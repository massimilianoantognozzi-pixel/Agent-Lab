import path from 'node:path';
import { existsSync, realpathSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('node:path');
vi.unmock('path');
// A regression must never touch a real network filesystem during this denial test.
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => true), realpathSync: vi.fn((value: string) => value), statSync: vi.fn() }));

import { assertLabFilePath } from '../lab-mode';

describe('Lab UNC denial before filesystem resolution', () => {
  const root = path.resolve('lab/work/virtual-workspaces');
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AIDER_DESK_LAB_MODE', 'true');
    vi.stubEnv('AIDER_DESK_LAB_WORKSPACE_ROOT', root);
  });
  afterEach(() => vi.unstubAllEnvs());
  it('rejects the external UNC target without stat or canonical probes to that target', () => {
    const target = '\\\\never-contact.example\\private\\canary.txt';
    expect(() => assertLabFilePath(path.join(root, 'sample'), target)).toThrow('fuori');
    expect(vi.mocked(existsSync).mock.calls.some((args) => String(args[0]).startsWith('\\\\'))).toBe(false);
    expect(vi.mocked(realpathSync).mock.calls.some((args) => String(args[0]).startsWith('\\\\'))).toBe(false);
  });
});
