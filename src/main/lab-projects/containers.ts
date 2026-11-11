import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';

import { controlRoot } from './policy';

const execute = promisify(execFile);
const docker = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const endpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine';
export const NODE_IMAGE = 'node@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205';
const active = new Map<string, { controller: AbortController; finished: Promise<boolean> }>();
let stopping = false;
const clientEnvironment = (): NodeJS.ProcessEnv => {
  const keep = ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA'];
  return {
    ...Object.fromEntries(keep.filter((key) => process.env[key]).map((key) => [key, process.env[key]])),
    DOCKER_CONFIG: path.join(path.dirname(controlRoot()), 'docker-client'),
  };
};
export const dockerRead = async (args: string[]): Promise<string> =>
  (await execute(docker, ['--host', endpoint, ...args], { env: clientEnvironment(), windowsHide: true, timeout: 15000, maxBuffer: 1000000 })).stdout;
const mount = (source: string, target: string, readonly = false): string => {
  if (!path.isAbsolute(source) || /[\r\n\0]/.test(source)) {
    throw new Error('Mount non valido.');
  }
  const field = 'source=' + source;
  return ['type=bind', field.includes(',') ? '"' + field.replaceAll('"', '""') + '"' : field, 'target=' + target, ...(readonly ? ['readonly'] : [])].join(',');
};
export type ContainerMount = { source: string; target: string; readonly?: boolean };
export type ContainerResult = { code: number; output: string; truncated: boolean; id: string; cleanupConfirmed: boolean };

export const runContainer = async (options: {
  image: string;
  command: string[];
  mounts: ContainerMount[];
  cwd: string;
  seconds?: number;
  network?: 'none' | 'bridge';
  environment?: Record<string, string>;
  seccomp?: string;
  signal?: AbortSignal;
  logFile: string;
}): Promise<ContainerResult> => {
  const id = randomUUID();
  if (stopping) {
    throw new Error('Chiusura Agent-Lab in corso: nessun nuovo job avviato.');
  }
  const name = 'agentlab-' + id;
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  signal.throwIfAborted();
  const args = [
    '--host',
    endpoint,
    'run',
    '--rm',
    '--name',
    name,
    '--label',
    'agentlab.run=' + id,
    '--init',
    '--read-only',
    '--user',
    '1000:1000',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--memory',
    '4g',
    '--cpus',
    '4',
    '--pids-limit',
    '256',
    '--shm-size',
    '512m',
    '--tmpfs',
    '/tmp:rw,nosuid,size=512m',
    '--network',
    options.network ?? 'none',
    '--workdir',
    options.cwd,
  ];
  if (options.seccomp) {
    args.push('--security-opt', 'seccomp=' + options.seccomp);
  }
  for (const value of options.mounts) {
    args.push('--mount', mount(value.source, value.target, value.readonly));
  }
  for (const [key, value] of Object.entries({ HOME: '/tmp/agentlab-home', ...(options.environment ?? {}) })) {
    args.push('--env', key + '=' + value);
  }
  args.push(options.image, '/usr/bin/timeout', '--signal=KILL', String(options.seconds ?? 180) + 's', ...options.command);
  const log = await fs.open(options.logFile, 'wx');
  if (stopping || signal.aborted) {
    await log.close();
    throw new DOMException('Verifica annullata', 'AbortError');
  }
  let finish: (confirmed: boolean) => void = () => {};
  const finished = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  active.set(name, { controller, finished });
  let cleanupConfirmed = false;
  let child: ReturnType<typeof spawn> | undefined;
  let bytes = 0;
  let output = '';
  let truncated = false;
  let writes = Promise.resolve();
  let result: ContainerResult | undefined;
  let logError: unknown;
  const deadline = setTimeout(() => controller.abort(), ((options.seconds ?? 180) + 30) * 1000);
  try {
    return await new Promise<ContainerResult>((resolve, reject) => {
      child = spawn(docker, args, { env: clientEnvironment(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const consume = (chunk: Buffer) => {
        output = (output + chunk.toString('utf8')).slice(-12000);
        if (bytes + chunk.length <= 4000000) {
          bytes += chunk.length;
          writes = writes
            .then(async () => {
              if (!logError) {
                await log.write(chunk);
              }
            })
            .catch((error) => {
              logError = error;
              controller.abort();
            });
        } else {
          truncated = true;
        }
      };
      child.stdout?.on('data', consume);
      child.stderr?.on('data', consume);
      child.once('error', reject);
      child.once('close', (code) => {
        result = { code: code ?? 1, output, truncated, id, cleanupConfirmed: false };
        if (signal.aborted) {
          reject(new DOMException('Verifica annullata', 'AbortError'));
        } else {
          resolve(result);
        }
      });
      const abort = () => {
        child?.kill();
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        abort();
      }
      child.once('close', () => signal.removeEventListener('abort', abort));
    });
  } finally {
    // Container names are random and the ownership label is checked before removal.
    try {
      const identity = JSON.parse(await dockerRead(['inspect', '--format', '{{json .Config.Labels}}', name]));
      if (identity['agentlab.run'] === id) {
        await dockerRead(['rm', '--force', name]);
        cleanupConfirmed = true;
      }
    } catch (error) {
      if (/No such (?:object|container)/i.test(String((error as { stderr?: string }).stderr ?? error))) {
        cleanupConfirmed = true;
      }
    }
    if (result) {
      result.cleanupConfirmed = cleanupConfirmed;
    }
    clearTimeout(deadline);
    try {
      await writes;
      if (logError) {
        if (result) {
          result.code = 1;
          result.output += '\nErrore durante la registrazione del controllo.';
        }
      }
    } finally {
      try {
        await log.close();
      } finally {
        if (cleanupConfirmed) {
          active.delete(name);
        }
        finish(cleanupConfirmed);
      }
    }
  }
};

export const stopOwnedJobs = async (): Promise<void> => {
  stopping = true;
  const jobs = [...active.values()];
  for (const job of jobs) {
    job.controller.abort();
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const completed = await Promise.race([
      Promise.all(jobs.map((job) => job.finished)),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), 35000);
      }),
    ]);
    if (completed === false || completed.some((value) => !value)) {
      throw new Error('Pulizia dei job non confermata: controllare i processi Agent-Lab.');
    }
  } finally {
    clearTimeout(timer);
  }
};
export const safeRemoveJob = async (directory: string): Promise<void> => {
  const jobs = path.resolve(controlRoot(), 'jobs');
  const target = path.resolve(directory);
  if (!target.startsWith(jobs + path.sep) || path.dirname(target) !== jobs || !/^[a-f0-9-]{36}$/.test(path.basename(target))) {
    throw new Error('Pulizia fuori dalla cartella job bloccata.');
  }
  if (syncFs.existsSync(target) && syncFs.lstatSync(target).isSymbolicLink()) {
    throw new Error('Pulizia di collegamenti bloccata.');
  }
  await fs.rm(target, { recursive: true, force: true });
};
