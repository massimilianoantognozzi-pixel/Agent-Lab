import type { TaskData } from './types';

// These shortcuts take effect only when the entire message is submitted.
export const workCommandPattern = /^\/?(inizia|riprendi|chiudi)$/i;
export const newWorkRequestPattern = /^\/inizia\s+([\s\S]+)$/i;

export class WorkResumeError extends Error {}

export const canResumeWork = (task: TaskData): boolean => {
  if (task.archived || task.state === 'DONE' || task.state === 'IN_PROGRESS') {
    return false;
  }
  const continuation = task.metadata?.governedContinuation;
  if (continuation && typeof continuation === 'object' && 'kind' in continuation && 'state' in continuation) {
    return (continuation.kind === 'queue' || continuation.kind === 'task') && ['active', 'paused', 'waiting'].includes(String(continuation.state));
  }
  return task.state === 'INTERRUPTED';
};

export const latestResumableWork = (tasks: TaskData[]) =>
  tasks
    .filter((task) => !task.parentId && canResumeWork(task))
    .sort((a, b) => (b.updatedAt ?? b.interruptedAt ?? '').localeCompare(a.updatedAt ?? a.interruptedAt ?? ''))[0];
