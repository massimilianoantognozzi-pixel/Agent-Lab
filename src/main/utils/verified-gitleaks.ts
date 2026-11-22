import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Gitleaks 8.30.1. The two operating systems distribute different binaries.
const windowsDigest = '17157e2ee8b76fc8b1d8bee607a250e34b8a8023c8bc81822d4b5ee4d78fcb7c';
const linuxX64Digest = '88f91962aa2f93ac6ab281d553b9e125f5197bbbce38f9f2437f7299c32e5509';

export const verifiedGitleaks = async (): Promise<string> => {
  const windows = process.platform === 'win32';
  if (!windows && !(process.platform === 'linux' && process.arch === 'x64')) {
    throw new Error('Gitleaks non qualificato per questa piattaforma.');
  }
  const filename = windows ? 'gitleaks.exe' : 'gitleaks';
  const executable = process.env.AIDER_DESK_GITLEAKS_PATH || path.join(os.homedir(), 'go', 'bin', filename);
  if (!path.isAbsolute(executable)) {
    throw new Error('Il percorso di Gitleaks deve essere assoluto.');
  }
  const canonical = await realpath(executable);
  const digest = createHash('sha256')
    .update(await readFile(canonical))
    .digest('hex');
  if (digest !== (windows ? windowsDigest : linuxX64Digest)) {
    throw new Error('Gitleaks non disponibile nella versione verificata.');
  }
  return canonical;
};
