import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { atomicWriteJsonFile } from '@/utils/atomic-write';

const hex = z.string().regex(/^[a-f0-9]{64}$/);
const generationId = z.union([z.literal('initial'), z.uuid()]);
export const REMOTE_DEVICE_LIFETIME_SECONDS = 365 * 24 * 60 * 60;
const deviceCredential = z.strictObject({ digest: hex, generation: generationId, expiresAt: z.number().int().positive().safe() });
const ledger = z.strictObject({
  version: z.literal(2),
  scope: hex,
  usedCode: hex.optional(),
  device: deviceCredential.optional(),
});
// Old credentials have no trustworthy issuance time. Keep the consumed QR
// marker, but require one new pairing instead of inventing an expiry date.
const legacyLedger = ledger.extend({ version: z.literal(1), device: deviceCredential.omit({ expiresAt: true }).optional() });
const revocation = z.strictObject({ generation: z.uuid() });

export type DeviceLedger = Omit<z.infer<typeof ledger>, 'version' | 'scope'>;
export type RemoteDeviceStore = {
  read: () => Promise<DeviceLedger>;
  write: (value: DeviceLedger) => Promise<void>;
  generation: () => Promise<string>;
};

const readLocalJson = async (filename: string): Promise<unknown> => {
  try {
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 8192) {
      throw new Error('Archivio associazioni non valido.');
    }
    return JSON.parse(await fs.readFile(filename, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

export const createRemoteDeviceStore = (directory: string, scope: string): RemoteDeviceStore => {
  const ledgerPath = path.join(directory, 'remote-device.json');
  const revokePath = path.join(directory, 'remote-device-revocation.json');
  const generation = async () => {
    const record = await readLocalJson(revokePath);
    return record === undefined ? 'initial' : revocation.parse(record).generation;
  };
  return {
    generation,
    read: async () => {
      const record = await readLocalJson(ledgerPath);
      if (record === undefined) {
        return {};
      }
      const current = z.union([ledger, legacyLedger]).parse(record);
      if (current.scope !== scope) {
        return {};
      }
      return {
        usedCode: current.usedCode,
        device:
          current.version === 2 && current.device && current.device.expiresAt > Date.now() && current.device.generation === (await generation())
            ? current.device
            : undefined,
      };
    },
    write: async (value) => atomicWriteJsonFile(ledgerPath, ledger.parse({ version: 2, scope, ...value })),
  };
};
