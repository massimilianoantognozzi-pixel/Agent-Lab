import { closeSync, constants, fstatSync, linkSync, lstatSync, openSync, realpathSync, unlinkSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

import type { BigIntStats } from 'node:fs';
import type { ImageReference } from './image-provider';

import { validateWorkflowPath } from '@/task/workflow-policy';
import { resolveProjectToolPath } from '@/utils/contained-path';

const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const same = (left: string, right: string) => path.relative(left, right) === '';

export const relativeImagePath = (input: string) => validateWorkflowPath(input.replaceAll('\\', '/'));

const imagePath = async (root: string, name: string) => {
  const resolved = await resolveProjectToolPath(root, relativeImagePath(name));
  if (!same(resolved, path.join(root, name))) {
    throw new Error('Collegamenti a file o cartelle esclusi per gli asset grafici.');
  }
  return resolved;
};

export const validateImageOutput = async (root: string, output: string, createParents = false) => {
  if (path.extname(output).toLowerCase() !== '.png') {
    throw new Error('Scegli un nuovo file con estensione PNG.');
  }
  const target = await imagePath(root, output);
  if (createParents) {
    let current = root;
    for (const part of relativeImagePath(output).split('/').slice(0, -1)) {
      current = path.join(current, part);
      await imagePath(root, path.relative(root, current));
      await fs.mkdir(current).catch((error) => {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      });
      if (!(await fs.lstat(current)).isDirectory()) {
        throw new Error('Cartella di destinazione non valida.');
      }
    }
  }
  if (
    await fs.lstat(target).then(
      () => true,
      (error) => {
        if (!missing(error)) {
          throw error;
        }
        return false;
      },
    )
  ) {
    throw new Error('Il file esiste già. Scegli un nuovo nome per conservare la versione precedente.');
  }
  return target;
};

export const readImageReferences = async (root: string, names: string[]): Promise<ImageReference[]> => {
  const references: ImageReference[] = [];
  let remaining = 20 * 1024 * 1024;
  for (const name of names) {
    const target = await imagePath(root, name);
    const file = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const before = await file.stat();
      if (!before.isFile() || before.nlink !== 1 || before.size < 12 || before.size > remaining) {
        throw new Error('Riferimento non valido o oltre i 20 MiB complessivi.');
      }
      const bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
        if (!bytesRead) {
          throw new Error('Riferimento modificato durante la lettura.');
        }
        offset += bytesRead;
      }
      const after = await fs.lstat(await imagePath(root, name));
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.ctimeMs !== after.ctimeMs || after.nlink !== 1) {
        throw new Error('Riferimento modificato durante la lettura.');
      }
      const ext = path.extname(name).toLowerCase();
      let mimeType: string;
      if (ext === '.png' && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
        mimeType = 'image/png';
      } else if (['.jpg', '.jpeg'].includes(ext) && bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) {
        mimeType = 'image/jpeg';
      } else if (ext === '.webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
        mimeType = 'image/webp';
      } else {
        throw new Error('Usa un riferimento PNG, JPEG o WebP con formato ed estensione corrispondenti.');
      }
      references.push({ name: path.basename(name), bytes, mimeType });
      remaining -= bytes.length;
    } finally {
      await file.close();
    }
  }
  return references;
};

const imageClaimName = (output: string) => {
  const basename = path.basename(output);
  const identity = createHash('sha256')
    .update(process.platform === 'win32' ? basename.toLowerCase() : basename)
    .digest('hex');
  return '.agent-lab-image-' + identity + '.lock';
};

// Caller holds the task journal writer lock. A legacy/foreign marker cannot
// be cleared using a filename alone: both directory entries must be our inode.
const releaseOwnedLinks = (claim: string, owner: string) => {
  const dir = path.dirname(claim);
  if (!same(realpathSync(dir), dir)) {
    throw new Error('Cartella della prenotazione cambiata.');
  }
  const old = lstatSync(owner, { bigint: true, throwIfNoEntry: false });
  if (!old?.isFile() || old.size !== 0n || old.ino === 0n) {
    return;
  }
  const marker = lstatSync(claim, { bigint: true, throwIfNoEntry: false });
  if (!marker?.isFile() || marker.dev !== old.dev || marker.ino !== old.ino || old.nlink !== 2n) {
    return;
  }
  unlinkSync(claim);
  unlinkSync(owner);
};

export const publishedReservationCleanup = async (root: string, output: string, jobId: string) => {
  const dir = path.dirname(await imagePath(root, output));
  return () => releaseOwnedLinks(path.join(dir, imageClaimName(output)), path.join(dir, '.agent-lab-image-' + jobId + '.owner'));
};

// Publish the token by hard link. A crash can never expose a partially written owner ID.
export const prepareImageReservation = async (root: string, output: string, jobId: string) => {
  const target = await validateImageOutput(root, output, true);
  const claim = await imagePath(root, path.join(path.dirname(output), imageClaimName(output)));
  const owner = await imagePath(root, path.join(path.dirname(output), '.agent-lab-image-' + jobId + '.owner'));
  return (otherPrepared: string[]) => {
    const dir = path.dirname(claim);
    if (!same(realpathSync(dir), dir)) {
      throw new Error('Cartella della prenotazione cambiata.');
    }
    if (lstatSync(target, { throwIfNoEntry: false })) {
      throw new Error('Il file esiste già. Scegli un nuovo nome per conservare la versione precedente.');
    }
    // The caller holds the journal writer lock. Only jobs in this task that
    // have provably never dispatched may give up ownership of this name.
    for (const previous of otherPrepared) {
      if (!/^[0-9a-f-]{36}$/i.test(previous)) {
        continue;
      }
      const oldOwner = path.join(dir, '.agent-lab-image-' + previous + '.owner');
      releaseOwnedLinks(claim, oldOwner);
    }
    let fd: number;
    let created = false;
    try {
      fd = openSync(owner, 'wx', 0o600);
      created = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
      fd = openSync(owner, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    }
    const matches = (file: string) => {
      const named = lstatSync(file, { bigint: true });
      const held = fstatSync(fd, { bigint: true });
      return named.isFile() && held.isFile() && held.ino !== 0n && named.dev === held.dev && named.ino === held.ino && held.size === 0n && held.nlink <= 2n;
    };
    try {
      if (!matches(owner)) {
        throw new Error('Prenotazione immagini non valida.');
      }
      try {
        linkSync(owner, claim);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
        if (!matches(claim)) {
          throw new Error(
            'Destinazione prenotata da un altro lavoro o da una versione precedente. Controlla la task originale. Se manca una ricevuta, usa un nuovo nome e verifica il consumo prima di confermare.',
          );
        }
      }
    } catch (error) {
      try {
        if (created && matches(owner)) {
          unlinkSync(owner);
        }
      } finally {
        closeSync(fd);
      }
      throw error;
    }
    return {
      abandon: () => closeSync(fd),
      release: () => {
        try {
          if (!lstatSync(owner, { throwIfNoEntry: false })) {
            return;
          } // An already verified publication may have been recovered by another process.
          if (!same(realpathSync(dir), dir) || !matches(claim) || !matches(owner)) {
            throw new Error('Prenotazione immagini cambiata.');
          }
          unlinkSync(claim);
          unlinkSync(owner);
        } finally {
          closeSync(fd);
        }
      },
    };
  };
};

export type StagedImageIdentity = { dev: string; ino: string };

const imageStage = (output: string, jobId: string): string => {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new Error('Identità del lavoro immagini non valida.');
  }
  return path.join(path.dirname(output), '.agent-lab-image-' + jobId + '.tmp');
};

const matchesImage = (file: BigIntStats | undefined, identity: StagedImageIdentity): file is BigIntStats =>
  !!file?.isFile() && file.ino !== 0n && file.dev.toString() === identity.dev && file.ino.toString() === identity.ino;

// Check both names without yielding between checks and unlink. Another publisher/reader may already have removed the temporary name.
const clearImageStage = (target: string, staging: string, identity: StagedImageIdentity, published: boolean) => {
  const dir = path.dirname(target);
  if (!same(realpathSync(dir), dir)) {
    throw new Error('Cartella di destinazione cambiata durante il salvataggio.');
  }
  const tmp = lstatSync(staging, { bigint: true, throwIfNoEntry: false });
  if (!tmp && published) {
    return;
  }
  if (!matchesImage(tmp, identity)) {
    throw new Error('File temporaneo immagini cambiato.');
  }
  if (published) {
    const output = lstatSync(target, { bigint: true, throwIfNoEntry: false });
    if (!matchesImage(output, identity)) {
      throw new Error('Destinazione immagini cambiata.');
    }
    if (output.nlink === 1n && !lstatSync(staging, { throwIfNoEntry: false })) {
      return;
    }
    if (output.nlink !== 2n || tmp.nlink !== 2n) {
      throw new Error('Collegamenti inattesi per l’immagine pubblicata.');
    }
  } else if (tmp.nlink !== 1n) {
    throw new Error('Collegamenti inattesi per il file temporaneo.');
  }
  try {
    unlinkSync(staging);
  } catch (error) {
    if (!published || !missing(error)) {
      throw error;
    }
  }
};

export const saveNewImage = async (
  root: string,
  output: string,
  bytes: Buffer,
  signal: AbortSignal,
  jobId: string,
  onStaged: (identity: StagedImageIdentity) => void,
) => {
  const target = await validateImageOutput(root, output, true);
  const stageName = imageStage(output, jobId);
  const staging = await imagePath(root, stageName);
  const handle = await fs.open(staging, 'wx', 0o600);
  let identity: StagedImageIdentity | undefined;
  let published = false;
  try {
    const held = await handle.stat({ bigint: true });
    identity = { dev: held.dev.toString(), ino: held.ino.toString() };
    await handle.writeFile(bytes);
    await handle.sync();
    await validateImageOutput(root, output);
    const named = await fs.lstat(await imagePath(root, stageName), { bigint: true });
    if (!matchesImage(named, identity) || named.nlink !== 1n) {
      throw new Error('Destinazione cambiata durante il salvataggio.');
    }
    signal.throwIfAborted();
    onStaged(identity);
    signal.throwIfAborted();
    await fs.link(staging, target);
    published = true;
  } finally {
    await handle.close();
    if (identity) {
      clearImageStage(target, staging, identity, published);
    }
  }
};

export const recoverPublishedImage = async (root: string, output: string, jobId: string, identity: StagedImageIdentity, sha256: string): Promise<boolean> => {
  try {
    if (!identity || !/^[a-f0-9]{64}$/.test(sha256) || path.extname(output).toLowerCase() !== '.png') {
      return false;
    }
    const target = await imagePath(root, output);
    const staging = await imagePath(root, imageStage(output, jobId));
    const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const file = await handle.stat({ bigint: true });
      if (!matchesImage(file, identity) || file.size < 12n || file.size > 20n * 1024n * 1024n || (file.nlink !== 1n && file.nlink !== 2n)) {
        return false;
      }
      if (file.nlink === 2n) {
        // Authenticate contents before touching even the job's own alias. Bound reads to the size of the held file.
        const digest = createHash('sha256');
        const buffer = Buffer.alloc(Math.min(Number(file.size), 64 * 1024));
        for (let offset = 0; offset < Number(file.size); ) {
          const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, Number(file.size) - offset), offset);
          if (!bytesRead) {
            return false;
          }
          digest.update(buffer.subarray(0, bytesRead));
          offset += bytesRead;
        }
        if (digest.digest('hex') !== sha256) {
          return false;
        }
        const after = await handle.stat({ bigint: true });
        if (after.size !== file.size || after.mtimeNs !== file.mtimeNs) {
          return false;
        }
        clearImageStage(target, staging, identity, true);
      } else if (lstatSync(staging, { throwIfNoEntry: false })) {
        return false;
      }
      // Use the ordinary one-link reference check for the final name, also when a concurrent reader completed the cleanup.
      const [reference] = await readImageReferences(root, [output]);
      const final = await fs.lstat(await imagePath(root, output), { bigint: true });
      return (
        matchesImage(final, identity) &&
        final.nlink === 1n &&
        final.mtimeNs === file.mtimeNs &&
        createHash('sha256').update(reference.bytes).digest('hex') === sha256
      );
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
};
