import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { createTwoFilesPatch } from 'diff';
import * as ts from 'typescript';
import { z } from 'zod';

import { assertWorkflowText, snapshotWorkflowFiles, validateWorkflowPath, type WorkflowFiles, type WorkflowProject } from './workflow-policy';
import { isWorkflowKind, workflowSkills, type WorkflowKind, type WorkflowStage } from './workflow-skills';

import { atomicWriteJsonFile } from '@/utils/atomic-write';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const line = z.string().trim().min(1).max(1500);
const planSchema = z.strictObject({
  outcome: line,
  delta: line,
  files: z.array(z.string()).min(1).max(40),
  reuse: z.array(line).max(15),
  steps: z.array(line).min(1).max(12),
  criteria: z
    .array(z.strictObject({ scenario: line, check: z.string() }))
    .min(1)
    .max(20),
  reproduction: z.string().nullable(),
  questions: z.array(line).max(8),
});
const changeSchema = z.strictObject({
  changes: z
    .array(z.strictObject({ path: z.string(), content: z.string().max(150_000).nullable() }))
    .min(1)
    .max(40),
});
const reviewSchema = z.strictObject({ verdict: z.enum(['pass', 'fail']), findings: z.array(line).max(20) });
const lessonSchema = z.strictObject({ context: line, symptom: line, cause: line, rule: line, destination: line });
const checkResult = z.object({ id: z.string(), passed: z.boolean(), detail: z.string() });
const receipt = z.object({
  directory: z.string().regex(/^candidate-[a-zA-Z0-9]{6}$/),
  snapshot: hash,
  patch: hash,
  checks: z.array(checkResult),
  files: z.array(z.string()),
});
const stateSchema = z.strictObject({
  version: z.literal(2),
  kind: z.enum(['bug', 'change', 'feature']),
  request: line,
  baseline: hash,
  source: hash,
  revision: hash,
  plan: planSchema,
  approved: z.boolean(),
  delivered: receipt.optional(),
  lesson: z.object({ revision: hash, value: lessonSchema }).optional(),
});
const memorySchema = z.array(z.object({ revision: hash, proof: hash, lesson: lessonSchema })).max(100);

type State = z.infer<typeof stateSchema>;
type CheckResult = z.infer<typeof checkResult>;
type Generate = (stage: WorkflowStage, instructions: string, input: string) => Promise<string | undefined>;
type Outcome = { phase: 'plan' | 'waiting' | 'done'; message: string };
const running = new Set<string>();
const run = promisify(execFile);

const parse = <T>(schema: z.ZodType<T>, raw: string | undefined): T => {
  if (!raw || raw.length > 400_000) {
    throw new Error('Risposta del modello assente o troppo lunga.');
  }
  const fence = String.fromCharCode(96).repeat(3);
  const trimmed = raw.trim();
  const json = trimmed.startsWith(fence) && trimmed.endsWith(fence) ? trimmed.slice(3, -3).replace(/^json\s*/i, '') : trimmed;
  return schema.parse(JSON.parse(json));
};

const readJson = async <T>(file: string, schema: z.ZodType<T>, fallback: T): Promise<T> => {
  try {
    return schema.parse(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
};

const getState = (file: string) => readJson(file, stateSchema.optional(), undefined);
const memoryFile = (file: string, policy: WorkflowProject) => path.join(path.dirname(file), 'memory-' + digest(policy.root) + '.json');
const jobs = (file: string) => path.join(path.dirname(file), path.basename(file, '.json') + '-jobs');
const hashSnapshot = (policy: WorkflowProject, files: WorkflowFiles, memory: unknown) => digest({ policy, files, memory });
const has = (files: WorkflowFiles, name: string) => Object.hasOwn(files, name);

const fileSnapshot = async (policy: WorkflowProject, statePath: string) => {
  const memory = await readJson(memoryFile(statePath, policy), memorySchema, []);
  const files = await snapshotWorkflowFiles(policy);
  return { files, memory, hash: hashSnapshot(policy, files, memory), source: digest({ policy, files }) };
};

const approvedContext = (policy: WorkflowProject, files: WorkflowFiles) =>
  policy.references.map((reference) => ({ ...reference, content: files[reference.path] }));

const stageFiles = async (dir: string, files: WorkflowFiles) => {
  for (const [name, content] of Object.entries(files)) {
    if (content === null) {
      continue;
    }
    const target = path.join(dir, validateWorkflowPath(name));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, { flag: 'wx' });
  }
};

const readCandidate = async (policy: WorkflowProject, dir: string): Promise<WorkflowFiles> => {
  const files = await snapshotWorkflowFiles({ ...policy, root: dir });
  const expected = new Set(
    Object.entries(files)
      .filter(([, content]) => content !== null)
      .map(([name]) => name),
  );
  const pending = [''];
  while (pending.length) {
    const folder = pending.pop()!;
    for (const entry of await fs.readdir(path.join(dir, folder), { withFileTypes: true })) {
      const name = folder ? folder + '/' + entry.name : entry.name;
      if (entry.isDirectory() && [...expected].some((file) => file.startsWith(name + '/'))) {
        pending.push(name);
      } else if (!entry.isFile() || !expected.has(name)) {
        throw new Error('La cartella candidata contiene un elemento estraneo al piano.');
      }
    }
  }
  return files;
};
const sandboxCommand = async (dir: string, image: string, args: string[], signal?: AbortSignal): Promise<string | undefined> => {
  if (dir.includes(',')) {
    throw new Error('Il percorso del job contiene una virgola.');
  }
  const container = 'agentlab-workflow-' + randomUUID();
  try {
    await run('docker', ['image', 'inspect', image], { timeout: 5_000, signal, maxBuffer: 150_000, windowsHide: true });
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    throw new Error('Motore Docker o immagine locale approvata indisponibile.');
  }
  try {
    await run(
      'docker',
      [
        'run',
        '--rm',
        '--name',
        container,
        '--pull=never',
        '--network=none',
        '--cap-drop=ALL',
        '--security-opt=no-new-privileges',
        '--read-only',
        '--pids-limit=128',
        '--memory=768m',
        '--cpus=2',
        '--user=65534:65534',
        '--mount',
        'type=bind,source=' + dir + ',target=/workspace,readonly',
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,nodev,size=128m',
        '--workdir=/workspace',
        image,
        ...args,
      ],
      { timeout: 30_000, signal, maxBuffer: 150_000, windowsHide: true },
    );
    return undefined;
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    const commandError = error as { code?: string | number; killed?: boolean };
    // A missing sandbox, timeout or failure to start the image is not a reproducible bug.
    if (typeof commandError.code !== 'number' || commandError.killed || commandError.code >= 125) {
      throw new Error('Controllo Docker indisponibile o interrotto. Verifica il motore e l’immagine locale approvata.');
    }
    return 'Il comando isolato ha restituito codice ' + commandError.code + '.';
  } finally {
    await run('docker', ['rm', '--force', container], { timeout: 5000, maxBuffer: 150_000, windowsHide: true }).catch(() => undefined);
  }
};

const runChecks = async (policy: WorkflowProject, files: WorkflowFiles, dir: string, signal?: AbortSignal): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];
  for (const check of policy.checks) {
    signal?.throwIfAborted();
    let problem: string | undefined;
    if (check.type === 'docker') {
      problem = await sandboxCommand(dir, check.image, check.args, signal);
    } else {
      const content = files[check.file];
      if (typeof content !== 'string') {
        problem = 'File assente: ' + check.file;
      } else if (check.type === 'json') {
        try {
          JSON.parse(content);
        } catch {
          problem = 'JSON non valido: ' + check.file;
        }
      } else if (check.type === 'typescript') {
        const diagnostics = ts.transpileModule(content, { fileName: check.file, reportDiagnostics: true }).diagnostics ?? [];
        if (diagnostics.some((item) => item.category === ts.DiagnosticCategory.Error)) {
          problem = 'Sintassi JS/TS non valida: ' + check.file;
        }
      } else if (check.type === 'typescript-expression') {
        const file = ts.createSourceFile(check.file, content, ts.ScriptTarget.Latest, true);
        const variable = file.statements
          .filter(ts.isVariableStatement)
          .flatMap((statement) => [...statement.declarationList.declarations])
          .find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === check.variable);
        const initializer = variable?.initializer;
        const expression = initializer && ts.isArrowFunction(initializer) && !ts.isBlock(initializer.body) ? initializer.body : undefined;
        const actual = expression && ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Expression, expression, file).trim();
        if (actual !== check.expected) {
          problem = 'L’espressione attesa non è presente in ' + check.file;
        }
      } else if (check.type === 'contains' ? !content.includes(check.text) : content.includes(check.text)) {
        problem = 'La condizione dichiarata non è soddisfatta in ' + check.file;
      }
    }
    results.push({ id: check.id, passed: !problem, detail: problem ?? 'PASS' });
  }
  return results;
};

const renderPlan = (state: State) =>
  [
    '## ' + { bug: 'Correzione', change: 'Piano di modifica', feature: 'Blueprint funzionale' }[state.kind],
    state.plan.outcome,
    state.plan.delta,
    'File autorizzati dal piano\n' + state.plan.files.map((item) => '- ' + item).join('\n'),
    'Riuso\n' + state.plan.reuse.map((item) => '- ' + item).join('\n'),
    'Passi\n' + state.plan.steps.map((item) => '- ' + item).join('\n'),
    'Criteri\n' + state.plan.criteria.map((item) => '- ' + item.scenario + ' [' + item.check + ']').join('\n'),
    ...(state.plan.reproduction ? ['Riproduzione: ' + state.plan.reproduction] : []),
    'Versione: ' + state.revision,
    state.plan.questions.length ? 'Domande aperte\n' + state.plan.questions.map((item) => '- ' + item).join('\n') : '/workflow approve ' + state.revision,
  ].join('\n\n');

const renderDelivery = (state: State, statePath: string) => {
  const delivery = state.delivered;
  if (!delivery) {
    throw new Error('Consegna assente.');
  }
  return [
    '## Consegna verificata',
    ...delivery.checks.map((result) => '- ' + result.id + ' PASS'),
    'File della proposta: ' + delivery.files.join(', '),
    'Cartella verificata: ' + path.join(jobs(statePath), delivery.directory),
    'Patch: ' + path.join(jobs(statePath), delivery.directory + '.patch'),
    'Versione verificata: ' + delivery.snapshot,
    'Per proporre un apprendimento riutilizzabile: /workflow learn',
  ].join('\n');
};

const verifiedRepositoryPatch = async (policy: WorkflowProject, statePath: string, revision?: string): Promise<string> => {
  const state = await getState(statePath);
  const receipt = state?.delivered;
  if (
    !state?.approved ||
    !receipt ||
    (revision !== undefined && revision !== state.revision) ||
    receipt.checks.length !== policy.checks.length ||
    policy.checks.some((check) => !receipt.checks.some((result) => result.id === check.id && result.passed))
  ) {
    throw new Error('La chiusura richiede approvazione, tutti i controlli e revisione indipendente.');
  }
  const current = await fileSnapshot(policy, statePath);
  const expected = path.join(jobs(statePath), receipt.directory);
  if (path.relative(expected, await fs.realpath(expected))) {
    throw new Error('Cartella della consegna sostituita.');
  }
  const candidate = await readCandidate(policy, expected);
  const patchFile = expected + '.patch';
  const patchInfo = await fs.lstat(patchFile);
  if (!patchInfo.isFile() || patchInfo.nlink !== 1 || patchInfo.size > 2_000_000) {
    throw new Error('File patch non valido.');
  }
  const patchText = await fs.readFile(patchFile, 'utf8');
  if (digest({ original: state.baseline, files: candidate }) !== receipt.snapshot || current.source !== state.source || digest(patchText) !== receipt.patch) {
    throw new Error('La consegna o le fonti sono cambiate dopo la verifica.');
  }
  return patchText;
};

export const assertRepositoryWorkflowDone = async (policy: WorkflowProject, statePath: string): Promise<void> => {
  await verifiedRepositoryPatch(policy, statePath);
};

export const readRemoteRepositoryPatch = async (policy: WorkflowProject, statePath: string, revision: string): Promise<string> => {
  const patch = await verifiedRepositoryPatch(policy, statePath, revision);
  assertWorkflowText(patch);
  return patch;
};

export const readRepositoryWorkflow = async (statePath: string, policy?: WorkflowProject) => {
  const state = await getState(statePath);
  if (!state) {
    return { phase: 'empty' };
  }
  if (state.delivered && policy) {
    try {
      await assertRepositoryWorkflowDone(policy, statePath);
    } catch {
      return { phase: 'stale', kind: state.kind, revision: state.revision, plan: state.plan, checks: [], files: [] };
    }
  }
  return {
    phase: state.delivered ? 'done' : state.approved ? 'approved' : 'plan',
    kind: state.kind,
    revision: state.revision,
    plan: state.plan,
    checks: state.delivered?.checks ?? [],
    files: state.delivered?.files ?? [],
  };
};

export const runRepositoryWorkflow = async (args: {
  policy: WorkflowProject;
  statePath: string;
  prompt: string;
  generate: Generate;
  signal?: AbortSignal;
}): Promise<Outcome> => {
  const { policy, statePath, signal } = args;
  const input = args.prompt.trim();
  if (!input || input.length > 1500) {
    throw new Error('Richiesta assente o oltre 1500 caratteri.');
  }
  if (running.has(policy.root)) {
    throw new Error('Un task di questo progetto è già in corso.');
  }
  running.add(policy.root);
  const save = (state: State) => atomicWriteJsonFile(statePath, state);
  const generate = async <T>(kind: WorkflowKind, stage: WorkflowStage, schema: z.ZodType<T>, instruction: string, payload: unknown): Promise<T> => {
    const text = JSON.stringify(payload);
    assertWorkflowText(text);
    const contract =
      workflowSkills(kind, stage) +
      '\n' +
      instruction +
      '\nRestituisci un singolo JSON conforme esattamente a questo JSON Schema. Non usare oggetti al posto di stringhe.\n' +
      JSON.stringify(z.toJSONSchema(schema));
    let feedback = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      signal?.throwIfAborted();
      const raw = await args.generate(stage, contract + feedback, text);
      signal?.throwIfAborted();
      if (raw) {
        assertWorkflowText(raw);
      }
      try {
        return parse(schema, raw);
      } catch (error) {
        if (stage !== 'plan' || attempt || !(error instanceof z.ZodError || error instanceof SyntaxError)) {
          throw error;
        }
        const fields =
          error instanceof z.ZodError
            ? error.issues
                .slice(0, 10)
                .map((issue) => issue.path.join('.'))
                .join(', ')
            : 'JSON';
        feedback = '\nLa risposta precedente non rispettava lo schema nei campi: ' + fields + '. Correggi tutti i tipi.';
      }
    }
    throw new Error('Il modello non ha prodotto un piano con lo schema richiesto.');
  };
  try {
    let state = await getState(statePath);
    if (input === '/workflow status') {
      if (!state) {
        return { phase: 'waiting', message: 'Invia /workflow bug, /workflow change o /workflow feature con la richiesta.' };
      }
      if (state.delivered) {
        await assertRepositoryWorkflowDone(policy, statePath);
        return { phase: 'done', message: renderDelivery(state, statePath) };
      }
      return { phase: 'plan', message: renderPlan(state) };
    }
    if (input === '/workflow learn') {
      await assertRepositoryWorkflowDone(policy, statePath);
      if (!state?.delivered) {
        throw new Error('Consegna assente.');
      }
      const value = await generate(state.kind, 'learn', lessonSchema, 'Schema: context, symptom, cause, rule, destination.', {
        plan: state.plan,
        checks: state.delivered.checks,
        files: state.delivered.files,
      });
      const revision = digest([state.delivered.snapshot, value]);
      await save({ ...state, lesson: { revision, value } });
      return { phase: 'done', message: Object.values(value).join('\n') + '\n/workflow remember ' + revision };
    }
    const remember = /^\/workflow remember ([0-9a-f]{64})$/.exec(input);
    if (remember) {
      await assertRepositoryWorkflowDone(policy, statePath);
      if (!state?.delivered || state.lesson?.revision !== remember[1]) {
        throw new Error('Apprendimento da approvare non trovato.');
      }
      const file = memoryFile(statePath, policy);
      const memory = await readJson(file, memorySchema, []);
      const entry = { revision: state.lesson.revision, proof: state.delivered.snapshot, lesson: state.lesson.value };
      if (!memory.some((item) => item.revision === entry.revision)) {
        await atomicWriteJsonFile(file, [...memory.slice(-99), entry]);
      }
      return { phase: 'done', message: 'Apprendimento approvato registrato per il prossimo piano.' };
    }

    const snapshot = await fileSnapshot(policy, statePath);
    const approval = /^\/workflow approve ([0-9a-f]{64})$/.exec(input);
    const resume = input === '/workflow resume';
    if (approval || resume) {
      if (!state || (approval && approval[1] !== state.revision) || (resume && !state.approved)) {
        throw new Error('Serve la versione esatta del piano.');
      }
      if (state.delivered) {
        await assertRepositoryWorkflowDone(policy, statePath);
        return { phase: 'done', message: renderDelivery(state, statePath) };
      }
      if (state.plan.questions.length || state.baseline !== snapshot.hash) {
        throw new Error('Il piano ha domande aperte oppure le fonti sono cambiate.');
      }
      state = { ...state, approved: true };
      await save(state);
      const jobRoot = jobs(statePath);
      await fs.mkdir(jobRoot, { recursive: true });
      if (path.relative(jobRoot, await fs.realpath(jobRoot))) {
        throw new Error('Cartella di lavoro del workflow sostituita.');
      }
      if (state.kind === 'bug') {
        const baselineDir = await fs.mkdtemp(path.join(jobRoot, 'baseline-'));
        try {
          await stageFiles(baselineDir, snapshot.files);
          const baseline = await runChecks(policy, snapshot.files, baselineDir, signal);
          if (baseline.find((item) => item.id === state?.plan.reproduction)?.passed !== false) {
            throw new Error('Il controllo di riproduzione deve fallire sullo stato iniziale.');
          }
        } finally {
          await fs.rm(baselineDir, { recursive: true, force: true });
        }
      }
      let feedback: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        let patch: z.infer<typeof changeSchema>;
        try {
          patch = await generate(
            state.kind,
            attempt ? 'debug' : 'implement',
            changeSchema,
            'Schema: changes [{path, content}]. content è il testo completo o null per una rimozione approvata. Restituisci solo file del piano.',
            {
              plan: state.plan,
              sources: approvedContext(policy, snapshot.files),
              files: state.plan.files.map((name) => [name, snapshot.files[name]]),
              feedback,
            },
          );
        } catch (error) {
          if (!(error instanceof z.ZodError || error instanceof SyntaxError)) {
            throw error;
          }
          feedback = 'Proposta priva di uno schema JSON valido.';
          continue;
        }
        const names = patch.changes.map((item) => item.path);
        if (
          new Set(names).size !== names.length ||
          names.some((name) => !state?.plan.files.includes(name)) ||
          patch.changes.some((item) => snapshot.files[item.path] === item.content || ((snapshot.files[item.path] ?? '') === '' && (item.content ?? '') === ''))
        ) {
          feedback = 'La proposta duplica file, contiene file non approvati o non produce una patch di testo applicabile.';
          continue;
        }
        const candidate = Object.fromEntries(Object.entries(snapshot.files));
        for (const change of patch.changes) {
          candidate[change.path] = change.content;
        }
        const dir = await fs.mkdtemp(path.join(jobRoot, 'candidate-'));
        let accepted = false;
        try {
          await stageFiles(dir, candidate);
          const checks = await runChecks(policy, candidate, dir, signal);
          if (checks.some((check) => !check.passed)) {
            feedback = checks.filter((check) => !check.passed);
            continue;
          }
          let review: z.infer<typeof reviewSchema>;
          try {
            review = await generate(state.kind, 'review', reviewSchema, 'Schema: verdict (pass o fail) e findings (lista). Un pass richiede findings vuoto.', {
              plan: state.plan,
              changes: patch.changes.map((item) => ({ ...item, before: snapshot.files[item.path] })),
              checks,
              sources: approvedContext(policy, snapshot.files),
            });
          } catch (error) {
            if (!(error instanceof z.ZodError || error instanceof SyntaxError)) {
              throw error;
            }
            feedback = 'Verdetto di revisione non valido.';
            continue;
          }
          if (review.verdict !== 'pass' || review.findings.length) {
            feedback = review.findings.length ? review.findings : 'Revisione negativa.';
            continue;
          }
          if ((await fileSnapshot(policy, statePath)).hash !== state.baseline) {
            throw new Error('Le fonti sono cambiate durante il lavoro.');
          }
          const confirmed = await snapshotWorkflowFiles({ ...policy, root: dir });
          if (digest(confirmed) !== digest(candidate)) {
            throw new Error('La copia verificata differisce dalla proposta.');
          }
          const patchText = patch.changes
            .map((item) =>
              createTwoFilesPatch(
                snapshot.files[item.path] === null ? '/dev/null' : 'a/' + item.path,
                item.content === null ? '/dev/null' : 'b/' + item.path,
                snapshot.files[item.path] ?? '',
                item.content ?? '',
                '',
                '',
              ),
            )
            .join('\n');
          await fs.writeFile(dir + '.patch', patchText, { flag: 'wx' });
          const baselineDir = await fs.mkdtemp(path.join(jobRoot, 'patch-check-'));
          try {
            await stageFiles(baselineDir, snapshot.files);
            await run('git', ['apply', '--check', dir + '.patch'], { cwd: baselineDir, timeout: 10_000, signal, windowsHide: true });
          } catch (error) {
            if (signal?.aborted) {
              throw error;
            }
            throw new Error('Git non riesce ad applicare la patch alla copia di partenza.');
          } finally {
            await fs.rm(baselineDir, { recursive: true, force: true });
          }
          signal?.throwIfAborted();
          state = {
            ...state,
            delivered: {
              directory: path.basename(dir),
              snapshot: digest({ original: state.baseline, files: candidate }),
              patch: digest(patchText),
              checks,
              files: names,
            },
          };
          await save(state);
          accepted = true;
          return { phase: 'done', message: renderDelivery(state, statePath) };
        } finally {
          if (!accepted) {
            await fs.rm(dir, { recursive: true, force: true });
            await fs.rm(dir + '.patch', { force: true });
          }
        }
      }
      return { phase: 'waiting', message: 'Consegna sospesa. ' + JSON.stringify(feedback) + '\n/workflow resume' };
    }

    const command = /^\/workflow (bug|change|feature)\s+([\s\S]+)$/.exec(input);
    if (input.startsWith('/workflow') && !command) {
      throw new Error('Comando workflow non valido.');
    }
    const kind: WorkflowKind = isWorkflowKind(command?.[1]) ? command[1] : 'feature';
    const request = command?.[2].trim() ?? input;
    const checkId = z.enum(policy.checks.map((check) => check.id));
    const scopedPlan = planSchema.extend({
      files: z.array(z.enum(policy.editable)).min(1).max(40),
      criteria: z
        .array(z.strictObject({ scenario: line, check: checkId }))
        .min(1)
        .max(20),
      reproduction: kind === 'bug' ? checkId : checkId.nullable(),
    });
    const plan = await generate(
      kind,
      'plan',
      scopedPlan,
      'Schema: outcome, delta, files[], reuse[], steps[], criteria[{scenario,check}], reproduction (ID per bug o null), questions[]. files contiene soltanto i file da modificare, scelti da editable. I check devono provenire dalla configurazione fornita.',
      {
        request,
        previous: state ? { request: state.request, outcome: state.plan.outcome, questions: state.plan.questions, delivered: !!state.delivered } : undefined,
        sources: approvedContext(policy, snapshot.files),
        files: snapshot.files,
        editable: policy.editable,
        checks: policy.checks.map((check) => check.id),
        memory: snapshot.memory,
      },
    );
    const checks = new Set(policy.checks.map((check) => check.id));
    if (
      new Set(plan.files).size !== plan.files.length ||
      plan.files.some((name) => !has(snapshot.files, name) || !policy.editable.includes(name)) ||
      plan.criteria.some((item) => !checks.has(item.check)) ||
      (kind === 'bug' && (!plan.reproduction || !checks.has(plan.reproduction)))
    ) {
      throw new Error('Il piano indica file o controlli estranei alla configurazione. Ripresenta la richiesta con un perimetro valido.');
    }
    state = {
      version: 2,
      kind,
      request,
      baseline: snapshot.hash,
      source: snapshot.source,
      revision: digest([kind, request, plan, snapshot.hash]),
      plan,
      approved: false,
    };
    await save(state);
    return { phase: 'plan', message: renderPlan(state) };
  } finally {
    running.delete(policy.root);
  }
};
