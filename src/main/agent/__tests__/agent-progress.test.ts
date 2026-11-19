import { describe, expect, it, vi } from 'vitest';

import { AgentProgress, canResumeNoProgress } from '../agent-progress';

import { NATIVE_VERIFICATION_RESEARCH_QUERY } from '@/task/goal-verification';

const read = (filePath = 'src/a.ts', output = 'actual file contents') => [{ toolName: 'power---file_read', input: { filePath }, output }];
const revision = async () => 'observed-source-revision';

describe('observed progress, without an iteration budget', () => {
  it('warns before stopping a fourth identical concluded operation', async () => {
    const progress = new AgentProgress();
    expect(await progress.observe(read(), revision)).toBeUndefined();
    expect(await progress.observe(read(), revision)).toBeUndefined();
    expect(await progress.observe(read(), revision)).toMatchObject({ action: 'warn' });
    const stopped = await progress.observe(read(), revision);
    expect(stopped).toMatchObject({ action: 'stop', checkpoint: { revision: await revision(), tools: ['power---file_read'] } });
    expect(JSON.stringify(stopped)).not.toContain('actual file contents');
  });

  it('detects a repeated read cycle but allows arbitrarily many different operations', async () => {
    const progress = new AgentProgress();
    const readRevision = vi.fn(revision);
    for (let index = 0; index < 100; index++) {
      expect(await progress.observe(read('file-' + index), readRevision)).toBeUndefined();
    }
    expect(readRevision).toHaveBeenCalledTimes(1);
    progress.reset();
    for (let cycle = 0; cycle < 3; cycle++) {
      await progress.observe(read('first'), revision);
      await progress.observe(read('second'), revision);
    }
    expect(await progress.observe(read('first'), revision)).toMatchObject({ action: 'warn' });
    expect(await progress.observe(read('second'), revision)).toMatchObject({ action: 'stop' });
  });

  it('does not stop when results or source files change', async () => {
    const progress = new AgentProgress();
    for (let index = 0; index < 6; index++) {
      expect(await progress.observe(read('src/a.ts', 'result-' + index), revision)).toBeUndefined();
    }
    progress.reset();
    await progress.observe(read(), revision);
    await progress.observe(read(), revision);
    expect(await progress.observe(read(), async () => 'changed-source')).toBeUndefined();
  });

  it('does not infer stagnation without a source revision', async () => {
    const progress = new AgentProgress();
    for (let index = 0; index < 8; index++) {
      expect(await progress.observe(read(), async () => undefined)).toBeUndefined();
    }
  });

  it.each([
    { toolName: 'power---bash_poll', output: { exitCode: null, processId: 'running' } },
    { toolName: 'power---bash', output: { exitCode: null, processId: 'running' } },
    { toolName: 'power---bash', output: { exitCode: 1, stdout: '', stderr: 'arbitrary external command' } },
    { toolName: 'power---bash', output: { exitCode: 1, stdout: '', stderr: 'arbitrary external command', [NATIVE_VERIFICATION_RESEARCH_QUERY]: undefined } },
    { toolName: 'power---file_write', output: 'File written' },
    { toolName: 'another-mcp---command', output: 'Result' },
  ])('does not count pending processes or uncharacterized actions: $toolName', async (result) => {
    const progress = new AgentProgress();
    await progress.observe(read(), revision);
    await progress.observe(read(), revision);
    for (let index = 0; index < 8; index++) {
      expect(await progress.observe([result], revision)).toBeUndefined();
    }
    expect(await progress.observe(read(), revision)).toBeUndefined();
  });

  it('compares errors from concluded native verification commands and resets on user input', async () => {
    const progress = new AgentProgress();
    const result = [
      {
        toolName: 'power---bash',
        input: { command: 'npm test' },
        output: { exitCode: 1, stdout: '', stderr: 'Assertion failed', [NATIVE_VERIFICATION_RESEARCH_QUERY]: 'public test diagnostics' },
      },
    ];
    await progress.observe(result, revision);
    await progress.observe(result, revision);
    expect(await progress.observe(result, revision)).toMatchObject({ action: 'warn' });
    progress.reset();
    expect(await progress.observe(result, revision)).toBeUndefined();
  });

  it('requires new evidence, a changed goal or explicit resumption', () => {
    const checkpoint = { revision: 'same', fingerprints: ['hash'], tools: ['power---file_read'], goalBinding: 'objective-one' };
    expect(canResumeNoProgress(checkpoint, 'same', 'objective-one')).toBe(false);
    expect(canResumeNoProgress(checkpoint, undefined, 'objective-one')).toBe(false);
    expect(canResumeNoProgress(checkpoint, 'different', 'objective-one')).toBe(true);
    expect(canResumeNoProgress(checkpoint, 'same', 'objective-two')).toBe(true);
    expect(canResumeNoProgress(checkpoint, 'same', 'objective-one', true)).toBe(true);
  });
});
