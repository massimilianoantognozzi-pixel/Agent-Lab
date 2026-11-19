import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';

import { assertKnowledgePayloadSafe, assertDesktopBlobSafe } from '@/knowledge-privacy';
import { renameWithWindowsRetry } from '@/utils/atomic-write';

const exec = promisify(execFile);
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const gitBytes = async (root: string, args: string[], input?: Buffer | string, index?: string, extraEnv?: Record<string, string>) => {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv, GIT_TERMINAL_PROMPT: '0' };
  for (const key of Object.keys(env)) {
    if (/^GIT_(?:DIR|COMMON_DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|CONFIG_PARAMETERS|CONFIG_COUNT)$/i.test(key)) {
      delete env[key];
    }
  }
  if (index) {
    env.GIT_INDEX_FILE = index;
  }
  const result = exec('git', ['--no-replace-objects', '--literal-pathspecs', '-C', root, ...args], {
    env,
    windowsHide: true,
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  result.child.stdin?.on('error', () => undefined);
  result.child.stdin?.end(input);
  return (await result).stdout;
};
export const git = async (root: string, args: string[], input?: Buffer | string, index?: string) => (await gitBytes(root, args, input, index)).toString('utf8');
export const pushDesktopCommit = async (root: string, url: string, remote: string, ref: string, expected: string, tip: string) => {
  const original = (await git(root, ['rev-parse', '--path-format=absolute', '--git-path', 'hooks/pre-push'])).trim();
  const hooks = await fs.mkdtemp(path.join(os.tmpdir(), 'agentlab-push-'));
  try {
    // Git supplies the actual advertised old object to pre-push. Keep the
    // ordinary fast-forward push and the project's own pre-push hook.
    const guard =
      [
        '#!/bin/sh',
        'set -eu',
        'IFS=" " read -r localref oid remoteref old',
        '[ "$oid" = "$LAB_CLOSE_TIP" ] && [ "$remoteref" = "$LAB_CLOSE_REF" ] && [ "$old" = "$LAB_CLOSE_OLD" ] || exit 1',
        'if read -r extra; then exit 1; fi',
        'if test -x "$LAB_CLOSE_HOOK"; then printf "%s %s %s %s\\n" "$localref" "$oid" "$remoteref" "$old" | "$LAB_CLOSE_HOOK" "$LAB_CLOSE_REMOTE" "$2"; fi',
      ].join('\n') + '\n';
    await fs.writeFile(path.join(hooks, 'pre-push'), guard, { mode: 0o755 });
    await gitBytes(
      root,
      ['-c', 'core.hooksPath=' + hooks, 'push', '--no-force', '--no-follow-tags', '--recurse-submodules=no', '--', url, tip + ':' + ref],
      undefined,
      undefined,
      {
        LAB_CLOSE_TIP: tip,
        LAB_CLOSE_OLD: expected || '0'.repeat(tip.length),
        LAB_CLOSE_REF: ref,
        LAB_CLOSE_HOOK: original,
        LAB_CLOSE_REMOTE: remote,
      },
    );
  } catch {
    throw new Error('Push rifiutato o remoto non raggiungibile. Commit locale conservato: ' + tip);
  } finally {
    await fs.rm(hooks, { recursive: true, force: true });
  }
};
export const checkDesktopOutgoing = async (root: string, commits: string[]) => {
  const scanned = new Set<string>();
  for (const sha of commits) {
    const delta = (await git(root, ['diff-tree', '--root', '-m', '--no-commit-id', '--raw', '--no-abbrev', '--no-renames', '-r', '-z', sha])).split('\0');
    await assertKnowledgePayloadSafe(await git(root, ['show', '-s', '--format=%B', sha]));
    for (let i = 0; i < delta.length - 1; i += 2) {
      const [, mode, , oid] = delta[i].split(' ');
      if (!/^(?:100644|100755|120000)$/.test(mode) || scanned.has(oid)) {
        continue;
      }
      scanned.add(oid);
      const blob = await gitBytes(root, ['cat-file', 'blob', oid]);
      await assertDesktopBlobSafe(blob, delta[i + 1]);
    }
  }
};
export const headOf = async (root: string) => {
  try {
    return (await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD'])).trim();
  } catch (error) {
    if ((error as { code?: number }).code === 1) {
      return '';
    }
    throw error;
  }
};
export const branchOf = async (root: string) => (await git(root, ['symbolic-ref', '--quiet', 'HEAD'])).trim();
const optionalBytes = (file: string) =>
  fs.readFile(file).catch((error) => {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  });

export type IndexRecovery = { from: string; to: string; original: string | null; prepared: string; inode: string; device: string; pid: number };
const indexPath = async (root: string) => (await git(root, ['rev-parse', '--path-format=absolute', '--git-path', 'index'])).trim();
export const recoverDesktopIndex = async (root: string, tx: IndexRecovery, branch: string) => {
  const file = await indexPath(root);
  const lock = file + '.lock';
  const stat = await fs.stat(lock, { bigint: true }).catch((e) => {
    if (e.code === 'ENOENT') {
      return null;
    }
    throw e;
  });
  if (!stat) {
    return;
  }
  if (tx.pid !== process.pid) {
    try {
      process.kill(tx.pid, 0);
      throw new Error('Pubblicazione già in corso in un’altra istanza.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw error;
      }
    }
  }
  if (stat.ino.toString() !== tx.inode || stat.dev.toString() !== tx.device || digest(await fs.readFile(lock)) !== tx.prepared) {
    throw new Error('Indice Git occupato. Rieseguire la chiusura a operazione terminata.');
  }
  const original = await optionalBytes(file);
  if ((original ? digest(original) : null) !== tx.original || (await branchOf(root)) !== branch) {
    throw new Error('Indice Git cambiato durante il recupero.');
  }
  const head = await headOf(root);
  if (head === tx.to) {
    await renameWithWindowsRetry(lock, file);
  } else if (head === tx.from) {
    await fs.unlink(lock);
  } else {
    throw new Error('Il ramo è cambiato durante il recupero dell’indice.');
  }
};

// Build the commit from immutable bytes, separately merge just those entries
// into the real index, and advance the *named* branch with compare-and-swap.
// Other staged entries and concurrent edits to working files stay intact.
export const commitDesktopFiles = async (
  root: string,
  branch: string,
  base: string,
  files: Map<string, Buffer | null>,
  summary: string,
  persist: (tx: IndexRecovery, tree: string) => Promise<void>,
) => {
  const realIndex = await indexPath(root);
  const dir = await fs.mkdtemp(path.join(path.dirname(realIndex), 'agentlab-close-'));
  const candidate = path.join(dir, 'candidate');
  const staged = path.join(dir, 'staged');
  const message = path.join(dir, 'message');
  let ownsLock = false;
  let advanced = false;
  try {
    await git(root, base ? ['read-tree', base] : ['read-tree', '--empty'], undefined, candidate);
    const zero = '0'.repeat((await git(root, ['rev-parse', '--show-object-format'])).trim() === 'sha256' ? 64 : 40);
    const entries: string[] = [];
    for (const [name, bytes] of files) {
      if (bytes === null) {
        entries.push('0 ' + zero + '\t' + name + '\0');
        continue;
      }
      const oid = (await git(root, ['hash-object', '-w', '--path=' + name, '--stdin'], bytes)).trim();
      const blob = await gitBytes(root, ['cat-file', 'blob', oid]);
      await assertDesktopBlobSafe(blob, name);
      const trackedMode = (await git(root, ['ls-files', '--stage', '--', name])).slice(0, 6);
      const mode =
        (process.platform === 'win32' && trackedMode === '100755') || ((await fs.stat(path.join(root, name))).mode & 0o111) !== 0 ? '100755' : '100644';
      entries.push(mode + ' ' + oid + '\t' + name + '\0');
    }
    const changes = entries.join('');
    await git(root, ['update-index', '-z', '--index-info'], changes, candidate);
    const tree = (await git(root, ['write-tree'], undefined, candidate)).trim();
    if (base && tree === (await git(root, ['rev-parse', base + '^{tree}'])).trim()) {
      return base;
    }
    await fs.writeFile(message, summary + '\n');
    for (const [hook, ...args] of [['pre-commit'], ['prepare-commit-msg', message, 'message'], ['commit-msg', message]]) {
      await git(root, ['hook', 'run', '--ignore-missing', hook, '--', ...args], undefined, candidate);
    }
    if ((await git(root, ['write-tree'], undefined, candidate)).trim() !== tree) {
      throw new Error('Un hook ha cambiato i file previsti per il commit.');
    }
    await assertKnowledgePayloadSafe(await fs.readFile(message, 'utf8'));
    const to = (await git(root, ['commit-tree', tree, ...(base ? ['-p', base] : []), '-F', message], undefined, candidate)).trim();
    if ((await branchOf(root)) !== branch || (await headOf(root)) !== base) {
      throw new Error('Ramo o HEAD cambiato prima del commit.');
    }
    const original = await optionalBytes(realIndex);
    if (original) {
      await fs.writeFile(staged, original);
    } else {
      await git(root, ['read-tree', '--empty'], undefined, staged);
    }
    // A newly staged version differing from both HEAD and our confirmed blob
    // belongs to the user. Preserve it and leave publication pending.
    for (const entry of entries) {
      const tab = entry.indexOf('\t');
      const name = entry.slice(tab + 1, -1);
      const oldEntry = base ? (await git(root, ['ls-tree', '-z', base, '--', name])).split('\t')[0] : '';
      const [oldMode, , oldOid] = oldEntry.split(' ');
      const prior = oldOid ? oldMode + ' ' + oldOid : '';
      const [stagedMode, stagedOid, stage] = (await git(root, ['ls-files', '--stage', '-z', '--', name], undefined, staged)).split('\t')[0].split(' ');
      const stagedEntry = stagedOid ? stagedMode + ' ' + stagedOid : '';
      const expected = entry.startsWith('0 ') ? '' : entry.slice(0, tab);
      if ((stage && stage !== '0') || (stagedEntry !== prior && stagedEntry !== expected)) {
        throw new Error('Staging modificato su ' + name);
      }
    }
    await git(root, ['update-index', '-z', '--index-info'], changes, staged);
    const prepared = await fs.readFile(staged);
    const stat = await fs.stat(staged, { bigint: true });
    const originalHash = original ? digest(original) : null;
    await persist(
      { from: base, to, original: originalHash, prepared: digest(prepared), inode: stat.ino.toString(), device: stat.dev.toString(), pid: process.pid },
      tree,
    );
    await fs.link(staged, realIndex + '.lock');
    ownsLock = true;
    const currentIndex = await optionalBytes(realIndex);
    if ((currentIndex ? digest(currentIndex) : null) !== originalHash || (await branchOf(root)) !== branch || (await headOf(root)) !== base) {
      throw new Error('Ramo o indice modificato prima della pubblicazione locale.');
    }
    await git(root, ['update-ref', '--no-deref', '-m', 'Agent-Lab: chiusura desktop', branch, to, base || zero]);
    advanced = true;
    await renameWithWindowsRetry(realIndex + '.lock', realIndex);
    ownsLock = false;
    await git(root, ['hook', 'run', '--ignore-missing', 'post-commit']);
    return to;
  } finally {
    if (ownsLock && !advanced) {
      await fs.unlink(realIndex + '.lock');
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
};
