import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';
import { compareBaseDirs } from '@common/utils';

import type { ProjectManager } from './project-manager';
import type { Store } from '@/store';

import { atomicWriteJsonFile } from '@/utils/atomic-write';

const goalRecord = z.object({ project: z.string().min(1), taskId: z.string().min(1), goalId: z.uuid() });
export const managedGoalRestartSchema = z.object({ version: z.literal(1), token: z.uuid(), goals: z.array(goalRecord) });

export const writeManagedGoalRestart = async (file: string, token: string, manager: ProjectManager, store: Store): Promise<void> => {
  const goals: z.infer<typeof goalRecord>[] = [];
  const open = store.getOpenProjects();
  for (const project of manager.getProjects()) {
    if (!project.isStarted() || !open.some(({ baseDir }) => compareBaseDirs(baseDir, project.baseDir))) {
      continue;
    }
    const records: Promise<z.infer<typeof goalRecord> | undefined>[] = [];
    project.forEachTask((task) => records.push(task.getManagedRestartGoal()));
    for (const record of await Promise.all(records)) {
      if (record) {
        goals.push(record);
      }
    }
  }
  await atomicWriteJsonFile(file, managedGoalRestartSchema.parse({ version: 1, token, goals }));
};

export const recoverManagedGoals = async (file: string, token: string, manager: ProjectManager, store: Store): Promise<PromiseSettledResult<void>[]> => {
  let snapshot;
  try {
    snapshot = managedGoalRestartSchema.parse(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  if (snapshot.token !== token) {
    return [];
  }
  await fs.unlink(file);
  const open = store.getOpenProjects();
  const results = await Promise.allSettled(
    snapshot.goals.map(async ({ project, taskId, goalId }) => {
      const available = open.find(({ baseDir }) => compareBaseDirs(baseDir, project));
      if (!available) {
        return;
      }
      // start() is shared and waits for loadTasks. Never reopen a project absent from the profile.
      const runtime = manager.getProject(available.baseDir);
      await runtime.start();
      await runtime.getTask(taskId)?.resumeManagedRestartGoal(goalId);
    }),
  );
  return results;
};

export const managedGoalRestartPath = (dataDir: string) => path.join(dataDir, 'managed-goal-restart.json');
