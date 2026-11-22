import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

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

// The claim lives beside the destination so independent desktop instances and profiles see the same reservation.
export const reserveImageOutput = async (root: string, output: string) => {
  const target = await validateImageOutput(root, output, true);
  const basename = path.basename(target);
  const identity = createHash('sha256')
    .update(process.platform === 'win32' ? basename.toLowerCase() : basename)
    .digest('hex');
  const relativeClaim = path.join(path.dirname(output), '.agent-lab-image-' + identity + '.lock');
  const claim = await imagePath(root, relativeClaim);
  const handle = await fs.open(claim, 'wx', 0o600).catch((err) => {
    if (err.code === 'EEXIST') {
      throw new Error('Questa destinazione è prenotata da una richiesta in corso o interrotta. Verifica la ricevuta prima di riprovare.');
    }
    throw err;
  });
  const acquired = await handle.stat();
  return async () => {
    try {
      const named = await fs.lstat(await imagePath(root, relativeClaim));
      if (named.dev !== acquired.dev || named.ino !== acquired.ino || !named.isFile()) {
        throw new Error('Prenotazione immagini cambiata.');
      }
      await fs.unlink(claim);
    } finally {
      await handle.close();
    }
  };
};

export const saveNewImage = async (root: string, output: string, bytes: Buffer, signal: AbortSignal) => {
  const target = await validateImageOutput(root, output, true);
  const staging = path.join(path.dirname(target), '.agent-lab-image-' + randomUUID() + '.tmp');
  const handle = await fs.open(staging, 'wx', 0o600);
  const identity = await handle.stat();
  const verifyStage = async () => {
    const named = await fs.lstat(await imagePath(root, path.relative(root, staging)));
    if (identity.ino !== named.ino || identity.dev !== named.dev || !named.isFile()) {
      throw new Error('Destinazione cambiata durante il salvataggio.');
    }
  };
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    await verifyStage();
    await validateImageOutput(root, output);
    signal.throwIfAborted();
    await fs.link(staging, target);
  } finally {
    await handle.close();
    await verifyStage().then(() => fs.unlink(staging));
  }
};
