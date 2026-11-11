import fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutonomyMode, ToolApprovalState } from '@common/types';

import { performStartUp } from '../start-up';
import { getEffectiveEnvironmentVariable, readAiderConfProperty } from '../utils/environment';
import { ApprovalManager } from '../agent/tools/approval-manager';

import type { PythonDependenciesInstaller } from '../python-dependencies-installer';
import type { AgentProfile } from '@common/types';
import type { Task } from '../task/task';

describe('Agent Lab startup and approval side effects', () => {
  beforeEach(() => {
    vi.stubEnv('AIDER_DESK_LAB_MODE', 'true');
    vi.clearAllMocks();
    vi.spyOn(fs, 'existsSync').mockImplementation(() => {
      throw new Error('Unexpected filesystem probe');
    });
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('Unexpected configuration read');
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('does not start or inspect the Python environment during lab startup', async () => {
    const ensureInstalled = vi.fn();
    await expect(performStartUp({ ensureInstalled } as unknown as PythonDependenciesInstaller)).resolves.toBe(true);
    expect(ensureInstalled).not.toHaveBeenCalled();
    expect(fs.existsSync).not.toHaveBeenCalled();
  });

  it('does not import provider credentials from the process or home configuration', () => {
    vi.stubEnv('OPENAI_API_KEY', 'SYNTHETIC_NOT_A_REAL_CREDENTIAL');
    expect(getEffectiveEnvironmentVariable('OPENAI_API_KEY')).toBeUndefined();
    expect(readAiderConfProperty('/synthetic', 'api-key')).toBeUndefined();
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  const manager = (approval: ToolApprovalState, answer = 'n') => {
    const askQuestion = vi.fn().mockResolvedValue([answer, 'synthetic decision']);
    const task = {
      task: { autonomyMode: AutonomyMode.Autonomous },
      taskId: 'lab-task',
      getProjectDir: () => '/synthetic',
      askQuestion,
      dispatchExtensionEvent: vi.fn(async (_name, event) => ({ ...event, allowed: true })),
    } as unknown as Task;
    const profile = { toolApprovals: { 'power---file_write': approval } } as unknown as AgentProfile;
    return { instance: new ApprovalManager(task, profile), askQuestion };
  };

  it('honours Never even when the task is autonomous and an extension claims approval', async () => {
    const { instance, askQuestion } = manager(ToolApprovalState.Never);
    expect(await instance.handleToolApproval('power---file_write', {}, 'power---file_write', 'write?')).toEqual([false, undefined]);
    expect(askQuestion).not.toHaveBeenCalled();
  });

  it('honours rejection of an Ask operation instead of auto-approving the autonomous task', async () => {
    const { instance, askQuestion } = manager(ToolApprovalState.Ask);
    expect(await instance.handleToolApproval('power---file_write', {}, 'power---file_write', 'write?')).toEqual([false, 'synthetic decision']);
    expect(askQuestion).toHaveBeenCalledOnce();
  });

  it('still permits an explicit human approval for an Ask operation', async () => {
    const { instance } = manager(ToolApprovalState.Ask, 'y');
    expect(await instance.handleToolApproval('power---file_write', {}, 'power---file_write', 'write?')).toEqual([true, undefined]);
  });
});
