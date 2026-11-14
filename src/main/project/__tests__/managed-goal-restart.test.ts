import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { recoverManagedGoals, writeManagedGoalRestart } from '../managed-goal-restart';

import type { ProjectManager } from '../project-manager';
import type { Store } from '@/store';

vi.unmock('fs');
vi.unmock('node:fs/promises');

describe('managed Goal restart', () => {
  it('restores only captured, still-open goals once using the matching restart token', async () => {
    const root = path.resolve('lab/work/boundary-tests');
    await fs.mkdir(root, { recursive: true });
    const fixture = await fs.mkdtemp(path.join(root, 'managed-goal-restart-'));
    const file = path.join(fixture, 'restart.json');
    const token = randomUUID();
    const record = { project: path.join(fixture, 'open'), taskId: 'already-loaded', goalId: randomUUID() };
    const removed = { project: path.join(fixture, 'closed-later'), taskId: 'removed', goalId: randomUUID() };
    const resume = vi.fn().mockResolvedValue(undefined);
    const runtime = { start: vi.fn().mockResolvedValue(undefined), getTask: vi.fn(() => ({ resumeManagedRestartGoal: resume })) };
    const started = (baseDir: string, goal: typeof record | undefined) => ({
      baseDir,
      isStarted: () => true,
      forEachTask: (fn: (task: { getManagedRestartGoal: () => Promise<typeof record | undefined> }) => void) => fn({ getManagedRestartGoal: async () => goal }),
    });
    const projects = [started(record.project, record), started(removed.project, removed), started(path.join(fixture, 'unopened'), undefined)];
    const manager = { getProjects: () => projects, getProject: vi.fn(() => runtime) } as unknown as ProjectManager;
    const open = vi.fn(() => [{ baseDir: record.project }, { baseDir: removed.project }]);
    const store = { getOpenProjects: open } as unknown as Store;
    await writeManagedGoalRestart(file, token, manager, store);
    await expect(recoverManagedGoals(file, randomUUID(), manager, store)).resolves.toEqual([]);
    expect(resume).not.toHaveBeenCalled();
    open.mockReturnValue([{ baseDir: record.project }]);
    await expect(recoverManagedGoals(file, token, manager, store)).resolves.toEqual([{ status: 'fulfilled' }, { status: 'fulfilled' }]);
    expect(manager.getProject).toHaveBeenCalledExactlyOnceWith(record.project);
    expect(resume).toHaveBeenCalledExactlyOnceWith(record.goalId);
    await expect(recoverManagedGoals(file, token, manager, store)).resolves.toEqual([]);
    expect(resume).toHaveBeenCalledTimes(1);
  });
});
