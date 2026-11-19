import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';
import { extractTextContent } from '@common/utils';

import { assertWorkflowText } from './workflow-policy';
import {
  git,
  digest,
  branchOf,
  headOf,
  commitDesktopFiles,
  recoverDesktopIndex,
  checkDesktopOutgoing,
  pushDesktopCommit,
  type IndexRecovery,
} from './desktop-close-git';

import type { ContextMessage, TaskData } from '@common/types';
import type { RootTurnRecord } from '@/agent/worker-checkpoint';

import { atomicWriteJsonFile } from '@/utils/atomic-write';
import { sanitizeKnowledgeText, assertKnowledgePayloadSafe } from '@/knowledge-privacy';

const safePath = (name: string) =>
  name.length > 0 &&
  !path.isAbsolute(name) &&
  !name
    .split(/[\\/]/)
    .some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        /^(?:\.git|\.aider-desk|\.agent-lab|node_modules|\.env(?:\..*)?|\.npmrc|\.netrc|credentials(?:\..*)?|.*\.(?:pem|key|pfx|p12))$/i.test(part),
    );
const statusOf = async (root: string) => {
  const raw = await git(root, ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all']);
  return new Map(
    raw
      .split('\0')
      .filter(Boolean)
      .map((record) => [record.slice(3), record.slice(0, 2)]),
  );
};
const receiptPath = (data: string, root: string, id: string) => path.join(data, 'desktop-session-close', digest(JSON.stringify([root, id])) + '.json');
type Receipt = {
  branch: string;
  base: string;
  dirty: string[];
  commits?: string[];
  writes?: Record<string, string | null>;
  pending?: string;
  remote?: string;
  published?: string;
  closingKey?: string;
  expectedTree?: string;
  priorHead?: string;
  transaction?: IndexRecovery;
  notes?: Record<string, { before: string | null; after: string; block: string; noteOnly?: boolean }>;
};
const readReceipt = async (filename: string): Promise<Receipt | undefined> => {
  try {
    return JSON.parse(await fs.readFile(filename, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

// The baseline is local application state. Do not infer authorship of changes
// already present when the desktop started the user's work.
export const beginDesktopWork = async (root: string, id: string, data: string, development?: string) => {
  const filename = receiptPath(data, root, id);
  const old = await readReceipt(filename);
  if (old && !old.published) {
    return;
  }
  const checkoutBranch = await branchOf(root);
  const branch = development ? 'refs/heads/' + development : checkoutBranch;
  const base = branch === checkoutBranch ? await headOf(root) : (await git(root, ['rev-parse', '--verify', branch])).trim();
  const dirty = branch === checkoutBranch ? [...(await statusOf(root)).keys()] : [];
  const target = await upstream(root, branch).catch(() => undefined);
  await atomicWriteJsonFile(filename, { branch, base, dirty, remote: target?.binding });
};

export const recordDesktopIntegration = async (root: string, id: string, data: string, sha: string) => {
  if (!/^[a-f0-9]{7,64}$/i.test(sha)) {
    return;
  }
  sha = (await git(root, ['rev-parse', '--verify', sha + '^{commit}'])).trim();
  const file = receiptPath(data, root, id);
  const receipt = await readReceipt(file);
  if (receipt && !receipt.published && !receipt.commits?.includes(sha)) {
    await atomicWriteJsonFile(file, { ...receipt, commits: [...(receipt.commits ?? []), sha] });
  }
};

export const withDesktopBranch = async <T>(root: string, data: string, development: string | undefined, run: (worktree: string) => Promise<T>): Promise<T> => {
  if (!development || (await branchOf(root)) === 'refs/heads/' + development) {
    return run(root);
  }
  await git(root, ['check-ref-format', '--branch', development]);
  const local = path.join(data, 'desktop-close-worktrees', digest(JSON.stringify([root, development])).slice(0, 24));
  await fs.mkdir(path.dirname(local), { recursive: true });
  const info = await fs.stat(local).catch((e) => {
    if (e.code !== 'ENOENT') {
      throw e;
    }
    return null;
  });
  if (!info) {
    await git(root, ['worktree', 'add', '--', local, development]);
  }
  if (
    (await branchOf(local)) !== 'refs/heads/' + development ||
    (await git(local, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim() !==
      (await git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim()
  ) {
    throw new Error('Worktree del ramo di sviluppo non verificato.');
  }
  try {
    return await run(local);
  } finally {
    if (!info && !(await git(local, ['status', '--porcelain', '--ignored', '--untracked-files=all'])).trim()) {
      await git(root, ['worktree', 'remove', '--', local]);
    }
  }
};

const documentName = /(?:current[-_]state|implementation[-_]state|stato[-_](?:corrente|lavori)|handoff|(?:piano[-_]di[-_])?ripresa|task[-_]queue)/i;
const isDocument = (name: string) =>
  /\.md$/i.test(name) &&
  documentName.test(path.basename(name)) &&
  !/(?:^|\/)(?:archives?|archived|archivio|historical|fixtures?|__tests__|node_modules|dist|build|work)\//i.test(name);
const planSchema = z.object({
  summary: z.string().trim().min(1).max(180),
  updates: z.array(z.object({ path: z.string(), note: z.string().trim().min(1).max(4000) })).max(12),
  files: z.array(z.string()).max(250),
});
export type DesktopCloseEvidence = {
  taskId: string;
  name: string;
  state?: string;
  checkpoint?: string;
  messages: string;
  commits: string[];
  verifiedCommits?: string[];
  files: string[];
  exactWrites: Record<string, string>;
};
export const collectDesktopEvidence = (root: string, task: TaskData, history: ContextMessage[], record?: RootTurnRecord): DesktopCloseEvidence => {
  const files = new Set<string>();
  const commits = new Set<string>();
  const writes = new Map<string, string>();
  const calls = new Map<string, { file: string; hash?: string }>();
  const notes: string[] = [];
  const relative = (file: string) => path.relative(root, path.resolve(root, file)).replaceAll('\\', '/');
  const messages = new Map([...history, ...(record?.messages ?? [])].map((message) => [message.id, message]));
  for (const message of messages.values()) {
    if (message.role === 'user' || message.role === 'assistant') {
      const value = extractTextContent(message.content).trim();
      if (value) {
        notes.push(message.role + ': ' + value.slice(0, 850));
      }
    }
    if (message.role === 'assistant') {
      if (message.commitHash && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(message.commitHash)) {
        commits.add(message.commitHash);
      }
      message.editedFiles?.forEach((file) => files.add(relative(file)));
      if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type !== 'tool-call' || !['power---file_write', 'power---file_edit'].includes(part.toolName)) {
            continue;
          }
          const input = part.input as { filePath?: string; content?: string; mode?: string } | null;
          if (typeof input?.filePath === 'string') {
            calls.set(part.toolCallId, {
              file: relative(input.filePath),
              hash: part.toolName === 'power---file_write' && input.mode !== 'append' && typeof input.content === 'string' ? digest(input.content) : undefined,
            });
          }
        }
      }
    }
    if (message.role === 'tool') {
      for (const part of message.content) {
        const call = calls.get(part.toolCallId);
        if (call && part.output.type === 'text' && /^Successfully (?:edited|written|created|appended)/.test(part.output.value)) {
          files.add(call.file);
          if (call.hash) {
            writes.set(call.file, call.hash);
          } else {
            writes.delete(call.file);
          }
        }
      }
    }
  }
  if (record?.pendingTools?.length) {
    notes.push('Operazioni con esito ancora da verificare: ' + record.pendingTools.map((item) => item.name).join(', '));
  }
  return {
    taskId: task.id,
    name: task.name,
    state: task.state,
    checkpoint: record?.turnId,
    messages: notes.slice(-20).join('\n'),
    files: [...files].filter(safePath),
    commits: [...commits],
    exactWrites: Object.fromEntries(writes),
  };
};
type Options = {
  root: string;
  journalRoot?: string;
  data: string;
  evidence: DesktopCloseEvidence;
  documents?: string[];
  plan: (input: string) => Promise<string | undefined>;
};
const localContent = async (root: string, name: string): Promise<Buffer | null> => {
  if (!safePath(name)) {
    throw new Error('Percorso fuori dal perimetro della sessione.');
  }
  const target = path.join(root, name);
  try {
    if (path.relative(target, await fs.realpath(target)) || !(await fs.lstat(target)).isFile()) {
      throw new Error('Percorso non regolare: ' + name);
    }
    return await fs.readFile(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const receiptWrites = new Map<string, Promise<void>>();
export const recordDesktopWrite = async (root: string, id: string, data: string, filename: string, before: Buffer | null, after: Buffer) => {
  const key = path.relative(root, path.resolve(root, filename)).replaceAll('\\', '/');
  if (!safePath(key)) {
    return;
  }
  const file = receiptPath(data, root, id);
  const write = (receiptWrites.get(file) ?? Promise.resolve()).then(async () => {
    const receipt = await readReceipt(file);
    if (!receipt || receipt.published || receipt.branch !== (await branchOf(root))) {
      return;
    }
    const writes = new Map(Object.entries(receipt.writes ?? {}));
    const beforeHash = before ? digest(before) : null;
    let owned = writes.has(key) && writes.get(key) === beforeHash;
    if (!owned && !receipt.dirty.includes(key)) {
      const head = await headOf(root);
      const tracked = head && (await git(root, ['ls-tree', '-z', head, '--', key])).length > 0;
      if (!tracked) {
        owned = before === null;
      } else if (before && !before.includes(0)) {
        const blob = await git(root, ['show', head + ':' + key]);
        owned = blob.replaceAll('\r\n', '\n') === before.toString('utf8').replaceAll('\r\n', '\n');
      }
    }
    if (owned) {
      writes.set(key, digest(after));
    } else {
      writes.delete(key);
    }
    await atomicWriteJsonFile(file, { ...receipt, writes: Object.fromEntries(writes) });
  });
  receiptWrites.set(file, write);
  try {
    await write;
  } finally {
    if (receiptWrites.get(file) === write) {
      receiptWrites.delete(file);
    }
  }
};

const writeNote = async (root: string, name: string, before: Buffer | null, note: string) => {
  const current = await localContent(root, name);
  if (!((!current && !before) || (current && before && current.equals(before)))) {
    throw new Error('Documento cambiato durante la chiusura: ' + name);
  }
  const target = path.join(root, name);
  let parent = path.dirname(target);
  while (parent !== root) {
    const real = await fs.realpath(parent).catch((e) => {
      if (e.code !== 'ENOENT') {
        throw e;
      }
      return undefined;
    });
    if (real) {
      if (path.relative(parent, real)) {
        throw new Error('Collegamento esterno nel percorso del documento.');
      }
      break;
    }
    parent = path.dirname(parent);
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (path.relative(path.dirname(target), await fs.realpath(path.dirname(target)))) {
    throw new Error('Directory del documento cambiata.');
  }
  const file = await fs.open(target, before ? 'a+' : 'wx+');
  try {
    if (before && !(await file.readFile()).equals(before)) {
      throw new Error('Documento modificato: ' + name);
    }
    await file.appendFile(note, 'utf8');
    await file.sync();
  } finally {
    await file.close();
  }
  const written = await localContent(root, name);
  if (!written?.equals(Buffer.concat([before ?? Buffer.alloc(0), Buffer.from(note)]))) {
    throw new Error('Modifica concorrente su ' + name);
  }
};

const upstream = async (root: string, branch: string) => {
  const fields = (await git(root, ['for-each-ref', '--format=%(upstream:remotename)%00%(upstream:remoteref)', branch])).trimEnd().split('\0');
  let [remote, ref] = fields;
  if (!remote) {
    const remotes = (await git(root, ['remote'])).trim().split(/\r?\n/).filter(Boolean);
    if (remotes.length !== 1) {
      throw new Error('Commit locale conservato. Destinazione di push assente o ambigua.');
    }
    remote = remotes[0];
    ref = branch;
  }
  if (remote === '.' || remote.startsWith('-') || !ref?.startsWith('refs/heads/')) {
    throw new Error('Upstream non utilizzabile per la pubblicazione.');
  }
  const urls = (await git(root, ['remote', 'get-url', '--push', '--all', remote])).trim().split(/\r?\n/);
  if (urls.length !== 1 || !urls[0] || urls[0].startsWith('-')) {
    throw new Error('Destinazione di push ambigua.');
  }
  const remoteHead = async () => {
    const lines = (
      await git(root, ['ls-remote', '--refs', urls[0], ref]).catch(() => {
        throw new Error('Remoto non raggiungibile. Commit locale conservato.');
      })
    )
      .trim()
      .split(/\r?\n/);
    const pair = lines[0].split('\t');
    if (lines.length === 1 && !lines[0]) {
      return '';
    }
    if (lines.length !== 1 || pair[1] !== ref || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(pair[0])) {
      throw new Error('Ramo remoto non verificabile.');
    }
    return pair[0];
  };
  return { remote, url: urls[0], ref, remoteHead, binding: digest(JSON.stringify([urls[0], ref])) };
};

export const closeDesktopCheckout = async ({ root: requested, journalRoot, data, evidence, documents = [], plan }: Options) => {
  const root = await fs.realpath(requested);
  const top = await fs.realpath((await git(root, ['rev-parse', '--show-toplevel'])).trim());
  if (path.relative(root, top)) {
    throw new Error('La directory della sessione non coincide con la radice Git.');
  }
  const branch = await branchOf(root);
  const initial = await headOf(root);
  const filename = receiptPath(data, journalRoot ?? root, evidence.taskId);
  const old = await readReceipt(filename);
  if (old && old.branch !== branch) {
    throw new Error('Il ramo è cambiato rispetto alla sessione.');
  }
  if (old?.transaction) {
    await recoverDesktopIndex(root, old.transaction, branch);
  }
  const originalTarget = await upstream(root, branch).catch(() => undefined);
  const status = await statusOf(root);
  if ([...status.values()].some((code) => /U|AA|DD/.test(code))) {
    throw new Error('Il repository contiene conflitti da risolvere.');
  }
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    const markerPath = (await git(root, ['rev-parse', '--git-path', marker])).trim();
    if (
      await fs.stat(path.resolve(root, markerPath)).then(
        () => true,
        (e) => {
          if (e.code !== 'ENOENT') {
            throw e;
          }
          return false;
        },
      )
    ) {
      throw new Error('Operazione Git già in corso.');
    }
  }
  const journal: Receipt = old ?? { branch, base: initial, dirty: [...status.keys()] };
  const listed = (await git(root, ['ls-files', '-co', '--exclude-standard', '-z'])).split('\0');
  const docs = [...new Set(documents.length ? documents : listed.filter(isDocument))].filter((name) => safePath(name) && /\.md$/i.test(name));
  if (!docs.length) {
    docs.push('docs/SESSION_HANDOFF.md');
  }
  const sources: Record<string, string> = {};
  const originals = new Map<string, Buffer | null>();
  for (const name of docs.slice(0, 32)) {
    const bytes = await localContent(root, name);
    originals.set(name, bytes);
    const value = bytes?.toString('utf8') ?? '';
    sources[name] = sanitizeKnowledgeText(value.length > 5000 ? value.slice(0, 3200) + '\n[…]\n' + value.slice(-1600) : value);
  }
  const owned = new Map<string, string | null>();
  for (const name of new Set([...evidence.files, ...Object.keys(journal.writes ?? {})])) {
    const code = status.get(name);
    if (!code || !safePath(name) || (code !== '??' && !code.includes(' '))) {
      continue;
    }
    const bytes = await localContent(root, name);
    const hash = bytes ? digest(bytes) : null;
    const exact = hash && evidence.exactWrites[name] === hash;
    if ((Object.hasOwn(journal.writes ?? {}, name) && journal.writes?.[name] === hash) || (code === '??' && exact)) {
      owned.set(name, hash);
    }
  }
  if (Object.keys(journal.writes ?? {}).some((name) => status.has(name) && !owned.has(name))) {
    throw new Error('Il lavoro contiene modifiche non attribuite dopo la scrittura della sessione. Commit sospeso.');
  }
  const key = digest(JSON.stringify([evidence, branch]));
  const recovered =
    old?.transaction?.to === initial &&
    old?.priorHead !== undefined &&
    old.expectedTree &&
    initial &&
    (await git(root, ['show', '-s', '--format=%P%x00%T', initial])).trim() === old.priorHead + '\0' + old.expectedTree;
  let tip = initial;
  if (old?.closingKey !== key || (old.pending !== initial && old.published !== initial && !recovered) || owned.size) {
    const modelInput = JSON.stringify({
      session: { ...evidence, messages: sanitizeKnowledgeText(evidence.messages), exactWrites: undefined },
      documents: sources,
      eligibleFiles: [...owned.keys()],
    });
    let result: z.infer<typeof planSchema>;
    try {
      await assertKnowledgePayloadSafe(modelInput);
      result = planSchema.parse(JSON.parse((await plan(modelInput)) ?? 'null'));
    } catch {
      result = { summary: 'Chiusura della sessione ' + evidence.taskId, updates: [], files: [...owned.keys()] };
      if (!evidence.checkpoint && owned.size && old?.closingKey !== key) {
        const file = Object.keys(sources).find((name) => /handoff|ripresa/i.test(name)) ?? Object.keys(sources)[0];
        if (file) {
          result.updates.push({
            path: file,
            note:
              'Attività ' +
              evidence.taskId +
              '. Modifiche attribuite: ' +
              [...owned.keys()].join(', ') +
              '. Alla ripresa confrontare questi file con i criteri della task ed eseguire i controlli ancora privi di esito.',
          });
        }
      }
    }
    if (
      !result.updates.length &&
      evidence.checkpoint &&
      evidence.state === 'INTERRUPTED' &&
      !Object.values(sources).some((text) => text.includes(evidence.checkpoint!))
    ) {
      const file = Object.keys(sources).find((name) => /handoff|ripresa/i.test(name)) ?? Object.keys(sources)[0];
      if (file) {
        result.updates.push({
          path: file,
          note:
            'Attività ' +
            evidence.taskId +
            ' sospesa al checkpoint ' +
            evidence.checkpoint +
            '. Alla ripresa verificare i cambiamenti sul ramo ' +
            branch.slice(11) +
            ' e continuare dal turno salvato. Le verifiche ancora in corso restano da completare.',
        });
      }
    }
    const selected = [...owned.keys()];
    const expected = new Map<string, Buffer | null>();
    for (const name of selected) {
      const bytes = await localContent(root, name);
      if ((bytes ? digest(bytes) : null) !== owned.get(name)) {
        throw new Error('File modificato dopo la verifica: ' + name);
      }
      expected.set(name, bytes);
    }
    if ((await branchOf(root)) !== branch || (await headOf(root)) !== initial) {
      throw new Error('Il ramo è cambiato durante la preparazione.');
    }
    const notes = { ...(journal.notes ?? {}) };
    // A retry recognizes exact file contents, never a marker at the end.
    if (journal.closingKey !== key) {
      for (const name of Object.keys(notes)) {
        delete notes[name];
      }
    }
    for (const update of result.updates) {
      const name = update.path;
      if (!originals.has(name)) {
        throw new Error('Documento esterno al piano di ripresa.');
      }
      if (notes[name]) {
        continue;
      }
      assertWorkflowText(update.note);
      const before = originals.get(name) ?? null;
      const block = '\n\n## Chiusura sessione\n\n' + update.note + '\n';
      if (before?.toString('utf8').endsWith(block)) {
        continue;
      }
      const noteOnly = status.has(name) && !owned.has(name);
      if (noteOnly && status.get(name) !== ' M') {
        throw new Error('Documento con modifiche già in staging o non attribuite: ' + name);
      }
      notes[name] = { before: before ? digest(before) : null, after: digest(Buffer.concat([before ?? Buffer.alloc(0), Buffer.from(block)])), block, noteOnly };
    }
    journal.closingKey = key;
    journal.notes = notes;
    await atomicWriteJsonFile(filename, journal);
    for (const [name, note] of Object.entries(notes)) {
      if (!originals.has(name)) {
        throw new Error('Documento di ripresa non più presente nelle fonti.');
      }
      const current = await localContent(root, name);
      const hash = current ? digest(current) : null;
      if (hash === note.before) {
        await writeNote(root, name, current, note.block);
      } else if (hash !== note.after) {
        throw new Error('Documento di ripresa modificato da un’altra operazione: ' + name);
      }
      const bytes = await localContent(root, name);
      if (!bytes || digest(bytes) !== note.after) {
        throw new Error('Documento cambiato prima del commit: ' + name);
      }
      expected.set(name, note.noteOnly ? Buffer.from((await git(root, ['show', initial + ':' + name])) + note.block) : bytes);
    }
    if (expected.size) {
      tip = await commitDesktopFiles(root, branch, initial, expected, result.summary, async (tx, tree) => {
        journal.transaction = tx;
        journal.expectedTree = tree;
        journal.priorHead = initial;
        await atomicWriteJsonFile(filename, journal);
      });
    }
  }
  const allowed = new Set([...(evidence.verifiedCommits ?? []), ...(journal.commits ?? []), old?.pending, old?.published]);
  if (!tip) {
    const remaining = [...(await statusOf(root)).keys()];
    return { commit: '', remote: '', branch: branch.slice(11), remaining, unattributed: remaining };
  }
  if (tip !== initial || recovered) {
    allowed.add(tip);
  }
  // Persist only a commit we can attribute: retrying a refused foreign tip
  // must never turn it into an authorized one.
  if (allowed.has(tip)) {
    journal.commits = [...new Set([...(journal.commits ?? []), ...(old?.pending ? [old.pending] : []), tip])];
    journal.pending = tip;
  }
  journal.closingKey = key;
  await atomicWriteJsonFile(filename, journal);
  const target = await upstream(root, branch);
  if (!originalTarget || originalTarget.binding !== target.binding || (journal.remote && journal.remote !== target.binding)) {
    throw new Error('La destinazione di push è cambiata.');
  }
  journal.remote = target.binding;
  await atomicWriteJsonFile(filename, journal);
  const before = await target.remoteHead();
  if (before !== tip) {
    if (before) {
      await git(root, ['merge-base', '--is-ancestor', before, tip]).catch(() => {
        throw new Error('Il remoto è avanzato o la storia è divergente. Commit locale conservato.');
      });
    }
    const outgoing = (await git(root, ['rev-list', before ? before + '..' + tip : tip])).trim().split(/\s+/);
    if (outgoing.some((oid) => !allowed.has(oid))) {
      throw new Error('Commit in uscita non attribuito alla sessione. Push sospeso.');
    }
    await checkDesktopOutgoing(root, outgoing);
    if ((await branchOf(root)) !== branch || (await headOf(root)) !== tip) {
      throw new Error('Il ramo è cambiato prima del push.');
    }
    await pushDesktopCommit(root, target.url, target.remote, target.ref, before, tip);
  }
  if ((await target.remoteHead()) !== tip) {
    throw new Error('Conferma del ramo remoto mancante. Commit locale: ' + tip);
  }
  await atomicWriteJsonFile(filename, { ...journal, transaction: undefined, pending: undefined, published: tip });
  const remaining = [...(await statusOf(root)).keys()];
  return {
    commit: tip,
    remote: target.remote,
    branch: target.ref.slice(11),
    remaining,
    unattributed: remaining.filter((name) => !journal.dirty.includes(name) && !journal.notes?.[name]?.noteOnly),
  };
};
