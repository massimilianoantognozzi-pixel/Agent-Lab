import { execFile } from 'node:child_process';
import { addAbortListener } from 'node:events';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { assertLocalWorkflowDocker, ensureWorkflowDocker, WorkflowServiceUnavailable } from './workflow-docker';
import { parseProjectWorkflowCommand } from './workflow-project-commands';

type ProjectStartup = { root: string; node: string; script: string; agentLabScript: string };
const run = promisify(execFile);
const starts = new Map<string, { input: string | undefined; completion: Promise<void> }>();
let agentLabStartup: Promise<void> | undefined;

export const projectStartupFor = (directory: string, prompt: string): ProjectStartup | undefined => {
  const { AIDER_DESK_PROJECT_STARTUP_NODE: node, AIDER_DESK_PROJECT_STARTUP_SCRIPT: script, AIDER_DESK_AGENTLAB_STARTUP_SCRIPT: agentLabScript } = process.env;
  if (parseProjectWorkflowCommand(prompt)?.kind !== 'start' || !node || !script || !agentLabScript || ![node, script, agentLabScript].every(path.isAbsolute)) {
    return undefined;
  }
  try {
    return { root: realpathSync(directory), node, script, agentLabScript };
  } catch {
    return undefined;
  }
};

export const startProjectEnvironment = async (
  { root, node, script, agentLabScript }: ProjectStartup,
  signal: AbortSignal,
  onProgress: (message: string) => void,
  documents?: Record<string, string | null>,
) => {
  await assertLocalWorkflowDocker(signal);
  await ensureWorkflowDocker(signal, onProgress);
  signal.throwIfAborted();
  const name = path.basename(root);
  onProgress(`Preparo Agent-Lab e verifico i container di ${name}…`);
  const input = documents ? JSON.stringify(documents) : undefined;
  const existing = starts.get(root);
  if (existing && existing.input !== input) {
    throw new WorkflowServiceUnavailable(`È in corso la preparazione di ${name} con documenti diversi.`);
  }
  let starting = existing?.completion;
  if (!starting) {
    agentLabStartup ??= run(node, [agentLabScript], { cwd: path.dirname(agentLabScript), windowsHide: true, timeout: 100_000 })
      .then(() => undefined)
      .catch((error: { killed?: boolean; code?: string | number }) => {
        if (error.killed || error.code === 75) {
          throw new WorkflowServiceUnavailable('I container di Agent-Lab non sono ancora disponibili.');
        }
        throw new Error('Impossibile avviare i container di Agent-Lab.');
      })
      .finally(() => {
        agentLabStartup = undefined;
      });
    starting = agentLabStartup
      .then(async () => {
        onProgress(`Leggo i documenti di ripresa di ${name} e preparo i suoi servizi…`);
        const command = run(node, [script, ...(input ? ['--read-documents'] : [])], { cwd: root, windowsHide: true, timeout: 410_000 });
        if (input) {
          command.child.stdin?.on('error', () => undefined);
          command.child.stdin?.end(input);
        }
        try {
          await command;
        } catch (error) {
          const { killed, code } = error as { killed?: boolean; code?: string | number };
          if (killed || code === 75) {
            throw new WorkflowServiceUnavailable(`I servizi di ${name} non sono ancora disponibili.`);
          }
          throw new Error(`Impossibile preparare i servizi di ${name}.`);
        }
      })
      .finally(() => starts.delete(root));
    starts.set(root, { input, completion: starting });
  }
  let listener: Disposable | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    listener = addAbortListener(signal, () => reject(signal.reason));
  });
  try {
    await Promise.race([starting, cancelled]);
    signal.throwIfAborted();
    onProgress(`Ambiente di ${name} pronto.`);
  } finally {
    listener?.[Symbol.dispose]();
  }
};
