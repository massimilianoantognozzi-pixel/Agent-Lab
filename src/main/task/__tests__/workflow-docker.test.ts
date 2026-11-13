import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureWorkflowDocker } from '../workflow-docker';

const { run } = vi.hoisted(() => ({ run: vi.fn<(program: string, args: string[]) => Promise<{ stdout: string }>>() }));

vi.mock('node:child_process', () => ({ execFile: Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: run }) }));
vi.mock('node:timers/promises', () => ({
  setTimeout: (ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms)),
}));

const launch = ['desktop', 'start', '--detach'];
const engine = ['info', '--format', '{{.ServerVersion}}'];
const offline = new Error('Engine unavailable');

describe('Docker readiness for the project queue', () => {
  beforeEach(() => {
    run.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reuses a responsive engine without starting Docker Desktop', async () => {
    run.mockResolvedValue({ stdout: '29.9.3\n' });
    const onWaiting = vi.fn();

    await ensureWorkflowDocker(undefined, onWaiting);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('docker', engine, expect.any(Object));
    expect(onWaiting).not.toHaveBeenCalled();
  });

  it('starts Docker Desktop once and waits for the engine across concurrent requests', async () => {
    let ready = false;
    run.mockImplementation(async (_program, args) => {
      if (args[0] === 'desktop') {
        return { stdout: '' };
      }
      if (ready) {
        return { stdout: '29.9.3\n' };
      }
      throw offline;
    });
    const controller = new AbortController();
    const waiting = vi.fn();
    const continued = vi.fn();
    const stopped = expect(ensureWorkflowDocker(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    const continuing = ensureWorkflowDocker(undefined, waiting).then(continued);

    await vi.advanceTimersByTimeAsync(1000);
    expect(waiting).toHaveBeenCalledOnce();
    expect(continued).not.toHaveBeenCalled();
    expect(run.mock.calls.filter(([, args]) => args[0] === 'desktop')).toEqual([['docker', launch, expect.any(Object)]]);

    controller.abort();
    await stopped;
    ready = true;
    await vi.advanceTimersByTimeAsync(1000);
    await continuing;
    expect(continued).toHaveBeenCalledOnce();
    expect(waiting).toHaveBeenLastCalledWith('Motore Docker pronto. Riprendo il lavoro…');
  });

  it('continues if the engine starts after the Desktop launch command fails', async () => {
    run.mockRejectedValueOnce(offline).mockRejectedValueOnce(new Error('Desktop already starting')).mockRejectedValueOnce(offline);
    run.mockResolvedValue({ stdout: '29.9.3\n' });

    const ready = ensureWorkflowDocker();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(ready).resolves.toBeUndefined();

    expect(run.mock.calls.map(([, args]) => args)).toEqual([engine, launch, engine, engine]);
  });

  it('reports an engine timeout and allows a later command to retry startup', async () => {
    run.mockImplementation(async (_program, args) => {
      if (args[0] === 'desktop') {
        return { stdout: '' };
      }
      throw offline;
    });
    const timedOut = expect(ensureWorkflowDocker()).rejects.toThrow('Il motore Docker non ha risposto entro due minuti');
    await vi.advanceTimersByTimeAsync(120_000);
    await timedOut;

    run.mockRejectedValueOnce(offline).mockResolvedValue({ stdout: '29.9.3\n' });
    await ensureWorkflowDocker();
    expect(run.mock.calls.filter(([, args]) => args[0] === 'desktop')).toHaveLength(2);
  });

  it('reports an unavailable Docker CLI without attempting to start it', async () => {
    run.mockRejectedValue(Object.assign(new Error('not found'), { code: 'ENOENT' }));

    await expect(ensureWorkflowDocker()).rejects.toThrow('Comando docker non disponibile');

    expect(run).toHaveBeenCalledTimes(1);
  });
});
