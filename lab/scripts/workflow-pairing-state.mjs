import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const newRemotePairing = async (directory, project) => {
  let generation = 'initial';
  try {
    const record = JSON.parse(await fs.readFile(path.join(directory, 'remote-device-revocation.json'), 'utf8'));
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(record.generation ?? '')) {
      throw Error('Generazione dell’associazione non valida.');
    }
    generation = record.generation;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { project, generation, code: randomBytes(16).toString('hex'), expiresAt: Date.now() + 20 * 60_000 };
};
