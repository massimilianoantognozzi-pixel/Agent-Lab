import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('fs');
vi.unmock('node:fs');
vi.unmock('path');
vi.unmock('node:path');

import { assertLabFilePath, assertLabSetupOperation, assertLabToolInput, assertLabWorkspace, getLabServerHost, isLabMode } from '../lab-mode';

describe('Agent Lab checkpoint boundaries', () => {
  let allowed: string;
  let taskDir: string;
  let outside: string;

  beforeEach(() => {
    const artifactDir = path.resolve('lab/work/boundary-tests');
    mkdirSync(artifactDir, { recursive: true });
    const caseDir = mkdtempSync(path.join(artifactDir, 'case-'));
    allowed = path.join(caseDir, 'workspaces');
    taskDir = path.join(allowed, 'synthetic');
    outside = path.join(caseDir, 'outside');
    mkdirSync(taskDir, { recursive: true });
    mkdirSync(outside);
    writeFileSync(path.join(taskDir, 'demo.py'), 'def total():\n    return 2\n');
    writeFileSync(path.join(outside, 'canary.txt'), 'SYNTHETIC_OUTSIDE_CANARY');
    vi.stubEnv('AIDER_DESK_LAB_MODE', 'true');
    vi.stubEnv('AIDER_DESK_LAB_WORKSPACE_ROOT', allowed);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('binds the lab listener to loopback and preserves the upstream mode otherwise', () => {
    expect(isLabMode()).toBe(true);
    expect(getLabServerHost()).toBe('127.0.0.1');
    vi.stubEnv('AIDER_DESK_LAB_MODE', 'false');
    expect(getLabServerHost()).toBeUndefined();
  });

  it('accepts the synthetic project and rejects a sibling with a matching prefix', () => {
    expect(() => assertLabWorkspace(taskDir)).not.toThrow();
    const sibling = `${allowed}-other`;
    mkdirSync(sibling);
    expect(() => assertLabWorkspace(sibling)).toThrow('fuori');
  });

  it('fails closed when the workspace root is not configured', () => {
    vi.stubEnv('AIDER_DESK_LAB_WORKSPACE_ROOT', '');
    expect(() => assertLabWorkspace(taskDir)).toThrow('fuori');
  });

  it('allows an explicit native read of a file inside the task', () => {
    expect(() => assertLabToolInput('power---file_read', { filePath: 'demo.py' }, taskDir)).not.toThrow();
  });

  it('confines direct application reads and writes and disables setup operations', () => {
    expect(() => assertLabFilePath(taskDir, path.join(taskDir, 'demo.py'))).not.toThrow();
    expect(() => assertLabFilePath(taskDir, path.join(outside, 'canary.txt'))).toThrow('fuori');
    expect(() => assertLabSetupOperation()).toThrow('disabilitata');
  });

  it('rejects broad symbolic content searches and requires explicit source files', () => {
    mkdirSync(path.join(taskDir, 'bundle.py'));
    expect(() => assertLabToolInput('serena---find_symbol', { relative_path: 'bundle.py' }, taskDir)).toThrow('file esplicito');
    for (const relative_path of [undefined, '', '.']) {
      expect(() => assertLabToolInput('serena---find_symbol', { relative_path }, taskDir)).toThrow();
      expect(() => assertLabToolInput('serena---search_for_pattern', { relative_path }, taskDir)).toThrow();
      expect(() => assertLabToolInput('serena---find_referencing_symbols', { relative_path }, taskDir)).toThrow();
    }
  });

  it('rejects traversal and absolute paths outside the current task', () => {
    expect(() => assertLabToolInput('power---file_read', { filePath: '../../outside/canary.txt' }, taskDir)).toThrow('fuori');
    expect(() => assertLabToolInput('power---file_read', { filePath: path.join(outside, 'canary.txt') }, taskDir)).toThrow('fuori');
  });

  it('rejects reserved files, malformed input and unknown tools', () => {
    for (const filePath of ['.env', '.env.local', '.git/config', 'id_rsa', 'private.pem']) {
      expect(() => assertLabToolInput('power---file_read', { filePath }, taskDir)).toThrow('riservato');
    }
    expect(() => assertLabToolInput('power---file_read', {}, taskDir)).toThrow('non valido');
    expect(() => assertLabToolInput('extensions---unreviewed', {}, taskDir)).toThrow('non autorizzato');
  });

  it('blocks writes, shell execution and remote fetch in the initial checkpoint', () => {
    for (const tool of ['power---file_write', 'power---file_edit', 'power---bash', 'power---fetch']) {
      expect(() => assertLabToolInput(tool, {}, taskDir)).toThrow('non autorizzato');
    }
  });

  it('allows symbolic reads and blocks Serena mutating tools', () => {
    expect(() => assertLabToolInput('serena---find_symbol', { relative_path: 'demo.py' }, taskDir)).not.toThrow();
    expect(() => assertLabToolInput('serena---initial_instructions', {}, taskDir)).not.toThrow();
    expect(() => assertLabToolInput('serena---read_file', { relative_path: '../../outside/canary.txt' }, taskDir)).toThrow('fuori');
    expect(() => assertLabToolInput('serena---replace_symbol_body', {}, taskDir)).toThrow('non autorizzato');
  });

  it('rejects an existing junction or symlink that points outside the task', () => {
    symlinkSync(outside, path.join(taskDir, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => assertLabToolInput('power---file_read', { filePath: 'escape/canary.txt' }, taskDir)).toThrow('fuori');
  });
});
