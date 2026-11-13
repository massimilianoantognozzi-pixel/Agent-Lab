import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { collectWorkflowFiles, workflowFileNames, type WorkflowProject } from './workflow-policy';

const run = promisify(execFile);
const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

const git = async (root: string, args: string[], signal?: AbortSignal, index?: string) => {
  if (path.relative(root, await fs.realpath(root))) {
    throw new Error('La radice del progetto è cambiata.');
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/i.test(name)));
  if (index) {
    env.GIT_INDEX_FILE = index;
  }
  env.GIT_NO_LAZY_FETCH = '1';
  env.GIT_ALLOW_PROTOCOL = '';
  const { stdout } = await run('git', ['--no-replace-objects', '--literal-pathspecs', '-c', 'core.fsmonitor=false', '-c', 'core.longpaths=true', ...args], {
    cwd: root,
    env,
    encoding: 'buffer',
    maxBuffer: 2_000_000,
    timeout: 15_000,
    windowsHide: true,
    signal,
  });
  return stdout;
};

const developmentRef = (policy: WorkflowProject) => {
  if (!policy.branches || policy.branches.main.toLowerCase() === policy.branches.development.toLowerCase()) {
    throw new Error('Configura due rami distinti, principale e sviluppo.');
  }
  return 'refs/heads/' + policy.branches.development;
};

export const readDevelopmentHead = async (policy: WorkflowProject, signal?: AbortSignal): Promise<string> => {
  const ref = developmentRef(policy);
  const root = (await git(policy.root, ['rev-parse', '--show-toplevel'], signal)).toString('utf8').trim();
  const common = (await git(policy.root, ['rev-parse', '--git-common-dir'], signal)).toString('utf8').trim();
  if (
    path.relative(policy.root, await fs.realpath(root)) ||
    path.relative(path.join(policy.root, '.git'), await fs.realpath(path.resolve(policy.root, common)))
  ) {
    throw new Error('La radice Git differisce dalla radice del progetto.');
  }
  const branches = (await git(policy.root, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads'], signal)).toString('utf8').trim();
  const refs = new Map(
    branches
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.split(' ', 2) as [string, string]),
  );
  const head = refs.get(ref);
  if (refs.size !== 2 || !refs.has('refs/heads/' + policy.branches?.main) || !head || !objectId.test(head)) {
    throw new Error('Il repository deve avere solo il ramo principale e il ramo di sviluppo configurati.');
  }
  return head;
};

export const readDevelopmentFiles = async (policy: WorkflowProject, tree: string, signal?: AbortSignal) => {
  if (!objectId.test(tree)) {
    throw new Error('Riferimento Git del workflow non valido.');
  }
  const names = workflowFileNames(policy);
  const expected = new Set(names);
  const records = (await git(policy.root, ['ls-tree', '-rz', '--full-tree', tree, '--', ...names], signal)).toString('utf8');
  const blobs = new Map<string, string>();
  for (const record of records.split('\0').filter(Boolean)) {
    const separator = record.indexOf('\t');
    const name = record.slice(separator + 1);
    const match = /^100(?:644|755) blob ([0-9a-f]+)$/.exec(record.slice(0, separator));
    if (separator < 0 || !expected.has(name) || !match || !objectId.test(match[1])) {
      throw new Error('Il ramo di sviluppo contiene un elemento non gestibile nel perimetro: ' + name);
    }
    blobs.set(name, match[1]);
  }
  return collectWorkflowFiles(policy, async (name) => {
    const blob = blobs.get(name);
    return blob ? git(policy.root, ['cat-file', 'blob', blob], signal) : null;
  });
};

export const prepareDevelopmentTree = async (policy: WorkflowProject, base: string, patch: string, files: string[], signal?: AbortSignal) => {
  if ((await readDevelopmentHead(policy, signal)) !== base) {
    throw new Error('Il ramo di sviluppo è avanzato dopo la pianificazione.');
  }
  const index = patch + '.index';
  try {
    await git(policy.root, ['read-tree', base], signal, index);
    await git(policy.root, ['apply', '--cached', '--whitespace=nowarn', patch], signal, index);
    const changed = (await git(policy.root, ['diff', '--cached', '--name-only', '--no-ext-diff', '--no-renames', '-z', base, '--'], signal, index)).toString(
      'utf8',
    );
    const names = changed.split('\0').filter(Boolean);
    if (names.length !== files.length || names.some((name) => !files.includes(name))) {
      throw new Error('L’integrazione modifica file estranei al task.');
    }
    return (await git(policy.root, ['write-tree'], signal, index)).toString('utf8').trim();
  } finally {
    await fs.rm(index, { force: true });
  }
};

export const createDevelopmentCommit = async (policy: WorkflowProject, base: string, tree: string, revision: string, signal?: AbortSignal) =>
  (await git(policy.root, ['commit-tree', '--no-gpg-sign', tree, '-p', base, '-m', 'Integra task verificato da AiderDesk', '-m', 'Piano ' + revision], signal))
    .toString('utf8')
    .trim();

export const isIntegrated = async (policy: WorkflowProject, commit: string, signal?: AbortSignal): Promise<boolean> => {
  const head = await readDevelopmentHead(policy, signal);
  try {
    await git(policy.root, ['merge-base', '--is-ancestor', commit, head], signal);
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 1) {
      return false;
    }
    throw error;
  }
};

export const developmentFilesMatch = async (policy: WorkflowProject, from: string, to: string, files: string[], signal?: AbortSignal): Promise<boolean> => {
  try {
    await git(policy.root, ['diff', '--quiet', '--no-ext-diff', '--no-textconv', from, to, '--', ...files], signal);
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 1) {
      return false;
    }
    throw error;
  }
};

export const publishDevelopmentCommit = async (policy: WorkflowProject, base: string, commit: string, jobs: string, signal?: AbortSignal): Promise<void> => {
  const parents = (await git(policy.root, ['rev-list', '--parents', '-n', '1', commit], signal)).toString('utf8').trim();
  if (parents !== `${commit} ${base}`) {
    throw new Error('Il commit preparato non discende direttamente dalla revisione approvata.');
  }
  if ((await readDevelopmentHead(policy, signal)) !== base) {
    throw new Error('Il ramo di sviluppo è cambiato prima dell’integrazione.');
  }
  const ref = developmentRef(policy);
  const worktrees = (await git(policy.root, ['worktree', 'list', '--porcelain', '-z'], signal)).toString('utf8').split('\0');
  if (worktrees.includes('branch ' + ref)) {
    throw new Error('Il ramo di sviluppo è aperto in un checkout. Chiudilo prima di aggiornare il ramo.');
  }
  const hooks = await fs.mkdtemp(path.join(jobs, 'hooks-'));
  try {
    await git(policy.root, ['-c', 'core.hooksPath=' + hooks, 'update-ref', '--no-deref', ref, commit, base], signal);
  } finally {
    await fs.rmdir(hooks);
  }
};
