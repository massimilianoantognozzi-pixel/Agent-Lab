import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { assertLabWorkspace, assertLabCodingProject } from '@/lab-mode';

export type WebStack = 'vanilla' | 'react-vite' | 'astro';
export type ProjectState = { version: 1; root: string; stack: WebStack; title: string; createdAt: string };
export const isFreelanceEnabled = (): boolean => process.env.AIDER_DESK_LAB_MODE === 'true' && process.env.AIDER_DESK_LAB_LOCAL_MODEL === 'devstral-coding';
export const digest = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
export const controlRoot = (): string => {
  const home = process.env.AIDER_DESK_HOME_DIR;
  if (!home || !path.isAbsolute(home)) {
    throw new Error('Cartella di controllo del laboratorio non configurata.');
  }
  return path.join(path.dirname(home), 'coding-control');
};
export const labScriptsRoot = (): string => path.join(path.dirname(path.dirname(process.env.AIDER_DESK_HOME_DIR!)), 'scripts');
export const projectRoot = (directory: string): string => {
  assertLabWorkspace(directory);
  assertLabCodingProject(directory);
  if (!path.isAbsolute(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error('Cartella progetto non valida.');
  }
  if (fs.lstatSync(directory).isSymbolicLink()) {
    throw new Error('Collegamenti di progetto esclusi.');
  }
  return fs.realpathSync(directory);
};
export const projectControl = (directory: string): string => path.join(controlRoot(), 'projects', digest(projectRoot(directory).toLowerCase()));
const reserved = /^(?:\.git|\.agent-lab|\.aider-desk|\.serena|node_modules|dist|build|coverage|\.env.*|id_(?:rsa|dsa|ecdsa|ed25519))$/i;
const device = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i;
const frozen = /^(?:agents\.md|blueprint.*|scope.*|package(?:-lock)?\.json|npm-shrinkwrap\.json|[tj]sconfig.*|vite\.config.*|astro\.config.*)$/i;
const sourceExtension = /\.(?:html?|css|[cm]?js|jsx|tsx?|json|md|svg|astro|txt)$/i;
const publicFile = /\.(?:html?|css|[cm]?js|jsx|tsx?|json|md|svg|astro|txt|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf|pdf)$/i;

export const safeProjectPath = (directory: string, relative: string, writing = false, privileged = false): string => {
  const root = projectRoot(directory);
  if (typeof relative !== 'string' || !relative || relative.length > 240 || /[\0:]/.test(relative) || /^[~\\/]/.test(relative) || path.isAbsolute(relative)) {
    throw new Error('Percorso relativo del progetto non valido.');
  }
  const parts = relative.split(/[\\/]/);
  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        part.endsWith('.') ||
        part.endsWith(' ') ||
        device.test(part) ||
        part.startsWith('.') ||
        reserved.test(part) ||
        /\.(?:pem|key|p12|pfx|db|sqlite)$/i.test(part),
    )
  ) {
    throw new Error('Percorso riservato o fuori perimetro.');
  }
  if (writing && (!sourceExtension.test(relative) || (!privileged && parts.some((part) => frozen.test(part))))) {
    throw new Error('File di configurazione o tipo di file non scrivibile dal modello.');
  }
  if (parts.some((part) => /^(?:credentials?|secrets?|service[-_]?account|auth|tokens?)(?:[._-]|$)/i.test(part))) {
    throw new Error('Nome di file riservato: escluso da lettura, copia e consegna.');
  }
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error('Collegamento simbolico escluso dal progetto.');
    }
  }
  const outside = path.relative(root, current);
  if (path.isAbsolute(outside) || outside === '..' || outside.startsWith('..' + path.sep)) {
    throw new Error('Percorso fuori progetto.');
  }
  return current;
};

export const readProjectState = (directory: string): ProjectState => {
  const value = JSON.parse(fs.readFileSync(path.join(projectControl(directory), 'project.json'), 'utf8')) as ProjectState;
  if (value.version !== 1 || value.root !== projectRoot(directory) || !['vanilla', 'react-vite', 'astro'].includes(value.stack)) {
    throw new Error('Stato progetto non verificato.');
  }
  return value;
};

export const sourceFiles = (directory: string): string[] => {
  const root = projectRoot(directory);
  const walk = (folder: string): string[] =>
    fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name.startsWith('.') || reserved.test(entry.name)) {
        return [];
      }
      const absolute = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error('Collegamento simbolico nel progetto: copia/esecuzione bloccata.');
      }
      if (entry.isDirectory()) {
        return walk(absolute);
      }
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (
        !entry.isFile() ||
        (!publicFile.test(relative) && !/^(?:LICENSE|NOTICE)$/i.test(entry.name)) ||
        /\.(?:pem|key|p12|pfx|db|sqlite|log)$/i.test(relative)
      ) {
        return [];
      }
      safeProjectPath(root, relative);
      return [relative];
    });
  return walk(root).sort();
};
export const sourceManifest = (directory: string): Record<string, string> =>
  Object.fromEntries(sourceFiles(directory).map((file) => [file, digest(fs.readFileSync(safeProjectPath(directory, file)))]));
export const manifestDigest = (manifest: Record<string, string>): string =>
  digest(JSON.stringify(Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)))));
