import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDriverPreparation, openComputerDriver, prepareDriverCache } from '../computer-driver';

const mock = vi.hoisted(() => ({ transport: vi.fn(), client: vi.fn(), bin: '' }));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: mock.transport }));
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: mock.client }));
vi.mock('@/constants', () => ({
  get AIDER_DESK_BIN_DIR() {
    return mock.bin;
  },
}));

beforeEach(async () => {
  mock.bin = await fs.mkdtemp(path.join(tmpdir(), 'agentlab-driver-lock-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await fs.rm(mock.bin, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

const fixtureFiles = () => ({
  verify: vi.fn(async (directory: string) => {
    if ((await fs.readFile(path.join(directory, 'fixture'), 'utf8')) !== 'verified') {
      throw Error('Invalid fixture');
    }
  }),
  install: vi.fn(async (directory: string, signal: AbortSignal) => {
    signal.throwIfAborted();
    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, 'fixture'), 'verified', { flag: 'wx' });
  }),
});

describe('computer driver preparation', () => {
  it('shares one preparation per cache and rechecks it for later sessions', async () => {
    const ready = Promise.withResolvers<void>();
    const prepare = vi.fn(async (_directory: string, signal: AbortSignal) => {
      signal.throwIfAborted();
      await ready.promise;
    });
    const acquire = createDriverPreparation(prepare);
    const stopped = new AbortController();
    const active = new AbortController();
    const first = acquire('cache', stopped.signal);
    const second = acquire(path.resolve('cache'), active.signal);
    expect(prepare).toHaveBeenCalledTimes(1);
    const rejected = expect(first).rejects.toThrow('prima sessione');
    stopped.abort(new Error('prima sessione'));
    await rejected;
    expect(prepare.mock.calls[0][1].aborted).toBe(false);
    ready.resolve();
    await second;
    await acquire('cache', active.signal);
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it('keeps separate caches independent and retries after an installation error', async () => {
    const failed = Promise.withResolvers<void>();
    const prepare = vi.fn<() => Promise<void>>().mockReturnValueOnce(failed.promise).mockResolvedValue(undefined);
    const acquire = createDriverPreparation(prepare);
    const { signal } = new AbortController();
    const a = acquire('cache-a', signal);
    const b = acquire('cache-a', signal);
    await acquire('cache-b', signal);
    expect(prepare).toHaveBeenCalledTimes(2);
    const rejected = Promise.all([expect(a).rejects.toThrow('download fallito'), expect(b).rejects.toThrow('download fallito')]);
    failed.reject(new Error('download fallito'));
    await rejected;
    await acquire('cache-a', signal);
    expect(prepare).toHaveBeenCalledTimes(3);
  });

  it('does not let late cleanup of an abandoned operation remove its replacement', async () => {
    const old = Promise.withResolvers<void>();
    const replacement = Promise.withResolvers<void>();
    const prepare = vi
      .fn<(_directory: string, _signal: AbortSignal) => Promise<void>>()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(replacement.promise);
    const acquire = createDriverPreparation(prepare);
    const stop = new AbortController();
    const rejected = expect(acquire('cache', stop.signal)).rejects.toThrow('ultimo utente');
    stop.abort(new Error('ultimo utente'));
    await rejected;
    expect(prepare.mock.calls[0][1].aborted).toBe(true);
    const { signal } = new AbortController();
    const next = acquire('cache', signal);
    old.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const another = acquire('cache', signal);
    expect(prepare).toHaveBeenCalledTimes(2);
    replacement.resolve();
    await Promise.all([next, another]);
  });

  it('checks again under the SQLite lock and downloads once for independent cache connections', async () => {
    const directory = path.join(mock.bin, 'driver');
    const { signal } = new AbortController();
    const begin = vi.spyOn(DatabaseSync.prototype, 'exec');
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const files = fixtureFiles();
    const write = files.install.getMockImplementation()!;
    files.install.mockImplementationOnce(async (cache, stop) => {
      started.resolve();
      await release.promise;
      await write(cache, stop);
    });
    const first = prepareDriverCache(directory, signal, files);
    await started.promise;
    const second = prepareDriverCache(directory, signal, files);
    try {
      await vi.waitFor(() => expect(begin.mock.calls.filter(([sql]) => sql === 'BEGIN IMMEDIATE').length).toBeGreaterThanOrEqual(2));
      expect(files.install).toHaveBeenCalledTimes(1);
    } finally {
      release.resolve();
      await Promise.all([first, second]);
    }
    expect(files.install).toHaveBeenCalledTimes(1);
    expect(await fs.readFile(path.join(directory, 'fixture'), 'utf8')).toBe('verified');
    await prepareDriverCache(directory, signal, files);
    expect(files.install).toHaveBeenCalledTimes(1);
  });

  it('lets a waiting app stop and releases the lock when a separate owner process terminates', async () => {
    const directory = path.join(mock.bin, 'cua-driver-0.52.0-win-x64');
    const fetchDriver = vi.fn<typeof fetch>().mockRejectedValue(new Error('No network in this fixture'));
    vi.stubGlobal('fetch', fetchDriver);
    const child = spawn(
      process.execPath,
      [
        '--no-warnings',
        '-e',
        [
          "const { DatabaseSync } = require('node:sqlite');",
          'const lock = new DatabaseSync(process.argv[1], { timeout: 0 });',
          "lock.exec('BEGIN IMMEDIATE');",
          "process.send('locked');",
          'setInterval(() => {}, 1000);',
        ].join('\n'),
        directory + '.install.sqlite',
      ],
      { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true },
    );
    const exit = once(child, 'exit');
    let surviving: Promise<void> | undefined;
    try {
      const [message] = await Promise.race([
        once(child, 'message'),
        exit.then(() => {
          throw Error('Fixture owner exited before locking');
        }),
      ]);
      expect(message).toBe('locked');
      const begin = vi.spyOn(DatabaseSync.prototype, 'exec');
      const stopped = new AbortController();
      const files = fixtureFiles();
      const cancelled = expect(openComputerDriver(stopped.signal)).rejects.toMatchObject({ name: 'AbortError' });
      surviving = prepareDriverCache(directory, new AbortController().signal, files);
      await vi.waitFor(() => expect(begin.mock.calls.filter(([sql]) => sql === 'BEGIN IMMEDIATE').length).toBeGreaterThanOrEqual(2));
      stopped.abort();
      await cancelled;
      expect(files.install).not.toHaveBeenCalled();
      child.kill();
      await exit;
      await surviving;
      expect(files.install).toHaveBeenCalledTimes(1);
      expect(fetchDriver).not.toHaveBeenCalled();
      expect(mock.transport).not.toHaveBeenCalled();
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
      }
      await exit;
      await surviving?.catch(() => undefined);
    }
  });

  it('releases a failed installation and refuses an invalid on-disk cache', async () => {
    const directory = path.join(mock.bin, 'driver');
    const { signal } = new AbortController();
    const files = fixtureFiles();
    files.install.mockRejectedValueOnce(new Error('fixture unavailable'));
    await expect(prepareDriverCache(directory, signal, files)).rejects.toThrow('fixture unavailable');
    await expect(prepareDriverCache(directory, signal, files)).resolves.toBeUndefined();
    await fs.writeFile(path.join(directory, 'fixture'), 'changed');
    await expect(prepareDriverCache(directory, signal, files)).rejects.toThrow('Invalid fixture');
    expect(files.install).toHaveBeenCalledTimes(2);
  });

  it('performs one simulated download and never opens a transport for stopped sessions', async () => {
    const missing = Object.assign(new Error('cache missing'), { code: 'ENOENT' });
    const readdir = vi.spyOn(fs, 'readdir').mockRejectedValue(missing);
    const download = vi.fn<typeof fetch>(
      (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true });
        }),
    );
    vi.stubGlobal('fetch', download);
    const a = new AbortController(),
      b = new AbortController();
    const first = expect(openComputerDriver(a.signal)).rejects.toThrow('sessione A');
    const second = expect(openComputerDriver(b.signal)).rejects.toThrow('sessione B');
    await vi.waitFor(() => expect(download).toHaveBeenCalledOnce());
    const sharedSignal = download.mock.calls[0][1]!.signal!;
    a.abort(new Error('sessione A'));
    await first;
    expect(sharedSignal.aborted).toBe(false);
    b.abort(new Error('sessione B'));
    await second;
    expect(sharedSignal.aborted).toBe(true);
    expect(mock.transport).not.toHaveBeenCalled();
    expect(mock.client).not.toHaveBeenCalled();
    const attempts = readdir.mock.calls.length;
    await expect(openComputerDriver(a.signal)).rejects.toThrow('sessione A');
    expect(readdir).toHaveBeenCalledTimes(attempts);
  });
});
