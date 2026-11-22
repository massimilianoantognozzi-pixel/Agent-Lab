import fs from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';

import type { Task } from '@/task';

import { isElectron } from '@/app';

type HostWorkInput = { id: string; objective: string; instructions?: string };
type HostWork = HostWorkInput & { active: boolean; children: number; completed: boolean };
const work = new WeakMap<Task, HostWork>();
const scopedWork = new AsyncLocalStorage<{ task: Task; active: boolean; current: () => HostWork | undefined }>();
const approvals = new WeakMap<HostWork, { key: string; decision: Promise<boolean> }>();
const computerWork = new WeakMap<HostWork, { objective: string }>();
let desktopApi: Promise<typeof import('electron')> | undefined;
const loadDesktopApi = () => (desktopApi ??= import('electron'));

const activeWork = (task: Task): HostWork | undefined => {
  const scoped = scopedWork.getStore();
  const value = scoped?.task === task && scoped.active ? scoped.current() : undefined;
  return value?.active ? value : undefined;
};

export const setHostExecutionWork = (task: Task, value: HostWorkInput): void => {
  const current = work.get(task);
  if (current && !current.completed && current.id === value.id && current.objective === value.objective && current.instructions === value.instructions) {
    current.active = true;
    return;
  }
  if (current && !(current.completed && current.children > 0)) {
    current.active = false;
    approvals.delete(current);
  }
  work.set(task, { ...value, active: true, children: 0, completed: false });
};

export const revokeHostExecutionGrant = (task: Task): void => {
  const current = work.get(task);
  if (current) {
    approvals.delete(current);
    computerWork.delete(current);
  }
  const scoped = scopedWork.getStore();
  const currentScope = scoped?.task === task ? scoped.current() : undefined;
  if (currentScope) {
    approvals.delete(currentScope);
    computerWork.delete(currentScope);
  }
};

// Separate identity for window sharing: permission to run a shell does not grant screen access.
export const currentComputerWork = (task: Task) => {
  const current = activeWork(task);
  if (!current) {
    return undefined;
  }
  let token = computerWork.get(current);
  if (!token) {
    token = { objective: current.objective };
    computerWork.set(current, token);
  }
  return token;
};

export const amendHostExecutionWork = (task: Task, instructions: string): void => {
  revokeHostExecutionGrant(task);
  const current = work.get(task);
  if (current?.active) {
    setHostExecutionWork(task, { id: current.id, objective: current.objective, instructions });
  }
};

export const clearHostExecutionWork = (task: Task, completed: boolean): void => {
  const current = work.get(task);
  if (completed && current) {
    current.completed = true;
    if (current.children > 0) {
      return;
    }
    current.active = false;
    approvals.delete(current);
    work.delete(task);
  }
};

// Standalone workers and Git recovery own their authorization. Parallel workers
// must not replace the parent task's work binding or each other's consent.
export const withHostExecutionWork = async <T>(task: Task, value: HostWorkInput, action: () => Promise<T>): Promise<T> => {
  const inherited = scopedWork.getStore();
  if (inherited?.task === task && inherited.active && activeWork(task)) {
    const parent = activeWork(task)!;
    parent.children++;
    const child = { task, active: true, current: () => parent };
    return scopedWork.run(child, async () => {
      try {
        return await action();
      } finally {
        child.active = false;
        parent.children--;
        if (parent.completed && !parent.children) {
          parent.active = false;
          approvals.delete(parent);
          if (work.get(task) === parent) {
            work.delete(task);
          }
        }
      }
    });
  }
  if (isElectron() && process.env.AIDER_DESK_HEADLESS !== 'true') {
    await loadDesktopApi();
  }
  const scoped: HostWork = { ...value, active: true, children: 0, completed: false };
  const context = { task, active: true, current: () => scoped };
  return scopedWork.run(context, async () => {
    try {
      return await action();
    } finally {
      context.active = false;
      scoped.completed = true;
      if (!scoped.children) {
        scoped.active = false;
        approvals.delete(scoped);
      }
    }
  });
};

export const withRootHostExecutionWork = async <T>(task: Task, action: () => Promise<T>): Promise<T> => {
  if (isElectron() && process.env.AIDER_DESK_HEADLESS !== 'true') {
    await loadDesktopApi();
  }
  const context = { task, active: true, current: () => work.get(task) };
  return scopedWork.run(context, async () => {
    try {
      return await action();
    } finally {
      context.active = false;
    }
  });
};

export const authorizeUnconfinedHostExecution = async (task: Task): Promise<boolean> => {
  // Headless operators must make the host capability explicit at launch.
  if (!isElectron() || process.env.AIDER_DESK_HEADLESS === 'true') {
    return process.env.AIDER_DESK_ALLOW_HOST_SHELL === 'true';
  }
  const active = activeWork(task);
  if (!active) {
    return false;
  }
  const scope = async () =>
    JSON.stringify([active.id, active.objective, active.instructions, await fs.realpath(task.getProjectDir()), await fs.realpath(task.getTaskDir())]);
  const key = await scope();
  if (activeWork(task) !== active) {
    return false;
  }
  const current = approvals.get(active);
  if (current?.key === key) {
    const allowed = await current.decision;
    const observedKey = await scope();
    return allowed && activeWork(task) === active && approvals.get(active) === current && observedKey === key;
  }

  const decision = (async () => {
    const { BrowserWindow, dialog } = await loadDesktopApi();
    const options = {
      type: 'warning' as const,
      title: 'Agent-Lab',
      message: 'Consentire i comandi sul PC per questo incarico?',
      detail: `${active.objective}${active.instructions ? '\n\nIstruzioni correnti: ' + active.instructions : ''}\n\nProgetto: ${task.getProjectDir()}\nCartella di lavoro: ${task.getTaskDir()}\n\nIl consenso vale per questo incarico e queste cartelle, comprese le riprese automatiche nella sessione dell'app. Nuove istruzioni o un altro incarico richiedono una nuova conferma. I comandi usano i permessi del tuo account e possono accedere anche fuori dal progetto: questa autorizzazione non è una sandbox.`,
      buttons: ['Annulla', 'Consenti questo incarico'],
      defaultId: 0,
      cancelId: 0,
    };
    const owner = BrowserWindow.getFocusedWindow();
    const result = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options);
    return result.response === 1;
  })();
  const entry = { key, decision };
  approvals.set(active, entry);
  try {
    const allowed = await decision;
    if (!allowed && approvals.get(active) === entry) {
      approvals.delete(active);
    }
    const observedKey = await scope();
    const valid = allowed && activeWork(task) === active && approvals.get(active) === entry && observedKey === key;
    if (!valid && approvals.get(active) === entry) {
      approvals.delete(active);
    }
    return valid;
  } catch (error) {
    if (approvals.get(active) === entry) {
      approvals.delete(active);
    }
    throw error;
  }
};
