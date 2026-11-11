import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('fs');
vi.unmock('node:fs');
vi.unmock('fs/promises');
vi.unmock('node:fs/promises');
vi.unmock('path');
vi.unmock('node:path');

import { digest, manifestDigest, projectControl, safeProjectPath, sourceManifest } from '../lab-projects/policy';
import { assertLabCodingProject } from '../lab-mode';
import { prepareWebProject } from '../lab-projects/templates';
import {
  editProjectFile,
  historyFor,
  recoverProject,
  restoreRevision,
  writeProjectFile,
  projectUpdatedFiles,
  projectFileContents,
} from '../lab-projects/files';
import { getAllFiles } from '../utils/file-system';
import { exportProject, requireCurrentProof, runProjectChecks } from '../lab-projects/runtime';

describe('Freelance project integrity and denial', () => {
  let root: string;
  beforeEach(async () => {
    const base = path.resolve('lab/work/freelance-unit', randomUUID());
    fs.mkdirSync(base, { recursive: true });
    root = path.join(base, 'project');
    fs.mkdirSync(root);
    vi.stubEnv('AIDER_DESK_LAB_MODE', 'true');
    vi.stubEnv('AIDER_DESK_LAB_LOCAL_MODEL', 'devstral-coding');
    vi.stubEnv('AIDER_DESK_LAB_WORKSPACE_ROOT', root);
    vi.stubEnv('AIDER_DESK_HOME_DIR', path.join(base, 'profile', 'home'));
    await prepareWebProject(root, 'vanilla', 'Fixture');
  });
  afterEach(() => vi.unstubAllEnvs());
  it('denies external, hidden, reserved, device, secrets and frozen config writes', () => {
    for (const candidate of [
      '../canary.txt',
      '~/test.txt',
      'C:/test.txt',
      String.raw`\\server\share\a.txt`,
      '.env',
      'sub/.git/a.txt',
      'nul.txt',
      'credentials.json',
      'service-account.json',
      'token.txt',
    ]) {
      expect(() => safeProjectPath(root, candidate, true)).toThrow();
    }
    for (const candidate of ['AGENTS.md', 'package.json', 'jsconfig.json', 'vite.config.ts']) {
      expect(() => safeProjectPath(root, candidate, true)).toThrow();
    }
  });
  it('keeps before/after backups, exact edits and safe rollback', async () => {
    await writeProjectFile(root, 'app.js', 'const subtotal = 10;');
    const edit = await editProjectFile(root, 'app.js', '10', '20');
    expect(fs.readFileSync(path.join(root, 'app.js'), 'utf8')).toContain('20');
    await restoreRevision(root, edit.id);
    expect(fs.readFileSync(path.join(root, 'app.js'), 'utf8')).toContain('10');
    expect(fs.readFileSync(path.join(projectControl(root), 'history', edit.id, 'after'), 'utf8')).toContain('20');
  });
  it('lists source files without Git and shows actual before/after in the review UI', async () => {
    expect(await getAllFiles(root)).toContain('index.html');
    expect(await getAllFiles(root)).not.toContain('.gitignore');
    const before = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    const revision = await writeProjectFile(root, 'app.js', 'const tested = true;\n');
    expect(await projectFileContents(root, 'app.js')).toEqual({ oldContent: before, newContent: 'const tested = true;\n' });
    const updates = await projectUpdatedFiles(root);
    expect(updates.find((file) => file.path === 'app.js')).toMatchObject({ additions: 1 });
    expect(updates[0].diff).toContain('+const tested = true;');
    await restoreRevision(root, revision.id);
    expect((await projectUpdatedFiles(root)).find((file) => file.path === 'app.js')).toBeUndefined();
  });
  it('keeps one review baseline for separator and Windows case variants', async () => {
    await writeProjectFile(root, 'sub/script.js', 'const first = 1;');
    await writeProjectFile(root, 'sub\\script.js', 'const second = 2;');
    expect((await projectUpdatedFiles(root)).filter((file) => file.path.toLowerCase().includes('script.js'))).toHaveLength(1);
    if (process.platform === 'win32') {
      const before = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
      await writeProjectFile(root, 'app.js', 'first');
      await writeProjectFile(root, 'APP.JS', 'second');
      expect((await projectUpdatedFiles(root)).filter((file) => file.path.toLowerCase() === 'app.js')).toHaveLength(1);
      expect((await projectFileContents(root, 'APP.JS')).oldContent).toBe(before);
    }
  });
  it('never rolls back over a subsequent edit or changes controller scaffolds', async () => {
    const first = await writeProjectFile(root, 'app.js', 'first');
    await writeProjectFile(root, 'app.js', 'second');
    await expect(restoreRevision(root, first.id)).rejects.toThrow('cambiato');
    const controller = historyFor(root).find((record) => record.actor === 'controller')!;
    await expect(restoreRevision(root, controller.id)).rejects.toThrow('controllo');
    expect(fs.readFileSync(path.join(root, 'app.js'), 'utf8')).toBe('second');
  });
  it('rejects an ambiguous edit and compare-before-write race', async () => {
    await writeProjectFile(root, 'app.js', 'x x');
    await expect(editProjectFile(root, 'app.js', 'x', 'y')).rejects.toThrow('una sola');
    await expect(writeProjectFile(root, 'app.js', 'new', undefined, false, digest('old'))).rejects.toThrow('cambiato');
    expect(historyFor(root).every((record) => record.state === 'committed')).toBe(true);
  });
  it('recovers an interrupted prepared revision without guessing conflicts', async () => {
    const revision = await writeProjectFile(root, 'app.js', 'completed');
    const file = path.join(projectControl(root), 'history', revision.id, 'revision.json');
    fs.writeFileSync(file, JSON.stringify({ ...revision, state: 'prepared' }));
    expect((await recoverProject(root))[0].status).toContain('confermato');
    fs.writeFileSync(file, JSON.stringify({ ...revision, state: 'prepared' }));
    fs.writeFileSync(path.join(root, 'app.js'), 'manual change');
    expect((await recoverProject(root))[0].status).toContain('conflitto');
    expect(fs.readFileSync(path.join(root, 'app.js'), 'utf8')).toBe('manual change');
  });
  it('reports corrupt history instead of hiding it', () => {
    const folder = path.join(projectControl(root), 'history', randomUUID());
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'revision.json'), '{invalid');
    expect(() => historyFor(root)).toThrow();
  });
  it('denies imported Git directories, gitdir files and bare metadata before any Git execution', () => {
    const git = path.join(root, '.git');
    fs.mkdirSync(git);
    expect(() => assertLabCodingProject(root)).toThrow('metadati Git');
    fs.rmdirSync(git);
    fs.writeFileSync(git, 'gitdir: C:/unrelated-project');
    expect(() => assertLabCodingProject(root)).toThrow('metadati Git');
    fs.unlinkSync(git);
    fs.writeFileSync(path.join(root, 'HEAD'), 'ref: refs/heads/main');
    fs.mkdirSync(path.join(root, 'objects'));
    fs.mkdirSync(path.join(root, 'refs'));
    expect(() => assertLabCodingProject(root)).toThrow('metadati Git');
  });
  it('blocks secrets before starting any container, without logging the value', async () => {
    const secret = 'ghp_' + 'x'.repeat(36);
    fs.writeFileSync(path.join(root, 'data.json'), JSON.stringify({ value: secret }));
    const result = await runProjectChecks(root);
    expect(result.pass).toBe(false);
    expect(result.errors.join()).toContain('Possibile segreto');
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(fs.existsSync(path.join(result.job, 'web.log'))).toBe(false);
  });
  it('denies export without a current successful proof', async () => {
    await expect(exportProject(root)).rejects.toThrow();
  });
  it('invalidates a proof when a source changes', async () => {
    const id = randomUUID();
    const job = path.join(path.dirname(path.dirname(projectControl(root))), 'jobs', id);
    fs.writeFileSync(
      path.join(projectControl(root), 'latest-proof.json'),
      JSON.stringify({ id, job, pass: true, sourceDigest: manifestDigest(sourceManifest(root)) }),
    );
    await writeProjectFile(root, 'app.js', 'changed');
    await expect(requireCurrentProof(root)).rejects.toThrow();
  });
  it('exports only the checked snapshot and rejects changed public output', async () => {
    const id = randomUUID();
    const job = path.join(path.dirname(path.dirname(projectControl(root))), 'jobs', id);
    const workspace = path.join(job, 'workspace');
    fs.mkdirSync(workspace, { recursive: true });
    const manifest = sourceManifest(root);
    for (const file of Object.keys(manifest)) {
      fs.copyFileSync(path.join(root, file), path.join(workspace, file));
    }
    fs.writeFileSync(path.join(job, 'source-manifest.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(job, 'output-manifest.json'), JSON.stringify(manifest));
    fs.writeFileSync(
      path.join(projectControl(root), 'latest-proof.json'),
      JSON.stringify({
        id,
        job,
        publicRoot: workspace,
        pass: true,
        stack: 'vanilla',
        sourceDigest: manifestDigest(manifest),
        criteriaDigest: digest('\n[]'),
        createdAt: new Date().toISOString(),
      }),
    );
    const exported = await exportProject(root);
    const zip = new AdmZip(exported.file);
    expect(zip.readAsText('sorgenti/app.js')).toBe(fs.readFileSync(path.join(workspace, 'app.js'), 'utf8'));
    expect(zip.getEntries().some((entry) => /\.env|\.agent-lab|history|knowledge/.test(entry.entryName))).toBe(false);
    fs.writeFileSync(path.join(projectControl(root), 'acceptance.json'), '[{"type":"text","selector":"main","value":"new criterion"}]');
    await expect(exportProject(root)).rejects.toThrow('Piano o prove modificati');
    fs.writeFileSync(path.join(projectControl(root), 'acceptance.json'), '[]');
    fs.writeFileSync(path.join(workspace, 'app.js'), 'tampered');
    await expect(exportProject(root)).rejects.toThrow('copia pubblica');
  });
});
