import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { developmentChangedFiles, developmentFilesMatch, isIntegrated, readDevelopmentFiles, readDevelopmentHead } from './workflow-development';
import { workflowServiceRetryable } from './workflow-docker';
import { assertWorkflowText, requiredWorkflowChecks, validateWorkflowPath, workflowFileNames, type WorkflowProject } from './workflow-policy';

import type { parseProjectWorkflowCommand } from './workflow-project-commands';

import { atomicWriteJsonFile } from '@/utils/atomic-write';

const text = z.string().trim().min(1).max(1200);
const id = z
  .string()
  .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/)
  .max(80);
const validation = z.strictObject({
  id,
  title: text,
  environment: text,
  steps: z.array(text).min(1).max(30),
  expected: text,
  files: z.array(z.string()).min(1).optional(),
});
const workPlan = z.strictObject({
  tasks: z.array(
    z.strictObject({
      id,
      kind: z.enum(['bug', 'change', 'feature']),
      request: text,
      files: z.array(z.string()).min(1),
      checks: z.array(z.string()).min(1),
      dependsOn: z.array(id).default([]),
      evidenceFiles: z.array(z.string()).min(1).optional(),
      evidenceRevision: z
        .string()
        .regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)
        .optional(),
      afterValidation: z.array(id).default([]),
      validations: z.array(validation).default([]),
    }),
  ),
});
const progressRecord = z.strictObject({
  commit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
  confirmed: z.number().int().nonnegative(),
  passed: z.boolean().optional(),
  notes: text.optional(),
});
const checkResult = z.object({ id: z.string(), passed: z.boolean(), detail: z.string() });
const currentEvidence = z.strictObject({ commit: progressRecord.shape.commit, results: z.array(checkResult).min(1) });
export const workflowInvestigation = z.strictObject({ findings: z.array(text).min(1).max(8), checks: z.array(z.string()).max(20) });
const progressFile = z.strictObject({
  records: z.record(z.string(), progressRecord),
  history: z.record(z.string(), progressRecord),
  open: z.record(z.string(), z.strictObject({ key: z.string(), commit: progressRecord.shape.commit })),
  legacyTasks: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)).default({}),
  checks: z.record(z.string(), z.array(currentEvidence)).default({}),
  investigations: z.record(z.string(), workflowInvestigation).default({}),
});
type Progress = z.infer<typeof progressFile>;
type WorkTask = z.infer<typeof workPlan>['tasks'][number];
type Command = NonNullable<ReturnType<typeof parseProjectWorkflowCommand>>;
type TaskStatus = {
  phase: string;
  revision?: string;
  commit?: string;
  baseCommit?: string;
  attestationRevision?: string;
  pendingPolicyChanged?: boolean;
  plan?: { questions: string[] };
};
type LegacyReceipt = { key: string; policyHash: string; base: string; taskId?: string };
export type ProjectTaskContext = {
  id: string;
  integrated: { id: string; commit: string }[];
  attestations?: { id: string; commit: string; passed: true }[];
};

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const projectAttestationRevision = (attestations: ProjectTaskContext['attestations']): string | undefined =>
  attestations?.length ? digest(attestations) : undefined;
const validationRevision = (records: Progress['records']) =>
  digest(Object.entries(records).flatMap(([key, { commit, passed }]) => (passed === undefined ? [] : [[key, commit, passed]])));
export const projectContinuationRevision = async (policy: WorkflowProject, head: string, signal?: AbortSignal): Promise<string> => {
  const references = policy.references.filter(({ path, role }) => path === 'docs/agentlab-services.json' || (role !== 'state' && role !== 'handoff'));
  const files = await readDevelopmentFiles({ ...policy, context: [], editable: [], references }, head, signal);
  return digest([policy, files]);
};

export const readWorkflowValidationRevision = async (policy: WorkflowProject, statePath: string): Promise<string> => {
  const registry = path.join(path.dirname(statePath), digest(policy.root) + '-validazioni.json');
  try {
    const state = progressFile.parse(JSON.parse(await fs.readFile(registry, 'utf8')));
    return validationRevision(state.records);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    return validationRevision({});
  }
};
const taskDefinition = ({ id, kind, request, files, checks, dependsOn, afterValidation }: WorkTask) => ({
  id,
  kind,
  request,
  files,
  checks,
  dependsOn,
  afterValidation,
});
const manualResult = (message: string) => ({ phase: 'waiting' as const, message: '## Validazioni manuali\n\n' + message });

export const runProjectWorkflow = async (args: {
  policy: WorkflowProject;
  statePath: string;
  command: Command;
  status: (statePath: string, policy: WorkflowProject) => Promise<TaskStatus>;
  recover: (statePath: string, policy: WorkflowProject, head: string, taskId: string) => Promise<void>;
  legacyReceipts: (workspace: string, head: string) => Promise<LegacyReceipt[]>;
  verify: (statePath: string, policy: WorkflowProject, commit: string) => Promise<{ id: string; passed: boolean; detail: string }[]>;
  investigate: (
    policy: WorkflowProject,
    input: { task: string; kind: WorkTask['kind']; commit: string; unknownFiles: string[] },
  ) => Promise<z.infer<typeof workflowInvestigation>>;
  execute: (
    statePath: string,
    policy: WorkflowProject,
    prompt: string,
    source: string,
    task: ProjectTaskContext,
    expectedDevelopmentHead: string,
  ) => Promise<{ phase: string; message: string; retryable?: boolean }>;
  signal?: AbortSignal;
  trackObjective?: boolean;
  expectedContinuationRevision?: string;
}) => {
  const { policy, command, signal } = args;
  if (!policy.branches || !policy.workPlan || !policy.references.some(({ role }) => role === 'blueprint')) {
    throw new Error('Il flusso richiede un blueprint, un piano di lavoro versionato e i due rami configurati.');
  }
  const planPath = policy.workPlan;
  const readPlan = async (head: string) => {
    const files = await readDevelopmentFiles({ ...policy, context: [], editable: [], references: [] }, head, signal);
    return files[planPath]!;
  };
  const previousPlans = new Map<string, WorkTask[]>();
  const readPreviousTasks = async (commit: string) => {
    const previous = previousPlans.get(commit);
    if (previous) {
      return previous;
    }
    const { tasks } = workPlan.parse(JSON.parse(await readPlan(commit)));
    previousPlans.set(commit, tasks);
    return tasks;
  };
  const initialHead = await readDevelopmentHead(policy, signal);
  const source = await readPlan(initialHead);
  if (args.expectedContinuationRevision && (await projectContinuationRevision(policy, initialHead, signal)) !== args.expectedContinuationRevision) {
    throw new Error('Il piano autorizzato o la configurazione sono cambiati prima della ripresa.');
  }
  const { tasks } = workPlan.parse(JSON.parse(source));
  const workspace = path.dirname(args.statePath);
  const project = digest(policy.root);
  const registry = path.join(workspace, `${project}-validazioni.json`);
  const state: Progress = await fs.readFile(registry, 'utf8').then(
    (content) => progressFile.parse(JSON.parse(content)),
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return { records: {}, history: {}, open: {}, legacyTasks: {}, checks: {}, investigations: {} };
      }
      throw error;
    },
  );
  const progress = state.records;
  const chat = digest(args.statePath);
  const save = () => atomicWriteJsonFile(registry, state);

  const taskKeys = new Map<string, string>();
  const evidence = new Map<string, { key: string; legacyKey: string; files: string[] }>();
  const validationEvidence = new Map<string, { key: string; owner: string; files: string[] }>();
  const projectFiles = new Set(workflowFileNames(policy));
  const sources = policy.references.filter(({ role }) => role !== 'state' && role !== 'handoff').map(({ path }) => path);
  const { evidenceExcludes, legacyReceipts, researchAfterFailures, requiredChecks, ...basePolicy } = policy;
  const mandatory = requiredWorkflowChecks(policy);
  const mandatoryInputs = mandatory.flatMap((check) => ('file' in check ? [check.file] : []));
  const aliases = Object.values(legacyReceipts ?? {});
  if (new Set(aliases).size !== aliases.length) {
    throw new Error('Una ricevuta precedente è associata a più task.');
  }
  const protectedPaths = [planPath, ...policy.references.map((reference) => reference.path)];
  const policyFor = (task: Pick<WorkTask, 'files' | 'checks'>) => {
    const checks = policy.checks.filter((check) => task.checks.includes(check.id));
    const context = [...new Set([...policy.context, ...checks.flatMap((check) => ('file' in check && !task.files.includes(check.file) ? [check.file] : []))])];
    return { ...basePolicy, editable: task.files, checks, context };
  };
  const taskKeyFor = (task: ReturnType<typeof taskDefinition>, taskPolicy: WorkflowProject, keys: Map<string, string>) =>
    digest([task, taskPolicy, task.dependsOn.map((dependency) => keys.get(dependency))]);
  const legacyKeys = (tasks: WorkTask[], policyHash: string) => {
    const keys = new Map<string, string>();
    return tasks.map((definition) => {
      const task = taskDefinition(definition);
      const taskPolicy = policyFor(task);
      const key = taskKeyFor(task, taskPolicy, keys);
      keys.set(task.id, key);
      return { id: task.id, key: digest([project, key]), matchingPolicy: digest(taskPolicy) === policyHash };
    });
  };
  const entries = tasks.map((task) => {
    if (
      taskKeys.has(task.id) ||
      task.dependsOn.some((dependency) => !taskKeys.has(dependency)) ||
      task.afterValidation.some((dependency) => !validationEvidence.has(dependency))
    ) {
      throw new Error('Task duplicato o dipendenza da un task o una prova fuori ordine nel piano.');
    }
    const taskPolicy = policyFor(task);
    if (
      new Set(task.files).size !== task.files.length ||
      task.files.some((file) => !policy.editable.includes(file) || protectedPaths.includes(file)) ||
      taskPolicy.checks.length !== task.checks.length
    ) {
      throw new Error('Il task ' + task.id + ' usa file o controlli fuori dal perimetro configurato.');
    }
    const { context } = taskPolicy;
    const { validations: definitions, evidenceFiles, evidenceRevision } = task;
    const key = taskKeyFor(taskDefinition(task), taskPolicy, taskKeys);
    taskKeys.set(task.id, key);
    const dependencies = task.dependsOn.map((dependency) => evidence.get(dependency)!);
    const manualDependencies = task.afterValidation.map((dependency) => validationEvidence.get(dependency)!);
    const excludes = (evidenceExcludes?.[task.id] ?? []).map(validateWorkflowPath);
    const evidenceParts = [key, evidenceFiles, evidenceRevision, excludes, dependencies.map(({ key }) => key), manualDependencies.map(({ key }) => key)];
    const evidenceKey = digest(requiredChecks?.length ? [...evidenceParts, mandatory] : evidenceParts);
    const legacyEvidenceKey = digest([
      key,
      evidenceFiles,
      evidenceRevision,
      dependencies.map(({ legacyKey }) => legacyKey),
      manualDependencies.map(({ key }) => key),
    ]);
    const inheritedFiles = [...dependencies, ...manualDependencies].flatMap(({ files }) => files);
    if (mandatory.length) {
      const ids = new Set([...task.checks, ...mandatory.map(({ id }) => id)]);
      taskPolicy.checks = policy.checks.filter(({ id }) => ids.has(id));
    }
    if (evidenceFiles?.some((file) => !projectFiles.has(file))) {
      throw new Error('Il task ' + task.id + ' dichiara una dipendenza fuori dal perimetro configurato.');
    }
    const files = [...new Set([...sources, ...context, ...task.files, ...(evidenceFiles ?? []), ...inheritedFiles, ...mandatoryInputs])];
    const additional = [...new Set([...(evidenceFiles ?? []), ...inheritedFiles, ...mandatoryInputs])].filter(
      (file) => !protectedPaths.includes(file) && !task.files.includes(file) && !context.includes(file),
    );
    if (additional.length) {
      taskPolicy.optionalInputs = additional;
    }
    evidence.set(task.id, { key: evidenceKey, legacyKey: legacyEvidenceKey, files });
    const excluded = new Set(excludes.filter((file) => !files.includes(file) && !policy.references.some((reference) => reference.path === file)));
    const validations = definitions.map((item) => {
      if (validationEvidence.has(item.id)) {
        throw new Error('Validazione duplicata nel piano: ' + item.id);
      }
      if (item.files?.some((file) => !projectFiles.has(file))) {
        throw new Error('La validazione ' + item.id + ' usa file fuori perimetro.');
      }
      const validationKey = evidenceRevision || evidenceFiles ? digest([key, item, legacyEvidenceKey]) : digest([key, item]);
      validationEvidence.set(item.id, { key: validationKey, owner: task.id, files: [...new Set([...files, ...(item.files ?? [])])] });
      return { ...item, excluded: new Set([...excluded].filter((file) => !item.files?.includes(file))), key: validationKey };
    });
    return {
      ...task,
      validations,
      evidenceKey,
      excluded,
      policy: researchAfterFailures === undefined ? taskPolicy : { ...taskPolicy, researchAfterFailures },
      legacyKey: digest([project, key]),
    };
  });
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const queuePath = (entry: (typeof entries)[number]) => path.join(workspace, `${digest([project, entry.id])}-task.json`);

  const completed = new Map<string, string>();
  let retryable = false;
  const validated = new Set<string>();
  const changes = new Map<string, string[]>();
  const changedFiles = async (from: string, to: string) => {
    if (from === to) {
      return [];
    }
    const key = from + ':' + to;
    const files = changes.get(key) ?? (await developmentChangedFiles(policy, from, to, signal));
    changes.set(key, files);
    return files;
  };
  const changedInputs = async (from: string, to: string, excluded: Set<string>) => (await changedFiles(from, to)).filter((file) => !excluded.has(file));
  const register = async (entry: (typeof entries)[number], commit: string, head: string) => {
    completed.set(entry.id, commit);
    if (!entry.validations.length) {
      return;
    }
    let changed = false;
    for (const item of entry.validations) {
      const previous = progress[item.key];
      const previousIsCurrent =
        previous && (await isIntegrated(policy, previous.commit, signal, head)) && (await changedInputs(previous.commit, head, item.excluded)).length === 0;
      if (!previousIsCurrent) {
        if (previous) {
          state.history[digest([item.key, previous.commit])] = previous;
        }
        const version = !entry.evidenceRevision && (await changedInputs(commit, head, item.excluded)).length === 0 ? commit : head;
        progress[item.key] = { commit: version, confirmed: 0 };
        changed = true;
      }
      if (progress[item.key].passed === true) {
        validated.add(item.id);
      } else {
        validated.delete(item.id);
      }
    }
    if (changed) {
      await save();
    }
  };

  const completedCommit = async (status: TaskStatus, head: string) =>
    status.commit && (await isIntegrated(policy, status.commit, signal, head)) ? status.commit : undefined;

  let indexedReceipts: Promise<LegacyReceipt[]> | undefined;
  const taskStatus = async (entry: (typeof entries)[number], head: string) => {
    const taskKey = digest(entry.id);
    const mapped = state.legacyTasks[taskKey];
    if (mapped) {
      const file = path.join(workspace, mapped + '.json');
      await args.recover(file, entry.policy, head, entry.id);
      return { file, status: await args.status(file, entry.policy) };
    }
    const file = queuePath(entry);
    await args.recover(file, entry.policy, head, entry.id);
    const current = await args.status(file, entry.policy);
    if (current.phase !== 'empty') {
      return { file, status: current };
    }
    let legacyKey = entry.legacyKey;
    let legacyFile = path.join(workspace, legacyKey + '.json');
    const mappedKeys = new Set(Object.values(state.legacyTasks));
    const approvedKey = legacyReceipts?.[entry.id];
    if (mappedKeys.has(legacyKey) || (approvedKey && mappedKeys.has(approvedKey))) {
      return { file, status: { phase: 'legacy-uncertain' } as TaskStatus };
    }
    await args.recover(legacyFile, entry.policy, head, entry.id);
    let legacy = await args.status(legacyFile, entry.policy);
    if (legacy.phase === 'empty') {
      indexedReceipts ??= args.legacyReceipts(workspace, initialHead);
      const matches: LegacyReceipt[] = [];
      for (const receipt of await indexedReceipts) {
        if (mappedKeys.has(receipt.key)) {
          continue;
        }
        try {
          const previous = await readPreviousTasks(receipt.base);
          const match = legacyKeys(previous, receipt.policyHash).find(({ key, matchingPolicy }) => key === receipt.key && matchingPolicy);
          if (match?.id === entry.id || (!match && approvedKey === receipt.key && previous.some(({ id }) => id === entry.id))) {
            if (!receipt.taskId || receipt.taskId === entry.id) {
              matches.push(receipt);
            }
          }
        } catch {
          signal?.throwIfAborted();
        }
      }
      if (matches.length > 1 || (approvedKey && !matches.some(({ key }) => key === approvedKey))) {
        return { file, status: { phase: 'legacy-uncertain' } as TaskStatus };
      }
      if (!matches.length) {
        return { file, status: current };
      }
      legacyKey = matches[0].key;
      legacyFile = path.join(workspace, legacyKey + '.json');
      await args.recover(legacyFile, entry.policy, head, entry.id);
      legacy = await args.status(legacyFile, entry.policy);
    }
    if (approvedKey && approvedKey !== legacyKey) {
      return { file, status: { phase: 'legacy-uncertain' } as TaskStatus };
    }
    state.legacyTasks[taskKey] = legacyKey;
    await save();
    return { file: legacyFile, status: legacy };
  };

  const evidenceResults = new Map<string, boolean>();
  const evidenceIssues = new Map<string, string>();
  const refreshEvidence = async (entry: (typeof entries)[number], head: string): Promise<boolean> => {
    const key = digest([entry.evidenceKey, head]);
    const known = evidenceResults.get(key);
    if (known !== undefined) {
      return known;
    }
    evidenceIssues.delete(entry.id);
    const current = await evaluateEvidence(entry, head);
    evidenceResults.set(key, current);
    return current;
  };

  const evaluateEvidence = async (entry: (typeof entries)[number], head: string): Promise<boolean> => {
    const commit = completed.get(entry.id);
    if (!commit || !(await isIntegrated(policy, commit, signal, head))) {
      return false;
    }
    if (!(await prerequisitesCurrent(entry, head))) {
      return false;
    }
    const evidenceKey = digest([entry.evidenceKey, commit]);
    const history = state.checks[evidenceKey] ?? [];
    const latest = history.at(-1);
    const saved = latest?.results.every((result) => result.passed) ? latest : undefined;
    const from = saved?.commit ?? commit;
    // A change to the contract needs a new approved check definition, even if the old check still passes.
    const sourcesChanged = commit !== head && !(await developmentFilesMatch(policy, commit, head, sources, signal));
    const oldTask = (await readPreviousTasks(commit)).find(({ id }) => id === entry.id);
    const definitionChanged = !oldTask || digest(taskDefinition(oldTask)) !== digest(taskDefinition(entry));
    if (sourcesChanged || definitionChanged) {
      const revision = entry.evidenceRevision;
      const reviewed =
        revision && (await isIntegrated(policy, revision, signal, head)) && (await developmentFilesMatch(policy, revision, head, sources, signal));
      const reviewedTask = reviewed && (await readPreviousTasks(revision)).find(({ id }) => id === entry.id);
      if (!reviewed || (definitionChanged && (!reviewedTask || digest(taskDefinition(reviewedTask)) !== digest(taskDefinition(entry))))) {
        evidenceIssues.set(
          entry.id,
          (sourcesChanged ? 'fonti approvate cambiate' : 'definizione del task cambiata') + ': riesamina i criteri e aggiorna la revisione delle prove',
        );
        return false;
      }
    }
    const hasBrowser = entry.policy.checks.some((check) => check.type === 'browser');
    const inputsChanged = await changedInputs(from, head, entry.excluded);
    if (!hasBrowser && !inputsChanged.length && (from === head || (await isIntegrated(policy, from, signal, head)))) {
      if (saved) {
        return true;
      }
      if (!latest && !entry.evidenceRevision) {
        const { status } = await taskStatus(entry, head);
        if (status.phase === 'done' && status.commit === commit) {
          return true;
        }
      }
    }
    const inputs = new Set(workflowFileNames(entry.policy));
    const unknownFiles = inputsChanged.filter((file) => !inputs.has(file));
    if (unknownFiles.length) {
      const investigationKey = digest([evidenceKey, head, unknownFiles]);
      let diagnosis = state.investigations[investigationKey];
      let detail = 'copertura delle dipendenze da verificare';
      try {
        if (!diagnosis) {
          diagnosis = await args.investigate(entry.policy, { task: entry.id, kind: entry.kind, commit: head, unknownFiles });
          signal?.throwIfAborted();
          state.investigations[investigationKey] = diagnosis;
          await save();
        }
        detail += '. Diagnosi: ' + diagnosis.findings.join(' ');
        if (diagnosis.checks.length) {
          detail += ' Controlli pertinenti: ' + diagnosis.checks.join(', ') + '.';
        }
      } catch (error) {
        signal?.throwIfAborted();
        retryable ||= workflowServiceRetryable(error);
        detail += '. Indagine tecnica in attesa di un esito utilizzabile.';
      }
      evidenceIssues.set(entry.id, detail);
      return false;
    }
    let results;
    try {
      results = await args.verify(queuePath(entry), entry.policy, head);
      if ((await readDevelopmentHead(policy, signal)) !== head) {
        return false;
      }
      if (results.length !== entry.policy.checks.length || entry.policy.checks.some((check) => !results.some((result) => result.id === check.id))) {
        return false;
      }
    } catch (error) {
      signal?.throwIfAborted();
      retryable ||= workflowServiceRetryable(error);
      evidenceIssues.set(entry.id, error instanceof Error ? error.message : 'verifica indisponibile');
      return false;
    }
    if (!latest || digest(latest) !== digest({ commit: head, results })) {
      state.checks[evidenceKey] = [...history, { commit: head, results }];
      await save();
    }
    const failed = results.filter((result) => !result.passed).map((result) => result.id);
    if (failed.length) {
      evidenceIssues.set(entry.id, 'controlli falliti: ' + failed.join(', '));
    }
    return failed.length === 0;
  };

  const prerequisitesCurrent = async (entry: (typeof entries)[number], head: string) => {
    if (entry.afterValidation.some((dependency) => !validated.has(dependency))) {
      return false;
    }
    const upstream = new Set([...entry.dependsOn, ...entry.afterValidation.map((dependency) => validationEvidence.get(dependency)!.owner)]);
    for (const dependency of upstream) {
      if (!(await refreshEvidence(byId.get(dependency)!, head))) {
        return false;
      }
    }
    return true;
  };

  const refreshValidations = async (head: string) => {
    for (const entry of entries) {
      const commit = completed.get(entry.id);
      if (commit && entry.validations.length) {
        await register(entry, commit, head);
      }
    }
  };

  if (command.kind !== 'start') {
    const head = initialHead;
    for (const entry of entries) {
      const { status } = await taskStatus(entry, head);
      const commit = await completedCommit(status, head);
      if (commit) {
        await register(entry, commit, head);
      }
    }
    const pending = entries.flatMap((entry) => (completed.has(entry.id) ? entry.validations : []));
    const item =
      command.kind === 'resume-validation' ? pending.find(({ key }) => progress[key].passed === undefined) : pending.find(({ id }) => id === command.id);
    if (!item) {
      return manualResult(command.kind === 'resume-validation' ? 'Nessuna prova da riprendere.' : 'La prova richiesta non è disponibile.');
    }
    const record = progress[item.key];
    if ((await readDevelopmentHead(policy, signal)) !== head) {
      return manualResult('Il ramo è cambiato durante la verifica. Scrivi «Riprendi le validazioni» per aprire la versione corrente.');
    }
    if (command.kind === 'resume-validation') {
      state.open[chat] = { key: item.key, commit: record.commit };
      await save();
    } else if (state.open[chat]?.key !== item.key || state.open[chat]?.commit !== record.commit) {
      return manualResult('La prova aperta si riferisce a una versione precedente. Scrivi «Riprendi le validazioni» per aprire quella corrente.');
    }
    if (command.kind === 'confirm-step') {
      if (record.passed !== undefined || command.step > item.steps.length || command.step > record.confirmed + 1) {
        return manualResult('Conferma il prossimo passaggio della prova in corso.');
      }
      record.confirmed = Math.max(record.confirmed, command.step);
      await save();
    } else if (command.kind === 'record-result') {
      const notes = command.notes ? text.parse(command.notes) : undefined;
      if (notes) {
        assertWorkflowText(notes);
      }
      record.passed = command.passed;
      record.notes = notes;
      await save();
      return manualResult(
        `${item.id} ${command.passed ? 'superata' : 'fallita'}. Esito complessivo registrato sul commit ${record.commit}.\n\n` +
          `Passaggi confermati singolarmente: ${record.confirmed} su ${item.steps.length}.`,
      );
    }
    const next = record.confirmed + 1;
    return manualResult(
      [
        `${item.id} · ${item.title}`,
        `Versione da provare: ${record.commit}`,
        `Ambiente: ${item.environment}`,
        ...(record.confirmed ? [`Ultimo passaggio confermato: ${record.confirmed}. ${item.steps[record.confirmed - 1]}`] : []),
        ...(item.steps[next - 1] ? [`Prossimo passaggio: ${next}. ${item.steps[next - 1]}`, `Conferma passaggio ${item.id} ${next}`] : []),
        `Risultato atteso: ${item.expected}`,
        `Registra esito ${item.id} superata oppure Registra esito ${item.id} fallita`,
      ].join('\n'),
    );
  }

  const waiting = new Map<string, string>();
  const deferred = new Map<string, (typeof entries)[number]>();
  const queue = entries.map((entry) => ({ entry, retry: false }));
  for (let index = 0; index < queue.length; index++) {
    const { entry, retry } = queue[index];
    const retryOnCurrentHead = () => queue.splice(index + 1, 0, { entry, retry: true });
    const resumeDeferred = () => {
      queue.push(...[...deferred.values()].map((entry) => ({ entry, retry: false })));
      deferred.clear();
    };
    const wait = (message: string) => waiting.set(entry.id, entry.id + ' · ' + message);
    waiting.delete(entry.id);
    signal?.throwIfAborted();
    const evidenceHead = await readDevelopmentHead(policy, signal);
    if (
      (await readPlan(evidenceHead)) !== source ||
      (args.expectedContinuationRevision && (await projectContinuationRevision(policy, evidenceHead, signal)) !== args.expectedContinuationRevision)
    ) {
      wait('Il piano di lavoro è cambiato durante l’esecuzione. La coda resta in attesa sulla nuova versione.');
      break;
    }
    let selected;
    try {
      selected = await taskStatus(entry, evidenceHead);
    } catch (error) {
      signal?.throwIfAborted();
      wait(error instanceof Error ? error.message : 'ricevuta indisponibile');
      continue;
    }
    const { file, status } = selected;
    if (status.phase === 'legacy-uncertain') {
      wait('associazione della ricevuta storica non verificata');
      continue;
    }
    const commit = await completedCommit(status, evidenceHead);
    if (commit) {
      await register(entry, commit, await readDevelopmentHead(policy, signal));
      continue;
    }
    if (status.commit) {
      wait('il commit della ricevuta storica è fuori dal ramo di sviluppo');
      continue;
    }
    if (entry.dependsOn.length || entry.afterValidation.length) {
      await refreshValidations(evidenceHead);
    }
    try {
      const ready = await prerequisitesCurrent(entry, evidenceHead);
      const head = await readDevelopmentHead(policy, signal);
      if (head !== evidenceHead) {
        if (!retry) {
          retryOnCurrentHead();
          continue;
        }
        wait('il ramo è cambiato durante la verifica delle dipendenze');
        continue;
      }
      if (!ready) {
        deferred.set(entry.id, entry);
        wait('dipendenza in attesa');
        continue;
      }
      const attestations = entry.afterValidation.map((id) => ({ id, commit: progress[validationEvidence.get(id)!.key].commit, passed: true as const }));
      const taskContext: ProjectTaskContext = {
        id: entry.id,
        integrated: [...completed].map(([id, commit]) => ({ id, commit })),
        ...(attestations.length ? { attestations } : {}),
      };
      const execute = (prompt: string) => args.execute(file, entry.policy, prompt, source, taskContext, evidenceHead);
      const sameBase = status.baseCommit === head;
      let outcome;
      if (status.phase === 'approved' && sameBase && !status.pendingPolicyChanged) {
        outcome = await execute('/workflow resume');
      } else {
        const planning =
          sameBase && status.phase === 'plan' && (!status.plan?.questions.length || status.attestationRevision === projectAttestationRevision(attestations));
        if (!planning) {
          await execute(`/workflow ${entry.kind} ${entry.request}`);
        }
        const planned = await args.status(file, entry.policy);
        if (planned.plan?.questions.length) {
          wait(planned.plan.questions.join(' '));
          continue;
        }
        if (planned.phase === 'plan' && planned.revision) {
          outcome = await execute('/workflow approve ' + planned.revision);
        }
      }
      const result = await args.status(file, entry.policy);
      const currentHead = await readDevelopmentHead(policy, signal);
      const integrated = await completedCommit(result, currentHead);
      if (integrated) {
        await register(entry, integrated, currentHead);
        if (currentHead !== evidenceHead) {
          resumeDeferred();
        }
      } else {
        retryable ||= outcome?.retryable === true;
        wait(outcome?.message.split('\n')[0] || 'verifiche o decisioni in attesa');
      }
    } catch (error) {
      signal?.throwIfAborted();
      retryable ||= workflowServiceRetryable(error);
      if (!retry && (await readDevelopmentHead(policy, signal)) !== evidenceHead) {
        retryOnCurrentHead();
        continue;
      }
      wait(error instanceof Error ? error.message : 'interruzione durante il task');
    }
  }
  const finalHead = await readDevelopmentHead(policy, signal);
  await refreshValidations(finalHead);
  const pending = entries.flatMap((entry) => (completed.has(entry.id) ? entry.validations.filter((item) => progress[item.key]?.passed === undefined) : []));
  const failed = entries.flatMap((entry) => (completed.has(entry.id) ? entry.validations.filter((item) => progress[item.key]?.passed === false) : []));
  let objectiveComplete = args.trackObjective && entries.length > 0 && completed.size === entries.length && !waiting.size && !pending.length && !failed.length;
  if (objectiveComplete) {
    for (const entry of entries) {
      if (!(await refreshEvidence(entry, finalHead))) {
        objectiveComplete = false;
        break;
      }
    }
    objectiveComplete &&=
      (await readPlan(finalHead)) === source &&
      (!args.expectedContinuationRevision || (await projectContinuationRevision(policy, finalHead, signal)) === args.expectedContinuationRevision) &&
      (await readDevelopmentHead(policy, signal)) === finalHead;
  }
  return {
    phase: 'waiting' as const,
    objectiveComplete,
    observedHead: finalHead,
    observedValidation: validationRevision(progress),
    retryable,
    message: [
      '## Piano di lavoro',
      `Task integrati sul ramo di sviluppo: ${[...completed.keys()].join(', ') || 'nessuno'}.`,
      ...(waiting.size ? ['Attività in attesa:\n- ' + [...waiting.values()].join('\n- ')] : []),
      ...(evidenceIssues.size ? ['Verifiche da risolvere:\n- ' + [...evidenceIssues].map(([id, detail]) => id + ' · ' + detail).join('\n- ')] : []),
      ...(pending.length ? [`Validazioni in attesa: ${pending.map(({ id }) => id).join(', ')}. Scrivi «Riprendi le validazioni».`] : []),
      ...(failed.length ? [`Validazioni con esito negativo da correggere: ${failed.map(({ id }) => id).join(', ')}.`] : []),
    ].join('\n\n'),
  };
};
