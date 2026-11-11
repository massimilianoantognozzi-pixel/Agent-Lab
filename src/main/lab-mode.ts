// Agent Lab modification: bounded, model-free checkpoint; not an OS sandbox.
import { existsSync, realpathSync, statSync, lstatSync } from 'node:fs';
import path from 'node:path';

export const isLabMode = (): boolean => process.env.AIDER_DESK_LAB_MODE === 'true';
export const isGeneralMode = (): boolean => process.env.AIDER_DESK_GENERAL_MODE === 'true';

export const getLabServerHost = (): string | undefined => (isLabMode() || isGeneralMode() ? '127.0.0.1' : undefined);

const canonicalPath = (target: string): string => {
  let existing = path.resolve(target);
  const missing: string[] = [];
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) {
      throw new Error('Agent Lab: percorso non verificabile.');
    }
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  return path.resolve(realpathSync(existing), ...missing);
};

const containsPath = (root: string, target: string): boolean => {
  const lexical = path.relative(path.resolve(root), path.resolve(target));
  if (path.isAbsolute(lexical) || lexical === '..' || lexical.startsWith(`..${path.sep}`)) {
    return false;
  }
  const relative = path.relative(canonicalPath(root), canonicalPath(target));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
};

export const assertLabWorkspace = (target: string): void => {
  if (!isLabMode()) {
    return;
  }
  const root = process.env.AIDER_DESK_LAB_WORKSPACE_ROOT;
  if (!root || !path.isAbsolute(root) || !containsPath(root, target)) {
    throw new Error('Agent Lab: operazione fuori dai workspace di prova autorizzati.');
  }
};

export const assertLabCodingProject = (target: string): void => {
  if (!isLabMode() || process.env.AIDER_DESK_LAB_LOCAL_MODEL !== 'devstral-coding') {
    return;
  }
  assertLabWorkspace(target);
  const root = canonicalPath(process.env.AIDER_DESK_LAB_WORKSPACE_ROOT!);
  const present = (file: string): boolean => {
    try {
      lstatSync(file);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  };
  let current = canonicalPath(target);
  while (true) {
    if (
      present(path.join(current, '.git')) ||
      (present(path.join(current, 'HEAD')) && present(path.join(current, 'objects')) && present(path.join(current, 'refs')))
    ) {
      throw new Error('Agent-Lab: aprire una cartella nuova o una copia dei soli sorgenti, senza metadati Git importati.');
    }
    if (current.toLowerCase() === root.toLowerCase()) {
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error('Confine Git del laboratorio non verificabile.');
    }
    current = parent;
  }
};

const symbolicReadTools = new Set(['find_symbol', 'get_symbols_overview', 'list_dir', 'read_file', 'check_onboarding_performed', 'initial_instructions']);

export const isAllowedLabToolName = (toolName: string): boolean => {
  const [group, name] = toolName.split('---');
  if (process.env.AIDER_DESK_LAB_LOCAL_MODEL === 'devstral-coding') {
    if (group === 'skills' && name === 'activate_skill') {
      return true;
    }
    return (
      group === 'lab' &&
      new Set([
        'project_prepare',
        'project_files',
        'project_search',
        'file_read',
        'file_write',
        'file_edit',
        'file_history',
        'file_restore',
        'project_check',
        'knowledge_update',
        'knowledge_search',
        'project_preview',
        'project_export',
      ]).has(name)
    );
  }
  return (
    (group === 'skills' && name === 'activate_skill') || (group === 'power' && name === 'file_read') || (group === 'serena' && symbolicReadTools.has(name))
  );
};

export const assertLabFilePath = (taskDir: string, target: string): void => {
  if (!isLabMode()) {
    return;
  }
  assertLabWorkspace(taskDir);
  if (!containsPath(taskDir, target)) {
    throw new Error('Agent Lab: lettura o scrittura fuori dal task di prova.');
  }
  const relative = path.relative(canonicalPath(taskDir), canonicalPath(target));
  const segments = relative.split(/[\\/]/);
  if (segments.some((part) => /^\.env(?:\.|$)|^\.git$|^id_(?:rsa|dsa|ecdsa|ed25519)$|\.(?:pem|key|p12|pfx)$/i.test(part))) {
    throw new Error('Agent Lab: file riservato escluso dalla prova.');
  }
};

export const assertLabSetupOperation = (): void => {
  if (isLabMode()) {
    throw new Error('Agent Lab: operazione di configurazione o rete disabilitata nel checkpoint iniziale.');
  }
};

export const assertLabToolInput = (toolName: string, input: Record<string, unknown> | undefined, taskDir: string): void => {
  if (!isLabMode()) {
    return;
  }
  assertLabWorkspace(taskDir);
  const [group, name] = toolName.split('---');
  if (process.env.AIDER_DESK_LAB_LOCAL_MODEL === 'devstral-coding' && group === 'lab' && isAllowedLabToolName(toolName)) {
    return;
  }
  const skillRead = group === 'skills' && name === 'activate_skill';
  const nativeRead = group === 'power' && name === 'file_read';
  const symbolicRead = group === 'serena' && symbolicReadTools.has(name);
  if (!skillRead && !nativeRead && !symbolicRead) {
    throw new Error('Agent Lab: strumento non autorizzato nel checkpoint iniziale in sola lettura.');
  }
  if (skillRead) {
    return;
  }

  const candidate = input?.filePath ?? input?.relative_path ?? input?.path;
  if (candidate === undefined && symbolicRead && ['list_dir', 'check_onboarding_performed', 'initial_instructions'].includes(name)) {
    return;
  }
  if (typeof candidate !== 'string' || candidate.includes('\0')) {
    throw new Error('Agent Lab: percorso dello strumento non valido.');
  }
  if (candidate === '~' || /^~[\\/]/.test(candidate)) {
    throw new Error('Agent Lab: espansione della home esclusa dalle letture del laboratorio.');
  }
  const resolved = path.resolve(taskDir, candidate);
  assertLabFilePath(taskDir, resolved);
  if (symbolicRead && ['find_symbol', 'get_symbols_overview', 'read_file'].includes(name) && (!existsSync(resolved) || !statSync(resolved).isFile())) {
    throw new Error('Agent Lab: lettura simbolica limitata a un file esplicito.');
  }
};
