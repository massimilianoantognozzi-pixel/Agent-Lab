import { describe, expect, it } from 'vitest';
import { canResumeWork, latestResumableWork, newWorkRequestPattern, workCommandPattern } from '@common/work-commands';

import { sessionPrompt } from '../session-prompts';

import type { TaskData } from '@common/types';

const task = (id: string, props: Partial<TaskData> = {}) => ({ id, state: 'INTERRUPTED', updatedAt: '2026-11-18', ...props }) as TaskData;

describe('project work shortcuts', () => {
  it('loads three distinct native prompt bodies without front matter or shell substitutions', () => {
    for (const [command, content] of [
      ['/inizia', 'prima task'],
      ['/riprendi', 'Knowledge Base'],
      ['/chiudi', 'push'],
    ]) {
      expect(sessionPrompt(command)).toContain(content);
      expect(sessionPrompt(command)).not.toMatch(/^(?:---|!)/m);
    }
    expect(sessionPrompt('Avvia il lavoro')).toBeUndefined();
  });
  it('recognizes only a complete shortcut, leaving prose and existing workflow commands alone', () => {
    for (const text of ['/inizia', '/riprendi', 'Inizia', 'RIPRENDI']) {
      expect(workCommandPattern.test(text)).toBe(true);
    }
    for (const text of ['Avvia il lavoro', 'Riprendi il lavoro', '/inizializza', 'riprendi la verifica', '/riprendi altro']) {
      expect(workCommandPattern.test(text)).toBe(false);
    }
    expect(newWorkRequestPattern.exec('/inizia Correggi il filtro')?.[1]).toBe('Correggi il filtro');
    expect(newWorkRequestPattern.test('Inizia il lavoro')).toBe(false);
  });

  it('finds the latest interrupted root task independent of list order, including an unfinished governed queue', () => {
    const queued = task('queue', {
      updatedAt: '2026-11-19',
      state: 'READY_FOR_REVIEW',
      metadata: { governedContinuation: { kind: 'queue', state: 'waiting' } },
    });
    const tasks = [queued, task('older'), task('child', { parentId: 'older', updatedAt: '2026-11-20' }), task('archived', { archived: true })];
    expect(latestResumableWork(tasks)?.id).toBe('queue');
    expect(latestResumableWork(tasks.reverse())?.id).toBe('queue');
  });

  it('does not resume a fresh chat, completed queue or unrelated task awaiting approval', () => {
    for (const record of [
      task('fresh', { state: 'TODO' }),
      task('finished', { state: 'DONE' }),
      task('plan', { state: 'READY_FOR_IMPLEMENTATION' }),
      task('live', { state: 'IN_PROGRESS', metadata: { recoverableRootTurn: 'current' } }),
      task('closed-queue', { metadata: { governedContinuation: { kind: 'queue', state: 'complete' } } }),
    ]) {
      expect(canResumeWork(record)).toBe(false);
    }
    expect(latestResumableWork([])).toBeUndefined();
  });
});
