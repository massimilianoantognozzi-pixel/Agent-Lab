import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watch } from 'chokidar';

import type { SettingsData } from '@common/types';

vi.unmock('path');
vi.unmock('fs');
vi.unmock('fs/promises');
vi.mock('@/logger');
vi.mock('child_process', async (load) => ({ ...(await load<typeof import('child_process')>()), spawn: vi.fn() }));
// Electron's CommonJS build receives the module namespace from require('filenamify').
vi.mock('filenamify', async (load) => ({ default: await load<typeof import('filenamify')>() }));
vi.mock('chokidar', () => ({ watch: vi.fn(() => ({ on: vi.fn().mockReturnThis(), close: vi.fn() })) }));
vi.mock('@/utils', async (original) => ({
  ...(await original<typeof import('@/utils')>()),
  execWithShellPath: vi.fn(async () => ({ stdout: '', stderr: '' })),
  getEnvironmentVariablesForAider: () => ({ AIDER_DESK_DIR: '.aider-desk' }),
}));
const fixtures = vi.hoisted(() => ({ home: '' }));
vi.mock('os', async (original) => {
  const os = await original<typeof import('os')>();
  return { ...os, default: { ...os, homedir: () => fixtures.home }, homedir: () => fixtures.home };
});

describe('configured project and global directories', () => {
  let scratch: string;
  let project: string;
  let profileHome: string;

  beforeEach(async () => {
    scratch = await fs.mkdtemp(path.join(tmpdir(), 'agentlab-directory-'));
    project = path.join(scratch, 'project');
    fixtures.home = path.join(scratch, 'fake-os-home');
    profileHome = path.join(scratch, 'operator-profile');
    await fs.mkdir(path.join(project, '.aider-desk', 'prompts'), { recursive: true });
    await fs.writeFile(path.join(project, '.aider-desk', 'prompts', 'marker.txt'), 'previous project data');
    await fs.mkdir(path.join(fixtures.home, '.aider-desk', 'agents'), { recursive: true });
    await fs.writeFile(path.join(fixtures.home, '.aider-desk', 'agents', 'order.json'), 'previous global data');
    vi.stubEnv('AIDER_DESK_HOME_DIR', profileHome);
    vi.stubEnv('AIDER_DESK_DATA_DIR', path.join(scratch, 'app-data'));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(scratch, { recursive: true, force: true });
  });

  it.each([
    ['.agent-lab', '.agent-lab'],
    [undefined, '.aider-desk'],
    ['.custom-agent', '.custom-agent'],
  ] as const)('uses the active project namespace for prompts, watcher and gitignore (%s)', async (configured, expected) => {
    vi.stubEnv('AIDER_DESK_DIR', configured);
    vi.resetModules();
    const { PromptsManager } = await import('@/prompts/prompts-manager');
    const { GitManager } = await import('@/git/git-manager');
    const { FileWatcherManager } = await import('@/file-watcher-manager');
    const store = { getSettings: () => ({ fileWatchMode: 'auto' }) };
    const manager = new PromptsManager({} as never, store as never, path.join(scratch, 'builtin'), path.join(profileHome, 'prompts'));
    const active = path.join(project, expected, 'prompts');
    await manager.watchProject(project);
    try {
      expect(watch).toHaveBeenCalledWith(active, expect.anything());
      expect((await fs.stat(active)).isDirectory()).toBe(true);
      const check = new FileWatcherManager(store as never)['createIgnoredList'](project, [])[0];
      expect(check(path.join(project, expected, 'tasks', 'record.json'))).toBe(true);
      expect(check(path.join(project, '.aider-desk', 'prompts', 'marker.txt'))).toBe(true);
      expect(check(path.join(project, 'app', 'main.ts'))).toBe(false);
      const git = new GitManager();
      await fs.writeFile(path.join(project, '.gitignore'), '# existing rule\n.aider-desk/');
      await git.initRepository(project);
      await git.initRepository(project);
      const ignored = (await fs.readFile(path.join(project, '.gitignore'), 'utf8')).trimEnd().split('\n');
      expect(ignored).toContain('# existing rule');
      expect(ignored.filter((line) => line === expected + '/')).toHaveLength(1);
      expect(await fs.readFile(path.join(project, '.aider-desk', 'prompts', 'marker.txt'), 'utf8')).toBe('previous project data');
      expect(await fs.readdir(path.join(project, '.aider-desk', 'prompts'))).toEqual(['marker.txt']);
    } finally {
      await manager.dispose();
    }
  });

  it('pins the connector namespace after merging project and provider environments', async () => {
    vi.stubEnv('AIDER_DESK_DIR', '.agent-lab');
    vi.resetModules();
    const { AiderManager } = await import('@/task/aider-manager');
    const task = { getProjectDir: () => project, getTaskDir: () => project, taskId: 'test', task: { id: 'test', mainModel: 'test/model' } };
    const store = { getSettings: () => ({ aider: { options: '' } }), getProjectSettings: () => ({ modelEditFormats: {} }), getProviders: () => [] };
    const models = { getAiderModelMapping: () => ({ modelName: 'test/model', environmentVariables: { AIDER_DESK_DIR: '.provider-test' } }) };
    const manager = new AiderManager(task as never, store as never, models as never, { sendAiderConnectorStatus: vi.fn() } as never, () => [], {
      isReady: () => true,
    } as never);
    vi.mocked(spawn).mockImplementationOnce(() => {
      throw new Error('fixture intercepted spawn');
    });
    await expect(manager.start()).rejects.toThrow('fixture intercepted spawn');
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ env: expect.objectContaining({ AIDER_DESK_DIR: '.agent-lab' }) }),
    );
  });

  it('migrates the profiles in the loaded settings to the configured profile home', async () => {
    vi.stubEnv('AIDER_DESK_DIR', '.agent-lab');
    vi.resetModules();
    const { migrateSettingsV16toV17 } = await import('@/store/migrations/v16-to-v17');
    await migrateSettingsV16toV17({ agentProfiles: [{ id: 'fixture', name: 'Fixture' }] } as unknown as SettingsData);
    expect(JSON.parse(await fs.readFile(path.join(profileHome, 'agents', 'order.json'), 'utf8'))).toEqual({ fixture: 0 });
    expect(await fs.readFile(path.join(fixtures.home, '.aider-desk', 'agents', 'order.json'), 'utf8')).toBe('previous global data');
    await expect(fs.stat(path.join(fixtures.home, '.agent-lab'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
