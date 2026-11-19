import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveContainedPath } from '../contained-path';

describe('canonical project file paths', () => {
  let fixture: string;
  let workspace: string;
  let other: string;

  beforeEach(async () => {
    fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'agentlab-scope-'));
    workspace = path.join(fixture, 'project');
    other = path.join(fixture, 'project-sibling');
    await Promise.all([fs.mkdir(workspace), fs.mkdir(other)]);
  });

  afterEach(async () => {
    await fs.rm(fixture, { recursive: true, force: true });
  });

  it('accepts a new path under the project and rejects nearby workspaces', async () => {
    expect(await resolveContainedPath(workspace, 'src/new.ts')).toBe(path.join(await fs.realpath(workspace), 'src', 'new.ts'));
    await expect(resolveContainedPath(workspace, path.join(other, 'different.ts'))).rejects.toThrow('outside');
  });

  it('checks the actual directory behind a project link', async () => {
    await fs.symlink(other, path.join(workspace, 'linked-folder'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(resolveContainedPath(workspace, path.join('linked-folder', 'new.ts'))).rejects.toThrow('resolves outside');
  });
});
