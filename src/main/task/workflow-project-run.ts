import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { developmentFilesMatch, isIntegrated, readDevelopmentFiles, readDevelopmentHead } from './workflow-development';
import { assertWorkflowText, workflowFileNames, type WorkflowProject } from './workflow-policy';

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
const progressFile = z.strictObject({
  records: z.record(z.string(), progressRecord),
  history: z.record(z.string(), progressRecord),
  open: z.record(z.string(), z.strictObject({ key: z.string(), commit: progressRecord.shape.commit })),
});
type Progress = z.infer<typeof progressFile>;
type Command = NonNullable<ReturnType<typeof parseProjectWorkflowCommand>>;
type TaskStatus = { phase: string; revision?: string; commit?: string; baseCommit?: string; pendingCommit?: string; plan?: { questions: string[] } };
export type ProjectTaskContext = { id: string; integrated: { id: string; commit: string }[] };

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const manualResult = (message: string) => ({ phase: 'waiting' as const, message: '## Validazioni manuali\n\n' + message });

export const runProjectWorkflow = async (args: {
  policy: WorkflowProject;
  statePath: string;
  command: Command;
  status: (statePath: string, policy: WorkflowProject) => Promise<TaskStatus>;
  execute: (
    statePath: string,
    policy: WorkflowProject,
    prompt: string,
    source: string,
    task: ProjectTaskContext,
  ) => Promise<{ phase: string; message: string }>;
  signal?: AbortSignal;
}) => {
  const { policy, command, signal } = args;
  if (!policy.branches || !policy.workPlan || !policy.references.some(({ role }) => role === 'blueprint')) {
    throw new Error('Il flusso richiede un blueprint, un piano di lavoro versionato e i due rami configurati.');
  }
  const planPath = policy.workPlan;
  const readPlan = async () => {
    const head = await readDevelopmentHead(policy, signal);
    const files = await readDevelopmentFiles({ ...policy, context: [], editable: [], references: [] }, head, signal);
    return files[planPath]!;
  };
  const source = await readPlan();
  const { tasks } = workPlan.parse(JSON.parse(source));
  const workspace = path.dirname(args.statePath);
  const project = digest(policy.root);
  const registry = path.join(workspace, `${project}-validazioni.json`);
  const state: Progress = await fs.readFile(registry, 'utf8').then(
    (content) => progressFile.parse(JSON.parse(content)),
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return { records: {}, history: {}, open: {} };
      }
      throw error;
    },
  );
  const progress = state.records;
  const chat = digest(args.statePath);
  const save = () => atomicWriteJsonFile(registry, state);

  const taskKeys = new Map<string, string>();
  const validationKeys = new Map<string, string>();
  const projectFiles = new Set(workflowFileNames(policy));
  const entries = tasks.map((task) => {
    if (
      taskKeys.has(task.id) ||
      task.dependsOn.some((dependency) => !taskKeys.has(dependency)) ||
      task.afterValidation.some((dependency) => !validationKeys.has(dependency))
    ) {
      throw new Error('Task duplicato o dipendenza da un task o una prova fuori ordine nel piano.');
    }
    const checks = policy.checks.filter((check) => task.checks.includes(check.id));
    const protectedPaths = [planPath, ...policy.references.map((reference) => reference.path)];
    if (
      new Set(task.files).size !== task.files.length ||
      task.files.some((file) => !policy.editable.includes(file) || protectedPaths.includes(file)) ||
      checks.length !== task.checks.length
    ) {
      throw new Error('Il task ' + task.id + ' usa file o controlli fuori dal perimetro configurato.');
    }
    const context = [...new Set([...policy.context, ...checks.flatMap((check) => ('file' in check && !task.files.includes(check.file) ? [check.file] : []))])];
    const taskPolicy = { ...policy, editable: task.files, checks, context };
    const { validations: definitions, ...technicalTask } = task;
    const key = digest([technicalTask, taskPolicy, task.dependsOn.map((dependency) => taskKeys.get(dependency))]);
    taskKeys.set(task.id, key);
    const validations = definitions.map((item) => {
      if (validationKeys.has(item.id)) {
        throw new Error('Validazione duplicata nel piano: ' + item.id);
      }
      const files = item.files ?? task.files;
      if (files.some((file) => !projectFiles.has(file))) {
        throw new Error('La validazione ' + item.id + ' usa file fuori perimetro.');
      }
      const validationKey = digest([key, item]);
      validationKeys.set(item.id, validationKey);
      return { ...item, files, key: validationKey };
    });
    return { ...task, validations, policy: taskPolicy, file: path.join(workspace, `${digest([project, key])}.json`) };
  });

  const completed = new Map<string, string>();
  const validated = new Set<string>();
  const register = async (entry: (typeof entries)[number], commit: string) => {
    completed.set(entry.id, commit);
    if (!entry.validations.length) {
      return;
    }
    const head = await readDevelopmentHead(policy, signal);
    let changed = false;
    for (const item of entry.validations) {
      const previous = progress[item.key];
      const previousIsCurrent =
        previous &&
        (await isIntegrated(policy, previous.commit, signal)) &&
        (previous.commit === head || (await developmentFilesMatch(policy, previous.commit, head, item.files, signal)));
      if (!previousIsCurrent) {
        if (previous) {
          state.history[digest([item.key, previous.commit])] = previous;
        }
        const version = commit === head || (await developmentFilesMatch(policy, commit, head, item.files, signal)) ? commit : head;
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

  const refreshValidations = async () => {
    for (const entry of entries) {
      const commit = completed.get(entry.id);
      if (commit && entry.validations.length) {
        await register(entry, commit);
      }
    }
  };

  if (command.kind !== 'start') {
    for (const entry of entries) {
      const status = await args.status(entry.file, entry.policy);
      if (status.phase === 'done' && status.commit) {
        await register(entry, status.commit);
      }
    }
    const pending = entries.flatMap((entry) => (completed.has(entry.id) ? entry.validations : []));
    const item =
      command.kind === 'resume-validation' ? pending.find(({ key }) => progress[key].passed === undefined) : pending.find(({ id }) => id === command.id);
    if (!item) {
      return manualResult(command.kind === 'resume-validation' ? 'Nessuna prova da riprendere.' : 'La prova richiesta non è disponibile.');
    }
    const record = progress[item.key];
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
      if (command.passed) {
        record.confirmed = item.steps.length;
      }
      await save();
      return manualResult(`${item.id} ${command.passed ? 'superata' : 'fallita'}. Esito registrato sul commit ${record.commit}.`);
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

  const waiting: string[] = [];
  for (const entry of entries) {
    signal?.throwIfAborted();
    if ((await readPlan()) !== source) {
      throw new Error('Il piano di lavoro è cambiato. Avvia di nuovo il lavoro per usare la versione aggiornata.');
    }
    const status = await args.status(entry.file, entry.policy);
    if (status.phase === 'done' && status.commit) {
      await register(entry, status.commit);
      continue;
    }
    if (entry.afterValidation.length) {
      await refreshValidations();
    }
    if (entry.dependsOn.some((dependency) => !completed.has(dependency)) || entry.afterValidation.some((dependency) => !validated.has(dependency))) {
      waiting.push(entry.id + ' · dipendenza in attesa');
      continue;
    }
    try {
      const execute = (prompt: string) =>
        args.execute(entry.file, entry.policy, prompt, source, {
          id: entry.id,
          integrated: [...completed].map(([id, commit]) => ({ id, commit })),
        });
      const head = await readDevelopmentHead(policy, signal);
      const prepared = status.pendingCommit && (await isIntegrated(policy, status.pendingCommit, signal));
      const sameBase = status.baseCommit === head;
      let outcome;
      if (status.phase === 'approved' && (sameBase || prepared)) {
        outcome = await execute('/workflow resume');
      } else {
        const planning = sameBase && status.phase === 'plan' ? status : undefined;
        if (!planning) {
          await execute(`/workflow ${entry.kind} ${entry.request}`);
        }
        const planned = await args.status(entry.file, entry.policy);
        if (planned.plan?.questions.length) {
          waiting.push(entry.id + ' · ' + planned.plan.questions.join(' '));
          continue;
        }
        if (planned.phase === 'plan' && planned.revision) {
          outcome = await execute('/workflow approve ' + planned.revision);
        }
      }
      const result = await args.status(entry.file, entry.policy);
      if (result.phase === 'done' && result.commit) {
        await register(entry, result.commit);
      } else {
        waiting.push(entry.id + ' · ' + (outcome?.message.split('\n')[0] || 'verifiche o decisioni in attesa'));
      }
    } catch (error) {
      signal?.throwIfAborted();
      waiting.push(`${entry.id} · ${error instanceof Error ? error.message : 'interruzione durante il task'}`);
    }
  }
  await refreshValidations();
  const pending = entries.flatMap((entry) => (completed.has(entry.id) ? entry.validations.filter((item) => progress[item.key]?.passed === undefined) : []));
  const failed = entries.flatMap((entry) => (completed.has(entry.id) ? entry.validations.filter((item) => progress[item.key]?.passed === false) : []));
  return {
    phase: 'waiting' as const,
    message: [
      '## Piano di lavoro',
      `Task integrati sul ramo di sviluppo: ${[...completed.keys()].join(', ') || 'nessuno'}.`,
      ...(waiting.length ? ['Attività in attesa:\n- ' + waiting.join('\n- ')] : []),
      ...(pending.length ? [`Validazioni in attesa: ${pending.map(({ id }) => id).join(', ')}. Scrivi «Riprendi le validazioni».`] : []),
      ...(failed.length ? [`Validazioni con esito negativo da correggere: ${failed.map(({ id }) => id).join(', ')}.`] : []),
    ].join('\n\n'),
  };
};
