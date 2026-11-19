import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

import * as ts from 'typescript';

import { AIDER_DESK_EXTENSIONS_DIR } from '@/constants';
import { atomicWriteJsonFile } from '@/utils/atomic-write';

type ExtensionFile = { path: string; content: Buffer; mode: number; link?: string };
type ExtensionSnapshot = { project: string; revision: string; files: ExtensionFile[] };

const MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024;

export const getProjectAuthorityRoot = () => path.join(homedir(), '.agent-lab-security');
const getTrustDir = (project: string) =>
  path.join(getProjectAuthorityRoot(), 'approved-project-extensions', createHash('sha256').update(project).digest('hex'));

const inside = (root: string, candidate: string): string | undefined => {
  const relative = path.relative(root, candidate);
  return relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) ? relative : undefined;
};

const readExtensionTree = async (root: string): Promise<Omit<ExtensionSnapshot, 'project'>> => {
  const files: ExtensionFile[] = [];
  const revision = createHash('sha256');
  let total = 0;

  const visit = async (directory: string): Promise<void> => {
    if (path.relative(directory, await fs.realpath(directory))) {
      throw new Error('Project extension directories must stay inside the checkout and cannot redirect elsewhere.');
    }
    for (const name of (await fs.readdir(directory)).sort()) {
      const target = path.join(directory, name);
      const relative = inside(root, target);
      const stats = await fs.lstat(target);
      if (!relative) {
        throw new Error('A project extension contains an invalid entry.');
      }
      if (stats.isSymbolicLink()) {
        const resolved = await fs.realpath(target);
        const link = inside(root, resolved);
        if (!link || !(await fs.stat(resolved)).isFile()) {
          throw new Error('A project extension link leaves the reviewed files.');
        }
        const content = Buffer.from(link);
        revision.update(JSON.stringify([relative, content.length, 'link'])).update(content);
        files.push({ path: relative, content, mode: stats.mode, link });
        continue;
      }
      if (stats.isDirectory()) {
        await visit(target);
        continue;
      }
      if (!stats.isFile() || path.relative(target, await fs.realpath(target))) {
        throw new Error('Project extensions may only contain regular files.');
      }
      total += stats.size;
      if (total > MAX_SNAPSHOT_BYTES) {
        throw new Error('The project extension snapshot is too large.');
      }
      const content = await fs.readFile(target);
      revision.update(JSON.stringify([relative, content.length])).update(content);
      files.push({ path: relative, content, mode: stats.mode });
    }
  };

  const rootStats = await fs.lstat(root).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  });
  if (rootStats) {
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
      throw new Error('Project extensions require a regular directory inside the checkout.');
    }
    await visit(root);
  }
  return { revision: revision.digest('hex'), files };
};

const validateImports = ({ files }: Omit<ExtensionSnapshot, 'project'>): void => {
  const names = new Set(files.map((entry) => entry.path.split(path.sep).join('/')));
  const supportedSuffixes = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '/index.ts', '/index.js', '/package.json'];
  for (const file of files) {
    const name = file.path.split(path.sep).join('/');
    if (file.link || name.split('/').includes('node_modules') || !/\.[cm]?[jt]sx?$/.test(name)) {
      continue;
    }
    const text = file.content.toString('utf8');
    const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, false);
    const check = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      ) {
        if (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0])) {
          throw new Error('Dynamic imports are unsupported for approved project extensions.');
        }
      }
      ts.forEachChild(node, check);
    };
    check(source);
    for (const { fileName } of ts.preProcessFile(text, true, true).importedFiles) {
      if (isBuiltin(fileName) || fileName === 'zod' || fileName === '@aiderdesk/extensions') {
        continue;
      }
      const directory = path.posix.dirname(name);
      if (fileName.startsWith('./') || fileName.startsWith('../')) {
        const target = path.posix.normalize(path.posix.join(directory, fileName));
        if (target.startsWith('../') || !supportedSuffixes.some((suffix) => names.has(`${target}${suffix}`))) {
          throw new Error('A project extension imports a file outside its reviewed snapshot.');
        }
        continue;
      }
      const parts = fileName.split('/');
      const packageName = parts.slice(0, fileName.startsWith('@') ? 2 : 1).join('/');
      let candidate = directory;
      for (;;) {
        if (names.has(path.posix.join(candidate, 'node_modules', packageName, 'package.json'))) {
          break;
        }
        if (candidate === '.') {
          throw new Error('Project extension packages must be installed inside the reviewed snapshot.');
        }
        candidate = path.posix.dirname(candidate);
      }
    }
  }
};

export const captureProjectExtensions = async (projectDir: string): Promise<ExtensionSnapshot> => {
  const project = await fs.realpath(projectDir);
  const snapshot = await readExtensionTree(path.join(project, AIDER_DESK_EXTENSIONS_DIR));
  validateImports(snapshot);
  return { project, ...snapshot };
};

export const approveProjectExtensionSnapshot = async (snapshot: ExtensionSnapshot): Promise<void> => {
  const trustDir = getTrustDir(snapshot.project);
  const receipt = await fs
    .readFile(path.join(trustDir, 'current.json'), 'utf8')
    .then((json): { project?: string; snapshotId?: string } => JSON.parse(json))
    .catch(() => undefined);
  if (receipt?.project === snapshot.project && receipt.snapshotId?.startsWith(`${snapshot.revision}-`)) {
    return;
  }
  const snapshotId = `${snapshot.revision}-${randomUUID()}`;
  const approvedTree = path.join(trustDir, snapshotId);
  await fs.mkdir(approvedTree, { recursive: true, mode: 0o700 });
  for (const file of snapshot.files) {
    const destination = path.resolve(approvedTree, file.path);
    if (!inside(approvedTree, destination)) {
      throw new Error('Invalid project extension snapshot path.');
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    if (file.link) {
      const target = path.resolve(approvedTree, file.link);
      if (!inside(approvedTree, target)) {
        throw new Error('Invalid project extension snapshot link.');
      }
      await fs.symlink(path.relative(path.dirname(destination), target), destination, 'file');
    } else {
      await fs.writeFile(destination, file.content, { mode: file.mode, flag: 'wx' });
    }
  }
  await atomicWriteJsonFile(path.join(trustDir, 'current.json'), { project: snapshot.project, snapshotId });
};

export const getApprovedProjectExtension = async (projectDir: string, entry: string): Promise<string | undefined> => {
  const relative = inside(path.resolve(projectDir, AIDER_DESK_EXTENSIONS_DIR), path.resolve(entry));
  if (!relative) {
    return undefined;
  }
  const project = await fs.realpath(projectDir);
  const trustDir = getTrustDir(project);
  try {
    const receipt = JSON.parse(await fs.readFile(path.join(trustDir, 'current.json'), 'utf8')) as { project?: string; snapshotId?: string };
    if (receipt.project !== project || !receipt.snapshotId || !/^[0-9a-f]{64}-[0-9a-f-]{36}$/.test(receipt.snapshotId)) {
      return undefined;
    }
    const trustedRoot = await fs.realpath(trustDir);
    const snapshotRoot = path.join(trustedRoot, receipt.snapshotId);
    const target = path.resolve(snapshotRoot, relative);
    if (!inside(snapshotRoot, target) || path.relative(target, await fs.realpath(target)) || !(await fs.lstat(target)).isFile()) {
      return undefined;
    }
    const approved = await readExtensionTree(snapshotRoot);
    if (!receipt.snapshotId.startsWith(`${approved.revision}-`)) {
      return undefined;
    }
    const live = path.join(project, AIDER_DESK_EXTENSIONS_DIR, relative);
    if (path.relative(live, await fs.realpath(live)) || !(await fs.lstat(live)).isFile()) {
      return undefined;
    }
    const [approvedEntry, liveEntry] = await Promise.all([fs.readFile(target), fs.readFile(live)]);
    if (!approvedEntry.equals(liveEntry)) {
      return undefined;
    }
    return target;
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};
