import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

import { AIDER_DESK_DATA_DIR } from '@/constants';

export const sanitizeKnowledgeText = (text: string): string =>
  text
    .replace(/-----BEGIN(?:[A-Z0-9 ]+)?PRIVATE KEY-----[\s\S]*?-----END(?:[A-Z0-9 ]+)?PRIVATE KEY-----/g, '[PRIVATE KEY REDACTED]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+/gi, '[AUTHORIZATION REDACTED]')
    .replace(
      /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,})\b/g,
      '[TOKEN REDACTED]',
    )
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[JWT REDACTED]')
    .replace(
      /(["']?[\w.-]*(?:api[_-]?key|token|secret|password|passwd|authorization|cookie|connection[_-]?string|database[_-]?url)[\w.-]*["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+)/gi,
      '$1"[REDACTED]"',
    )
    .replace(/\b([a-z][a-z0-9+.-]*):\/\/[^/\s:@]+:[^@\s/]+@/gi, '$1://[REDACTED]@')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[CONTACT REDACTED]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ADDRESS REDACTED]');

// This gate applies only to automatic knowledge capture, never to development tools.
export const assertKnowledgePayloadSafe = async (text: string): Promise<void> => {
  const executable = path.join(os.homedir(), 'go', 'bin', 'gitleaks.exe');
  if (
    createHash('sha256')
      .update(await fs.readFile(executable))
      .digest('hex') !== '17157e2ee8b76fc8b1d8bee607a250e34b8a8023c8bc81822d4b5ee4d78fcb7c'
  ) {
    throw new Error('Controllo privacy KB non disponibile nella versione verificata.');
  }
  const config = path.join(process.env.AIDER_DESK_DATA_DIR ?? AIDER_DESK_DATA_DIR, 'knowledge-base', 'privacy.toml');
  await fs.mkdir(path.dirname(config), { recursive: true });
  const body = '[extend]\nuseDefault = true\n';
  await fs.writeFile(config, body, { flag: 'wx' }).catch((error) => {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  });
  if ((await fs.readFile(config, 'utf8')) !== body) {
    throw new Error('Configurazione del controllo privacy KB da verificare.');
  }
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, ['stdin', '--config', config, '--redact=100', '--ignore-gitleaks-allow', '--no-banner', '--no-color', '--timeout', '10'], {
      env,
      windowsHide: true,
      cwd: path.dirname(config),
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Controllo privacy KB non completato.'));
    }, 15000);
    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error('Controllo privacy KB non disponibile.'));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(code === 1 ? 'Cattura KB omessa: dati sensibili residui.' : 'Controllo privacy KB non completato.'));
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(text);
  });
};
