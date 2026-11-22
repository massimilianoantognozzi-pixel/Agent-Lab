import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

it('keeps extension checkpoints, schedules and compaction state in the configured project directory', async () => {
  const project = await fs.mkdtemp(path.join(tmpdir(), 'agentlab-extension-paths-'));
  try {
    const legacy = path.join(project, '.aider-desk');
    await fs.mkdir(legacy);
    await fs.writeFile(path.join(legacy, 'schedules.json'), '{"previous":true}');
    vi.stubEnv('AIDER_DESK_DIR', '.agent-lab');
    vi.resetModules();
    const { addCheckpointEntry, loadCheckpointIndex } = await import('../checkpoints/storage');
    const { saveTaskState, getTaskState } = await import('../compaction-studio/storage');
    const { saveSchedules, loadSchedules } = await import('../task-scheduler/storage');
    const { pruneFiles } = await import('../jev/files');
    await addCheckpointEntry(project, 'task', 'message', {
      ref: 'r', toolName: 'write', filePath: 'sample.ts', timestamp: 1, branch: 'main', headSha: 'a', indexTreeSha: 'b', worktreeTreeSha: 'c',
    });
    saveTaskState(project, 'task', { visible: true });
    const schedules = { task: { runsCompleted: 1, isActive: true, paused: false } };
    saveSchedules(project, schedules);
    expect((await loadCheckpointIndex(project, 'task')).checkpoints.message.filePath).toBe('sample.ts');
    expect(getTaskState(project, 'task').visible).toBe(true);
    expect(loadSchedules(project)).toEqual(schedules);
    expect((await fs.readdir(path.join(project, '.agent-lab'))).sort()).toEqual(['checkpoints', 'compaction-studio.json', 'schedules.json']);
    expect(await fs.readdir(legacy)).toEqual(['schedules.json']);
    expect(await fs.readFile(path.join(legacy, 'schedules.json'), 'utf8')).toBe('{"previous":true}');
    const privateFile = path.join('.agent-lab', 'schedules.json');
    expect((await pruneFiles([privateFile], project)).files).toEqual([]);
  } finally {
    await fs.rm(project, { recursive: true, force: true });
  }
});
