import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import fs from 'fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('fs');
vi.unmock('node:fs');
vi.unmock('path');
vi.unmock('node:path');

import { EventsHandler } from '../events-handler';
import { Task } from '../task/task';
import { PromptsManager } from '../prompts/prompts-manager';

import { createMockAgentProfile, createMockSettings } from './mocks';

import type { AgentProfile } from '@common/types';

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
    vi.spyOn(fs, 'stat').mockResolvedValue({} as never);
    vi.spyOn(fs, 'readdir').mockResolvedValue(['owner.md'] as never);
    vi.spyOn(fs, 'readFile').mockResolvedValue('SYNTHETIC_OWNER_RULE');
    const task = Object.assign(Object.create(Task.prototype), {
      project: { baseDir: taskDir, getProjectSettings: () => ({ disabledRuleFiles: [] }) },
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
