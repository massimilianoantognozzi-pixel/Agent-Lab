import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutonomyMode, FileWriteMode } from '@common/types';

vi.unmock('fs');
vi.unmock('node:fs');
vi.unmock('fs/promises');
vi.unmock('node:fs/promises');
vi.unmock('path');
vi.unmock('node:path');
import { createPowerToolset } from '../agent/tools/power';
import { assertLabSetupOperation, assertLabWorkspace, isGeneralMode, isLabMode } from '../lab-mode';
import { Agent } from '../agent/agent';
import { getAllFiles } from '../utils/file-system';

describe('General AiderDesk capability restoration', () => {
  let directory: string;
  beforeEach(() => {
    directory = path.resolve('lab/work/general-unit', randomUUID());
    fs.mkdirSync(directory, { recursive: true });
    vi.stubEnv('AIDER_DESK_GENERAL_MODE', 'true');
    vi.stubEnv('AIDER_DESK_LAB_MODE', 'false');
    vi.stubEnv('AIDER_DESK_LAB_WORKSPACE_ROOT', path.join(directory, 'old-web-only'));
  });
  afterEach(() => vi.unstubAllEnvs());
  const task = (directory: string) => ({
    taskId: 'unit',
    getTaskDir: () => directory,
    task: { autonomyMode: AutonomyMode.Autonomous },
    addToolMessage: vi.fn(),
    addToGit: vi.fn(async () => {}),
    dispatchExtensionEvent: vi.fn(async (_name, event) => event),
  });
  const profile = { toolApprovals: {}, toolSettings: {} };
  it('does not apply the old workspace/setup restrictions or tool whitelist', () => {
    expect(isGeneralMode()).toBe(true);
    expect(isLabMode()).toBe(false);
    expect(() => assertLabWorkspace(directory)).not.toThrow();
    expect(() => assertLabSetupOperation()).not.toThrow();
    const agent = Object.create(Agent.prototype) as Agent;
    const native = {
      'power---bash': { execute: vi.fn() },
      'power---file_write': { execute: vi.fn() },
      'serena---replace_symbol_body': { execute: vi.fn() },
      'custom-extension---tool': { execute: vi.fn() },
    };
    expect(Object.keys(agent['wrapToolsWithHooks']({} as never, {} as never, native as never))).toEqual(Object.keys(native));
  });
  it('writes different source/configuration types without mandatory templates', async () => {
    const tools = createPowerToolset(task(directory) as never, profile as never);
    for (const filePath of [
      'module.py',
      'module.rs',
      'module.cs',
      'schema.sql',
      'build.ps1',
      'Makefile',
      'package.json',
      '.github/workflows/check.yml',
      '.env.example',
    ]) {
      const result = await tools['power---file_write'].execute!(
        { filePath, content: 'synthetic fixture\n', mode: FileWriteMode.Overwrite },
        { toolCallId: randomUUID(), messages: [], context: {} },
      );
      expect(String(result)).toContain('Successfully');
      expect(fs.existsSync(path.join(directory, filePath))).toBe(true);
    }
    const files = await getAllFiles(directory);
    expect(files).toContain('module.py');
    expect(files).toContain('module.rs');
    expect(files).toContain('.github/workflows/check.yml');
  });
  it('executes the ordinary native command tool and returns real output/status', async () => {
    const tools = createPowerToolset(task(directory) as never, profile as never);
    const result = await tools['power---bash'].execute!(
      { command: 'node -e "process.stdout.write(\'general-native-ok\')"', timeout: 10000 },
      { toolCallId: 'native-command', messages: [], context: {} },
    );
    expect(result).toMatchObject({ exitCode: 0, stdout: 'general-native-ok' });
  }, 15000);
});
