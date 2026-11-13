import { execFile } from 'node:child_process';
import { addAbortListener } from 'node:events';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { assertLocalWorkflowDocker, ensureWorkflowDocker } from './workflow-docker';
import { parseProjectWorkflowCommand } from './workflow-project-commands';

type ProjectStartup = { root: string; node: string; script: string; agentLabScript: string };
type ReadDocuments = () => Promise<Record<string, string | null>>;
const run = promisify(execFile);
const starts = new Map<string, Promise<void>>();
let agentLabStartup: Promise<void> | undefined;

export const projectStartupFor = (directory: string, prompt: string): ProjectStartup | undefined => {
  const {
    AIDER_DESK_PROJECT_STARTUP_NODE: node,
    AIDER_DESK_PROJECT_STARTUP_SCRIPT: script,
    AIDER_DESK_AGENTLAB_STARTUP_SCRIPT: agentLabScript,
  } = process.env;
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
  readDocuments?: ReadDocuments,
) => {
  await assertLocalWorkflowDocker(signal);
  await ensureWorkflowDocker(signal, onProgress);
  signal.throwIfAborted();
  const name = path.basename(root);
  onProgress(`Preparo Agent-Lab e verifico i container di ${name}…`);
  let starting = starts.get(root);
  if (!starting) {
    agentLabStartup ??= run(node, [agentLabScript], { cwd: path.dirname(agentLabScript), windowsHide: true, timeout: 100_000 })
      .then(() => undefined)
      .catch(() => {
        throw new Error('Impossibile avviare i container di Agent-Lab.');
      })
      .finally(() => {
        agentLabStartup = undefined;
      });
    starting = agentLabStartup
      .then(async () => {
        onProgress(`Leggo i documenti di ripresa di ${name} e preparo i suoi servizi…`);
        const documents = await readDocuments?.();
        const command = run(node, [script, ...(documents ? ['--read-documents'] : [])], { cwd: root, windowsHide: true, timeout: 410_000 });
        if (documents) {
          command.child.stdin?.on('error', () => undefined);
          command.child.stdin?.end(JSON.stringify(documents));
        }
        try {
          await command;
        } catch {
          throw new Error(`Impossibile preparare i servizi di ${name}. Verifica i documenti di ripresa e lo stack locale.`);
        }
      })
      .finally(() => starts.delete(root));
    starts.set(root, starting);
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
