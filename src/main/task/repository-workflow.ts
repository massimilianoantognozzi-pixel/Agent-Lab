import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { createTwoFilesPatch } from 'diff';
import { escapeRegExp } from 'lodash';
import * as ts from 'typescript';
import { z } from 'zod';

import {
  createDevelopmentCommit,
  developmentFilesMatch,
  isIntegrated,
  isKnownDevelopmentCommit,
  matchesDevelopmentReceipt,
  prepareDevelopmentTree,
  publishDevelopmentCommit,
  readDevelopmentFiles,
  readDevelopmentHead,
} from './workflow-development';
import { dockerFailureDetail, ensureWorkflowDocker, WorkflowServiceUnavailable, workflowServiceRetryable } from './workflow-docker';
import { hasVisualWorkflowImpact, isStandaloneVisualPath, visualPathsAffected, visualSourceScope } from './workflow-evidence';
import { assertWorkflowText, snapshotWorkflowFiles, validateWorkflowPath, type WorkflowFiles, type WorkflowProject } from './workflow-policy';
import { parseProjectWorkflowCommand } from './workflow-project-commands';
import {
  projectAttestationRevision,
  projectContinuationRevision,
  runProjectWorkflow,
  workflowDesignSurface,
  workflowInvestigation,
  type ProjectTaskContext,
} from './workflow-project-run';
import shadcn from './workflow-shadcn.json';
import { isWorkflowKind, workflowSkills, type WorkflowKind, type WorkflowStage } from './workflow-skills';

import { atomicWriteJsonFile } from '@/utils/atomic-write';
import { searchGeneralKnowledge } from '@/general-knowledge';
import { sanitizeKnowledgeText } from '@/knowledge-privacy';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const line = z.string().trim().min(1).max(1500);
const checkDescriptions = {
  json: 'sola sintassi JSON',
  typescript: 'sola sintassi JS/TS',
  'typescript-expression': 'struttura di una espressione',
  contains: 'presenza di testo',
  excludes: 'assenza di testo',
  browser: 'verificatore browser',
  docker: 'comando eseguito in Docker',
} as const;
const surface = z.enum(['none', ...workflowDesignSurface.options]);
const designSchema = z.strictObject({
  sharedLogic: line,
  ui: line.nullable(),
  mobile: line.nullable(),
  questions: z.array(line).max(8),
});
const planSchema = z.strictObject({
  outcome: line,
  delta: line,
  files: z.array(z.string()).min(1).max(40),
  reuse: z.array(line).max(15),
  steps: z.array(line).min(1).max(12),
  criteria: z
    .array(
      z.strictObject({ scenario: line, check: z.string(), method: z.enum(Object.keys(checkDescriptions) as (keyof typeof checkDescriptions)[]).optional() }),
    )
    .min(1)
    .max(20),
  reproduction: z.string().nullable(),
  questions: z.array(line).max(8),
  surface: surface.optional(),
  design: designSchema.optional(),
  catalog: z.enum(['consulted', 'unavailable']).optional(),
  skills: z
    .array(z.object({ name: line, hash }))
    .max(4)
    .optional(),
});
const changeSchema = z.strictObject({
  changes: z
    .array(z.strictObject({ path: z.string(), content: z.string().max(150_000).nullable() }))
    .min(1)
    .max(40),
});
const reviewSchema = z.strictObject({ verdict: z.enum(['pass', 'fail']), findings: z.array(line).max(20) });
const reviewContract = 'Schema: verdict (pass o fail) e findings (lista). Un pass richiede findings vuoto.';
const lessonSchema = z.strictObject({ context: line, symptom: line, cause: line, rule: line, destination: line });
const checkResult = z.object({ id: z.string(), passed: z.boolean(), detail: z.string() });
const recoveryAttempt = z.strictObject({
  feedback: z.union([z.string(), z.array(z.string()), z.array(checkResult)]),
});
const recoveryStrategy = z.strictObject({ hypothesis: line, approach: line });
const researchTopic = (policy: WorkflowProject, failures: z.infer<typeof recoveryAttempt>[]): string => {
  const failedIds = new Set(
    failures.flatMap(({ feedback }) =>
      Array.isArray(feedback) ? feedback.filter((item): item is CheckResult => typeof item === 'object').map(({ id }) => id) : [],
    ),
  );
  const types = new Set(policy.checks.filter(({ id }) => failedIds.has(id)).map(({ type }) => type));
  if (types.has('typescript') || types.has('typescript-expression')) {
    return 'TypeScript ' + ts.version + ' syntax compiler diagnostics';
  }
  if (types.has('docker')) {
    return 'Docker container application integration test troubleshooting';
  }
  if (types.has('browser')) {
    return 'browser integration test behavior diagnostics';
  }
  if (types.has('json')) {
    return 'JSON validation syntax troubleshooting';
  }
  return 'software regression tests debugging strategy';
};
const recoveryState = z.strictObject({
  attempts: z.array(recoveryAttempt),
  rejected: z.array(hash),
  changes: changeSchema.shape.changes.optional(),
  checkedCandidate: z.strictObject({ fingerprint: hash, checks: z.array(checkResult) }).optional(),
  verifyPending: z.literal(true).optional(),
  strategies: z.array(recoveryStrategy).optional(),
  research: z.array(z.strictObject({ query: z.string(), references: z.string(), attempt: z.number().int().nonnegative().optional() })).optional(),
  researchedAt: z.number().int().nonnegative().optional(),
  rejectedOutcomes: z.array(hash).optional(),
});
const gitCommit = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
const integration = z.object({ base: gitCommit, commit: gitCommit, policy: hash });
const receipt = z.object({
  directory: z.string().regex(/^candidate-[a-zA-Z0-9]{6}$/),
  snapshot: hash,
  patch: hash,
  checks: z.array(checkResult),
  baselineChecks: z.array(checkResult).optional(),
  files: z.array(z.string()),
  designReviewed: z.literal(true).optional(),
  integration: integration.optional(),
});
const stateSchema = z.strictObject({
  version: z.literal(2),
  kind: z.enum(['bug', 'change', 'feature']),
  request: line,
  clarifications: z
    .array(
      z.strictObject({
        questions: z.array(line).max(8),
        reply: z.string().trim().min(1),
        resolved: z
          .array(z.strictObject({ number: z.number().int().min(1).max(8), quote: line }))
          .max(8)
          .optional(),
      }),
    )
    .optional(),
  baseline: hash,
  source: hash,
  baseCommit: gitCommit.optional(),
  attestationRevision: hash.optional(),
  projectTaskId: z
    .string()
    .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/)
    .optional(),
  revision: hash,
  plan: planSchema,
  approved: z.boolean(),
  recovery: recoveryState.optional(),
  delivered: receipt.optional(),
  pendingIntegration: receipt.extend({ integration }).optional(),
  lesson: z.object({ revision: hash, value: lessonSchema }).optional(),
});
const memorySchema = z.array(z.object({ revision: hash, proof: hash, lesson: lessonSchema })).max(100);

type State = z.infer<typeof stateSchema>;
type Receipt = z.infer<typeof receipt>;
type CheckResult = z.infer<typeof checkResult>;
type Generate = (stage: WorkflowStage, instructions: string, input: string, verdictSchema?: typeof reviewSchema) => Promise<string | undefined>;
type Outcome = {
  phase: 'plan' | 'waiting' | 'done';
  message: string;
  recoveryProgress?: true;
  objectiveComplete?: boolean;
  observedHead?: string;
  observedValidation?: string;
  retryable?: boolean;
};
export type WorkflowSkillCatalog = {
  available: { name: string; description: string }[];
  read: (name: string) => Promise<string | null>;
};
const running = new Set<string>();
const runningProjects = new Set<string>();
const run = promisify(execFile);

class InvalidModelResponse extends Error {}
class WorkflowModelFailure extends Error {}
class PreparedDesignRejection extends Error {
  constructor(
    readonly changes: z.infer<typeof changeSchema>['changes'],
    readonly findings: string[],
  ) {
    super('Revisione UI/UX negativa sul commit preparato.');
  }
}

const parse = <T>(schema: z.ZodType<T>, raw: string | undefined): T => {
  if (!raw || raw.length > 400_000) {
    throw new InvalidModelResponse('Risposta del modello assente o troppo lunga.');
  }
  const fence = String.fromCharCode(96).repeat(3);
  const trimmed = raw.trim();
  const json = trimmed.startsWith(fence) && trimmed.endsWith(fence) ? trimmed.slice(3, -3).replace(/^json\s*/i, '') : trimmed;
  return schema.parse(JSON.parse(json));
};

const invalidModelResponse = (error: unknown) => error instanceof z.ZodError || error instanceof SyntaxError || error instanceof InvalidModelResponse;

const recoveryMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message.slice(0, 1500) : '';
  try {
    assertWorkflowText(message);
    return message || fallback;
  } catch {
    return fallback;
  }
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

const legacyQueueReceipts = async (workspace: string, policy: WorkflowProject, head: string, signal?: AbortSignal) => {
  const files = await fs.readdir(workspace, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  });
  const receipts: { key: string; policyHash: string; base: string; taskId?: string }[] = [];
  const candidates = files.filter((file) => file.isFile() && /^[a-f0-9]{64}\.json$/.test(file.name));
  if (!candidates.length) {
    return receipts;
  }
  for (const file of candidates) {
    signal?.throwIfAborted();
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(path.join(workspace, file.name), 'utf8'));
    } catch (error) {
      if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw error;
    }
    const parsed = stateSchema.safeParse(raw);
    if (!parsed.success) {
      continue;
    }
    const state = parsed.data;
    const receipt = state.delivered ?? state.pendingIntegration;
    const integration = receipt?.integration;
    if (integration && state.approved && state.baseCommit === integration.base && (await isKnownDevelopmentCommit(policy, integration.commit, head, signal))) {
      if (!(await matchesDevelopmentReceipt(policy, integration.commit, integration.base, state.revision, signal))) {
        continue;
      }
      receipts.push({
        key: file.name.slice(0, -5),
        policyHash: integration.policy,
        base: integration.base,
        taskId: state.projectTaskId,
      });
    }
  }
  return receipts;
};

const settlePublishedReceipt = (state: State, pending: NonNullable<State['pendingIntegration']>): State => {
  const { pendingIntegration: _pending, ...previous } = state;
  return { ...previous, delivered: pending };
};

const requirePublishedReceiptMatch = async (policy: WorkflowProject, state: State, receipt: NonNullable<Receipt['integration']>, signal?: AbortSignal) => {
  if (
    !state.approved ||
    state.baseCommit !== receipt.base ||
    !(await matchesDevelopmentReceipt(policy, receipt.commit, receipt.base, state.revision, signal))
  ) {
    throw new Error('Il commit pubblicato non corrisponde alla ricevuta.');
  }
};

const recoverPublishedReceipt = async (statePath: string, policy: WorkflowProject, head: string, taskId: string, signal?: AbortSignal): Promise<void> => {
  const state = await getState(statePath);
  if (state?.projectTaskId && state.projectTaskId !== taskId) {
    throw new Error('La ricevuta appartiene a un task diverso.');
  }
  const integrated = state?.delivered?.integration ?? state?.pendingIntegration?.integration;
  if (!state?.approved || !integrated) {
    return;
  }
  const pending = state?.pendingIntegration;
  const { commit } = integrated;
  if (await isIntegrated(policy, commit, signal, head)) {
    await requirePublishedReceiptMatch(policy, state, integrated, signal);
    if (pending) {
      await atomicWriteJsonFile(statePath, settlePublishedReceipt({ ...state, projectTaskId: taskId }, pending));
    }
  }
};
const memoryFile = (file: string, policy: WorkflowProject) => path.join(path.dirname(file), 'memory-' + digest(policy.root) + '.json');
const jobs = (file: string) => path.join(path.dirname(file), path.basename(file, '.json') + '-jobs');
const hashSnapshot = (policy: WorkflowProject, files: WorkflowFiles, memory: unknown) => digest({ policy, files, memory });
const has = (files: WorkflowFiles, name: string) => Object.hasOwn(files, name);

const fileSnapshot = async (policy: WorkflowProject, statePath: string, signal?: AbortSignal) => {
  const memory = await readJson(memoryFile(statePath, policy), memorySchema, []);
  const commit = policy.branches ? await readDevelopmentHead(policy, signal) : undefined;
  const files = commit ? await readDevelopmentFiles(policy, commit, signal) : await snapshotWorkflowFiles(policy);
  const baseline = hashSnapshot(policy, files, memory);
  return { files, memory, commit, hash: commit ? digest([baseline, commit]) : baseline, source: digest({ policy, files }) };
};

export const repositoryContinuationRevision = async (policy: WorkflowProject, signal?: AbortSignal): Promise<string> => {
  if (!policy.branches || !policy.workPlan) {
    throw new Error('Il piano governato non è disponibile.');
  }
  return projectContinuationRevision(policy, await readDevelopmentHead(policy, signal), signal);
};

const approvedContext = (policy: WorkflowProject, files: WorkflowFiles) =>
  policy.references.map((reference) => ({ ...reference, content: files[reference.path] }));

const stageFiles = async (dir: string, files: WorkflowFiles, dockerReadable = false) => {
  const directories = new Set([dir]);
  for (const [name, content] of Object.entries(files)) {
    if (content === null) {
      continue;
    }
    const target = path.join(dir, validateWorkflowPath(name));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, { flag: 'wx' });
    if (dockerReadable) {
      await fs.chmod(target, 0o644);
      let parent = path.dirname(target);
      while (!directories.has(parent)) {
        directories.add(parent);
        parent = path.dirname(parent);
      }
    }
  }
  if (dockerReadable) {
    for (const parent of directories) {
      await fs.chmod(parent, 0o755);
    }
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
const sandboxCommand = async (dir: string, files: WorkflowFiles, image: string, args: string[], signal?: AbortSignal): Promise<string | undefined> => {
  const container = 'agentlab-workflow-' + randomUUID();
  try {
    await run('docker', ['image', 'inspect', image], { timeout: 5_000, signal, maxBuffer: 150_000, windowsHide: true });
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    throw new Error('Motore Docker o immagine locale approvata indisponibile.');
  }
  // POSIX mkdtemp roots are 0700. Keep the original private and mount only a readable copy beneath it.
  const mount = process.platform === 'win32' ? dir : await fs.mkdtemp(path.join(dir, '.docker-'));
  try {
    if (mount !== dir) {
      await stageFiles(mount, files, true);
    }
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
        // Docker reads --mount as CSV. Quote the whole field; Go's CSV reader also folds CRLF into LF.
        `type=bind,"source=${mount.replaceAll('"', '""').replaceAll('\r\n', '\r\r\n')}",target=/workspace,readonly`,
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
    const commandError = error as { code?: string | number; killed?: boolean; stdout?: string; stderr?: string };
    // A missing sandbox, timeout or failure to start the image is not a reproducible bug.
    if (typeof commandError.code !== 'number' || commandError.killed || commandError.code >= 125) {
      throw new WorkflowServiceUnavailable('Controllo Docker indisponibile o interrotto.');
    }
    return dockerFailureDetail(commandError.code, [commandError.stderr, commandError.stdout].filter(Boolean).join('\n'), files);
  } finally {
    await run('docker', ['rm', '--force', container], { timeout: 5000, maxBuffer: 150_000, windowsHide: true }).catch(() => undefined);
    if (mount !== dir) {
      await fs.rm(mount, { recursive: true, force: true });
    }
  }
};

const runChecks = async (policy: WorkflowProject, files: WorkflowFiles, dir: string, signal?: AbortSignal): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];
  for (const check of policy.checks) {
    signal?.throwIfAborted();
    if (check.type === 'browser') {
      const node = process.env.AIDER_DESK_WORKFLOW_NODE;
      const checker = process.env.AIDER_DESK_WORKFLOW_REPOSITORY_BROWSER_CHECK;
      if (!node || !checker || !path.isAbsolute(node) || !path.isAbsolute(checker)) {
        throw new Error('Verificatore browser del repository non configurato.');
      }
      try {
        const { stdout } = await run(node, [checker, dir, check.id], { signal, timeout: 45_000, maxBuffer: 64_000, windowsHide: true });
        const detail = stdout.trim();
        assertWorkflowText(detail);
        if (!detail.startsWith('BROWSER_PASS ')) {
          throw new Error('Il verificatore browser non ha attestato il controllo.');
        }
        results.push({ id: check.id, passed: true, detail: detail.slice('BROWSER_PASS '.length, 1500) });
      } catch (error) {
        if (signal?.aborted || (error as { code?: number }).code !== 1) {
          throw error;
        }
        const detail = (error as { stdout?: string }).stdout?.trim() ?? '';
        assertWorkflowText(detail);
        if (!detail.startsWith('BROWSER_FAIL ')) {
          throw new Error('Il verificatore browser si è interrotto senza attestare un esito.');
        }
        results.push({ id: check.id, passed: false, detail: detail.slice('BROWSER_FAIL '.length, 1500) });
      }
      continue;
    }
    let problem: string | undefined;
    if (check.type === 'docker') {
      problem = await sandboxCommand(dir, files, check.image, check.args, signal);
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

const numberedAnswers = (reply: string) => {
  const labels = [...reply.matchAll(/^[ \t]*(\d+)[.)](?=[ \t]|\r?$)[ \t]*/gm)];
  return labels.map((label, index) => ({ number: Number(label[1]), text: reply.slice(label.index + label[0].length, labels[index + 1]?.index).trim() }));
};

const answerDecisions = z.array(z.strictObject({ number: z.number().int().min(1).max(8), quote: line.nullable(), remaining: line.nullable() }));

const reconcileQuestions = (round: { questions: string[]; reply: string }, answers: z.infer<typeof answerDecisions>, newQuestions: string[]) => {
  const normalized = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
  const numbered = numberedAnswers(round.reply);
  const resolved = new Map<string, { number: number; quote: string }>();
  const open: string[] = [];
  for (const [index, question] of round.questions.entries()) {
    const decisions = answers.filter((answer) => answer.number === index + 1);
    const decision = decisions.length === 1 ? decisions[0] : undefined;
    const assigned = numbered.filter((answer) => answer.number === index + 1);
    const text = numbered.length ? (assigned.length === 1 ? assigned[0].text : '') : round.reply;
    const quote = decision?.quote;
    const deferred = /^(?:aperta|da decidere|da chiarire|non (?:lo so|saprei|ho deciso)|non ancora|non so)[\s.!?]*$/iu;
    const literal = quote && escapeRegExp(quote);
    const evidence =
      quote &&
      literal &&
      !deferred.test(quote) &&
      !deferred.test(text.trim()) &&
      new RegExp('(?<![\\p{L}\\p{N}_])' + literal + '(?![\\p{L}\\p{N}_])', 'u').test(text);
    if (evidence && !decision.remaining) {
      resolved.set(normalized(question), { number: index + 1, quote });
    } else {
      open.push((evidence && decision?.remaining) || question);
    }
  }
  const questions = new Map(open.map((q) => [normalized(q), q]));
  for (const question of newQuestions) {
    if (!resolved.has(normalized(question))) {
      questions.set(normalized(question), question);
    }
  }
  return { open: planSchema.shape.questions.parse([...questions.values()]), resolved: [...resolved.values()] };
};

const renderPlan = (state: State) =>
  [
    '## ' + { bug: 'Correzione', change: 'Piano di modifica', feature: 'Blueprint funzionale' }[state.kind],
    state.plan.outcome,
    state.plan.delta,
    'File autorizzati dal piano\n' + state.plan.files.map((item) => '- ' + item).join('\n'),
    'Riuso\n' + state.plan.reuse.map((item) => '- ' + item).join('\n'),
    'Passi\n' + state.plan.steps.map((item) => '- ' + item).join('\n'),
    'Criteri\n' +
      state.plan.criteria
        .map((item) => '- ' + item.scenario + ' [' + item.check + ']' + (item.method ? ' · ' + checkDescriptions[item.method] : ''))
        .join('\n'),
    ...(state.plan.design
      ? [
          'Proposta UI/UX',
          'Logica condivisa · ' + state.plan.design.sharedLogic,
          ...(state.plan.design.ui ? ['Interfaccia · ' + state.plan.design.ui] : []),
          ...(state.plan.design.mobile ? ['Mobile · ' + state.plan.design.mobile] : []),
        ]
      : []),
    ...(state.plan.skills?.length ? ['Skill · ' + state.plan.skills.map(({ name }) => name).join(', ')] : []),
    ...(state.plan.catalog ? ['Catalogo shadcn MCP · ' + (state.plan.catalog === 'consulted' ? 'consultato' : 'indisponibile')] : []),
    ...(state.plan.reproduction ? ['Riproduzione: ' + state.plan.reproduction] : []),
    'Versione: ' + state.revision,
    state.plan.questions.length
      ? 'Domande aperte\n' +
        state.plan.questions.map((item, index) => index + 1 + '. ' + item).join('\n') +
        '\nRispondi in questa chat, anche per numero. Per iniziare un altro incarico usa /workflow bug, change o feature con la nuova richiesta.'
      : '/workflow approve ' + state.revision,
  ].join('\n\n');

const renderDelivery = (state: State, statePath: string, policy: WorkflowProject) => {
  const delivery = state.delivered;
  if (!delivery) {
    throw new Error('Consegna assente.');
  }
  const verifiedDefinitions = !delivery.integration || delivery.integration.policy === digest(policy) ? policy.checks : [];
  return [
    '## Consegna verificata',
    ...(delivery.baselineChecks
      ?.filter((result) => result.id === state.plan.reproduction)
      .map((result) => '- Riproduzione sulla base: ' + result.id + ' FAIL') ?? []),
    ...delivery.checks.map((result) => {
      const check = verifiedDefinitions.find(({ id }) => id === result.id);
      return '- ' + result.id + ' PASS' + (check ? ' · ' + checkDescriptions[check.type] : '');
    }),
    '- Revisione del codice PASS',
    ...(delivery.designReviewed ? ['- Revisione UI/UX del codice PASS'] : []),
    'File della proposta: ' + delivery.files.join(', '),
    'Cartella verificata: ' + path.join(jobs(statePath), delivery.directory),
    'Patch: ' + path.join(jobs(statePath), delivery.directory + '.patch'),
    'Versione verificata: ' + delivery.snapshot,
    ...(delivery.integration ? ['Commit integrato sul ramo di sviluppo: ' + delivery.integration.commit] : []),
    ...(delivery.integration ? ['Gli esiti si riferiscono al commit indicato.'] : []),
    'Per proporre un apprendimento riutilizzabile: /workflow learn',
  ].join('\n');
};

const readVerifiedCandidate = async (policy: WorkflowProject, statePath: string, state: State, receipt: Receipt) => {
  if (
    !state.approved ||
    (state.plan.design && !receipt.designReviewed) ||
    receipt.checks.length !== policy.checks.length ||
    policy.checks.some((check) => !receipt.checks.some((result) => result.id === check.id && result.passed))
  ) {
    throw new Error('La chiusura richiede approvazione, tutti i controlli e revisione indipendente.');
  }
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
  if (digest({ original: state.baseline, files: candidate }) !== receipt.snapshot || digest(patchText) !== receipt.patch) {
    throw new Error('La consegna o le fonti sono cambiate dopo la verifica.');
  }
  return { candidate, patchText };
};

const verifiedRepositoryPatch = async (policy: WorkflowProject, statePath: string, revision?: string): Promise<string> => {
  const state = await getState(statePath);
  const receipt = state?.delivered;
  if (!state || !receipt || (revision !== undefined && revision !== state.revision)) {
    throw new Error('La chiusura richiede approvazione, tutti i controlli e revisione indipendente.');
  }
  const { patchText } = await readVerifiedCandidate(policy, statePath, state, receipt);
  const current = receipt.integration
    ? receipt.integration.policy === digest(policy) && (await isIntegrated(policy, receipt.integration.commit))
    : (await fileSnapshot(policy, statePath)).source === state.source;
  if (!current) {
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

export const readRepositoryWorkflow = async (statePath: string, policy?: WorkflowProject, historical = false) => {
  const state = await getState(statePath);
  if (!state) {
    return { phase: 'empty' as const };
  }
  if (state.delivered && policy) {
    try {
      await assertRepositoryWorkflowDone(policy, statePath);
      if (!historical && state.delivered.integration) {
        const head = await readDevelopmentHead(policy);
        if (
          !(await isIntegrated(policy, state.delivered.integration.commit, undefined, head)) ||
          !(await developmentFilesMatch(policy, state.delivered.integration.commit, head))
        ) {
          throw new Error('Le verifiche della consegna si riferiscono a una versione precedente.');
        }
      }
    } catch {
      return {
        phase: 'stale' as const,
        kind: state.kind,
        revision: state.revision,
        plan: state.plan,
        checks: [],
        files: [],
        ...(state.delivered.integration ? { commit: state.delivered.integration.commit } : {}),
      };
    }
  }
  return {
    phase: state.delivered ? ('done' as const) : state.approved ? ('approved' as const) : ('plan' as const),
    kind: state.kind,
    revision: state.revision,
    plan: state.plan,
    checks: state.delivered?.checks ?? [],
    files: state.delivered?.files ?? [],
    ...(state.baseCommit ? { baseCommit: state.baseCommit } : {}),
    ...(state.attestationRevision ? { attestationRevision: state.attestationRevision } : {}),
    ...(state.pendingIntegration
      ? {
          pendingCommit: state.pendingIntegration.integration.commit,
          pendingPolicyChanged: !!policy && state.pendingIntegration.integration.policy !== digest(policy),
        }
      : {}),
    ...(state.delivered?.integration ? { commit: state.delivered.integration.commit } : {}),
  };
};

const runWorkflowTask = async (args: {
  policy: WorkflowProject;
  statePath: string;
  prompt: string;
  expectedWorkPlan?: string;
  expectedDevelopmentHead?: string;
  projectTask?: ProjectTaskContext;
  generate: Generate;
  skills?: () => Promise<WorkflowSkillCatalog>;
  designCatalog?: (items: readonly string[]) => Promise<string[] | null>;
  search?: (query: string) => Promise<string | undefined>;
  continueRecovery?: boolean;
  expectedContinuationRevision?: string;
  expectedApprovedRevision?: string;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  protectPublication?: (write: () => Promise<void>) => Promise<void>;
  onDesktopCommit?: (sha: string) => Promise<void>;
}): Promise<Outcome> => {
  const { policy, statePath, signal } = args;
  const input = args.prompt.trim();
  const projectLessons = async (query: string) => {
    try {
      const lessons = await searchGeneralKnowledge(query, policy.root);
      return lessons.map(({ title, lesson, applicability, evidenceId }) => ({
        title: sanitizeKnowledgeText(title).slice(0, 200),
        lesson: sanitizeKnowledgeText(lesson).slice(0, 900),
        applicability: sanitizeKnowledgeText(applicability).slice(0, 350),
        evidenceId: /^[a-f0-9-]{36}$/i.test(evidenceId) ? evidenceId : undefined,
      }));
    } catch {
      args.onProgress?.('Knowledge Base del progetto indisponibile; proseguo dalle fonti e dalle prove correnti.');
      return [];
    }
  };
  if (!input || input.length > 1500) {
    throw new Error('Richiesta assente o oltre 1500 caratteri.');
  }
  if (running.has(policy.root)) {
    throw new WorkflowServiceUnavailable('Un task di questo progetto è già in corso.');
  }
  running.add(policy.root);
  const save = (state: State) => atomicWriteJsonFile(statePath, state);
  const finishIntegration = async (state: State, pending: NonNullable<State['pendingIntegration']>): Promise<State> => {
    const { base, commit } = pending.integration;
    if (await isIntegrated(policy, commit, signal)) {
      await requirePublishedReceiptMatch(policy, state, pending.integration, signal);
      const integrated = settlePublishedReceipt(state, pending);
      await save(integrated);
      await args.onDesktopCommit?.(commit);
      return integrated;
    }
    if (pending.integration.policy !== digest(policy)) {
      throw new Error('La configurazione è cambiata durante l’integrazione.');
    }
    const { candidate } = await readVerifiedCandidate(policy, statePath, state, pending);
    if (digest(await readDevelopmentFiles(policy, commit, signal)) !== digest(candidate)) {
      throw new Error('Il commit preparato differisce dalla versione verificata.');
    }
    const snapshot = await fileSnapshot(policy, statePath, signal);
    if (snapshot.hash !== state.baseline) {
      throw new Error('Il ramo di sviluppo o le fonti sono cambiati prima dell’integrazione.');
    }
    if (!pending.designReviewed) {
      const changes = Object.entries(candidate).flatMap(([path, content]) =>
        snapshot.files[path] === content ? [] : [{ path, content, before: snapshot.files[path] }],
      );
      if (
        hasVisualWorkflowImpact(
          snapshot.files,
          candidate,
          changes.map(({ path }) => path),
        )
      ) {
        const review = await generate(state.kind, 'design-review', reviewSchema, reviewContract, {
          plan: state.plan,
          ...(state.clarifications && { clarifications: state.clarifications }),
          changes,
          checks: pending.checks,
          baselineChecks: pending.baselineChecks,
          checkDefinitions: policy.checks,
          sources: approvedContext(policy, snapshot.files),
          context: Object.fromEntries([...policy.context, ...(policy.optionalInputs ?? [])].map((name) => [name, snapshot.files[name]])),
          projectTask: args.projectTask,
          skills: await approvedSkills(state.plan),
        });
        if ((await fileSnapshot(policy, statePath, signal)).hash !== state.baseline) {
          throw new Error('Il ramo di sviluppo o le fonti sono cambiati prima dell’integrazione.');
        }
        if (review.verdict !== 'pass' || review.findings.length) {
          throw new PreparedDesignRejection(
            changes.map(({ path, content }) => ({ path, content })),
            review.findings.length ? review.findings : ['Revisione UI/UX negativa sul candidato preparato.'],
          );
        }
        pending = { ...pending, designReviewed: true };
        await save({ ...state, pendingIntegration: pending });
      }
    }
    const integrated = settlePublishedReceipt(state, pending);
    const publish = async () => {
      await publishDevelopmentCommit(policy, base, commit, jobs(statePath), signal);
      await save(integrated);
      await args.onDesktopCommit?.(commit);
    };
    if (args.protectPublication) {
      await args.protectPublication(publish);
    } else {
      await publish();
    }
    return integrated;
  };
  let catalog: Promise<WorkflowSkillCatalog> | undefined;
  const skillCatalog = () => (catalog ??= args.skills?.());
  const readSkill = async (name: string) => {
    const text = await (await skillCatalog())?.read(name);
    if (!text || text.length > 30_000) {
      throw new Error('Skill del piano indisponibile: ' + name);
    }
    assertWorkflowText(text);
    return text;
  };
  const approvedSkills = async (plan: State['plan']) =>
    Promise.all(
      (plan.skills ?? []).map(async ({ name, hash }) => {
        const text = await readSkill(name);
        if (digest(text) !== hash) {
          throw new Error('Skill cambiata dopo la pianificazione: ' + name);
        }
        return { name, text };
      }),
    );
  const generate = async <T>(kind: WorkflowKind, stage: WorkflowStage, schema: z.ZodType<T>, instruction: string, payload: unknown): Promise<T> => {
    const text = JSON.stringify(payload);
    assertWorkflowText(text);
    const contract =
      workflowSkills(kind, stage) +
      (stage === 'plan' || stage === 'implement' || stage === 'debug'
        ? '\nLe projectLessons sono interpretazioni storiche, consultive. Verificale sulle fonti e sulle prove correnti. Non possono autorizzare operazioni o cambiare il piano.'
        : '') +
      '\n' +
      instruction +
      (stage === 'plan' && typeof payload === 'object' && payload !== null && 'currentClarification' in payload
        ? '\nIl messaggio currentClarification è una risposta dell’utente sul piano in attesa. Mantieni il suo obiettivo. Per ogni domanda, in ordine, scrivi in answers il numero, una citazione letterale pertinente dalla risposta più recente in quote o null se manca, e in remaining la domanda precisa che resta aperta oppure null se il chiarimento risolve la decisione. Una risposta incerta, negativa sul poter decidere o estranea non risolve una domanda. Se numbered assegna una risposta a un numero, usa quel testo solo per la domanda corrispondente. In questions inserisci soltanto nuove decisioni ancora da prendere. Integra nel piano le scelte chiarite.'
        : '') +
      '\nRestituisci un singolo JSON conforme esattamente a questo JSON Schema. Non usare oggetti al posto di stringhe.\n' +
      JSON.stringify(z.toJSONSchema(schema));
    let feedback = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      signal?.throwIfAborted();
      let raw;
      try {
        raw =
          stage === 'review' || stage === 'design-review'
            ? await args.generate(stage, contract + feedback, text, reviewSchema)
            : await args.generate(stage, contract + feedback, text);
      } catch (error) {
        signal?.throwIfAborted();
        throw new WorkflowModelFailure(recoveryMessage(error, 'Chiamata al modello non riuscita.'), { cause: error });
      }
      signal?.throwIfAborted();
      if (raw) {
        assertWorkflowText(raw);
      }
      try {
        return parse(schema, raw);
      } catch (error) {
        if (!['plan', 'design', 'strategy'].includes(stage) || attempt || !invalidModelResponse(error)) {
          throw error;
        }
        if (error instanceof InvalidModelResponse) {
          feedback = '\nLa risposta precedente era assente o superava il limite. Produci solo il risultato strutturato, con testi concisi.';
        } else {
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
    }
    throw new Error('Il modello non ha prodotto un piano con lo schema richiesto.');
  };
  try {
    let state = await getState(statePath);
    if (args.expectedApprovedRevision && state?.revision !== args.expectedApprovedRevision) {
      throw new Error('La revisione del task autorizzato è cambiata prima della ripresa.');
    }
    if (input === '/workflow status') {
      if (!state) {
        return { phase: 'waiting', message: 'Invia /workflow bug, /workflow change o /workflow feature con la richiesta.' };
      }
      if (state.delivered) {
        await assertRepositoryWorkflowDone(policy, statePath);
        return { phase: 'done', message: renderDelivery(state, statePath, policy) };
      }
      if (state.pendingIntegration) {
        return { phase: 'waiting', message: 'Commit preparato: ' + state.pendingIntegration.integration.commit + '\n/workflow resume' };
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

    const approval = /^\/workflow approve ([0-9a-f]{64})$/.exec(input);
    const resume = input === '/workflow resume';
    const snapshot = await fileSnapshot(policy, statePath, signal);
    if (args.expectedDevelopmentHead !== undefined && snapshot.commit !== args.expectedDevelopmentHead) {
      throw new Error('Il ramo di sviluppo è cambiato dopo la verifica delle dipendenze.');
    }
    if (args.expectedWorkPlan !== undefined && (!policy.workPlan || snapshot.files[policy.workPlan] !== args.expectedWorkPlan)) {
      throw new Error('Il piano di lavoro è cambiato prima di avviare il task.');
    }
    if (state?.pendingIntegration && (resume || approval?.[1] === state.revision)) {
      try {
        return { phase: 'done', message: renderDelivery(await finishIntegration(state, state.pendingIntegration), statePath, policy) };
      } catch (error) {
        if (!(error instanceof PreparedDesignRejection)) {
          throw error;
        }
        const recovery = state.recovery;
        const candidateHash = digest([...error.changes].sort((a, b) => a.path.localeCompare(b.path)));
        state = {
          ...state,
          pendingIntegration: undefined,
          recovery: {
            ...recovery,
            attempts: [...(recovery?.attempts ?? []), { feedback: error.findings }],
            rejected: [...new Set([...(recovery?.rejected ?? []), candidateHash])],
            changes: error.changes,
            verifyPending: undefined,
          },
        };
        await save(state);
      }
    }
    if (state?.pendingIntegration) {
      const pending = state.pendingIntegration;
      const samePolicy = pending.integration.policy === digest(policy);
      if ((args.projectTask || samePolicy) && (await isIntegrated(policy, pending.integration.commit, signal))) {
        state = await finishIntegration(state, pending);
        if (args.projectTask) {
          return { phase: 'done', message: renderDelivery(state, statePath, policy) };
        }
      } else if (samePolicy && snapshot.hash === state.baseline) {
        throw new Error('Integrazione in attesa. Usa /workflow resume per riprendere il commit preparato.');
      }
    }
    if (approval || resume) {
      if (!state || (approval && approval[1] !== state.revision) || (resume && !state.approved)) {
        throw new Error('Serve la versione esatta del piano.');
      }
      if (state.delivered) {
        await assertRepositoryWorkflowDone(policy, statePath);
        return { phase: 'done', message: renderDelivery(state, statePath, policy) };
      }
      if (state.plan.questions.length || state.baseline !== snapshot.hash) {
        throw new Error('Il piano ha domande aperte oppure le fonti sono cambiate.');
      }
      if (args.projectTask?.designSurface && (state.plan.surface !== args.projectTask.designSurface || !state.plan.design)) {
        throw new Error('Il piano deve includere il lavoro del Designer per la superficie dichiarata dal task.');
      }
      const skills = await approvedSkills(state.plan);
      state = { ...state, approved: true };
      await save(state);
      if (args.projectTask && policy.checks.some((check) => check.type === 'docker')) {
        await ensureWorkflowDocker(signal, args.onProgress);
      }
      const jobRoot = jobs(statePath);
      await fs.mkdir(jobRoot, { recursive: true });
      if (path.relative(jobRoot, await fs.realpath(jobRoot))) {
        throw new Error('Cartella di lavoro del workflow sostituita.');
      }
      let baselineChecks: CheckResult[] | undefined;
      if (state.kind === 'bug') {
        const baselineDir = await fs.mkdtemp(path.join(jobRoot, 'baseline-'));
        try {
          await stageFiles(baselineDir, snapshot.files);
          baselineChecks = await runChecks(policy, snapshot.files, baselineDir, signal);
          if (baselineChecks.find((item) => item.id === state?.plan.reproduction)?.passed !== false) {
            throw new Error('Il controllo di riproduzione deve fallire sullo stato iniziale.');
          }
        } finally {
          await fs.rm(baselineDir, { recursive: true, force: true });
        }
      }
      let attempts = state.recovery?.attempts ?? [];
      const rejected = new Set(state.recovery?.rejected);
      const rejectedOutcomes = new Set(state.recovery?.rejectedOutcomes);
      const initialOutcomeCount = rejectedOutcomes.size;
      let strategies = state.recovery?.strategies ?? [];
      let researchHistory = state.recovery?.research ?? [];
      let researchedAt = state.recovery?.researchedAt ?? 0;
      const approvedFiles = state.plan.files;
      const usableProposal = (changes: z.infer<typeof changeSchema>['changes']) => {
        const names = changes.map((item) => item.path);
        return (
          new Set(names).size === names.length &&
          changes.every(
            ({ path, content }) =>
              approvedFiles.includes(path) &&
              policy.editable.includes(path) &&
              has(snapshot.files, path) &&
              snapshot.files[path] !== content &&
              (!!snapshot.files[path] || !!content),
          )
        );
      };
      const restored = state.recovery?.changes;
      let previousChanges = restored && usableProposal(restored) ? restored : undefined;
      let checkedCandidate = state.recovery?.checkedCandidate;
      const revision = state.revision;
      const candidateFingerprint = (changes: z.infer<typeof changeSchema>['changes'], checks: CheckResult[]) => digest([revision, changes, checks]);
      if (
        checkedCandidate &&
        (!previousChanges ||
          checkedCandidate.checks.length !== policy.checks.length ||
          checkedCandidate.checks.some((result, index) => result.id !== policy.checks[index].id) ||
          checkedCandidate.fingerprint !== candidateFingerprint(previousChanges, checkedCandidate.checks))
      ) {
        checkedCandidate = undefined;
      }
      let serviceUnavailable = false;
      let feedback: z.infer<typeof recoveryAttempt>['feedback'] | null = attempts.at(-1)?.feedback ?? null;
      const saveRecovery = async (verifyPending = false) => {
        state = {
          ...state!,
          recovery: {
            attempts,
            rejected: [...rejected],
            rejectedOutcomes: [...rejectedOutcomes],
            changes: previousChanges,
            checkedCandidate,
            strategies,
            research: researchHistory,
            researchedAt,
            ...(verifyPending ? { verifyPending: true } : {}),
          },
        };
        await save(state);
      };
      const recordFailure = async (reason: NonNullable<typeof feedback>, candidate?: string, verifyPending = false) => {
        feedback = reason;
        attempts = [...attempts, { feedback: reason }];
        if (candidate) {
          rejected.add(candidate);
          if (Array.isArray(reason) && reason.length && reason.every((item) => typeof item === 'object')) {
            rejectedOutcomes.add(digest(reason.map(({ id, detail }) => [id, detail])));
          }
        }
        await saveRecovery(verifyPending);
      };
      const context = Object.fromEntries([...policy.context, ...(policy.optionalInputs ?? [])].map((name) => [name, snapshot.files[name]]));
      // The planner sees every configured input. Keep unchanged UI definitions and independent copies visible
      // to the later roles too, without expanding which files the approved plan can change.
      const visualFiles = visualPathsAffected(policy.editable, visualSourceScope(snapshot.files));
      const touchesUI =
        Boolean(state.plan.design) || approvedFiles.some((file) => visualFiles.includes(file) || isStandaloneVisualPath(file) || /\.[jt]sx$/i.test(file));
      const componentSources = (provided: string[]) =>
        Object.fromEntries(
          visualFiles
            .filter((file) => !provided.includes(file) && !Object.hasOwn(context, file) && snapshot.files[file] != null)
            .map((file) => [file, snapshot.files[file]]),
        );
      // Older checkpoints saved a proposal before staging it. Re-run the checks before using it as measured context.
      const requalify = !!previousChanges && !checkedCandidate && !state.recovery?.verifyPending;
      const pendingVerification = state.recovery?.verifyPending || requalify ? previousChanges : undefined;
      const originalFiles = approvedFiles.map((name) => [name, snapshot.files[name]]);
      const researchThreshold = policy.researchAfterFailures ?? 3;
      const strategyLimit = 3;
      let strategyReviews = 0;
      let lastStrategyAt = researchedAt;
      let searched = false;
      const strategyEnabled = !!args.search || args.continueRecovery === true;
      let proposalLimit = strategyEnabled ? Math.max(3, researchThreshold + 1) : 3;
      for (let attempt = pendingVerification ? -1 : 0; attempt < proposalLimit; attempt++) {
        if (strategyEnabled && attempt >= 0 && attempts.length - lastStrategyAt >= researchThreshold && strategyReviews < strategyLimit) {
          strategyReviews++;
          lastStrategyAt = attempts.length;
          const topic = researchTopic(policy, attempts.slice(-researchThreshold));
          try {
            // Search only with public diagnostics selected by the engine, never model text, logs or paths.
            const query = topic + ' official documentation GitHub Stack Overflow';
            const savedResearch = researchHistory.findLast((item) => item.attempt === attempts.length && item.query === query);
            const previousResearch = researchHistory.findLast((item) => item.query === query);
            const alreadySearched = searched;
            searched = true;
            const research = savedResearch?.references ?? (alreadySearched ? previousResearch?.references : (await args.search?.(query))?.slice(0, 12_000));
            signal?.throwIfAborted();
            if (research) {
              assertWorkflowText(research);
              if (!savedResearch) {
                researchHistory = [...researchHistory, { query, references: research, attempt: attempts.length }];
                await saveRecovery();
              }
            } else if (args.search) {
              await recordFailure('Ricerca tecnica senza fonti disponibili. Continua la diagnosi locale.');
            }
            const strategy = await generate(state.kind, 'strategy', recoveryStrategy, 'Schema: hypothesis, approach. Prepara il prossimo tentativo tecnico.', {
              plan: state.plan,
              previousChanges,
              failures: attempts.slice(-12).map(({ feedback }) => feedback),
              strategies: strategies.slice(-6),
              research,
              skills,
            });
            const duplicate = strategies.some((previous) => digest(previous) === digest(strategy));
            if (!duplicate) {
              strategies = [...strategies, strategy];
              if (research || args.continueRecovery) {
                proposalLimit = Math.max(proposalLimit, attempt + researchThreshold + (strategyReviews < strategyLimit ? 1 : 0));
              }
            }
            if (research) {
              researchedAt = attempts.length;
            }
            await saveRecovery();
          } catch (error) {
            signal?.throwIfAborted();
            await recordFailure(recoveryMessage(error, 'Ricerca o strategia non disponibile.'));
          }
        }
        let patch: z.infer<typeof changeSchema>;
        try {
          const checkedFiles =
            feedback !== null && checkedCandidate && previousChanges
              ? { ...snapshot.files, ...Object.fromEntries(previousChanges.map(({ path, content }) => [path, content])) }
              : undefined;
          patch =
            attempt < 0 && pendingVerification
              ? { changes: pendingVerification }
              : await generate(
                  state.kind,
                  feedback !== null ? 'debug' : 'implement',
                  changeSchema,
                  'Schema: changes [{path, content}]. content è il testo completo o null per una rimozione approvata. Restituisci solo file del piano.' +
                    (checkedFiles
                      ? ' In files trovi il candidato su cui sono stati eseguiti candidateChecks. Parti da questi contenuti, conserva le modifiche pertinenti e correggi i fallimenti. originalFiles contiene la base approvata: restituisci tutte le differenze che vuoi consegnare rispetto a quella base, comprese le modifiche già valide. Non rimandare soltanto l’ultima correzione.'
                      : ''),
                  {
                    plan: state.plan,
                    ...(state.clarifications && { clarifications: state.clarifications }),
                    projectLessons: await projectLessons([state.request, ...state.plan.files, feedback ? JSON.stringify(feedback) : ''].join(' ')),
                    sources: approvedContext(policy, snapshot.files),
                    files: checkedFiles ? approvedFiles.map((name) => [name, checkedFiles[name]]) : originalFiles,
                    context: checkedFiles ? Object.fromEntries(Object.entries(context).filter(([name]) => !approvedFiles.includes(name))) : context,
                    ...(touchesUI && { componentSources: componentSources(approvedFiles) }),
                    ...(checkedFiles && checkedCandidate && { originalFiles, candidateChecks: checkedCandidate.checks }),
                    baselineChecks,
                    checkDefinitions: policy.checks,
                    skills,
                    previousChanges: checkedFiles ? previousChanges : undefined,
                    feedback,
                    ...(attempts.length ? { previousFailures: attempts.slice(-12).map(({ feedback }) => feedback) } : {}),
                    ...(strategies.length ? { strategy: strategies.at(-1), previousStrategies: strategies.slice(-6) } : {}),
                    ...(researchHistory.length ? { technicalReferences: researchHistory.at(-1) } : {}),
                    projectTask: args.projectTask,
                  },
                );
        } catch (error) {
          if (error instanceof WorkflowModelFailure) {
            serviceUnavailable ||= workflowServiceRetryable(error);
            await recordFailure('Chiamata al Programmatore o al Correttore non riuscita. ' + error.message);
            continue;
          }
          if (!invalidModelResponse(error)) {
            throw error;
          }
          await recordFailure('Proposta priva di uno schema JSON valido.');
          continue;
        }
        const names = patch.changes.map((item) => item.path);
        if (!usableProposal(patch.changes)) {
          await recordFailure('La proposta duplica file, contiene file non approvati o non produce una patch di testo applicabile.');
          continue;
        }
        const candidateHash = digest([...patch.changes].sort((a, b) => a.path.localeCompare(b.path)));
        if (rejected.has(candidateHash) && !(attempt < 0 && requalify)) {
          await recordFailure('La proposta coincide con un candidato già respinto. Usa le evidenze precedenti e cambia strategia.');
          continue;
        }
        previousChanges = patch.changes;
        checkedCandidate = undefined;
        await saveRecovery(true);
        const candidate = Object.fromEntries(Object.entries(snapshot.files));
        for (const change of patch.changes) {
          candidate[change.path] = change.content;
        }
        const dir = await fs.mkdtemp(path.join(jobRoot, 'candidate-'));
        let accepted = false;
        try {
          await stageFiles(dir, candidate);
          const checks = await runChecks(policy, candidate, dir, signal);
          checkedCandidate = { fingerprint: candidateFingerprint(patch.changes, checks), checks };
          if (attempt < 0 && requalify) {
            await saveRecovery();
            continue;
          }
          if (checks.some((check) => !check.passed)) {
            const failures = checks.filter((check) => !check.passed);
            const deterministic = failures.every(({ id }) =>
              policy.checks.some((check) => check.id === id && check.type !== 'browser' && check.type !== 'docker'),
            );
            await recordFailure(failures, deterministic ? candidateHash : undefined);
            continue;
          }
          const requiresDesignerReview = Boolean(state.plan.design) || hasVisualWorkflowImpact(snapshot.files, candidate, names);
          const reviewInput = {
            plan: state.plan,
            ...(state.clarifications && { clarifications: state.clarifications }),
            changes: patch.changes.map((item) => ({ ...item, before: snapshot.files[item.path] })),
            checks,
            baselineChecks,
            checkDefinitions: policy.checks,
            sources: approvedContext(policy, snapshot.files),
            context: requiresDesignerReview ? Object.fromEntries(Object.entries(context).filter(([file]) => !names.includes(file))) : context,
            ...(requiresDesignerReview && { componentSources: componentSources(names) }),
            projectTask: args.projectTask,
            skills,
          };
          let reviews: z.infer<typeof reviewSchema>[];
          try {
            reviews = [await generate(state.kind, 'review', reviewSchema, reviewContract, reviewInput)];
            if (requiresDesignerReview && reviews[0].verdict === 'pass' && !reviews[0].findings.length) {
              reviews.push(await generate(state.kind, 'design-review', reviewSchema, reviewContract, reviewInput));
            }
          } catch (error) {
            if (error instanceof WorkflowModelFailure) {
              serviceUnavailable ||= workflowServiceRetryable(error);
              await recordFailure('Chiamata al Revisore non riuscita. ' + error.message);
              continue;
            }
            if (!invalidModelResponse(error)) {
              throw error;
            }
            await recordFailure('Verdetto di revisione non valido.');
            continue;
          }
          const failed = reviews.find((review) => review.verdict !== 'pass' || review.findings.length);
          if (failed) {
            await recordFailure(failed.findings.length ? failed.findings : 'Revisione negativa.');
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
          if (!snapshot.commit) {
            const baselineDir = await fs.mkdtemp(path.join(jobRoot, 'patch-check-'));
            try {
              await stageFiles(baselineDir, snapshot.files);
              const options = process.platform === 'win32' ? ['-c', 'core.longpaths=true'] : [];
              await run('git', [...options, 'apply', '--check', dir + '.patch'], { cwd: baselineDir, timeout: 10_000, signal, windowsHide: true });
            } catch (error) {
              if (signal?.aborted) {
                throw error;
              }
              await recordFailure('Git non riesce ad applicare la patch alla copia di partenza.');
              continue;
            } finally {
              await fs.rm(baselineDir, { recursive: true, force: true });
            }
          }
          signal?.throwIfAborted();
          const delivered: Receipt = {
            directory: path.basename(dir),
            snapshot: digest({ original: state.baseline, files: candidate }),
            patch: digest(patchText),
            checks,
            ...(baselineChecks && { baselineChecks }),
            files: names,
            ...(requiresDesignerReview && { designReviewed: true }),
          };
          if (snapshot.commit) {
            const base = snapshot.commit;
            const tree = await prepareDevelopmentTree(policy, base, dir + '.patch', names, signal);
            const integrated = await readDevelopmentFiles(policy, tree, signal);
            if (digest(integrated) !== digest(candidate)) {
              throw new Error('L’integrazione differisce dalla versione verificata.');
            }
            const integrationDir = await fs.mkdtemp(path.join(jobRoot, 'integration-'));
            try {
              await stageFiles(integrationDir, integrated);
              delivered.checks = await runChecks(policy, integrated, integrationDir, signal);
            } finally {
              await fs.rm(integrationDir, { recursive: true, force: true });
            }
            if (delivered.checks.some((check) => !check.passed)) {
              await recordFailure(delivered.checks.filter((check) => !check.passed));
              continue;
            }
            const commit = await createDevelopmentCommit(policy, base, tree, state.revision, signal);
            const pending = { ...delivered, integration: { base, commit, policy: digest(policy) } };
            state = { ...state, pendingIntegration: pending };
            await save(state);
            accepted = true;
            state = await finishIntegration(state, pending);
            return { phase: 'done', message: renderDelivery(state, statePath, policy) };
          }
          state = { ...state, delivered };
          await save(state);
          accepted = true;
          return { phase: 'done', message: renderDelivery(state, statePath, policy) };
        } catch (error) {
          if (!signal?.aborted && !accepted) {
            await recordFailure(recoveryMessage(error, 'Verifica o preparazione del candidato interrotta.'), undefined, true);
          }
          throw error;
        } finally {
          if (!accepted) {
            await fs.rm(dir, { recursive: true, force: true });
            await fs.rm(dir + '.patch', { force: true });
          }
        }
      }
      return {
        phase: 'waiting',
        message: 'Correzione in attesa. Stato e diagnosi salvati. ' + JSON.stringify(feedback),
        ...(rejectedOutcomes.size > initialOutcomeCount ? { recoveryProgress: true } : {}),
        ...(serviceUnavailable ? { retryable: true } : {}),
      };
    }

    const command = /^\/workflow (bug|change|feature)\s+([\s\S]+)$/.exec(input);
    if (input.startsWith('/workflow') && !command) {
      throw new Error('Comando workflow non valido.');
    }
    const incoming = command?.[2].trim() ?? input;
    const openPlan = state && state.plan.questions.length && !state.approved && !state.projectTaskId && !args.projectTask ? state : undefined;
    // A new explicit objective starts a fresh plan. Some clients resubmit the original brief with a reply appended.
    let reply: string | undefined;
    if (openPlan && (!command || command[1] === openPlan.kind)) {
      if (incoming === openPlan.request && openPlan.baseline === snapshot.hash) {
        return { phase: 'plan', message: renderPlan(openPlan) };
      }
      if (incoming.startsWith(openPlan.request) && /^\s/.test(incoming.slice(openPlan.request.length))) {
        reply = incoming.slice(openPlan.request.length).trim();
      } else if (!command && incoming !== openPlan.request) {
        reply = incoming;
      }
    }
    const round = openPlan && reply ? { questions: openPlan.plan.questions, reply } : undefined;
    const earlierRounds = openPlan?.clarifications ?? [];
    const kind: WorkflowKind = isWorkflowKind(command?.[1]) ? command[1] : (openPlan?.kind ?? 'feature');
    const request = round && openPlan ? openPlan.request : incoming;
    const checkId = z.enum(policy.checks.map((check) => check.id));
    const availableSkills = (await skillCatalog())?.available ?? [];
    const scopedPlan = planSchema.omit({ design: true, skills: true, catalog: true }).extend({
      surface,
      files: z.array(z.enum(policy.editable)).min(1).max(40),
      criteria: z
        .array(z.strictObject({ scenario: line, check: checkId }))
        .min(1)
        .max(20),
      reproduction: kind === 'bug' ? checkId : checkId.nullable(),
      skillNames: z
        .array(z.enum(availableSkills.map(({ name }) => name)))
        .max(4)
        .optional(),
      components: z.array(z.enum(shadcn.components)).max(3).optional(),
      ...(round && {
        answers: answerDecisions.length(round.questions.length),
      }),
    });
    const { skillNames, components, answers, ...proposedPlan } = await generate(
      kind,
      'plan',
      scopedPlan,
      'Schema: outcome, delta, files[], reuse[], steps[], criteria[{scenario,check}], reproduction (ID per bug o null), questions[], surface, skillNames[], components[]. Scegli i file da editable e i check dalla configurazione. Collega i criteri alla copertura effettiva delle definizioni dei controlli. Per un criterio funzionale usa una prova del comportamento quando disponibile e segnala nel piano ogni comportamento che resta da verificare. Indica surface=none per la sola logica, ui se cambiano interfaccia o interazioni, mobile se è richiesta una UI dedicata al telefono, ui-and-mobile se cambiano entrambe. Seleziona fino a quattro skill pertinenti. Se per la UI serve valutare nuovi componenti e lo stack è compatibile con shadcn, scegli fino a tre tipi da consultare. Quando projectTask è presente, il suo id indica il task attivo e i commit integrati aggiornano il punto di ripresa delle note di stato. projectTask.attestations contiene gli esiti già verificati dalla coda per i prerequisiti del task. Usa questi esiti e il commit attestato, senza chiedere di ripetere la stessa prova.',
      {
        request,
        projectLessons: await projectLessons(request),
        previous: state && !round ? { request: state.request, outcome: state.plan.outcome, delivered: !!state.delivered } : undefined,
        ...(round && {
          clarificationHistory: earlierRounds,
          currentClarification: { ...round, numbered: numberedAnswers(round.reply) },
        }),
        sources: approvedContext(policy, snapshot.files),
        files: snapshot.files,
        editable: policy.editable,
        checks: policy.checks.map((check) => check.id),
        checkDefinitions: policy.checks,
        memory: snapshot.memory,
        availableSkills,
        designCatalog: !!args.designCatalog,
        projectTask: args.projectTask,
      },
    );
    const methods = new Map(policy.checks.map((check) => [check.id, check.type]));
    const reviewed = round ? reconcileQuestions(round, answerDecisions.parse(answers), proposedPlan.questions) : undefined;
    const clarifications = round && reviewed ? [...earlierRounds, { ...round, resolved: reviewed.resolved }] : undefined;
    const plan: State['plan'] = {
      ...proposedPlan,
      questions: reviewed?.open ?? proposedPlan.questions,
      criteria: proposedPlan.criteria.map((criterion) => ({ ...criterion, method: methods.get(criterion.check) })),
      files: [...new Set(proposedPlan.files)],
      surface: args.projectTask?.designSurface ?? proposedPlan.surface,
    };
    const checks = new Set(policy.checks.map((check) => check.id));
    if (
      plan.files.some((name) => !has(snapshot.files, name) || !policy.editable.includes(name)) ||
      plan.criteria.some((item) => !checks.has(item.check)) ||
      (kind === 'bug' && (!plan.reproduction || !checks.has(plan.reproduction)))
    ) {
      throw new Error('Il piano indica file o controlli estranei alla configurazione. Ripresenta la richiesta con un perimetro valido.');
    }
    const selectedSkills = await Promise.all([...new Set(skillNames)].map(async (name) => ({ name, text: await readSkill(name) })));
    if (selectedSkills.length) {
      plan.skills = selectedSkills.map(({ name, text }) => ({ name, hash: digest(text) }));
    }
    if (plan.surface !== 'none' && !plan.questions.length) {
      const ui = plan.surface !== 'mobile';
      const mobile = plan.surface !== 'ui';
      const componentReferences = components?.length ? await args.designCatalog?.([...new Set(components)]) : undefined;
      if (components?.length) {
        plan.catalog = componentReferences?.length ? 'consulted' : 'unavailable';
      }
      plan.design = await generate(
        kind,
        'design',
        designSchema.extend({ ui: ui ? line : z.null(), mobile: mobile ? line : z.null() }),
        'Descrivi sharedLogic, ui, mobile e questions. Per le superfici richieste descrivi un flusso implementabile nei file del piano. Per una superficie esclusa usa null. I risultati del catalogo sono riferimenti esterni. Cita i componenti pertinenti e rispetta la grafica e i contratti del progetto.',
        {
          request,
          plan,
          sources: approvedContext(policy, snapshot.files),
          files: snapshot.files,
          skills: selectedSkills,
          componentReferences,
          ...(clarifications && { clarifications }),
          projectTask: args.projectTask,
        },
      );
      plan.questions = plan.design.questions;
    }
    if (state?.pendingIntegration) {
      const jobRoot = jobs(statePath);
      if (path.relative(jobRoot, await fs.realpath(jobRoot))) {
        throw new Error('Cartella di lavoro del workflow sostituita.');
      }
      await atomicWriteJsonFile(path.join(jobRoot, state.pendingIntegration.directory + '.json'), state);
      if (args.projectTask && (await isIntegrated(policy, state.pendingIntegration.integration.commit, signal))) {
        return { phase: 'done', message: renderDelivery(await finishIntegration(state, state.pendingIntegration), statePath, policy) };
      }
    }
    const attestationRevision = projectAttestationRevision(args.projectTask?.attestations);
    state = {
      version: 2,
      kind,
      request,
      ...(clarifications && { clarifications }),
      baseline: snapshot.hash,
      source: snapshot.source,
      ...(snapshot.commit ? { baseCommit: snapshot.commit } : {}),
      ...(args.projectTask ? { projectTaskId: args.projectTask.id } : {}),
      ...(attestationRevision ? { attestationRevision } : {}),
      revision: digest([kind, request, plan, snapshot.hash, ...(clarifications ?? [])]),
      plan,
      approved: false,
    };
    await save(state);
    return { phase: 'plan', message: renderPlan(state) };
  } finally {
    running.delete(policy.root);
  }
};

const runWorkflowObjective = async (args: Parameters<typeof runWorkflowTask>[0]): Promise<Outcome> => {
  let result = await runWorkflowTask(args);
  while (args.continueRecovery && result.recoveryProgress) {
    args.signal?.throwIfAborted();
    args.onProgress?.('Rivaluto la correzione dalle nuove evidenze salvate.');
    result = await runWorkflowTask({ ...args, prompt: '/workflow resume' });
  }
  return result;
};

export const runRepositoryWorkflow = async (args: Parameters<typeof runWorkflowTask>[0]): Promise<Outcome> => {
  const command = parseProjectWorkflowCommand(args.prompt);
  const root = args.policy.root;
  if (runningProjects.has(root)) {
    throw new WorkflowServiceUnavailable('Il piano di lavoro di questo progetto è già in esecuzione.');
  }
  if (!command) {
    if (!args.continueRecovery) {
      return runWorkflowTask(args);
    }
    if (running.has(root)) {
      throw new WorkflowServiceUnavailable('Un task di questo progetto è già in corso.');
    }
    runningProjects.add(root);
    try {
      return await runWorkflowObjective(args);
    } finally {
      runningProjects.delete(root);
    }
  }
  if (running.has(root)) {
    throw new WorkflowServiceUnavailable('Un task di questo progetto è già in corso.');
  }
  runningProjects.add(root);
  try {
    return await runProjectWorkflow({
      policy: args.policy,
      statePath: args.statePath,
      command,
      trackObjective: args.continueRecovery,
      expectedContinuationRevision: args.expectedContinuationRevision,
      status: (statePath, policy) => readRepositoryWorkflow(statePath, policy, true),
      recover: (statePath, policy, head, taskId) => recoverPublishedReceipt(statePath, policy, head, taskId, args.signal),
      legacyReceipts: (workspace, head) => legacyQueueReceipts(workspace, args.policy, head, args.signal),
      execute: (statePath, policy, prompt, expectedWorkPlan, projectTask, expectedDevelopmentHead) =>
        runWorkflowObjective({ ...args, statePath, policy, prompt, expectedWorkPlan, projectTask, expectedDevelopmentHead }),
      verify: async (statePath, policy, commit) => {
        const files = await readDevelopmentFiles(policy, commit, args.signal);
        if (policy.checks.some((check) => check.type === 'docker')) {
          await ensureWorkflowDocker(args.signal, args.onProgress);
        }
        const dir = await fs.mkdtemp(path.join(path.dirname(statePath), 'recheck-'));
        try {
          await stageFiles(dir, files);
          return await runChecks(policy, files, dir, args.signal);
        } finally {
          await fs.rm(dir, { recursive: true, force: true });
        }
      },
      investigate: async (policy, input) => {
        const files = await readDevelopmentFiles(policy, input.commit, args.signal);
        args.signal?.throwIfAborted();
        const payload = JSON.stringify({ ...input, files, checks: policy.checks });
        assertWorkflowText(payload);
        const instructions =
          workflowSkills(input.kind, 'investigate') +
          '\nRestituisci JSON con findings[] e checks[] (ID di controlli configurati). Le conclusioni sono diagnostiche e non autorizzano modifiche o riuso di prove.';
        const raw = await args.generate('investigate', instructions, payload);
        args.signal?.throwIfAborted();
        if (raw) {
          assertWorkflowText(raw);
        }
        const result = parse(workflowInvestigation, raw);
        const configured = new Set(policy.checks.map(({ id }) => id));
        return { ...result, checks: [...new Set(result.checks.filter((id) => configured.has(id)))] };
      },
      signal: args.signal,
    });
  } finally {
    runningProjects.delete(root);
  }
};
