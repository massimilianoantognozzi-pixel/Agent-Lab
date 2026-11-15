import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import fs from 'fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('fs');
vi.unmock('node:fs');
vi.unmock('path');
vi.unmock('node:path');

import { EventsHandler } from '../events-handler';
import { AgentProfileManager } from '../agent/agent-profile-manager';
import { Task } from '../task/task';
import { PromptsManager } from '../prompts/prompts-manager';

import { createMockAgentProfile, createMockSettings } from './mocks';

import type { AgentProfile } from '@common/types';

import { AIDER_DESK_PROJECT_RULES_DIR } from '@/constants';

describe('Agent Lab application entry points', () => {
  let taskDir: string;
  let outside: string;
  let handler: EventsHandler;

  beforeEach(() => {
    const artifacts = path.resolve('lab/work/handler-tests');
    mkdirSync(artifacts, { recursive: true });
    const fixture = mkdtempSync(path.join(artifacts, 'case-'));
    taskDir = path.join(fixture, 'workspaces', 'sample');
    outside = path.join(fixture, 'outside.txt');
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(path.join(taskDir, 'demo.py'), 'synthetic source');
    writeFileSync(outside, 'SYNTHETIC_OUTSIDE_CANARY');
    vi.stubEnv('AIDER_DESK_LAB_MODE', 'true');
    vi.stubEnv('AIDER_DESK_LAB_WORKSPACE_ROOT', path.dirname(taskDir));
    handler = Object.assign(Object.create(EventsHandler.prototype), {
      projectManager: { getProject: vi.fn(() => ({ getTask: () => undefined })) },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const limitStatsToFixture = () => {
    const stat = fs.stat.bind(fs);
    vi.spyOn(fs, 'stat').mockImplementation(async (file) => {
      const relativePath = path.relative(taskDir, String(file));
      if (path.isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith(`..${path.sep}`)) {
        throw Object.assign(new Error('Outside the synthetic project'), { code: 'ENOENT' });
      }
      return stat(file);
    });
  };

  it('denies outside reads and writes before asynchronous filesystem access', async () => {
    const read = vi.spyOn(fs, 'readFile');
    const write = vi.spyOn(fs, 'writeFile');
    await expect(handler.readFile(taskDir, 'absent', outside)).rejects.toThrow('fuori');
    await expect(handler.saveFile(taskDir, 'absent', outside, 'DENIED')).rejects.toThrow('fuori');
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('still reads a permitted synthetic source through the real handler', async () => {
    await expect(handler.readFile(taskDir, 'absent', 'demo.py')).resolves.toBe('synthetic source');
  });

  it('carries discovered global rules into the prompt on Windows using portable home paths', async () => {
    vi.spyOn(fs, 'stat').mockResolvedValue({ isFile: () => true } as never);
    vi.spyOn(fs, 'readdir').mockResolvedValue(['owner.md'] as never);
    vi.spyOn(fs, 'readFile').mockResolvedValue('SYNTHETIC_OWNER_RULE');
    const task = Object.assign(Object.create(Task.prototype), {
      project: { baseDir: taskDir, getProjectSettings: () => ({ disabledRuleFiles: [] }) },
      agentProfileManager: new AgentProfileManager({} as never, {} as never, {} as never),
      extensionManager: { dispatchEvent: async (_name: string, event: unknown) => event },
      getProjectDir: () => taskDir,
      getTaskDir: () => taskDir,
      task: {},
    }) as Task;
    const rules = await task.getRuleFilesAsContextFiles();
    expect(rules.find((rule) => rule.source === 'global-rule')?.path).toMatch(/^~\//);
    const profile = { ...createMockAgentProfile(), systemPrompt: 'Synthetic system prompt.' };
    const prompts = new PromptsManager({} as never, {} as never);
    const prompt = await prompts.getSystemPrompt(createMockSettings(), task, profile);
    expect(prompt).toContain('SYNTHETIC_OWNER_RULE');
    expect(prompt).toContain('<Rules>');
  });

  it.each([
    { caseName: 'uses the active AGENTS.md', worktreeFile: 'AGENTS.md', expected: 'TASK_AGENTS_RULE' },
    { caseName: 'does not inherit AGENTS.md from another checkout', worktreeFile: undefined, expected: undefined },
    { caseName: 'prefers the worktree override', worktreeFile: 'AGENTS.override.md', expected: 'TASK_OVERRIDE_RULE' },
  ])('$caseName when loading worktree instructions', async ({ worktreeFile, expected }) => {
    const worktree = path.join(taskDir, 'task-worktree');
    mkdirSync(worktree, { recursive: true });
    writeFileSync(path.join(taskDir, 'AGENTS.md'), 'MAIN_CHECKOUT_RULE');
    if (worktreeFile && expected) {
      writeFileSync(path.join(worktree, worktreeFile), expected);
    }
    if (worktreeFile === 'AGENTS.override.md') {
      writeFileSync(path.join(worktree, 'AGENTS.md'), 'TASK_FALLBACK_RULE');
    }
    const projectRules = path.join(taskDir, AIDER_DESK_PROJECT_RULES_DIR);
    mkdirSync(projectRules, { recursive: true });
    writeFileSync(path.join(projectRules, 'policy.md'), 'PROJECT_POLICY_RULE');
    limitStatsToFixture();
    const task = Object.assign(Object.create(Task.prototype), {
      project: { baseDir: taskDir, getProjectSettings: () => ({ disabledRuleFiles: [] }) },
      agentProfileManager: new AgentProfileManager({} as never, {} as never, {} as never),
      extensionManager: { dispatchEvent: async (_name: string, event: unknown) => event },
      task: { worktree: { path: worktree } },
    }) as Task;
    const prompts = new PromptsManager({} as never, {} as never);
    const profile = { ...createMockAgentProfile(), systemPrompt: 'Synthetic system prompt.' };
    const prompt = await prompts.getSystemPrompt(createMockSettings(), task, profile);
    if (expected) {
      expect(prompt).toContain(expected);
    }
    expect(prompt).toContain('PROJECT_POLICY_RULE');
    expect(prompt).not.toContain('MAIN_CHECKOUT_RULE');
    expect(prompt).not.toContain('TASK_FALLBACK_RULE');
  });

  it.each([
    { mode: 'ordinary Git checkout', labMode: false, gitMarker: true, inherits: true },
    { mode: 'restricted Lab task', labMode: true, gitMarker: true, inherits: false },
    { mode: 'ordinary folder without a Git marker', labMode: false, gitMarker: false, inherits: false },
  ])('selects the rules for a nested $mode', async ({ labMode, gitMarker, inherits }) => {
    const root = path.join(taskDir, 'repo');
    const section = path.join(root, 'section');
    const checkout = path.join(section, 'screen');
    const sibling = path.join(root, 'sibling');
    mkdirSync(checkout, { recursive: true });
    mkdirSync(sibling, { recursive: true });
    if (gitMarker) {
      mkdirSync(path.join(root, '.git'));
    }
    writeFileSync(path.join(taskDir, 'AGENTS.md'), 'OUTSIDE_REPO_RULE');
    writeFileSync(path.join(root, 'AGENTS.md'), 'REPO_ROOT_RULE');
    writeFileSync(path.join(section, 'AGENTS.md'), 'SECTION_FALLBACK_RULE');
    writeFileSync(path.join(section, 'AGENTS.override.md'), 'SECTION_OVERRIDE_RULE');
    writeFileSync(path.join(checkout, 'AGENTS.md'), 'SCREEN_RULE');
    writeFileSync(path.join(sibling, 'AGENTS.md'), 'SIBLING_RULE');
    vi.stubEnv('AIDER_DESK_LAB_MODE', labMode ? 'true' : 'false');
    limitStatsToFixture();

    const task = Object.assign(Object.create(Task.prototype), {
      project: { baseDir: checkout, getProjectSettings: () => ({ disabledRuleFiles: [] }) },
      agentProfileManager: new AgentProfileManager({} as never, {} as never, {} as never),
      extensionManager: { dispatchEvent: async (_name: string, event: unknown) => event },
      task: {},
    }) as Task;
    const prompts = new PromptsManager({} as never, {} as never);
    const profile = { ...createMockAgentProfile(), systemPrompt: 'Synthetic system prompt.' };
    const prompt = await prompts.getSystemPrompt(createMockSettings(), task, profile);
    expect(prompt).toContain('SCREEN_RULE');
    expect(prompt).not.toContain('OUTSIDE_REPO_RULE');
    expect(prompt).not.toContain('SECTION_FALLBACK_RULE');
    expect(prompt).not.toContain('SIBLING_RULE');
    if (inherits) {
      expect(prompt).toContain('<File name="../../AGENTS.md">');
      expect(prompt).toContain('<File name="../AGENTS.override.md">');
      expect(prompt).toContain('REPO_ROOT_RULE');
      expect(prompt).toContain('SECTION_OVERRIDE_RULE');
      expect(prompt.indexOf('REPO_ROOT_RULE')).toBeLessThan(prompt.indexOf('SECTION_OVERRIDE_RULE'));
      expect(prompt.indexOf('SECTION_OVERRIDE_RULE')).toBeLessThan(prompt.indexOf('SCREEN_RULE'));
    } else {
      expect(prompt).not.toContain('REPO_ROOT_RULE');
      expect(prompt).not.toContain('SECTION_OVERRIDE_RULE');
    }
  });

  it.each([
    { mode: 'stable alias', retarget: false, separateWorktree: false },
    { mode: 'retargeted alias', retarget: true, separateWorktree: false },
    { mode: 'retargeted project alias with a separate worktree', retarget: true, separateWorktree: true },
  ])('uses one physical Git rule snapshot for $mode', async ({ retarget, separateWorktree }) => {
    const lexicalRoot = path.join(taskDir, 'lexical-repo');
    const physicalRoot = path.join(taskDir, 'physical-repo');
    const physicalDirectory = path.join(physicalRoot, 'screen');
    const alias = path.join(lexicalRoot, 'selected');
    for (const directory of [lexicalRoot, physicalRoot]) {
      mkdirSync(path.join(directory, '.git'), { recursive: true });
    }
    mkdirSync(physicalDirectory);
    await fs.symlink(physicalDirectory, alias, process.platform === 'win32' ? 'junction' : 'dir');
    writeFileSync(path.join(lexicalRoot, 'AGENTS.md'), 'LEXICAL_REPO_RULE');
    writeFileSync(path.join(physicalRoot, 'AGENTS.md'), 'PHYSICAL_REPO_RULE');
    writeFileSync(path.join(physicalDirectory, 'AGENTS.md'), 'ALIASED_SCREEN_RULE');
    vi.stubEnv('AIDER_DESK_LAB_MODE', 'false');
    limitStatsToFixture();

    const replacement = path.join(taskDir, 'replacement-checkout');
    mkdirSync(replacement);
    writeFileSync(path.join(replacement, 'AGENTS.md'), 'REPLACEMENT_SCREEN_RULE');
    const projectRules = path.join(physicalDirectory, AIDER_DESK_PROJECT_RULES_DIR);
    const replacementRules = path.join(replacement, AIDER_DESK_PROJECT_RULES_DIR);
    mkdirSync(projectRules, { recursive: true });
    mkdirSync(replacementRules, { recursive: true });
    writeFileSync(path.join(projectRules, 'policy.md'), 'ALIASED_PROJECT_POLICY');
    writeFileSync(path.join(replacementRules, 'policy.md'), 'REPLACEMENT_PROJECT_POLICY');
    const worktree = path.join(taskDir, 'separate-worktree');
    if (separateWorktree) {
      mkdirSync(worktree);
      writeFileSync(path.join(worktree, '.git'), 'gitdir: synthetic-marker\n');
      writeFileSync(path.join(worktree, 'AGENTS.md'), 'SEPARATE_WORKTREE_RULE');
    }
    let retargeted = false;
    const task = Object.assign(Object.create(Task.prototype), {
      project: { baseDir: alias, getProjectSettings: () => ({ disabledRuleFiles: [] }) },
      agentProfileManager: new AgentProfileManager({} as never, {} as never, {} as never),
      extensionManager: {
        dispatchEvent: async (name: string, event: unknown) => {
          if (name === 'onRuleFilesRetrieved' && retarget && !retargeted) {
            expect((await fs.lstat(alias)).isSymbolicLink()).toBe(true);
            await fs.unlink(alias);
            await fs.symlink(replacement, alias, process.platform === 'win32' ? 'junction' : 'dir');
            retargeted = true;
          }
          return event;
        },
      },
      task: separateWorktree ? { worktree: { path: worktree } } : {},
    }) as Task;
    const prompts = new PromptsManager({} as never, {} as never);
    const profile = { ...createMockAgentProfile(), systemPrompt: 'Synthetic system prompt.' };
    const prompt = await prompts.getSystemPrompt(createMockSettings(), task, profile);
    if (separateWorktree) {
      expect(prompt).toContain('SEPARATE_WORKTREE_RULE');
      expect(prompt).not.toContain('PHYSICAL_REPO_RULE');
      expect(prompt).not.toContain('ALIASED_SCREEN_RULE');
    } else {
      expect(prompt).toContain('<File name="../AGENTS.md">');
      expect(prompt).toContain('PHYSICAL_REPO_RULE');
      expect(prompt).toContain('ALIASED_SCREEN_RULE');
    }
    expect(prompt).toContain('ALIASED_PROJECT_POLICY');
    expect(prompt).not.toContain('LEXICAL_REPO_RULE');
    expect(prompt).not.toContain('REPLACEMENT_SCREEN_RULE');
    expect(prompt).not.toContain('REPLACEMENT_PROJECT_POLICY');
    expect(await task.getRuleFilesAsContextFiles(profile)).toContainEqual({ path: 'AGENTS.md', readOnly: true, source: 'project-rule' });
  });

  it('rejects an outside project before consulting or persisting the project store', async () => {
    await expect(handler.addOpenProject(path.dirname(outside))).rejects.toThrow('fuori');
  });

  it('blocks profile creation, update and deletion before reaching the profile manager', async () => {
    const profile = { id: 'synthetic', projectDir: path.dirname(outside) } as AgentProfile;
    await expect(handler.createAgentProfile(profile)).rejects.toThrow('disabilitata');
    await expect(handler.updateAgentProfile({ ...profile, projectDir: undefined })).rejects.toThrow('disabilitata');
    await expect(handler.deleteAgentProfile(profile.id)).rejects.toThrow('disabilitata');
  });

  it('blocks MCP mutation, clone and scrape before their managers or network are used', async () => {
    await expect(handler.replaceMcpServers({}, path.dirname(outside))).rejects.toThrow('disabilitata');
    await expect(handler.cloneProject('https://example.invalid/synthetic', path.dirname(outside))).rejects.toThrow('disabilitata');
    await expect(handler.scrapeWeb(taskDir, 'absent', 'https://example.invalid', outside)).rejects.toThrow('disabilitata');
  });
});
