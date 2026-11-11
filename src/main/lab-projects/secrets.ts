import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { digest } from './policy';

const execute = promisify(execFile);
const executable = path.join(os.homedir(), 'go', 'bin', 'gitleaks.exe');
export const checkSecrets = async (source: string, job: string, signal?: AbortSignal): Promise<void> => {
  if (digest(await fs.readFile(executable)) !== '17157e2ee8b76fc8b1d8bee607a250e34b8a8023c8bc81822d4b5ee4d78fcb7c') {
    throw new Error('Gitleaks non disponibile nella versione verificata.');
  }
  const config = path.join(job, 'gitleaks-controller.toml');
  await fs.writeFile(config, '[extend]\nuseDefault = true\n', { flag: 'wx' });
  const report = path.join(job, 'secret-check.json');
  const env = Object.fromEntries(
    ['SystemRoot', 'WINDIR', 'PATH', 'Path', 'TEMP', 'TMP'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]),
  );
  try {
    await execute(
      executable,
      [
        'dir',
        source,
        '--config',
        config,
        '--ignore-gitleaks-allow',
        '--redact=100',
        '--no-banner',
        '--no-color',
        '--report-format=json',
        '--report-path',
        report,
        '--timeout',
        '30',
      ],
      { cwd: job, env, windowsHide: true, signal, timeout: 35000, maxBuffer: 100000 },
    );
  } catch (error) {
    signal?.throwIfAborted();
    if ((error as { code?: number }).code === 1) {
      throw new Error('Gitleaks ha rilevato possibili segreti: controllo bloccato. I valori non vengono mostrati.');
    }
    throw new Error('Controllo Gitleaks non completato: nessun PASS.');
  }
};
