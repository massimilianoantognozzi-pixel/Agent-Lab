import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { getResourceDir } from '@/paths';
import { ensureWorkflowDocker, localWorkflowDockerEndpoint } from '@/task/workflow-docker';

const execute = promisify(execFile);
const bind = (source: string, target: string, readonly: boolean) =>
  ['type=bind', '"source=' + source.replaceAll('"', '""') + '"', 'target=' + target, ...(readonly ? ['readonly'] : [])].join(',');

export const renderProjectDocuments = async (job: string, signal: AbortSignal) => {
  const resources = path.join(getResourceDir(), 'office');
  const input = path.join(job, 'input');
  const output = path.join(job, 'output');
  const empty = path.join(job, 'build');
  await fs.mkdir(empty);
  await fs.mkdir(output);
  const endpoint = await localWorkflowDockerEndpoint(signal);
  await ensureWorkflowDocker(signal);
  const docker = async (args: string[], timeout: number, abortSignal?: AbortSignal) =>
    execute('docker', ['--host', endpoint, ...args], {
      cwd: job,
      windowsHide: true,
      timeout,
      maxBuffer: 1024 * 1024,
      signal: abortSignal,
    });
  const recipe = path.join(resources, 'Dockerfile');
  const version = createHash('sha256')
    .update(await fs.readFile(recipe))
    .digest('hex')
    .slice(0, 20);
  const tag = 'agent-lab-office:' + version;
  let image: string;
  try {
    image = (await docker(['image', 'inspect', '--format', '{{.Id}}', tag], 15_000, signal)).stdout.trim();
  } catch (error) {
    signal.throwIfAborted();
    if (!/no such (image|object)/i.test(String((error as { stderr?: string }).stderr))) {
      throw error;
    }
    // Only the packaged recipe and an empty context go to the builder.
    image = (await docker(['build', '--quiet', '--file', recipe, '--tag', tag, empty], 900_000, signal)).stdout.trim();
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(image)) {
    throw new Error('Immagine del motore documenti non verificata.');
  }
  const container = 'agentlab-documents-' + randomUUID();
  // Host ownership of the temporary mounts matters on Linux. Windows bind mounts use Docker Desktop.
  const uid = process.getuid?.() || 65534;
  const gid = process.getgid?.() || 65534;
  if (process.getuid?.() === 0) {
    await fs.chown(output, uid, gid);
  }
  const args = [
    'create',
    '--name',
    container,
    '--label',
    'agentlab.office.job=' + container,
    '--pull=never',
    '--init',
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--memory=1536m',
    '--cpus=2',
    '--pids-limit=160',
    '--tmpfs',
    '/tmp:rw,nosuid,nodev,size=700m',
    '--user',
    uid + ':' + gid,
    '--mount',
    bind(resources, '/app', true),
    '--mount',
    bind(input, '/input', true),
    '--mount',
    bind(output, '/output', false),
    image,
    '/usr/bin/timeout',
    '-k',
    '5',
    '300',
    'python3',
    '/app/generate.py',
  ];
  signal.throwIfAborted();
  // Complete creation before handling cancellation so there is always an ID to clean up.
  let id: string;
  try {
    id = (await docker(args, 30_000)).stdout.trim();
    if (!/^[0-9a-f]{64}$/.test(id)) {
      throw new Error('Identità del processo documenti non valida.');
    }
  } catch (error) {
    // The daemon may have created the container before the CLI lost its reply.
    try {
      const owner = await docker(['inspect', '--format', '{{index .Config.Labels "agentlab.office.job"}}', container], 10_000);
      if (owner.stdout.trim() === container) {
        await docker(['rm', '--force', container], 20_000);
      }
    } catch (cleanupError) {
      if (!/no such (object|container)/i.test(String((cleanupError as { stderr?: string }).stderr))) {
        throw new Error('Arresto del motore documenti da verificare: ' + container, { cause: cleanupError });
      }
    }
    throw error;
  }
  try {
    signal.throwIfAborted();
    const result = await docker(['start', '--attach', id], 330_000, signal);
    const exit = (await docker(['inspect', '--format', '{{.State.ExitCode}}', id], 10_000, signal)).stdout.trim();
    if (exit !== '0') {
      throw new Error((result.stderr || result.stdout).trim().slice(-1600) || 'Verifica documenti fallita.');
    }
  } finally {
    await docker(['rm', '--force', id], 20_000);
  }
  return image;
};
