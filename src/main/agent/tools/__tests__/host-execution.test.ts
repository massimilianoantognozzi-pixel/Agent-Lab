import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  amendHostExecutionWork,
  authorizeUnconfinedHostExecution as authorizeHost,
  clearHostExecutionWork,
  revokeHostExecutionGrant,
  setHostExecutionWork,
  withHostExecutionWork,
  withRootHostExecutionWork,
} from '../host-execution';

const authorizeUnconfinedHostExecution = (task: Parameters<typeof authorizeHost>[0]) => withRootHostExecutionWork(task, () => authorizeHost(task));

const fixture = vi.hoisted(() => ({ desktop: false, dialog: vi.fn(), realpath: vi.fn(async (value: string) => value) }));
vi.mock('@/app', () => ({ isElectron: () => fixture.desktop }));
vi.mock('node:fs/promises', () => ({ default: { realpath: (value: string) => fixture.realpath(value) } }));
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => undefined },
  dialog: { showMessageBox: fixture.dialog },
}));

describe('unconfined host execution in a headless task', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    fixture.desktop = false;
    fixture.dialog.mockReset();
    fixture.realpath.mockReset().mockImplementation(async (value: string) => value);
  });

  it('requires an explicit operator grant at launch', async () => {
    const task = {} as never;
    vi.stubEnv('AIDER_DESK_ALLOW_HOST_SHELL', undefined);
    expect(await authorizeUnconfinedHostExecution(task)).toBe(false);
    vi.stubEnv('AIDER_DESK_ALLOW_HOST_SHELL', 'true');
    expect(await authorizeUnconfinedHostExecution(task)).toBe(true);
  });

  it('defaults desktop host consent to cancel and remembers only an accepted task grant', async () => {
    fixture.desktop = true;
    const task = { getTaskDir: () => 'synthetic-project', getProjectDir: () => 'synthetic-project' } as never;
    setHostExecutionWork(task, { id: 'first-work', objective: 'Run the requested tests' });
    fixture.dialog.mockResolvedValueOnce({ response: 0 }).mockResolvedValue({ response: 1 });
    expect(await authorizeUnconfinedHostExecution(task)).toBe(false);
    expect(await authorizeUnconfinedHostExecution(task)).toBe(true);
    expect(await authorizeUnconfinedHostExecution(task)).toBe(true);
    expect(fixture.dialog).toHaveBeenCalledTimes(2);
    expect(fixture.dialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultId: 0,
        cancelId: 0,
        detail: expect.stringContaining('anche fuori dal progetto'),
      }),
    );
    setHostExecutionWork(task, { id: 'next-work', objective: 'Build another application' });
    expect(await authorizeUnconfinedHostExecution(task)).toBe(true);
    expect(fixture.dialog).toHaveBeenCalledTimes(3);
  });

  it('requires a live work binding and expires a completed work grant', async () => {
    fixture.desktop = true;
    const task = { getTaskDir: () => '/project', getProjectDir: () => '/project' } as never;
    fixture.dialog.mockResolvedValue({ response: 1 });
    expect(await authorizeUnconfinedHostExecution(task)).toBe(false);
    setHostExecutionWork(task, { id: 'work', objective: 'Fix the bug' });
    expect(await authorizeUnconfinedHostExecution(task)).toBe(true);
    clearHostExecutionWork(task, false);
    expect(await authorizeHost(task)).toBe(false);
    setHostExecutionWork(task, { id: 'work', objective: 'Fix the bug' });
    expect(await authorizeUnconfinedHostExecution(task)).toBe(true);
    expect(fixture.dialog).toHaveBeenCalledTimes(1);
    clearHostExecutionWork(task, true);
    setHostExecutionWork(task, { id: 'work', objective: 'Fix the bug' });
    expect(await authorizeUnconfinedHostExecution(task)).toBe(true);
    expect(fixture.dialog).toHaveBeenCalledTimes(2);
  });

  it('renews consent after an objective, project or worktree change', async () => {
    fixture.desktop = true;
    let directory = '/project';
    let project = '/project';
    const task = { getTaskDir: () => directory, getProjectDir: () => project } as never;
    fixture.dialog.mockResolvedValue({ response: 1 });
    setHostExecutionWork(task, { id: 'work', objective: 'Fix the bug' });
    await authorizeUnconfinedHostExecution(task);
    setHostExecutionWork(task, { id: 'work', objective: 'Change the feature' });
    await authorizeUnconfinedHostExecution(task);
    directory = '/another-worktree';
    await authorizeUnconfinedHostExecution(task);
    project = '/another-project';
    await authorizeUnconfinedHostExecution(task);
    expect(fixture.dialog).toHaveBeenCalledTimes(4);
  });

  it('shows admitted new instructions in the renewed consent', async () => {
    fixture.desktop = true;
    const task = { getTaskDir: () => '/project', getProjectDir: () => '/project' } as never;
    fixture.dialog.mockResolvedValue({ response: 1 });
    setHostExecutionWork(task, { id: 'work', objective: 'Fix the bug' });
    await authorizeUnconfinedHostExecution(task);
    amendHostExecutionWork(task, 'Use the newly selected test environment');
    await authorizeUnconfinedHostExecution(task);
    expect(fixture.dialog).toHaveBeenLastCalledWith(expect.objectContaining({ detail: expect.stringContaining('Use the newly selected test environment') }));
    expect(fixture.dialog).toHaveBeenCalledTimes(2);
  });

  it('isolates parallel standalone workers and preserves an active parent grant', async () => {
    fixture.desktop = true;
    const task = { getTaskDir: () => '/project', getProjectDir: () => '/project' } as never;
    fixture.dialog.mockResolvedValue({ response: 1 });
    await Promise.all(
      ['worker-one', 'worker-two'].map((id) =>
        withHostExecutionWork(task, { id, objective: id }, async () => {
          expect(await authorizeHost(task)).toBe(true);
          await Promise.resolve();
          expect(await authorizeHost(task)).toBe(true);
        }),
      ),
    );
    expect(fixture.dialog).toHaveBeenCalledTimes(2);
    expect(await authorizeUnconfinedHostExecution(task)).toBe(false);
    setHostExecutionWork(task, { id: 'parent', objective: 'The authorized parent work' });
    await authorizeUnconfinedHostExecution(task);
    await withHostExecutionWork(task, { id: 'standalone', objective: 'Independent work' }, async () => {
      expect(await authorizeHost(task)).toBe(true);
    });
    await withRootHostExecutionWork(task, async () => {
      await withHostExecutionWork(task, { id: 'child', objective: 'Child action' }, async () => {
        expect(await authorizeHost(task)).toBe(true);
      });
    });
    expect(await authorizeUnconfinedHostExecution(task)).toBe(true);
    expect(fixture.dialog).toHaveBeenCalledTimes(4);
  });

  it('keeps a delegated background worker bound until its own completion', async () => {
    fixture.desktop = true;
    const task = { getTaskDir: () => '/project', getProjectDir: () => '/project' } as never;
    fixture.dialog.mockResolvedValue({ response: 1 });
    setHostExecutionWork(task, { id: 'parent', objective: 'Complete the delegated work' });
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let child!: Promise<void>;
    await withRootHostExecutionWork(task, async () => {
      expect(await authorizeHost(task)).toBe(true);
      child = withHostExecutionWork(task, { id: 'delegated', objective: 'Delegated step' }, async () => {
        await waiting;
        expect(await authorizeHost(task)).toBe(true);
      });
    });
    clearHostExecutionWork(task, true);
    release();
    await child;
    expect(await authorizeUnconfinedHostExecution(task)).toBe(false);
    expect(fixture.dialog).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('rechecks revocation after the final realpath await (cached=%s)', async (cached) => {
    fixture.desktop = true;
    const task = { getTaskDir: () => '/project', getProjectDir: () => '/project' } as never;
    setHostExecutionWork(task, { id: 'work', objective: 'Original work' });
    fixture.dialog.mockResolvedValue({ response: 1 });
    if (cached) {
      await authorizeUnconfinedHostExecution(task);
    }
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let paths = 0;
    fixture.realpath.mockImplementation(async (value) => {
      if (++paths === 3) {
        await waiting;
      }
      return value;
    });
    const allowed = authorizeUnconfinedHostExecution(task);
    await vi.waitFor(() => expect(paths).toBe(3));
    amendHostExecutionWork(task, 'New instructions admitted during the last path check');
    release();
    expect(await allowed).toBe(false);
  });

  it.each(['new-instructions', 'work-ended', 'directory-changed'])('rejects an outstanding consent after %s', async (change) => {
    fixture.desktop = true;
    let directory = '/project';
    const task = { getTaskDir: () => directory, getProjectDir: () => '/project' } as never;
    setHostExecutionWork(task, { id: 'work', objective: 'Fix the bug' });
    fixture.dialog.mockImplementationOnce(async () => {
      if (change === 'new-instructions') {
        revokeHostExecutionGrant(task);
      }
      if (change === 'work-ended') {
        clearHostExecutionWork(task, true);
      }
      if (change === 'directory-changed') {
        directory = '/other';
      }
      return { response: 1 };
    });
    expect(await authorizeUnconfinedHostExecution(task)).toBe(false);
    setHostExecutionWork(task, { id: 'work', objective: 'Fix the bug' });
    fixture.dialog.mockResolvedValue({ response: 1 });
    expect(await authorizeUnconfinedHostExecution(task)).toBe(true);
    expect(fixture.dialog).toHaveBeenCalledTimes(2);
  });
});
