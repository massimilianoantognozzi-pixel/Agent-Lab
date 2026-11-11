import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { createPatch, diffLines } from 'diff';

import { digest, projectControl, readProjectState, safeProjectPath, sourceFiles } from './policy';

import type { UpdatedFile } from '@common/types';

type Revision = {
  id: string;
  file: string;
  before: string | null;
  after: string;
  createdAt: string;
  actor: 'model' | 'controller';
  state?: 'prepared' | 'committed' | 'aborted';
  restored?: boolean;
};
const locks = new Map<string, Promise<unknown>>();
const reviewFileKey = (file: string): string => {
  const normalized = file.replaceAll('\\', '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
};
export const projectOperation = async <T>(directory: string, operation: () => Promise<T>): Promise<T> => {
  const key = projectControl(directory);
  const previous = locks.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(operation);
  locks.set(key, pending);
  const release = () => {
    if (locks.get(key) === pending) {
      locks.delete(key);
    }
  };
  pending.then(release, release);
  return pending;
};
const hashAt = async (file: string): Promise<string | null> => {
  try {
    return digest(await fs.readFile(file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};
const durable = async (file: string, bytes: string | Buffer, exclusive = true): Promise<void> => {
  const handle = await fs.open(file, exclusive ? 'wx' : 'w');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
};
const atomicJson = async (file: string, value: unknown): Promise<void> => {
  const temporary = file + '-' + randomUUID() + '.tmp';
  await durable(temporary, JSON.stringify(value));
  await fs.rename(temporary, file);
};

export const writeProjectFile = async (
  directory: string,
  file: string,
  content: string,
  signal?: AbortSignal,
  privileged = false,
  expectedBefore?: string,
): Promise<Revision> =>
  projectOperation(directory, async () => {
    if (!privileged) {
      readProjectState(directory);
    }
    const target = safeProjectPath(directory, file, true, privileged);
    if (typeof content !== 'string' || Buffer.byteLength(content) > 512000) {
      throw new Error('File troppo grande: usa modifiche mirate o moduli separati.');
    }
    if (content.includes('[Testo omesso dal contesto')) {
      throw new Error('Segnaposto del contesto non scrivibile: rileggere il file corrente prima della modifica.');
    }
    signal?.throwIfAborted();
    const control = projectControl(directory);
    const id = randomUUID();
    const folder = path.join(control, 'history', id);
    const beforeBytes = await fs.readFile(target).catch((error) => {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    });
    const before = beforeBytes === null ? null : digest(beforeBytes);
    if (expectedBefore !== undefined && before !== expectedBefore) {
      throw new Error('Il file e cambiato dopo la lettura: modifica da ricalcolare.');
    }
    await fs.mkdir(folder, { recursive: true });
    const after = digest(content);
    const record: Revision = { id, file, before, after, createdAt: new Date().toISOString(), actor: privileged ? 'controller' : 'model' };
    await atomicJson(path.join(folder, 'revision.json'), { ...record, state: 'prepared' });
    if (beforeBytes !== null) {
      await durable(path.join(folder, 'before'), beforeBytes);
    }
    await durable(path.join(folder, 'after'), content);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = target + '.agentlab-' + id + '.tmp';
    try {
      await durable(temporary, content);
      signal?.throwIfAborted();
      safeProjectPath(directory, file, true, privileged);
      if ((await hashAt(target)) !== before) {
        throw new Error('Il file e cambiato durante la preparazione: nessuna sovrascrittura.');
      }
      await fs.rename(temporary, target);
      await atomicJson(path.join(folder, 'revision.json'), { ...record, state: 'committed' });
      await fs.appendFile(path.join(control, 'ledger.jsonl'), JSON.stringify(record) + '\n');
      return record;
    } finally {
      // Exact temporary filename created above, always within the already-validated project path.
      await fs.unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      });
    }
  });

export const editProjectFile = async (directory: string, file: string, search: string, replacement: string, signal?: AbortSignal): Promise<Revision> => {
  if (!search) {
    throw new Error('Testo da sostituire vuoto.');
  }
  const target = safeProjectPath(directory, file, true);
  const content = await fs.readFile(target, 'utf8');
  if (content.split(search).length !== 2) {
    throw new Error('La ricerca deve corrispondere a una sola porzione: rileggi il file e fornisci piu contesto.');
  }
  return writeProjectFile(directory, file, content.replace(search, replacement), signal, false, digest(content));
};

export const historyFor = (directory: string): Revision[] => {
  const folder = path.join(projectControl(directory), 'history');
  if (!syncFs.existsSync(folder)) {
    return [];
  }
  return syncFs
    .readdirSync(folder)
    .filter((name) => /^[a-f0-9-]{36}$/.test(name))
    .flatMap((name) => {
      const record = JSON.parse(syncFs.readFileSync(path.join(folder, name, 'revision.json'), 'utf8')) as Revision;
      if (record.id !== name) {
        throw new Error('Storico non integro: revisione ' + name);
      }
      return [record];
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};
export const restoreRevision = async (directory: string, revisionId: string): Promise<Revision> =>
  projectOperation(directory, async () => {
    const record = historyFor(directory).find((entry) => entry.id === revisionId);
    if (!record || !/^[a-f0-9-]{36}$/.test(revisionId)) {
      throw new Error('Revisione non trovata nel progetto.');
    }
    if (record.actor !== 'model' || record.restored || record.state !== 'committed') {
      throw new Error('Revisione di controllo, incompleta o gia ripristinata: non modificabile dal modello.');
    }
    const target = safeProjectPath(directory, record.file, true);
    if ((await hashAt(target)) !== record.after) {
      throw new Error('Il file e cambiato dopo questa revisione: ripristino bloccato per non perdere modifiche.');
    }
    const folder = path.join(projectControl(directory), 'history', revisionId);
    if (record.before === null) {
      await fs.unlink(target);
    } else {
      const bytes = await fs.readFile(path.join(folder, 'before'));
      if (digest(bytes) !== record.before) {
        throw new Error('Backup non integro.');
      }
      const temp = target + '.restore-' + randomUUID();
      try {
        await durable(temp, bytes);
        await fs.rename(temp, target);
      } finally {
        await fs.unlink(temp).catch((error) => {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        });
      }
    }
    const restored = { ...record, restored: true };
    await atomicJson(path.join(folder, 'revision.json'), restored);
    await fs.appendFile(path.join(projectControl(directory), 'ledger.jsonl'), JSON.stringify(restored) + '\n');
    return restored;
  });

export const recoverProject = async (directory: string): Promise<Array<{ id: string; status: string }>> =>
  projectOperation(directory, async () => {
    const results: Array<{ id: string; status: string }> = [];
    for (const record of historyFor(directory).filter((entry) => entry.state === 'prepared')) {
      const target = safeProjectPath(directory, record.file, true, true);
      const current = await hashAt(target);
      const folder = path.join(projectControl(directory), 'history', record.id);
      if (current === record.after && (await hashAt(path.join(folder, 'after'))) === record.after) {
        await atomicJson(path.join(folder, 'revision.json'), { ...record, state: 'committed' });
        results.push({ id: record.id, status: 'commit confermato dopo interruzione' });
      } else if (current === record.before) {
        await atomicJson(path.join(folder, 'revision.json'), { ...record, state: 'aborted' });
        results.push({ id: record.id, status: 'operazione non applicata; file originale preservato' });
      } else {
        results.push({ id: record.id, status: 'conflitto: nessuna modifica automatica al file' });
      }
    }
    return results;
  });

export const projectFileContents = async (directory: string, file: string): Promise<{ oldContent: string; newContent: string }> => {
  const target = safeProjectPath(directory, file);
  const first = historyFor(directory).find(
    (record) => reviewFileKey(record.file) === reviewFileKey(file) && record.actor === 'model' && record.state === 'committed',
  );
  const current = await fs.readFile(target, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  });
  if (!first) {
    return { oldContent: current, newContent: current };
  }
  const before = first.before === null ? null : await fs.readFile(path.join(projectControl(directory), 'history', first.id, 'before'));
  if (before !== null && digest(before) !== first.before) {
    throw new Error('Backup non integro: confronto bloccato.');
  }
  return { oldContent: before?.toString('utf8') ?? '', newContent: current };
};
export const projectUpdatedFiles = async (directory: string): Promise<UpdatedFile[]> => {
  const files = [
    ...new Map(
      historyFor(directory)
        .filter((record) => record.actor === 'model' && record.state === 'committed')
        .map((record) => [reviewFileKey(record.file), record.file]),
    ).values(),
  ];
  const updates: UpdatedFile[] = [];
  for (const file of files) {
    const { oldContent, newContent } = await projectFileContents(directory, file);
    if (oldContent === newContent) {
      continue;
    }
    const parts = diffLines(oldContent, newContent);
    updates.push({
      path: file,
      additions: parts.filter((part) => part.added).reduce((sum, part) => sum + (part.count ?? 0), 0),
      deletions: parts.filter((part) => part.removed).reduce((sum, part) => sum + (part.count ?? 0), 0),
      diff: createPatch(file, oldContent, newContent),
    });
  }
  return updates;
};
export const projectFileDiff = async (directory: string, file: string): Promise<string> => {
  const { oldContent, newContent } = await projectFileContents(directory, file);
  return createPatch(file, oldContent, newContent);
};

export const projectTree = (directory: string): Array<{ file: string; bytes: number }> =>
  sourceFiles(directory).map((file) => ({ file, bytes: syncFs.statSync(safeProjectPath(directory, file)).size }));
