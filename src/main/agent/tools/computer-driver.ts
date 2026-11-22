import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';

import AdmZip from 'adm-zip';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import notice from './cua-driver-notice.json';

import { AIDER_DESK_BIN_DIR } from '@/constants';

const binary = 'cua-driver.exe';
const archiveSize = 32339205;
const archiveDigest = '788178cbdcce4de0121f6d04ef6cb5e9d512503371e60a70563aa6f69cdd50af';
const url = 'https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.52.0/cua-driver-rs-0.52.0-windows-x86_64-binary.zip';
const files: Record<string, string> = {
  [binary]: '700957a196efddf41d6fd1f7388ed7aac5e7f4112745fe3930df5ecbdbb2c170',
  'cua-driver-uia.exe': '9ef39bb276c12ab92143a41698fbdb6684f719a71d29fe23397e7778348cdd92',
  'cua-cursor-theme.exe': '5c63f006f08c33e602236e6b503a90ede7d3bda6d02a2a68d71fefd4dfb717d7',
  'cua_driver_sdk.dll': 'f8b49bca03c92e96f65866192bfb9f1c2006b37b685dbc3c77af09fc9a06fed2',
};
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

const verify = async (directory: string) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  if (
    entries.length !== Object.keys(files).length + 1 ||
    entries.some((entry) => !entry.isFile() || (entry.name !== 'LICENSE.txt' && !Object.hasOwn(files, entry.name)))
  ) {
    throw new Error('File inattesi nella cartella di Cua Driver.');
  }
  for (const { name } of entries) {
    const data = await fs.readFile(path.join(directory, name));
    if (name === 'LICENSE.txt' ? data.toString('utf8') !== notice.notice : sha(data) !== files[name]) {
      throw new Error('Integrità di Cua Driver non verificata.');
    }
  }
};

const install = async (directory: string, signal: AbortSignal) => {
  signal.throwIfAborted();
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) {
    throw new Error('Download di Cua Driver non riuscito.');
  }
  const bytes: Buffer[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    signal.throwIfAborted();
    size += chunk.byteLength;
    if (size > archiveSize) {
      throw new Error('Dimensione del download inattesa.');
    }
    bytes.push(Buffer.from(chunk));
  }
  const data = Buffer.concat(bytes);
  signal.throwIfAborted();
  if (size !== archiveSize || sha(data) !== archiveDigest) {
    throw new Error('Archivio Cua Driver diverso dalla versione verificata.');
  }
  const parent = path.dirname(directory);
  await fs.mkdir(parent, { recursive: true });
  const stage = await fs.mkdtemp(path.join(parent, 'cua-install-'));
  try {
    const zip = new AdmZip(data);
    for (const name of Object.keys(files)) {
      signal.throwIfAborted();
      const entry = zip.getEntry(name);
      if (!entry || entry.isDirectory) {
        throw new Error('Archivio Cua Driver incompleto.');
      }
      await fs.writeFile(path.join(stage, name), entry.getData(), { flag: 'wx' });
    }
    await fs.writeFile(path.join(stage, 'LICENSE.txt'), notice.notice, { flag: 'wx' });
    await verify(stage);
    signal.throwIfAborted();
    try {
      await fs.rename(stage, directory);
    } catch (error) {
      // Another session can finish the same pinned installation first.
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw error;
      }
      await verify(directory);
    }
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
};

export const prepareDriverCache = async (
  directory: string,
  signal: AbortSignal,
  operations: { verify: typeof verify; install: typeof install },
): Promise<void> => {
  const installed = async () => {
    try {
      await operations.verify(directory);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      return false;
    }
  };
  signal.throwIfAborted();
  const alreadyInstalled = await installed();
  signal.throwIfAborted();
  if (alreadyInstalled) {
    return;
  }
  await fs.mkdir(path.dirname(directory), { recursive: true });
  signal.throwIfAborted();
  const lock = new DatabaseSync(directory + '.install.sqlite', { timeout: 0 });
  try {
    for (;;) {
      signal.throwIfAborted();
      try {
        lock.exec('BEGIN IMMEDIATE');
        break;
      } catch (error) {
        // SQLITE_BUSY (5) or one of its extended result codes. Never block the main thread waiting for another installer.
        const code = (error as { errcode?: number }).errcode;
        if (code === undefined || (code & 0xff) !== 5) {
          throw error;
        }
        await delay(100, undefined, { signal });
      }
    }
    const installedWhileWaiting = await installed();
    signal.throwIfAborted();
    if (installedWhileWaiting) {
      return;
    }
    await operations.install(directory, signal);
    signal.throwIfAborted();
    await operations.verify(directory);
    signal.throwIfAborted();
  } finally {
    // Closing rolls back the empty transaction. The OS also releases its lock when the owner dies.
    lock.close();
  }
};

// Concurrent desktop turns share verified files, never an MCP client or the consent of another turn.
export const createDriverPreparation = (prepare: (directory: string, signal: AbortSignal) => Promise<void>) => {
  const pending = new Map<string, { controller: AbortController; ready: Promise<void>; users: number }>();
  return async (directory: string, signal: AbortSignal): Promise<void> => {
    signal.throwIfAborted();
    const key = process.platform === 'win32' ? path.resolve(directory).toLowerCase() : path.resolve(directory);
    let job = pending.get(key);
    if (!job) {
      const controller = new AbortController();
      const ready = prepare(directory, controller.signal).finally(() => {
        if (pending.get(key)?.controller === controller) {
          pending.delete(key);
        }
      });
      job = { controller, ready, users: 0 };
      pending.set(key, job);
    }
    job.users++;
    const stopped = Promise.withResolvers<never>();
    const cancel = () => stopped.reject(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) {
      cancel();
    }
    try {
      await Promise.race([job.ready, stopped.promise]);
      signal.throwIfAborted();
    } finally {
      signal.removeEventListener('abort', cancel);
      job.users--;
      if (!job.users && pending.get(key) === job) {
        pending.delete(key);
        job.controller.abort();
      }
    }
  };
};

const prepareSharedDriver = createDriverPreparation((directory, signal) => prepareDriverCache(directory, signal, { verify, install }));

export const openComputerDriver = async (signal: AbortSignal) => {
  const directory = path.join(AIDER_DESK_BIN_DIR, 'cua-driver-0.52.0-win-x64');
  await prepareSharedDriver(directory, signal);
  signal.throwIfAborted();
  const transport = new StdioClientTransport({
    command: path.join(directory, binary),
    args: ['mcp', '--direct'],
    cwd: directory,
    env: { CUA_DRIVER_RS_TELEMETRY_ENABLED: '0' },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'agent-lab-computer-use', version: '1' });
  try {
    await client.connect(transport, { signal, timeout: 15_000 });
    signal.throwIfAborted();
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
};
