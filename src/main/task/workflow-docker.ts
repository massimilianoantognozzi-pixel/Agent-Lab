import { execFile } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { promisify, stripVTControlCharacters } from 'node:util';

import { RetryError } from 'ai';

import type { WorkflowFiles } from './workflow-policy';

const run = promisify(execFile);
const engineProbeTimeout = 3_000;
const startupTimeout = 120_000;
let startup: Promise<void> | undefined;

export class WorkflowServiceUnavailable extends Error {}

// These fields go to the model and the saved task. Never forward free-form test output or assertion values.
export const dockerFailureDetail = (code: number, output: string, files: WorkflowFiles): string => {
  const summary = 'Il comando isolato ha restituito codice ' + code + '.';
  if (output.includes('\0')) {
    return summary;
  }
  const log = stripVTControlCharacters(output);
  const failure = log.match(/^(AssertionError|TypeError|ReferenceError|SyntaxError|RangeError|ValueError|KeyError|IndexError|ModuleNotFoundError)(?::| \[|$)/m);
  if (!failure) {
    return summary;
  }
  const fields = [failure[1]];
  const operator = log.match(/^\s*operator:\s*'(strictEqual|deepStrictEqual|notStrictEqual|notDeepStrictEqual|equal|deepEqual|match|rejects)'[,]?\s*$/m);
  if (failure[1] === 'AssertionError' && operator) {
    fields.push(operator[1]);
  }
  for (const frame of log.matchAll(/(?:\/workspace\/([^:\r\n"]+):|File "\/workspace\/([^"\r\n]+)", line )([1-9]\d{0,5})(?=[:,\s)]|$)/gm)) {
    const file = frame[1] ?? frame[2];
    if (file.length <= 300 && Object.hasOwn(files, file) && typeof files[file] === 'string' && Number(frame[3]) <= files[file].split('\n').length) {
      fields.push(file + ':' + frame[3]);
      break;
    }
  }
  return summary + '\n' + fields.join(' · ');
};

export const workflowServiceRetryable = (error: unknown): boolean => {
  const seen = new Set<Error>();
  for (let cause = error; cause instanceof Error && !seen.has(cause); cause = RetryError.isInstance(cause) ? cause.lastError : cause.cause) {
    seen.add(cause);
    if (RetryError.isInstance(cause) && cause.reason === 'abort') {
      return false;
    }
    if (cause instanceof WorkflowServiceUnavailable) {
      return true;
    }
    const { code, statusCode, isRetryable } = cause as Error & { code?: string; statusCode?: number; isRetryable?: boolean };
    if (
      ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code ?? '') ||
      (isRetryable && (statusCode === undefined || statusCode === 408 || statusCode === 429 || statusCode >= 500))
    ) {
      return true;
    }
  }
  return false;
};

export const localWorkflowDockerEndpoint = async (signal?: AbortSignal): Promise<string> => {
  const { stdout } = await run('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], {
    timeout: 5_000,
    signal,
    windowsHide: true,
  });
  const isLocal = (endpoint: string) =>
    process.platform === 'win32' ? /^npipe:\/\/\/\/\.\/pipe\/(docker_engine|dockerDesktopLinuxEngine)$/i.test(endpoint) : /^unix:\/\/\//.test(endpoint);
  if (!isLocal(stdout.trim()) || (process.env.DOCKER_HOST && !isLocal(process.env.DOCKER_HOST))) {
    throw new Error('Seleziona il motore Docker locale di Docker Desktop prima di avviare il lavoro.');
  }
  return process.env.DOCKER_HOST || stdout.trim();
};

export const assertLocalWorkflowDocker = async (signal?: AbortSignal): Promise<void> => {
  await localWorkflowDockerEndpoint(signal);
};

const engineReady = async (timeout: number, signal?: AbortSignal): Promise<boolean> => {
  try {
    const { stdout } = await run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout, signal, windowsHide: true });
    return !!stdout.trim();
  } catch (error) {
    signal?.throwIfAborted();
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('Comando docker non disponibile sul PC.');
    }
    return false;
  }
};

const startDockerDesktop = async () => {
  const deadline = Date.now() + startupTimeout;
  let startFailed = false;
  try {
    await run('docker', ['desktop', 'start', '--detach'], { timeout: 15_000, windowsHide: true });
  } catch {
    // An external launch or a timed-out client can leave Desktop starting in the background.
    startFailed = true;
  }

  for (let remaining = deadline - Date.now(); remaining > 0; remaining = deadline - Date.now()) {
    if (await engineReady(Math.min(engineProbeTimeout, remaining))) {
      return;
    }
    const delay = Math.min(1000, deadline - Date.now());
    if (delay > 0) {
      await setTimeout(delay);
    }
  }
  if (startFailed) {
    throw new WorkflowServiceUnavailable('Avvio automatico di Docker Desktop non riuscito.');
  }
  throw new WorkflowServiceUnavailable('Il motore Docker non ha risposto entro due minuti.');
};

export const ensureWorkflowDocker = async (signal?: AbortSignal, onProgress?: (message: string) => void): Promise<void> => {
  signal?.throwIfAborted();
  if (await engineReady(engineProbeTimeout, signal)) {
    return;
  }
  signal?.throwIfAborted();
  onProgress?.('Attendo che il motore Docker sia pronto…');
  signal?.throwIfAborted();
  startup ??= startDockerDesktop().finally(() => {
    startup = undefined;
  });
  if (!signal) {
    await startup;
  } else {
    // Stopping one workflow must not interrupt Docker startup for another.
    let abort: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
    });
    try {
      await Promise.race([startup, cancelled]);
    } finally {
      signal.removeEventListener('abort', abort!);
    }
  }
  signal?.throwIfAborted();
  onProgress?.('Motore Docker pronto. Riprendo il lavoro…');
};
