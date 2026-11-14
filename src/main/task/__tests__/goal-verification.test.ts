import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test, vi } from 'vitest';

import { goalWorktreeRevision, isProjectVerificationCommand, isGoalVerificationDirectory } from '../goal-verification';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

test('rejects trivial shell evidence and accepts ordinary project check entry points', () => {
  expect(isProjectVerificationCommand('echo OK')).toBe(false);
  expect(isProjectVerificationCommand('npm test || echo OK')).toBe(false);
  expect(isProjectVerificationCommand('npm test --if-present')).toBe(false);
  expect(isProjectVerificationCommand('vitest --passWithNoTests')).toBe(false);
  expect(isProjectVerificationCommand('npm run test:node -- --no-color')).toBe(true);
  expect(isProjectVerificationCommand('python -m pytest tests/test_core.py')).toBe(true);
});

test('binds evidence to the bytes of tracked and untracked source inputs', async () => {
  const fixtureDir = path.resolve('lab/work/boundary-tests');
  await fs.mkdir(fixtureDir, { recursive: true });
  const repo = await fs.mkdtemp(path.join(fixtureDir, 'goal-verifier-'));
  execFileSync('git', ['init', '-q'], { cwd: repo, windowsHide: true });
  await fs.writeFile(path.join(repo, 'source.txt'), 'version 1');
  await fs.writeFile(path.join(repo, 'new-input.txt'), 'original');
  execFileSync('git', ['add', 'source.txt'], { cwd: repo, windowsHide: true });
  const verified = await goalWorktreeRevision(repo);
  expect(verified).toMatch(/^[0-9a-f]{64}$/);
  expect(await goalWorktreeRevision(repo)).toBe(verified);
  await fs.writeFile(path.join(repo, 'new-input.txt'), 'replaced');
  expect(await goalWorktreeRevision(repo)).not.toBe(verified);
  await fs.writeFile(path.join(repo, 'new-input.txt'), 'original');
  await fs.writeFile(path.join(repo, 'source.txt'), 'version 2');
  expect(await goalWorktreeRevision(repo)).not.toBe(verified);
});

test('qualifies an explicit verification directory only inside the real checkout', async () => {
  const base = path.resolve('lab/work/boundary-tests');
  await fs.mkdir(base, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(base, 'goal-cwd-'));
  const checkout = path.join(fixture, 'checkout');
  const child = path.join(checkout, 'tests');
  const unrelated = path.join(fixture, 'unrelated');
  await fs.mkdir(child, { recursive: true });
  await fs.mkdir(unrelated);
  await fs.symlink(unrelated, path.join(checkout, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(isGoalVerificationDirectory(checkout, '.')).resolves.toBe(true);
  await expect(isGoalVerificationDirectory(checkout, 'tests')).resolves.toBe(true);
  await expect(isGoalVerificationDirectory(checkout, 'linked')).resolves.toBe(false);
  await expect(isGoalVerificationDirectory(checkout, '../unrelated')).resolves.toBe(false);
  await expect(isGoalVerificationDirectory(checkout, 'missing')).resolves.toBe(false);
});
