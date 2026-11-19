import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { approveProjectExtensionSnapshot, captureProjectExtensions, getApprovedProjectExtension } from '../project-extension-trust';

const settings = vi.hoisted(() => ({ data: '' }));

vi.mock('@/constants', () => ({
  AIDER_DESK_EXTENSIONS_DIR: '.aider-desk/extensions',
}));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => settings.data };
});

describe('project extension approval snapshots', () => {
  let root: string;
  let project: string;
  let entry: string;
  let helper: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentlab-extension-approval-'));
    settings.data = path.join(root, 'app');
    project = path.join(root, 'project');
    const extension = path.join(project, '.aider-desk', 'extensions', 'library');
    entry = path.join(extension, 'index.ts');
    helper = path.join(extension, 'helper.ts');
    await fs.mkdir(extension, { recursive: true });
    await fs.writeFile(entry, 'export { label } from "./helper";');
    await fs.writeFile(helper, 'export const label = "reviewed";');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('allows only a reviewed version of a project extension and its relative source files', async () => {
    expect(await getApprovedProjectExtension(project, entry)).toBeUndefined();
    const snapshot = await captureProjectExtensions(project);
    await fs.writeFile(helper, 'export const label = "later edit";');
    await approveProjectExtensionSnapshot(snapshot);

    const approvedEntry = await getApprovedProjectExtension(project, entry);
    expect(approvedEntry).toBeDefined();
    expect(path.relative(settings.data, approvedEntry!)).toContain('approved-project-extensions');
    expect(await fs.readFile(path.join(path.dirname(approvedEntry!), 'helper.ts'), 'utf8')).toBe('export const label = "reviewed";');

    await fs.writeFile(entry, 'export const label = "changed entry";');
    expect(await getApprovedProjectExtension(project, entry)).toBeUndefined();
    await approveProjectExtensionSnapshot(await captureProjectExtensions(project));
    expect(await fs.readFile((await getApprovedProjectExtension(project, entry))!, 'utf8')).toBe('export const label = "changed entry";');
  });

  it('keeps approval tied to the canonical project and extension directory', async () => {
    await approveProjectExtensionSnapshot(await captureProjectExtensions(project));
    const secondProject = `${project}-new`;
    const siblingEntry = path.join(secondProject, path.relative(project, entry));
    await fs.mkdir(path.dirname(siblingEntry), { recursive: true });
    await fs.copyFile(entry, siblingEntry);

    expect(await getApprovedProjectExtension(secondProject, siblingEntry)).toBeUndefined();
    expect(await getApprovedProjectExtension(project, siblingEntry)).toBeUndefined();
  });
});
