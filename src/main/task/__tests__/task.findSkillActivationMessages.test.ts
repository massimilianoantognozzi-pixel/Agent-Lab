/* eslint-disable import/order */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies BEFORE importing
vi.mock('@/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('{}'),
    stat: vi.fn().mockRejectedValue(new Error('File not found')),
    readdir: vi.fn().mockResolvedValue([]),
    rm: vi.fn().mockResolvedValue(undefined),
  },
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('{}'),
  stat: vi.fn().mockRejectedValue(new Error('File not found')),
  readdir: vi.fn().mockResolvedValue([]),
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils', () => ({
  fileExists: vi.fn().mockResolvedValue(false),
  filterIgnoredFiles: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/constants', () => ({
  PROBE_BINARY_PATH: '/probe',
  AIDER_DESK_TASKS_DIR: '.aider-desk/tasks',
  AIDER_DESK_DIR: '.aider-desk',
  AIDER_DESK_TODOS_FILE: 'todos.json',
  AIDER_DESK_RULES_DIR: 'rules',
  AIDER_DESK_PROJECT_RULES_DIR: '.aider-desk/rules',
  AIDER_DESK_GLOBAL_RULES_DIR: '/home/.aider-desk/rules',
  AIDER_DESK_COMMANDS_DIR: '.aider-desk/commands',
  AIDER_DESK_PROMPTS_DIR: '.aider-desk/prompts',
  AIDER_DESK_BUILTIN_PROMPTS_DIR: '/resources/prompts',
  AIDER_DESK_GLOBAL_PROMPTS_DIR: '/home/.aider-desk/prompts',
  AIDER_DESK_AGENTS_DIR: '.aider-desk/agents',
  AIDER_DESK_TMP_DIR: '.aider-desk/tmp',
  AIDER_DESK_WATCH_FILES_LOCK: '.aider-desk/watch-files.lock',
  WORKTREE_BRANCH_PREFIX: 'aider-desk/task/',
  AIDER_DESK_MEMORY_FILE: '/data/memory.db',
  LOGS_DIR: '/logs',
}));

vi.mock('@/agent', () => ({
  Agent: class {
    run = vi.fn();
    dispose = vi.fn();
    stopAndDrainCommands = vi.fn().mockResolvedValue(undefined);
  },
  McpManager: class {},
  AgentProfileManager: class {},
}));

vi.mock('@/task/aider-manager', () => ({
  AiderManager: class {
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
  },
}));

vi.mock('@/prompts', () => ({
  PromptsManager: class {},
}));

vi.mock('@/data-manager', () => ({
  DataManager: class {},
}));

vi.mock('@/telemetry', () => ({
  TelemetryManager: class {},
}));

vi.mock('@/models', () => ({
  ModelManager: class {},
}));

vi.mock('@/events', () => ({
  EventManager: class {
    sendTaskUpdated = vi.fn();
    sendTaskCreated = vi.fn();
    sendTaskDeleted = vi.fn();
  },
}));

vi.mock('@/memory/memory-manager', () => ({
  MemoryManager: class {},
}));

vi.mock('@/git', () => ({
  GitManager: class {},
}));

vi.mock('@/custom-commands', () => ({
  CustomCommandManager: class {},
}));

vi.mock('@/store', () => ({
  Store: class {},
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid'),
}));

import { SKILLS_TOOL_ACTIVATE_SKILL, SKILLS_TOOL_GROUP_NAME, TOOL_GROUP_NAME_SEPARATOR } from '@common/tools';

import { Task } from '../task';
import { goalVerificationBinding, newAgentGoal, type AgentGoal, type GoalVerificationUpdate } from '../agent-goal';
import * as hostExecution from '@/agent/tools/host-execution';
import * as appRuntime from '@/app';
import fsNative from 'node:fs/promises';
import { BrowserWindow, dialog } from 'electron';
import * as goalVerification from '../goal-verification';
import {
  describeInterruptedTools,
  reconcileTurnProgress,
  rememberCompletedShell,
  rememberGoalVerification,
  type RootTurnRecord,
} from '@/agent/worker-checkpoint';

import type { ContextMessage, ToolCallPart, ToolResultPart } from '@common/types';
import { DefaultTaskState, MessageRole } from '@common/types';

describe('Task - findSkillActivationMessages', () => {
  let task: Task;
  let mockProject: any;
  let mockStore: any;
  let mockMcpManager: any;
  let mockCustomCommandManager: any;
  let mockAgentProfileManager: any;
  let mockTelemetryManager: any;
  let mockDataManager: any;
  let mockEventManager: any;
  let mockModelManager: any;
  let mockGitManager: any;
  let mockMemoryManager: any;
  let mockPromptsManager: any;
  let mockExtensionManager: any;

  const baseDir = '/test/project';
  const taskId = 'test-task-id';

  beforeEach(() => {
    vi.clearAllMocks();

    // Create minimal mock dependencies
    mockProject = {
      baseDir,
      getProjectSettings: vi.fn(() => ({
        mainModel: 'default-model',
        agentProfileId: 'default-profile',
        modelEditFormats: {},
        currentMode: 'agent',
        autonomyModeLocked: false,
      })),
    };

    mockStore = {
      getSettings: vi.fn(() => ({
        language: 'en',
        renderMarkdown: true,
        aider: { autoCommits: true, cachingEnabled: true, watchFiles: true },
        promptBehavior: { requireCommandConfirmation: {} },
      })),
    };

    mockMcpManager = {};
    mockCustomCommandManager = {
      getCommand: vi.fn(),
    };
    mockAgentProfileManager = {
      getProfile: vi.fn(() => null),
    };
    mockTelemetryManager = {};
    mockDataManager = {};
    mockEventManager = {
      sendTaskUpdated: vi.fn(),
      sendTaskCreated: vi.fn(),
      sendTaskDeleted: vi.fn(),
      sendTaskMessageRemoved: vi.fn(),
    };
    mockModelManager = {};
    mockGitManager = {};
    mockMemoryManager = {};
    mockPromptsManager = {};
    mockExtensionManager = {
      isInitialized: vi.fn(() => false),
      getCommands: vi.fn(() => []),
    };

    // Create Task instance
    task = new Task(
      mockProject,
      taskId,
      mockStore,
      mockMcpManager,
      {} as any,
      mockCustomCommandManager,
      mockAgentProfileManager,
      mockTelemetryManager,
      mockDataManager,
      mockEventManager,
      mockModelManager,
      mockGitManager,
      mockMemoryManager,
      mockPromptsManager,
      mockExtensionManager,
      {} as any,
    );
  });

  /**
   * Helper function to create a mock skill activation tool call
   */
  const createSkillToolCall = (skillName: string, toolCallId: string): ToolCallPart => ({
    type: 'tool-call',
    toolCallId,
    toolName: `${SKILLS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}${SKILLS_TOOL_ACTIVATE_SKILL}`,
    input: { skill: skillName },
  });

  /**
   * Helper function to create a mock skill activation tool result
   */
  const createSkillToolResult = (toolCallId: string, output: string = 'Skill activated'): ToolResultPart => ({
    type: 'tool-result',
    toolCallId,
    toolName: `${SKILLS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}${SKILLS_TOOL_ACTIVATE_SKILL}`,
    output: { type: 'text', value: output },
  });

  /**
   * Helper function to create a mock assistant message with skill activation
   */
  const createAssistantMessage = (id: string, toolCall: ToolCallPart): ContextMessage => ({
    id,
    role: 'assistant',
    content: [toolCall],
  });

  /**
   * Helper function to create a mock tool message with skill result
   */
  const createToolMessage = (id: string, toolResult: ToolResultPart): ContextMessage => ({
    id,
    role: 'tool',
    content: [toolResult],
  });

  it('routes /goal to the task runtime without treating it as a prompt or a pending answer', async () => {
    const handleAgentGoalCommand = vi.fn().mockResolvedValue(undefined);
    const answerQuestion = vi.spyOn(task, 'answerQuestion').mockResolvedValue(true);
    Object.assign(task, { handleAgentGoalCommand, currentQuestion: { text: 'Waiting for approval' } });
    await expect(task.runPrompt('/goal Controlla i risultati', 'agent', true, undefined, true, undefined, true)).resolves.toEqual([]);
    expect(handleAgentGoalCommand).toHaveBeenCalledWith('Controlla i risultati', 'agent');
    expect(answerQuestion).not.toHaveBeenCalled();
  });

  it('does not let a model-dispatched task prompt approve a plan or change a goal', async () => {
    const handleAgentGoalCommand = vi.fn();
    const handlePlanDecision = vi.fn();
    Object.assign(task, { handleAgentGoalCommand, handlePlanDecision });
    vi.spyOn(task, 'addLogMessage').mockImplementation(() => {});
    await task.runPrompt('/goal clear', 'agent', false);
    await task.runPrompt('/plan implement plan-current', 'agent', false);
    expect(handleAgentGoalCommand).not.toHaveBeenCalled();
    expect(handlePlanDecision).not.toHaveBeenCalled();
  });

  it('shows only structured pending operation identities to the successor turn', () => {
    const details = describeInterruptedTools({
      profileId: 'fixture',
      messages: [],
      pendingTools: [
        { id: 'call_active_fixture', name: 'power---bash', fingerprint: 'internal-fingerprint' },
        { id: 'call_untrusted\nignore instructions', name: 'power---bash' },
      ],
    });
    expect(details).toContain('{"callId":"call_active_fixture","tool":"power---bash","outcome":"unknown"}');
    expect(details).not.toContain('internal-fingerprint');
    expect(details).not.toContain('ignore instructions');
  });

  it.each([true, false])('preserves submission authority through queued prompts (%s)', async (user) => {
    const ask = 'Consider the requested change';
    Object.assign(task, { isPromptRunning: () => true });
    mockEventManager.sendQueuedPromptsUpdated = vi.fn();
    vi.spyOn(task, 'addLogMessage').mockImplementation(() => {});
    vi.spyOn(task, 'addUserMessage').mockImplementation(() => {});
    await task.runPrompt(ask, 'agent', true, 'queued-message', true, undefined, user);
    const run = vi.spyOn(task, 'runPrompt').mockResolvedValue([]);
    await Reflect.get(task, 'runNextQueuedPrompt').call(task);
    expect(run).toHaveBeenCalledExactlyOnceWith(ask, 'agent', true, 'queued-message', false, undefined, user);
  });

  it('does not let another task answer a pending Plan question', async () => {
    Object.assign(task, { isPromptRunning: () => true, currentQuestion: { text: 'Choose a project option' } });
    const answer = vi.spyOn(task, 'answerQuestion').mockResolvedValue(true);
    mockEventManager.sendQueuedPromptsUpdated = vi.fn();
    await task.runPrompt('Use the second choice', 'agent', false);
    expect(answer).not.toHaveBeenCalled();
    expect(task.getQueuedPrompts()[0]?.text).toBe('Use the second choice');
  });

  it('refuses a stale plan approval and keeps the current proposal available when admission is blocked', async () => {
    const plan = { id: 'plan-current', markdown: 'Exact approved text', directory: baseDir, turnId: 'old-plan-turn', taskId };
    task.task.metadata = { pendingPlan: plan };
    Object.assign(task, { isPromptRunning: () => false });
    vi.spyOn(task, 'addLogMessage').mockImplementation(() => {});
    vi.spyOn(task, 'getTaskAgentProfile').mockResolvedValue({ id: 'fixture' } as never);
    const runUserPrompt = vi.fn().mockResolvedValue([]);
    Object.assign(task, { runUserPrompt });
    await task.runPrompt('/plan implement plan-stale', 'agent', true, undefined, true, undefined, true);
    expect(runUserPrompt).not.toHaveBeenCalled();
    await task.runPrompt('/plan implement plan-current', 'agent', true, undefined, true, undefined, true);
    expect(runUserPrompt).toHaveBeenCalledExactlyOnceWith('Implement the plan.', 'agent', true, expect.any(String), true, undefined, plan.id);
    expect(task.task.metadata.pendingPlan).toEqual(plan);
  });

  describe('ordinary Agent goals', () => {
    afterEach(() => vi.restoreAllMocks());
    const bindVerification = (revision?: string) => {
      vi.spyOn(goalVerification, 'resolveGoalVerificationScope').mockResolvedValue({ root: baseDir, directory: baseDir });
      return vi.spyOn(goalVerification, 'goalWorktreeRevision').mockResolvedValue(revision);
    };

    const bindGoal = (initial: AgentGoal) => {
      let goal: AgentGoal | null = initial;
      const store = {
        read: vi.fn(async () => goal),
        mutate: vi.fn(async (update: (current: AgentGoal | null) => AgentGoal | null) => (goal = update(goal))),
      };
      Object.assign(task, { agentGoalStore: store });
      return store;
    };

    it.each(['pause', 'clear'])('stops a goal controller created just before the queued %s mutation', async (action) => {
      const initial = newAgentGoal('Finish the current work');
      const controller = new AbortController();
      let record: AgentGoal | null = initial;
      const store = {
        mutate: vi.fn(async (update: (current: AgentGoal | null) => AgentGoal | null) => {
          Object.assign(task, { agentGoalTurnController: controller });
          record = update(record);
          return record;
        }),
      };
      Object.assign(task, { agentGoalStore: store });
      vi.spyOn(task, 'addLogMessage').mockImplementation(() => {});
      await task.runPrompt(`/goal ${action}`, 'agent', true, undefined, true, undefined, true);
      expect(controller.signal.aborted).toBe(true);
      expect(record?.status ?? null).toBe(action === 'pause' ? 'paused' : null);
    });

    it('recovers a running root turn left behind by a hard process exit before scheduling new work', async () => {
      const goal = newAgentGoal('Finish the verified operation');
      const record = {
        turnId: 'running-turn',
        directory: baseDir,
        profileId: 'profile',
        provider: 'provider',
        model: 'model',
        goalId: goal.id,
        state: 'running',
        messages: [],
      };
      task.task.metadata = { recoverableRootTurn: record.turnId };
      task.task.state = DefaultTaskState.InProgress;
      const profile = { id: 'profile', provider: 'provider', model: 'model' } as Awaited<ReturnType<Task['getTaskAgentProfile']>>;
      vi.spyOn(task, 'getTaskAgentProfile').mockResolvedValue(profile);
      Object.assign(task, { readRootTurn: () => Promise.resolve(record), isPromptRunning: () => false });
      const saveTask = vi.spyOn(task, 'saveTask').mockImplementation(async (updates) => Object.assign(task.task, updates));
      expect((await task.workListData()).state).toBe(DefaultTaskState.Interrupted);
      expect(task.task.state).toBe(DefaultTaskState.InProgress);
      expect(saveTask).not.toHaveBeenCalled();
      await Reflect.get(task, 'reconcileInterruptedRootTurn').call(task);
      expect(saveTask).toHaveBeenCalledWith(expect.objectContaining({ state: DefaultTaskState.Interrupted }));
      expect(task.task.metadata.recoverableRootTurn).toBe(record.turnId);
    });

    it('admits a fresh turn without new user input and gives a queued prompt priority', async () => {
      const goal = newAgentGoal('Finish the requested change');
      bindGoal(goal);
      Object.assign(task, { initialized: true, getCurrentMode: () => 'agent', isPromptRunning: () => false });
      const profile = { id: 'profile', provider: 'provider', model: 'model' } as Awaited<ReturnType<Task['getTaskAgentProfile']>>;
      vi.spyOn(task, 'getTaskAgentProfile').mockResolvedValue(profile);
      const runAgent = vi.spyOn(task, 'runPromptInAgent').mockResolvedValue([]);
      const wake = Reflect.get(task, 'wakeAgentGoal').bind(task);
      const hasQueuedPrompts = vi.spyOn(task, 'hasQueuedPrompts').mockReturnValue(true);
      vi.spyOn(task, 'restoreAgentGoal').mockImplementation(() => undefined);
      await wake(0);
      expect(runAgent).not.toHaveBeenCalled();
      hasQueuedPrompts.mockReturnValue(false);
      await wake(0);
      expect(runAgent.mock.calls[0].slice(0, 4)).toEqual([profile, 'agent', null, { id: expect.any(String) }]);
      expect(runAgent.mock.calls[0].at(-1)).toMatchObject({ goal });
    });

    it('resumes accepted steering for the same goal before a queued follow-up', async () => {
      const goal = newAgentGoal('Finish the requested change');
      bindGoal(goal);
      Object.assign(task, { initialized: true, getCurrentMode: () => 'agent', isPromptRunning: () => false });
      task.task.state = DefaultTaskState.Interrupted;
      vi.spyOn(task, 'hasQueuedPrompts').mockReturnValue(true);
      vi.spyOn(task, 'getTaskAgentProfile').mockResolvedValue({ id: 'profile' } as never);
      const resume = vi.spyOn(task, 'resumeTask').mockResolvedValue(undefined);
      const checkpoint = {
        turnId: 'active-turn',
        goalId: goal.id,
        state: 'running',
        messages: [{ id: 'active-turn', role: 'user', content: 'Original request', promptContext: { id: 'active-turn' } }],
      };
      Object.assign(task, { readRootTurn: async () => checkpoint });
      const wake = Reflect.get(task, 'wakeAgentGoal').bind(task);

      await wake(0);
      expect(resume).not.toHaveBeenCalled();

      checkpoint.messages.push({ id: 'steer-id', role: 'user', content: 'Accepted correction', promptContext: { id: 'active-turn' } });
      await wake(0);
      expect(resume).toHaveBeenCalledTimes(1);
    });

    it('requires the native verifier and commits only after an admitted completion is persisted', async () => {
      bindVerification('verified-revision');
      const goal = newAgentGoal('Make the regression pass', 50, 'node verify.cjs');
      const store = bindGoal(goal);
      vi.spyOn(task, 'addLogMessage').mockImplementation(() => {});
      const turn = Reflect.get(task, 'createAgentGoalTurn').call(task, goal, 'first');
      await turn.acceptToolResult('irrelevant', await turn.beginVerification({ command: 'echo OK' }), { exitCode: 0 });
      await expect(turn.proposeCompletion('Premature', ['irrelevant'])).rejects.toThrow('successful verification');
      await turn.acceptToolResult('stale', await turn.beginVerification({ command: 'node verify.cjs' }), { exitCode: 0 });
      await turn.acceptToolResult('red', await turn.beginVerification({ command: 'node verify.cjs' }), { exitCode: 1 });
      await expect(turn.proposeCompletion('Premature', ['stale'])).rejects.toThrow('successful verification');
      await turn.acceptToolResult('green', await turn.beginVerification({ command: 'node verify.cjs' }), { exitCode: 0 });
      await turn.proposeCompletion('Regression passes', ['green']);
      await expect(store.read()).resolves.toMatchObject({ status: 'active' });
      await expect(turn.onUsage(21)).resolves.toBe(false);
      await expect(turn.commitCompletion()).resolves.toBe(true);
      await expect(store.read()).resolves.toMatchObject({ status: 'complete', tokensUsed: 21, evidence: { turnId: 'first', toolCallIds: ['green'] } });
    });

    it('limits an explicit budget and invalidates an older turn after pausing or editing', async () => {
      const goal = newAgentGoal('Check the actual outcome', 10);
      const store = bindGoal(goal);
      const createTurn = Reflect.get(task, 'createAgentGoalTurn').bind(task);
      const first = createTurn(goal, 'first');
      await store.mutate((current) => ({ ...current!, objective: 'New objective' }));
      await expect(first.canExecute()).resolves.toBe(false);
      const next = await store.read();
      const second = createTurn(next, 'second');
      await expect(second.onUsage(11)).resolves.toBe(false);
      await expect(store.read()).resolves.toMatchObject({ status: 'budget_limited', tokensUsed: 11 });
      await expect(second.canExecute()).resolves.toBe(false);
    });

    it('does not certify a named verifier when the checkout revision is unavailable', async () => {
      bindVerification();
      const goal = newAgentGoal('Verify the actual outcome', undefined, 'node verify.cjs');
      bindGoal(goal);
      const createTurn = Reflect.get(task, 'createAgentGoalTurn').bind(task);
      const turn = createTurn(goal, 'first');
      await turn.acceptToolResult('native-exit-zero', await turn.beginVerification({ command: 'node verify.cjs' }), { exitCode: 0 });

      expect(turn.getAvailableVerification()).toEqual([]);
      await expect(turn.proposeCompletion('Unbound verifier', ['native-exit-zero'])).rejects.toThrow('successful verification');
    });

    it('does not accept exit zero when the native Node runner executed no tests', async () => {
      bindVerification('known-digest');
      const goal = newAgentGoal('Run the project tests', undefined, 'node --test');
      bindGoal(goal);
      const turn = Reflect.get(task, 'createAgentGoalTurn').call(task, goal, 'first');
      const verifier = await turn.beginVerification({ command: 'node --test' });
      await turn.acceptToolResult('empty-run', verifier, { exitCode: 0, stdout: 'ℹ tests 0\nℹ suites 0\nℹ pass 0\nℹ fail 0\nℹ skipped 0\n' });

      expect(turn.getAvailableVerification()).toEqual([]);
      await expect(turn.proposeCompletion('No tests actually ran', ['empty-run'])).rejects.toThrow('successful verification');
    });

    it('rejects an unattributed npm result but admits the same test with its own lifecycle report', async () => {
      bindVerification('a'.repeat(64));
      const goal = newAgentGoal('Run the project tests');
      bindGoal(goal);
      const turn = Reflect.get(task, 'createAgentGoalTurn').call(task, goal, 'first');
      const report = '# tests 1\n# suites 0\n# pass 1\n';
      const quiet = await turn.beginVerification({ command: 'npm test --silent' });
      await turn.acceptToolResult('quiet', quiet, { exitCode: 0, stdout: report });
      expect(turn.getAvailableVerification()).toEqual([]);
      await expect(turn.proposeCompletion('The hook passed', ['quiet'])).rejects.toThrow('npm lifecycle');

      const visible = await turn.beginVerification({ command: 'npm test' });
      await turn.acceptToolResult('test', visible, { exitCode: 0, stdout: '> fixture@1.0.0 test\n> node --test\n' + report });
      expect(turn.getAvailableVerification()).toEqual([{ toolCallId: 'test', command: 'npm test' }]);
    });

    it.each([
      { hasBanner: false, marker: undefined, restoredCount: 0 },
      { hasBanner: true, marker: undefined, restoredCount: 1 },
      { hasBanner: false, marker: true as const, restoredCount: 1 },
    ])('rechecks npm receipts without a stored attribution ($hasBanner, $marker)', async ({ hasBanner, marker, restoredCount }) => {
      const revision = 'a'.repeat(64);
      bindVerification(revision);
      const command = 'npm test';
      const goal = newAgentGoal('Run the project tests', undefined, command);
      bindGoal(goal);
      const record: RootTurnRecord = {
        turnId: 'same-turn',
        directory: baseDir,
        goalId: goal.id,
        profileId: 'profile',
        provider: 'provider',
        model: 'model',
        state: 'running',
        messages: [],
        unmergedReceipts: [
          {
            id: 'native-test',
            name: 'power---bash',
            fingerprint: 'native-test',
            input: JSON.stringify({ command }),
            output: JSON.stringify({ exitCode: 0, stdout: (hasBanner ? '> fixture@1.0.0 test\n> node --test\n' : '') + '# tests 1\n# suites 0\n# pass 1\n' }),
          },
        ],
      };
      expect(
        rememberGoalVerification(record, {
          goalId: goal.id,
          binding: goalVerificationBinding(goal),
          command,
          isCurrent: () => true,
          receipt: { toolCallId: 'native-test', command, revision, root: baseDir, npmScriptIdentified: marker },
        }),
      ).toBe(true);

      const restored = await Reflect.get(task, 'recoverGoalVerification').call(task, goal, record);
      expect(restored).toHaveLength(restoredCount);
    });

    it.each([
      { command: 'jest --listTests --runInBand', stdout: 'suite.test.js\n', stderr: '', count: 0 },
      { command: 'jest --runInBand', stdout: '', stderr: 'Tests: 1 skipped, 1 total\n', count: 0 },
      { command: 'jest --runInBand', stdout: '', stderr: 'Tests: 1 failed, 1 passed, 2 total\n', count: 0 },
      {
        command: 'python -m unittest',
        stdout: '',
        stderr: 'x\n----------------------------------------------------------------------\nRan 1 test in 0.000s\n\nOK (expected failures=1)\n',
        count: 0,
      },
      { command: 'npm test', stdout: '> fixture@1.0.0 test\n> jest --runInBand\n', stderr: 'Tests: 1 skipped, 1 total\n', count: 0 },
      { command: 'jest --runInBand', stdout: '', stderr: 'Tests: 1 passed, 1 total\n', count: 1 },
    ])('rechecks the recovered $command result with $count valid receipt', async ({ command, stdout, stderr, count }) => {
      const revision = 'a'.repeat(64);
      bindVerification(revision);
      const goal = newAgentGoal('Run the project tests', undefined, command);
      bindGoal(goal);
      const record: RootTurnRecord = {
        turnId: 'same-turn',
        directory: baseDir,
        goalId: goal.id,
        profileId: 'profile',
        provider: 'provider',
        model: 'model',
        state: 'running',
        messages: [],
        unmergedReceipts: [
          {
            id: 'native-test',
            name: 'power---bash',
            fingerprint: 'native-test',
            input: JSON.stringify({ command }),
            output: JSON.stringify({ exitCode: 0, stdout, stderr }),
          },
        ],
      };
      expect(
        rememberGoalVerification(record, {
          goalId: goal.id,
          binding: goalVerificationBinding(goal),
          command,
          isCurrent: () => true,
          receipt: { toolCallId: 'native-test', command, revision, root: baseDir, npmScriptIdentified: command === 'npm test' ? true : undefined },
        }),
      ).toBe(true);

      const restored = await Reflect.get(task, 'recoverGoalVerification').call(task, goal, record);
      expect(restored).toHaveLength(count);
    });

    it.each([
      'unchanged',
      'different checkout',
      'changed revision',
      'different goal',
      'later failure',
      'unfinished tool',
      'pending steering',
      'superseded write',
      'steering while saving',
      'missing admission',
      'missing output',
    ])('only restores a proven native result after resuming the same turn (%s)', async (scenario) => {
      const revision = 'a'.repeat(64);
      const command = 'node --test';
      const getRevision = bindVerification(revision);
      const goal = newAgentGoal('Verify the completed project tests', undefined, command);
      const store = bindGoal(goal);
      vi.spyOn(task, 'addLogMessage').mockImplementation(() => {});
      const record: RootTurnRecord = {
        turnId: 'same-turn',
        directory: baseDir,
        goalId: goal.id,
        profileId: 'profile',
        provider: 'provider',
        model: 'model',
        state: 'running',
        messages: [],
      };
      const createTurn = Reflect.get(task, 'createAgentGoalTurn').bind(task);
      const turn = createTurn(goal, record.turnId);
      const saveVerification = async (update: GoalVerificationUpdate) => {
        expect(turn.getAvailableVerification()).toEqual([]);
        if (scenario === 'superseded write') {
          turn.invalidateVerification();
        }
        if (scenario === 'steering while saving') {
          record.pendingSteering = [{ id: 'new-steering', role: 'user', content: 'Recheck the goal criteria', promptContext: { id: record.turnId } }];
        }
        const admitted = rememberGoalVerification(record, update);
        reconcileTurnProgress(record, {
          receipt: {
            id: update.receipt?.toolCallId ?? 'native-failure',
            name: 'power---bash',
            fingerprint: 'native-verifier-fingerprint',
            input: JSON.stringify({ command }),
            output: JSON.stringify({ exitCode: update.receipt ? 0 : 1 }),
          },
        });
        return admitted;
      };
      await turn.acceptToolResult('native-pass', await turn.beginVerification({ command }), { exitCode: 0 }, undefined, saveVerification);
      const shouldPublish = scenario !== 'superseded write' && scenario !== 'steering while saving';
      expect(turn.getAvailableVerification()).toEqual(shouldPublish ? [{ toolCallId: 'native-pass', command }] : []);
      expect(record.unmergedReceipts?.map(({ id }) => id)).toEqual(['native-pass']);

      let current = goal;
      if (scenario === 'different checkout') {
        vi.mocked(goalVerification.resolveGoalVerificationScope).mockResolvedValue({ root: '/another/project', directory: '/another/project' });
      } else if (scenario === 'changed revision') {
        getRevision.mockResolvedValue('b'.repeat(64));
      } else if (scenario === 'different goal') {
        current = { ...goal, objective: 'Check a different scope' };
        await store.mutate(() => current);
      } else if (scenario === 'later failure') {
        await turn.acceptToolResult('native-failure', await turn.beginVerification({ command }), { exitCode: 1 }, undefined, saveVerification);
        expect(record.unmergedReceipts?.map(({ id }) => id)).toEqual(['native-pass', 'native-failure']);
      } else if (scenario === 'unfinished tool') {
        record.pendingTools = [{ id: 'pending', name: 'power---bash' }];
      } else if (scenario === 'pending steering') {
        record.pendingSteering = [{ id: 'steer', role: 'user', content: 'Change what this turn should verify', promptContext: { id: record.turnId } }];
      } else if (scenario === 'missing admission') {
        delete record.goalVerification;
      } else if (scenario === 'missing output') {
        record.unmergedReceipts = [];
      }

      const restored = await Reflect.get(task, 'recoverGoalVerification').call(task, current, record);
      const resumed = createTurn(current, record.turnId, restored);
      if (scenario === 'unchanged') {
        expect(resumed.getAvailableVerification()).toEqual([{ toolCallId: 'native-pass', command }]);
        await resumed.proposeCompletion('Use the original confirmed verification', ['native-pass']);
        await expect(resumed.commitCompletion()).resolves.toBe(true);
      } else {
        expect(resumed.getAvailableVerification()).toEqual([]);
        await expect(resumed.proposeCompletion('Old verification', ['native-pass'])).rejects.toThrow('successful verification');
      }
    });

    it('does not re-admit an older receipt after the same command fails and then passes', async () => {
      const command = 'node --test';
      bindVerification('verified-revision');
      const goal = newAgentGoal('Verify only the actual tests', undefined, command);
      bindGoal(goal);
      const turn = Reflect.get(task, 'createAgentGoalTurn').call(task, goal, 'turn');
      await turn.acceptToolResult('old-pass', await turn.beginVerification({ command }), { exitCode: 0 });
      await turn.proposeCompletion('First result', ['old-pass']);
      await turn.acceptToolResult('later-failure', await turn.beginVerification({ command }), { exitCode: 1 });
      await turn.acceptToolResult('new-pass', await turn.beginVerification({ command }), { exitCode: 0 });
      expect(turn.getAvailableVerification()).toEqual([{ toolCallId: 'new-pass', command }]);
      await expect(turn.commitCompletion()).resolves.toBe(false);
      await expect(turn.proposeCompletion('Revoked result', ['old-pass'])).rejects.toThrow('successful verification');
    });

    it('uses the native report when the displayed Node output contains an earlier empty report', async () => {
      bindVerification('known-digest');
      const goal = newAgentGoal('Run the project tests', undefined, 'node --test');
      bindGoal(goal);
      const turn = Reflect.get(task, 'createAgentGoalTurn').call(task, goal, 'first');
      const verifier = await turn.beginVerification({ command: 'node --test' });
      await turn.acceptToolResult('passed-run', verifier, {
        exitCode: 0,
        stdout: 'ℹ tests 0\nℹ suites 0\nℹ pass 0\n',
        [goalVerification.NATIVE_EMPTY_TEST_REPORT]: false,
      });

      await expect(turn.proposeCompletion('The actual test passed', ['passed-run'])).resolves.toContain('Verification received');
    });

    it('does not publish completion for a different checkout with the same digest', async () => {
      bindVerification('same-digest');
      const goal = newAgentGoal('Verify the actual outcome', undefined, 'node verify.cjs');
      const store = bindGoal(goal);
      const turn = Reflect.get(task, 'createAgentGoalTurn').call(task, goal, 'first');
      await turn.acceptToolResult('original-check', await turn.beginVerification({ command: 'node verify.cjs' }), { exitCode: 0 });
      await turn.proposeCompletion('Verified in original checkout', ['original-check']);
      vi.mocked(goalVerification.resolveGoalVerificationScope).mockResolvedValue({ root: '/another/project', directory: '/another/project' });

      await expect(turn.commitCompletion()).resolves.toBe(false);
      await expect(store.read()).resolves.toMatchObject({ status: 'active' });
    });

    it('rejects shell success without a check and revokes a staged completion when a later tool can mutate files', async () => {
      bindVerification('verified-revision');
      const first = newAgentGoal('Make the regression pass');
      const store = bindGoal(first);
      const createTurn = Reflect.get(task, 'createAgentGoalTurn').bind(task);
      const automatic = createTurn(first, 'automatic');
      await automatic.acceptToolResult('irrelevant', await automatic.beginVerification({ command: 'echo OK' }), { exitCode: 0 });
      await expect(automatic.proposeCompletion('Premature', ['irrelevant'])).rejects.toThrow('successful verification');

      const explicit = { ...first, verifier: 'node verify.cjs' };
      await store.mutate(() => explicit);
      const bound = createTurn(explicit, 'explicit');
      await bound.acceptToolResult('check', await bound.beginVerification({ command: 'node verify.cjs' }), { exitCode: 0 });
      await bound.proposeCompletion('Verified result', ['check']);
      bound.invalidateVerification();
      await expect(bound.commitCompletion()).resolves.toBe(false);
      await expect(store.read()).resolves.toMatchObject({ status: 'active' });
    });
    it('rejects a Python verification with only skipped tests when native report metadata is absent', async () => {
      const command = 'python -m unittest discover';
      bindVerification('known-digest');
      const goal = newAgentGoal('Run the project tests', undefined, command);
      bindGoal(goal);
      const turn = Reflect.get(task, 'createAgentGoalTurn').call(task, goal, 'first');
      await turn.acceptToolResult('skipped-run', await turn.beginVerification({ command }), {
        exitCode: 0,
        stderr: 'ss\n----------------------------------------------------------------------\nRan 2 tests in 0.000s\n\nOK (skipped=2)\n',
      });

      await expect(turn.proposeCompletion('The suite ran', ['skipped-run'])).rejects.toThrow('successful verification');
    });
  });

  describe('skill activation deduplication', () => {
    it('should keep only the most recent activation when the same skill is activated multiple times', () => {
      const contextMessages: ContextMessage[] = [
        // First activation of skill-a
        createAssistantMessage('msg-1', createSkillToolCall('skill-a', 'call-1')),
        createToolMessage('msg-2', createSkillToolResult('call-1', 'First activation')),
        // Second activation of skill-a (should be kept)
        createAssistantMessage('msg-3', createSkillToolCall('skill-a', 'call-2')),
        createToolMessage('msg-4', createSkillToolResult('call-2', 'Second activation')),
      ];

      const result = (task as any).findSkillActivationMessages(contextMessages);

      // Should return only 2 messages (assistant + tool) for the most recent activation
      expect(result).toHaveLength(2);

      // Check that the result contains the second activation (most recent)
      const assistantMsg = result.find((m: ContextMessage) => m.role === 'assistant');
      const toolMsg = result.find((m: ContextMessage) => m.role === 'tool');

      expect(assistantMsg).toBeDefined();
      expect(toolMsg).toBeDefined();
      expect(assistantMsg?.id).toBe('msg-3');
      expect(toolMsg?.id).toBe('msg-4');

      // Verify the tool call has the correct skill name
      const toolCall = (assistantMsg?.content as ToolCallPart[])[0] as ToolCallPart;
      expect(toolCall.toolCallId).toBe('call-2');
      expect(toolCall.input).toEqual({ skill: 'skill-a' });
    });

    it('should preserve all different skills', () => {
      const contextMessages: ContextMessage[] = [
        // Activation of skill-a
        createAssistantMessage('msg-1', createSkillToolCall('skill-a', 'call-1')),
        createToolMessage('msg-2', createSkillToolResult('call-1', 'Skill A activated')),
        // Activation of skill-b
        createAssistantMessage('msg-3', createSkillToolCall('skill-b', 'call-2')),
        createToolMessage('msg-4', createSkillToolResult('call-2', 'Skill B activated')),
        // Activation of skill-c
        createAssistantMessage('msg-5', createSkillToolCall('skill-c', 'call-3')),
        createToolMessage('msg-6', createSkillToolResult('call-3', 'Skill C activated')),
      ];

      const result = (task as any).findSkillActivationMessages(contextMessages);

      // Should return 6 messages (3 skills × 2 messages each)
      expect(result).toHaveLength(6);

      // Verify all three skills are present
      const assistantMessages = result.filter((m: ContextMessage) => m.role === 'assistant');
      const toolMessages = result.filter((m: ContextMessage) => m.role === 'tool');

      expect(assistantMessages).toHaveLength(3);
      expect(toolMessages).toHaveLength(3);

      // Extract skill names from assistant messages
      const skillNames = assistantMessages.map((m: ContextMessage) => {
        const toolCall = (m.content as ToolCallPart[])[0] as ToolCallPart;
        return (toolCall.input as { skill: string }).skill;
      });

      expect(skillNames).toContain('skill-a');
      expect(skillNames).toContain('skill-b');
      expect(skillNames).toContain('skill-c');
    });

    it('should keep the most recent activation when multiple skills have duplicate activations', () => {
      const contextMessages: ContextMessage[] = [
        // First activation of skill-a
        createAssistantMessage('msg-1', createSkillToolCall('skill-a', 'call-1')),
        createToolMessage('msg-2', createSkillToolResult('call-1', 'First A')),
        // Activation of skill-b (only one)
        createAssistantMessage('msg-3', createSkillToolCall('skill-b', 'call-2')),
        createToolMessage('msg-4', createSkillToolResult('call-2', 'Skill B')),
        // Second activation of skill-b (should be kept)
        createAssistantMessage('msg-5', createSkillToolCall('skill-b', 'call-3')),
        createToolMessage('msg-6', createSkillToolResult('call-3', 'Second B')),
        // Second activation of skill-a (should be kept)
        createAssistantMessage('msg-7', createSkillToolCall('skill-a', 'call-4')),
        createToolMessage('msg-8', createSkillToolResult('call-4', 'Second A')),
      ];

      const result = (task as any).findSkillActivationMessages(contextMessages);

      // Should return 4 messages (2 skills × 2 messages each)
      expect(result).toHaveLength(4);

      const assistantMessages = result.filter((m: ContextMessage) => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(2);

      // Verify that the most recent activations are kept
      const skillNames = assistantMessages.map((m: ContextMessage) => {
        const toolCall = (m.content as ToolCallPart[])[0] as ToolCallPart;
        return (toolCall.input as { skill: string }).skill;
      });

      expect(skillNames).toContain('skill-a');
      expect(skillNames).toContain('skill-b');

      // Check that the correct messages (most recent) are kept for skill-a
      const skillAMessage = assistantMessages.find((m: ContextMessage) => ((m.content as ToolCallPart[])[0] as ToolCallPart).toolCallId === 'call-4');
      expect(skillAMessage?.id).toBe('msg-7');

      // Check that the correct messages (most recent) are kept for skill-b
      const skillBMessage = assistantMessages.find((m: ContextMessage) => ((m.content as ToolCallPart[])[0] as ToolCallPart).toolCallId === 'call-3');
      expect(skillBMessage?.id).toBe('msg-5');
    });
  });

  describe('edge cases', () => {
    it('should return empty array when no skill activation messages exist', () => {
      const contextMessages: ContextMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello world',
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there!',
        },
      ];

      const result = (task as any).findSkillActivationMessages(contextMessages);

      expect(result).toHaveLength(0);
    });

    it('should ignore tool calls that are not skill activations', () => {
      const contextMessages: ContextMessage[] = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'other-tool-group---other-tool',
              input: {},
            },
          ],
        },
        {
          id: 'msg-2',
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'other-tool-group---other-tool',
              output: {
                type: 'text',
                value: 'Other tool result',
              },
            },
          ],
        },
      ];

      const result = (task as any).findSkillActivationMessages(contextMessages);

      expect(result).toHaveLength(0);
    });

    it('should handle missing skill name in tool call input', () => {
      const contextMessages: ContextMessage[] = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: `${SKILLS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}${SKILLS_TOOL_ACTIVATE_SKILL}`,
              input: {}, // Missing skill property
            },
          ],
        },
        {
          id: 'msg-2',
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: `${SKILLS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}${SKILLS_TOOL_ACTIVATE_SKILL}`,
              output: {
                type: 'text',
                value: 'Skill activation result',
              },
            },
          ],
        },
      ];

      const result = (task as any).findSkillActivationMessages(contextMessages);

      expect(result).toHaveLength(0);
    });

    it('should handle missing tool result message', () => {
      const contextMessages: ContextMessage[] = [
        // Assistant message with skill activation but no corresponding tool result
        createAssistantMessage('msg-1', createSkillToolCall('skill-a', 'call-1')),
      ];

      const result = (task as any).findSkillActivationMessages(contextMessages);

      expect(result).toHaveLength(0);
    });

    it('should handle assistant messages with non-array content', () => {
      const contextMessages: ContextMessage[] = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'Just text, not array',
        },
      ];

      const result = (task as any).findSkillActivationMessages(contextMessages);

      expect(result).toHaveLength(0);
    });

    it('should preserve promptContext in filtered messages', () => {
      const promptContext = { id: 'prompt-123' };

      const contextMessages: ContextMessage[] = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: [createSkillToolCall('skill-a', 'call-1')],
          promptContext,
        },
        createToolMessage('msg-2', createSkillToolResult('call-1')),
      ];

      const result = (task as any).findSkillActivationMessages(contextMessages);

      const assistantMsg = result.find((m: ContextMessage) => m.role === 'assistant');
      expect(assistantMsg?.promptContext).toEqual(promptContext);
    });

    it('should handle empty contextMessages array', () => {
      const result = (task as any).findSkillActivationMessages([]);

      expect(result).toHaveLength(0);
    });

    it('should filter assistant message to only contain the skill activation tool-call', () => {
      const contextMessages: ContextMessage[] = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: [
            createSkillToolCall('skill-a', 'call-1'),
            {
              type: 'tool-call',
              toolCallId: 'call-2',
              toolName: 'other-tool---other-action',
              input: {},
            },
          ],
        },
        createToolMessage('msg-2', createSkillToolResult('call-1')),
      ];

      const result = (task as any).findSkillActivationMessages(contextMessages);

      const assistantMsg = result.find((m: ContextMessage) => m.role === 'assistant');
      expect(assistantMsg?.content).toHaveLength(1);

      const toolCall = (assistantMsg?.content as ToolCallPart[])[0] as ToolCallPart;
      expect(toolCall.toolCallId).toBe('call-1');
    });

    it('should filter tool message to only contain the skill activation tool-result', () => {
      const contextMessages: ContextMessage[] = [
        createAssistantMessage('msg-1', createSkillToolCall('skill-a', 'call-1')),
        {
          id: 'msg-2',
          role: 'tool',
          content: [
            createSkillToolResult('call-1'),
            {
              type: 'tool-result',
              toolCallId: 'call-2',
              toolName: 'other-tool---other-action',
              output: {
                type: 'text',
                value: 'Other tool result',
              },
            },
          ],
        },
      ];

      const result = (task as any).findSkillActivationMessages(contextMessages);

      const toolMsg = result.find((m: ContextMessage) => m.role === 'tool');
      expect(toolMsg?.content).toHaveLength(1);

      const toolResult = (toolMsg?.content as ToolResultPart[])[0] as ToolResultPart;
      expect(toolResult.toolCallId).toBe('call-1');
    });
  });

  describe('resumeTask', () => {
    it.each(['paused', 'budget_limited'] as const)('handles a stopped goal with status %s through the work shortcut', async (status) => {
      let goal: AgentGoal = { ...newAgentGoal('Finish the assigned work'), status };
      const record: RootTurnRecord = {
        turnId: 'stopped-work',
        directory: baseDir,
        profileId: 'profile',
        provider: 'provider',
        model: 'model',
        state: 'running',
        mode: 'agent',
        messages: [],
        goalId: goal.id,
      };
      task.task.state = DefaultTaskState.Interrupted;
      task.task.metadata = { recoverableRootTurn: record.turnId };
      Object.assign(task, {
        readRootTurn: async () => record,
        agentGoalStore: { read: async () => goal, mutate: async (update: (value: AgentGoal) => AgentGoal) => (goal = update(goal)) },
        finishAgentGoalTurn: async () => undefined,
      });
      vi.spyOn(task, 'isPromptRunning').mockReturnValue(false);
      vi.spyOn(task, 'hasQueuedPrompts').mockReturnValue(false);
      vi.spyOn(task, 'getTaskAgentProfile').mockResolvedValue({ id: 'profile', provider: 'provider', model: 'model' } as never);
      vi.spyOn(task, 'restoreAgentGoal').mockImplementation(() => undefined);
      const run = vi.spyOn(task, 'runPromptInAgent').mockResolvedValue([]);
      if (status === 'budget_limited') {
        await expect(task.resumeWork()).rejects.toThrow('budget');
      } else {
        await task.resumeWork();
      }
      expect(goal.status).toBe(status === 'paused' ? 'active' : status);
      expect(run).toHaveBeenCalledTimes(status === 'paused' ? 1 : 0);
      if (status === 'paused') {
        expect(record.pendingSteering).toEqual([expect.objectContaining({ content: expect.stringContaining('piano di ripresa') })]);
      }
    });

    it('retries a failed checkpoint clear after storage recovers', async () => {
      vi.spyOn(task, 'isPromptRunning').mockReturnValue(false);
      const disk: RootTurnRecord = {
        turnId: 'stopped',
        directory: baseDir,
        profileId: 'profile',
        provider: 'provider',
        model: 'model',
        state: 'running',
        mode: 'agent',
        messages: [],
        noProgress: { revision: 'same', fingerprints: ['hash'], tools: ['power---file_read'] },
      };
      const save = vi.fn().mockRejectedValueOnce(new Error('Temporary storage failure')).mockResolvedValue(undefined);
      Object.assign(task, { readRootTurn: async () => structuredClone(disk), saveRootTurn: save, agentGoalStore: { read: async () => null } });
      task.task.state = DefaultTaskState.Interrupted;
      task.task.metadata = { recoverableRootTurn: disk.turnId };
      vi.spyOn(task, 'getTaskAgentProfile').mockResolvedValue({ id: 'profile', provider: 'provider', model: 'model' } as never);
      const run = vi.spyOn(task, 'runPromptInAgent').mockResolvedValue([]);
      await expect(task.resumeTask(undefined, true)).rejects.toThrow('Temporary storage failure');
      expect(run).not.toHaveBeenCalled();
      expect(Reflect.get(task, 'rootTurnInUse')).toBe(false);
      await task.resumeTask(undefined, true);
      expect(save).toHaveBeenCalledTimes(2);
      expect(run).toHaveBeenCalledTimes(1);
    });

    it.each(['root', 'directory', 'epoch', 'profile'])('does not resume a stale %s after waiting for a source revision', async (changed) => {
      vi.spyOn(task, 'isPromptRunning').mockReturnValue(false);
      const root: RootTurnRecord = {
        turnId: 'old-turn',
        directory: baseDir,
        profileId: 'profile',
        provider: 'provider',
        model: 'model',
        state: 'running',
        mode: 'agent',
        messages: [],
        noProgress: { revision: 'old-source', fingerprints: ['hash'], tools: ['power---file_read'] },
      };
      Object.assign(task, { readRootTurn: async () => root, agentGoalStore: { read: async () => null } });
      task.task.state = DefaultTaskState.Interrupted;
      task.task.metadata = { recoverableRootTurn: root.turnId };
      const getProfile = vi.spyOn(task, 'getTaskAgentProfile').mockResolvedValue({ id: 'profile', provider: 'provider', model: 'model' } as never);
      const save = vi.spyOn(task as unknown as { saveRootTurn: (value: unknown) => Promise<void> }, 'saveRootTurn').mockResolvedValue(undefined);
      const revoke = vi.spyOn(hostExecution, 'revokeHostExecutionGrant');
      let resolveRevision!: (revision: string) => void;
      const revision = vi.spyOn(goalVerification, 'goalWorktreeRevision').mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolveRevision = resolve;
          }),
      );
      try {
        const resumed = task.resumeTask();
        await vi.waitFor(() => expect(resolveRevision).toBeTypeOf('function'));
        if (changed === 'root') {
          task.task.metadata.recoverableRootTurn = 'newer-turn';
        }
        if (changed === 'directory') {
          vi.spyOn(task, 'getTaskDir').mockReturnValue('/another-worktree');
        }
        if (changed === 'epoch') {
          task.task.metadata.workerEpoch = 'new-epoch';
        }
        if (changed === 'profile') {
          getProfile.mockResolvedValue({ id: 'other-profile', provider: 'provider', model: 'model' } as never);
        }
        resolveRevision('different-source');
        await resumed;
        expect(save).not.toHaveBeenCalled();
        expect(revoke).not.toHaveBeenCalled();
        expect(root.noProgress).toBeDefined();
      } finally {
        revoke.mockRestore();
        revision.mockRestore();
      }
    });

    it('does not run an old goal edited while its stop checkpoint is being cleared', async () => {
      vi.spyOn(task, 'isPromptRunning').mockImplementation(() => Reflect.get(task, 'rootTurnInUse'));
      const initial = newAgentGoal('Original objective');
      let current = initial;
      const root: RootTurnRecord = {
        turnId: 'stopped-turn',
        directory: baseDir,
        profileId: 'profile',
        provider: 'provider',
        model: 'model',
        state: 'running',
        mode: 'agent',
        messages: [],
        goalId: initial.id,
        noProgress: { revision: 'same', fingerprints: ['hash'], tools: ['power---file_read'], goalBinding: goalVerificationBinding(initial) },
      };
      let finishWrite!: () => void;
      const save = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishWrite = resolve;
          }),
      );
      Object.assign(task, {
        readRootTurn: async () => root,
        saveRootTurn: save,
        agentGoalStore: { read: async () => current, mutate: async (update: (goal: AgentGoal) => AgentGoal) => (current = update(current)) },
      });
      task.task.state = DefaultTaskState.Interrupted;
      task.task.metadata = { recoverableRootTurn: root.turnId };
      vi.spyOn(task, 'getTaskAgentProfile').mockResolvedValue({ id: 'profile', provider: 'provider', model: 'model' } as never);
      const run = vi.spyOn(task, 'runPromptInAgent').mockResolvedValue([]);
      const restore = vi.spyOn(task, 'restoreAgentGoal').mockImplementation(() => undefined);
      const resumed = task.resumeTask(undefined, true);
      await vi.waitFor(() => expect(finishWrite).toBeTypeOf('function'));
      expect(Reflect.get(task, 'rootTurnInUse')).toBe(true);
      current = { ...initial, objective: 'New objective' };
      finishWrite();
      await resumed;
      expect(run).not.toHaveBeenCalled();
      expect(Reflect.get(task, 'rootTurnInUse')).toBe(false);
      expect(restore).toHaveBeenCalled();
      Object.assign(task, { initialized: true, getCurrentMode: () => 'agent' });
      await Reflect.get(task, 'wakeAgentGoal').call(task, 0);
      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0].at(-1)).toMatchObject({ goal: { objective: 'New objective' } });
    });

    it.each(['subagent', 'git', 'plannotator'])('gives a standalone %s its own native consent while a different parent work is active', async (entry) => {
      const desktop = vi.spyOn(appRuntime, 'isElectron').mockReturnValue(true);
      const nativeFs = fsNative as unknown as { realpath: (value: unknown) => Promise<string> };
      const priorRealpath = nativeFs.realpath;
      nativeFs.realpath = async (value) => String(value);
      const priorFocus = BrowserWindow.getFocusedWindow;
      BrowserWindow.getFocusedWindow = () => null;
      const priorDialog = dialog.showMessageBox;
      const confirm = vi.fn<typeof dialog.showMessageBox>(async () => ({ response: 1, checkboxChecked: false }));
      dialog.showMessageBox = confirm as unknown as typeof dialog.showMessageBox;
      const profile = { id: 'profile', provider: 'provider', model: 'model' } as never;
      vi.spyOn(task, 'getTaskAgentProfile').mockResolvedValue(profile);
      vi.spyOn(task, 'saveTask').mockImplementation(async (changes) => Object.assign(task.task, changes));
      vi.spyOn(task, 'addLogMessage').mockImplementation(() => {});
      mockExtensionManager.dispatchEvent = vi.fn(async (_name, event) => event);
      mockPromptsManager.getGitErrorResolutionSystemPrompt = vi.fn(async () => 'system');
      mockPromptsManager.getGitErrorResolutionPrompt = vi.fn(async () => 'Resolve the Git error');
      mockStore.getSettings.mockReturnValue({ taskSettings: {} });
      Object.assign(task, { sendRequestContextInfo: vi.fn(), sendTaskGitStatusUpdated: vi.fn(), sendUpdatedFilesUpdated: vi.fn(), sendSkillsUpdated: vi.fn() });
      const manager = (task as unknown as { contextManager: { save: () => Promise<void> } }).contextManager;
      vi.spyOn(manager, 'save').mockResolvedValue(undefined);
      Object.assign(task, {
        agent: {
          runAgent: vi.fn(async () => {
            expect(await hostExecution.authorizeUnconfinedHostExecution(task)).toBe(true);
            return [];
          }),
        },
        lastGitError: { action: 'pull', message: 'conflict' },
      });
      hostExecution.setHostExecutionWork(task, { id: 'parent', objective: 'Different parent objective' });
      try {
        expect(await hostExecution.withRootHostExecutionWork(task, () => hostExecution.authorizeUnconfinedHostExecution(task))).toBe(true);
        if (entry === 'subagent') {
          await task.runSubagent(profile, 'Independent investigation', [], [], undefined, undefined, { id: 'standalone' });
        } else if (entry === 'plannotator') {
          await task.runPromptInAgent(profile, 'plannotator', 'Execute the approved extension plan', { id: 'extension-work' }, [], [], undefined, false, false);
        } else {
          await task.resolveGitErrorWithAgent();
        }
        expect(confirm).toHaveBeenCalledTimes(2);
        expect(confirm.mock.calls[1][0]).toMatchObject({
          detail: expect.stringContaining(
            entry === 'subagent' ? 'Independent investigation' : entry === 'git' ? 'Resolve the Git error' : 'Execute the approved extension plan',
          ),
        });
        expect(await hostExecution.withRootHostExecutionWork(task, () => hostExecution.authorizeUnconfinedHostExecution(task))).toBe(true);
        expect(confirm).toHaveBeenCalledTimes(2);
      } finally {
        hostExecution.clearHostExecutionWork(task, true);
        desktop.mockRestore();
        nativeFs.realpath = priorRealpath;
        BrowserWindow.getFocusedWindow = priorFocus;
        dialog.showMessageBox = priorDialog;
      }
    });

    it('revokes and amends host authority before persisting accepted steering', async () => {
      const root: RootTurnRecord = {
        turnId: 'active-turn',
        directory: baseDir,
        profileId: 'profile',
        provider: 'provider',
        model: 'model',
        state: 'running',
        mode: 'agent',
        messages: [],
      };
      const amend = vi.spyOn(hostExecution, 'amendHostExecutionWork');
      const save = vi.fn(async () => {
        expect(amend).toHaveBeenCalledWith(task, 'Use the new test environment');
      });
      Object.assign(task, { rootTurnInUse: true, activeRootSteering: root, saveRootTurn: save });
      try {
        expect(await task.steerAgentTurn(root.turnId, 'user-change', 'Use the new test environment')).toBe(true);
        expect(save).toHaveBeenCalledTimes(1);
      } finally {
        amend.mockRestore();
      }
    });

    it('keeps a repeated-operation checkpoint incomplete even with assistant text', async () => {
      const goal = newAgentGoal('Fix and verify the bug');
      const goalTurn = {
        goal,
        signal: new AbortController().signal,
        canExecute: vi.fn(async () => true),
        readGoal: vi.fn(async () => goal),
        commitCompletion: vi.fn(async () => true),
      } as unknown as Parameters<Task['runPromptInAgent']>[12];
      const checkpoints: RootTurnRecord[] = [];
      Object.assign(task, {
        agent: {
          runAgent: vi.fn(async (...args: unknown[]) => {
            const progress = args[13] as (event: unknown) => Promise<void>;
            await progress({
              noProgress: { revision: 'same', fingerprints: ['repeated'], tools: ['power---file_read'], goalBinding: goalVerificationBinding(goal) },
            });
            return [{ id: 'final', role: 'assistant', content: 'A final-looking response' }];
          }),
        },
        saveRootTurn: async (record: RootTurnRecord) => {
          checkpoints.push(structuredClone(record));
        },
        sendRequestContextInfo: vi.fn(),
        sendTaskGitStatusUpdated: vi.fn(),
        sendUpdatedFilesUpdated: vi.fn(),
        sendSkillsUpdated: vi.fn(),
      });
      task.task.name = 'Fixture';
      mockStore.getSettings.mockReturnValue({ taskSettings: {} });
      vi.spyOn(task, 'saveTask').mockImplementation(async (changes) => Object.assign(task.task, changes));
      const manager = (task as unknown as { contextManager: { save: () => Promise<void> } }).contextManager;
      vi.spyOn(manager, 'save').mockResolvedValue(undefined);
      await task.runPromptInAgent(
        { id: 'profile', provider: 'provider', model: 'model' } as never,
        'agent',
        'Fix the bug',
        { id: 'stopped' },
        [],
        [],
        undefined,
        false,
        false,
        undefined,
        undefined,
        undefined,
        goalTurn,
      );
      expect(checkpoints.at(-1)).toMatchObject({ state: 'running', noProgress: { revision: 'same' } });
      expect(task.task.state).toBe(DefaultTaskState.Interrupted);
      expect(goalTurn?.commitCompletion).not.toHaveBeenCalled();
    });

    it('does not restart saved repetitions automatically, but accepts explicit resumption', async () => {
      vi.spyOn(task, 'isPromptRunning').mockReturnValue(false);
      const profile = { id: 'profile', provider: 'test-provider', model: 'test-model' } as never;
      const root: RootTurnRecord = {
        turnId: 'stopped-turn',
        directory: baseDir,
        profileId: 'profile',
        provider: 'test-provider',
        model: 'test-model',
        mode: 'agent',
        state: 'running',
        messages: [{ id: 'stopped-turn', role: 'user', content: 'Fix the bug' }],
        noProgress: { revision: 'same', fingerprints: ['repeated'], tools: ['power---file_read'] },
      };
      task.task.state = DefaultTaskState.Interrupted;
      task.task.metadata = { recoverableRootTurn: root.turnId };
      vi.spyOn(task, 'getTaskAgentProfile').mockResolvedValue(profile);
      vi.spyOn(task as unknown as { readRootTurn: () => Promise<unknown> }, 'readRootTurn').mockResolvedValue(root);
      vi.spyOn(task as unknown as { saveRootTurn: (record: unknown) => Promise<void> }, 'saveRootTurn').mockResolvedValue(undefined);
      vi.spyOn(goalVerification, 'goalWorktreeRevision').mockResolvedValue('same');
      vi.spyOn(task, 'addLogMessage').mockImplementation(() => undefined);
      const run = vi.spyOn(task, 'runPromptInAgent').mockResolvedValue([]);
      await task.resumeTask();
      expect(run).not.toHaveBeenCalled();
      expect(root.noProgress).toBeDefined();
      await task.resumeTask(undefined, true);
      expect(run).toHaveBeenCalledTimes(1);
      expect(root.noProgress).toBeUndefined();
    });

    it('restores the saved Plan mode after the selector changes', async () => {
      vi.spyOn(task, 'isPromptRunning').mockReturnValue(false);
      const profile = { id: 'profile', provider: 'test-provider', model: 'test-model' } as never;
      const root = {
        turnId: 'plan-turn',
        directory: baseDir,
        profileId: 'profile',
        provider: 'test-provider',
        model: 'test-model',
        mode: 'plan',
        state: 'running',
        messages: [{ id: 'plan-turn', role: 'user', content: 'Prepare a plan' }],
      };
      task.task.state = 'INTERRUPTED';
      task.task.currentMode = 'agent';
      task.task.metadata = { recoverableRootTurn: 'plan-turn' };
      mockExtensionManager.getModes = vi.fn(() => []);
      vi.spyOn(task, 'getTaskAgentProfile').mockResolvedValue(profile);
      vi.spyOn(task as unknown as { readRootTurn: () => Promise<unknown> }, 'readRootTurn').mockResolvedValue(root);
      vi.spyOn(task, 'addLogMessage').mockImplementation(() => undefined);
      const run = vi.spyOn(task, 'runPromptInAgent').mockResolvedValue([]);
      await task.resumeTask();
      expect(run).not.toHaveBeenCalled();
      mockExtensionManager.getModes.mockReturnValue([{ mode: { name: 'plan' } }]);
      await task.resumeTask();
      expect(run).toHaveBeenCalledWith(
        profile,
        'plan',
        null,
        { id: 'plan-turn' },
        root.messages,
        undefined,
        undefined,
        false,
        true,
        undefined,
        undefined,
        root,
      );
    });

    it('keeps the original command fingerprint after a yielded process exits through poll', () => {
      const record: RootTurnRecord = {
        turnId: 'turn',
        directory: baseDir,
        profileId: 'profile',
        provider: 'provider',
        model: 'model',
        messages: [],
        pendingTools: [{ id: 'yield', name: 'power---bash', processId: 'process', fingerprint: 'launch-fingerprint' }],
      };
      const receipt = { id: 'poll', name: 'power---bash_poll', fingerprint: 'poll-fingerprint', input: '{"processId":"process"}', output: '{"exitCode":0}' };
      rememberCompletedShell(record, receipt);
      reconcileTurnProgress(record, { receipt });
      expect(record.completedShellFingerprints).toEqual(['launch-fingerprint']);
    });

    it('records a steering input on the active root, keeping its client ID and image', async () => {
      const root: RootTurnRecord = {
        turnId: 'active-turn',
        directory: baseDir,
        profileId: 'profile',
        provider: 'provider',
        model: 'model',
        mode: 'agent',
        state: 'running',
        messages: [],
      };
      const saveRootTurn = vi.fn(async () => {});
      Object.assign(task, { rootTurnInUse: true, activeRootSteering: root, saveRootTurn });
      const image = 'data:image/png;base64,aW1hZ2U=';

      await expect(task.steerAgentTurn('other-turn', 'stale', 'Ignore the current request')).resolves.toBe(false);
      await expect(task.steerAgentTurn(root.turnId, 'client-id', 'Use this reference', [image])).resolves.toBe(true);
      await expect(task.steerAgentTurn(root.turnId, 'client-id', 'Use this reference', [image])).resolves.toBe(true);
      await expect(task.steerAgentTurn(root.turnId, 'client-id', 'Different input')).resolves.toBe(false);

      expect(saveRootTurn).toHaveBeenCalledTimes(1);
      expect(root.pendingSteering).toEqual([
        expect.objectContaining({
          id: 'client-id',
          role: 'user',
          content: [
            { type: 'text', text: 'Use this reference' },
            { type: 'file', data: 'aW1hZ2U=', mediaType: 'image/png' },
          ],
          promptContext: { id: root.turnId },
        }),
      ]);
      expect(root.messages).toEqual([]);
      expect(task.getQueuedPrompts()).toEqual([]);
    });

    it('orders steering accepted during a running step and closes admission at the final boundary', async () => {
      const root: RootTurnRecord = {
        turnId: 'active-turn',
        directory: baseDir,
        profileId: 'profile',
        provider: 'provider',
        model: 'model',
        mode: 'agent',
        state: 'running',
        messages: [{ id: 'initial-result', role: 'assistant', content: 'First sample' }],
      };
      const saveRootTurn = vi.fn<(root: RootTurnRecord) => Promise<void>>().mockResolvedValue(undefined);
      const activeTask = task as unknown as { activeRootSteering?: RootTurnRecord };
      Object.assign(activeTask, { rootTurnInUse: true, activeRootSteering: root, saveRootTurn });
      const drain = (task as unknown as { takeRootSteering: (root: RootTurnRecord, closeIfEmpty: boolean) => Promise<ContextMessage[]> }).takeRootSteering.bind(
        task,
      );
      const closeIfEmpty = (task as unknown as { closeRootSteeringIfEmpty: (root: RootTurnRecord) => Promise<boolean> }).closeRootSteeringIfEmpty.bind(task);

      const first = task.steerAgentTurn(root.turnId, 'a', 'First correction');
      const second = task.steerAgentTurn(root.turnId, 'b', 'Second correction');
      await expect(closeIfEmpty(root)).resolves.toBe(true);
      const steering = drain(root, false);
      await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
      await expect(steering).resolves.toMatchObject([{ id: 'a' }, { id: 'b' }]);
      expect(saveRootTurn.mock.calls.at(-1)?.[0]).toMatchObject({
        pendingSteering: [],
        messages: [{ id: 'initial-result' }, { id: 'a' }, { id: 'b' }],
      });

      const cutoff = closeIfEmpty(root);
      const late = task.steerAgentTurn(root.turnId, 'late', 'Arrived at cutoff');
      await expect(cutoff).resolves.toBe(false);
      await expect(late).resolves.toBe(false);
      expect(activeTask.activeRootSteering).toBeUndefined();
    });

    it('honors a prompt policy veto and discards a decision for a replaced root', async () => {
      const root: RootTurnRecord = {
        turnId: 'active-turn',
        directory: baseDir,
        profileId: 'profile',
        provider: 'provider',
        model: 'model',
        mode: 'agent',
        state: 'running',
        messages: [],
      };
      const saveRootTurn = vi.fn(async () => {});
      const activeTask = task as unknown as { activeRootSteering?: RootTurnRecord };
      Object.assign(activeTask, { rootTurnInUse: true, activeRootSteering: root, saveRootTurn });
      mockExtensionManager.isInitialized.mockReturnValue(true);
      mockExtensionManager.dispatchEvent = vi.fn().mockResolvedValueOnce({ blocked: true, mode: 'agent', prompt: 'Denied' });
      await expect(task.steerAgentTurn(root.turnId, 'denied', 'Denied')).resolves.toBe(false);

      mockExtensionManager.dispatchEvent.mockImplementationOnce(async () => {
        activeTask.activeRootSteering = { ...root, turnId: 'replacement' };
        return { mode: 'agent', prompt: 'Late' };
      });
      await expect(task.steerAgentTurn(root.turnId, 'late', 'Late')).resolves.toBe(false);
      expect(mockExtensionManager.dispatchEvent).toHaveBeenCalledTimes(2);
      expect(saveRootTurn).not.toHaveBeenCalled();
      expect(root.pendingSteering).toBeUndefined();
      expect(activeTask.activeRootSteering?.pendingSteering).toBeUndefined();
    });

    it.each(['handoff', 'stop'] as const)('keeps accepted steering and the queue intact after %s', async (exit) => {
      const root: RootTurnRecord = {
        turnId: 'active-turn',
        directory: baseDir,
        profileId: 'profile',
        provider: 'provider',
        model: 'model',
        mode: 'agent',
        state: 'running',
        messages: [{ id: 'root-request', role: 'user', content: 'Original request' }],
      };
      const checkpoints: RootTurnRecord[] = [];
      const runNextQueuedPrompt = vi.fn(async () => []);
      const activeTask = task as unknown as { activeRootSteering?: RootTurnRecord };
      const runAgent = vi.fn(async () => {
        await expect(task.steerAgentTurn(root.turnId, 'late-correction', 'Use the new input')).resolves.toBe(true);
        if (exit === 'stop') {
          await task.interruptResponse();
        } else {
          task.task.state = DefaultTaskState.Delegated;
        }
        return [{ id: 'old-response', role: 'assistant' as const, content: 'Old response' }];
      });
      Object.assign(task, {
        agent: { runAgent, interrupt: vi.fn() },
        runNextQueuedPrompt,
        saveRootTurn: async (checkpoint: RootTurnRecord) => {
          checkpoints.push(structuredClone(checkpoint));
        },
        sendRequestContextInfo: vi.fn(),
        sendTaskGitStatusUpdated: vi.fn(),
        sendUpdatedFilesUpdated: vi.fn(),
        sendSkillsUpdated: vi.fn(),
      });
      const stop = vi.spyOn(task, 'interruptResponse').mockImplementation(async () => {
        activeTask.activeRootSteering = undefined;
        task.task.state = DefaultTaskState.Interrupted;
      });
      task.task.name = 'Fixture';
      vi.spyOn(task, 'saveTask').mockImplementation(async (changes) => Object.assign(task.task, changes));
      vi.spyOn(task, 'addUserMessage').mockImplementation(() => {});
      vi.spyOn(task, 'addContextMessage').mockResolvedValue(undefined);
      const manager = (task as unknown as { contextManager: { save: () => Promise<void> } }).contextManager;
      vi.spyOn(manager, 'save').mockResolvedValue(undefined);
      const profile = { id: root.profileId, provider: root.provider, model: root.model } as never;

      Object.assign(task, { queuedPrompts: [{ id: 'queued-request', text: 'Later separate work', mode: 'agent', timestamp: 1 }] });
      vi.spyOn(task, 'waitForCurrentAgentToFinish').mockResolvedValue(undefined);
      await task.runPromptInAgent(profile, 'agent', null, { id: root.turnId }, root.messages, [], undefined, true, false, undefined, undefined, root);

      expect(runAgent).toHaveBeenCalledTimes(1);
      expect(task.task.state).toBe(DefaultTaskState.Interrupted);
      expect(runNextQueuedPrompt).not.toHaveBeenCalled();
      expect(task.getQueuedPrompts()).toMatchObject([{ id: 'queued-request' }]);
      if (exit === 'stop') {
        expect(stop).toHaveBeenCalledOnce();
        expect(checkpoints.at(-1)).toMatchObject({ state: 'running', pendingSteering: [{ id: 'late-correction' }], messages: [{ id: 'root-request' }] });
      } else {
        expect(checkpoints.at(-1)).toMatchObject({ state: 'running', pendingSteering: [], messages: [{ id: 'root-request' }, { id: 'late-correction' }] });
      }
    });

    it('keeps recovered model history separate from incremental context writes', async () => {
      const initial: ContextMessage = { id: 'active-turn', role: 'user', content: 'Original request' };
      const restored = [initial];
      const root: RootTurnRecord = {
        turnId: initial.id,
        directory: baseDir,
        profileId: 'profile',
        provider: 'provider',
        model: 'model',
        state: 'running',
        messages: restored,
      };
      const runAgent = vi.fn(async () => {
        await task.addContextMessage({ id: 'steer', role: 'user', content: 'Accepted correction', promptContext: { id: root.turnId } });
        expect(restored.map(({ id }) => id)).toEqual([initial.id]);
        return [{ id: 'reply', role: 'assistant' as const, content: 'Done' }];
      });
      Object.assign(task, {
        agent: { runAgent },
        saveRootTurn: vi.fn(async () => {}),
        sendRequestContextInfo: vi.fn(),
        sendTaskGitStatusUpdated: vi.fn(),
        sendUpdatedFilesUpdated: vi.fn(),
        sendSkillsUpdated: vi.fn(),
      });
      task.task.name = 'Fixture';
      mockStore.getSettings.mockReturnValue({ taskSettings: {} });
      vi.spyOn(task, 'saveTask').mockImplementation(async (changes) => Object.assign(task.task, changes));
      const manager = (task as unknown as { contextManager: { save: () => Promise<void>; autosave: () => void } }).contextManager;
      vi.spyOn(manager, 'save').mockResolvedValue(undefined);
      vi.spyOn(manager, 'autosave').mockImplementation(() => {});
      const profile = { id: root.profileId, provider: root.provider, model: root.model } as never;

      await task.runPromptInAgent(profile, 'agent', null, { id: root.turnId }, restored, [], undefined, false, false, undefined, undefined, root);

      expect(runAgent).toHaveBeenCalledTimes(1);
      expect(task.task.state).toBe(DefaultTaskState.ReadyForReview);
      expect(restored.map(({ id }) => id)).toEqual([initial.id]);
    });

    it('records a budget-limited goal turn without an assistant response as settled', async () => {
      const goal = newAgentGoal('Verify changes', 10);
      const limited = { ...goal, status: 'budget_limited', tokensUsed: 10 } as const;
      const goalTurn = {
        goal,
        signal: new AbortController().signal,
        readGoal: vi.fn(async () => limited),
        canExecute: vi.fn(async () => false),
        commitCompletion: vi.fn(async () => false),
      } as unknown as Parameters<Task['runPromptInAgent']>[12];
      const checkpoints: RootTurnRecord[] = [];
      Object.assign(task, {
        agent: { runAgent: vi.fn(async () => []) },
        saveRootTurn: async (record: RootTurnRecord) => {
          checkpoints.push(structuredClone(record));
        },
        sendRequestContextInfo: vi.fn(),
        sendTaskGitStatusUpdated: vi.fn(),
        sendUpdatedFilesUpdated: vi.fn(),
        sendSkillsUpdated: vi.fn(),
      });
      task.task.name = 'Fixture';
      mockStore.getSettings.mockReturnValue({ taskSettings: {} });
      vi.spyOn(task, 'saveTask').mockImplementation(async (changes) => Object.assign(task.task, changes));
      const manager = (task as unknown as { contextManager: { save: () => Promise<void> } }).contextManager;
      vi.spyOn(manager, 'save').mockResolvedValue(undefined);
      const profile = { id: 'profile', provider: 'provider', model: 'model' } as never;

      await task.runPromptInAgent(profile, 'agent', null, { id: 'limited' }, [], [], undefined, false, false, undefined, undefined, undefined, goalTurn);

      expect(checkpoints.at(-1)).toMatchObject({ state: 'success', turnId: 'limited' });
      expect(task.task.state).toBe(DefaultTaskState.ReadyForReview);
      expect(await goalTurn?.readGoal()).toMatchObject({ status: 'budget_limited' });
    });

    it.each([
      { mode: 'agent' as const, output: '' },
      { mode: 'agent' as const, output: 'Preface\n### **Conversation Summary**\n' },
      { mode: 'ask' as const, output: '### **Conversation Summary**\n' },
    ])('preserves working history when internal $mode compaction makes no summary ($output)', async ({ mode, output }) => {
      const history: ContextMessage[] = [
        { id: 'original', role: 'user', content: 'Retain the original request' },
        { id: 'result', role: 'assistant', content: 'Independent working evidence' },
      ];
      const summaryPrompt: ContextMessage = { id: 'compaction', role: 'user', content: 'Summarize this conversation' };
      const applyCompaction = vi.fn();
      const runNextQueuedPrompt = vi.fn();
      Object.assign(task, {
        agent: { runAgent: vi.fn(async () => (output ? [summaryPrompt, { id: 'candidate', role: 'assistant', content: output }] : [summaryPrompt])) },
        sendPromptToAider: vi.fn(async () => [{ messageId: 'candidate', content: output }]),
        contextManager: { applyCompaction, getContextMessages: async () => history },
        runNextQueuedPrompt,
        updateContextInfo: vi.fn(),
      });
      mockPromptsManager.getCompactConversationPrompt = vi.fn(async () => summaryPrompt.content);
      vi.spyOn(task, 'saveTask').mockImplementation(async (changes) => Object.assign(task.task, changes));
      vi.spyOn(task, 'addLogMessage').mockImplementation(() => {});
      const profile = { id: 'profile', provider: 'provider', model: 'model' } as never;

      await expect(task.compactConversation(mode, undefined, profile, history, undefined, undefined, false)).resolves.toBe(false);

      expect(applyCompaction).not.toHaveBeenCalled();
      expect(runNextQueuedPrompt).not.toHaveBeenCalled();
      expect(history.map(({ id }) => id)).toEqual(['original', 'result']);
    });

    it('preserves the conversation and prior undo when loading the proposed summary fails', async () => {
      const history: ContextMessage[] = [
        { id: 'original', role: 'user', content: 'Original request' },
        { id: 'result', role: 'assistant', content: 'Observed evidence' },
      ];
      const previousUndo: ContextMessage[] = [{ id: 'undo', role: 'user', content: 'Older original history' }];
      const manager = task['contextManager'];
      const projectionFailure = vi.fn(() => {
        throw new Error('Cannot display compacted context');
      });
      Object.assign(task, {
        agent: { runAgent: vi.fn(async () => [{ id: 'summary', role: 'assistant', content: 'Valid summary' }]) },
        sendUserMessage: vi.fn(),
        sendResponseCompleted: projectionFailure,
        sendContextInfoUpdated: vi.fn(),
        sendSkillsUpdated: vi.fn(),
      });
      mockEventManager.sendClearTask = vi.fn();
      await manager.getContextMessages();
      manager.setContextMessages(previousUndo, false);
      manager.setContextMessages(history, false);
      mockPromptsManager.getCompactConversationPrompt = vi.fn(async () => 'Summarize');
      vi.spyOn(task, 'runCommand').mockImplementation(async () => {});
      vi.spyOn(task, 'saveTask').mockImplementation(async (changes) => Object.assign(task.task, changes));
      vi.spyOn(task, 'updateTask').mockImplementation(async (changes) => Object.assign(task.task, changes));
      vi.spyOn(task, 'addLogMessage').mockImplementation(() => {});

      await expect(
        task.compactConversation('agent', undefined, { id: 'profile', provider: 'provider', model: 'model' } as never, history, undefined, undefined, false),
      ).resolves.toBe(false);
      expect(projectionFailure).toHaveBeenCalledOnce();
      expect(await manager.getContextMessages()).toEqual(history);
      expect(manager.undoContextChange()).toEqual(previousUndo);
    });

    it('does not apply an accumulated summary after Stop during manual compaction', async () => {
      const history: ContextMessage[] = [
        { id: 'original', role: 'user', content: 'Original request' },
        { id: 'result', role: 'assistant', content: 'Observed evidence' },
      ];
      const applyCompaction = vi.fn();
      const interrupted = vi.fn();
      Object.assign(task, {
        agent: {
          runAgent: vi.fn(async () => {
            await task.interruptResponse(undefined, true);
            return [{ id: 'summary', role: 'assistant', content: 'Accumulated summary' }];
          }),
          interrupt: interrupted,
        },
        contextManager: { applyCompaction, getContextMessages: async () => history },
        extensionManager: { dispatchEvent: async (_eventName: string, event: unknown) => event },
        findMessageConnectors: vi.fn(() => []),
        promptFinished: vi.fn(),
        cleanupChunkBuffers: vi.fn(),
        waitForCurrentAgentToFinish: vi.fn(async () => {}),
        resolveAgentRunPromises: vi.fn(),
        runNextQueuedPrompt: vi.fn(async () => {}),
        sendSkillsUpdated: vi.fn(),
      });
      mockPromptsManager.getCompactConversationPrompt = vi.fn(async () => 'Summarize');
      vi.spyOn(task, 'saveTask').mockImplementation(async (changes) => Object.assign(task.task, changes));
      vi.spyOn(task, 'addLogMessage').mockImplementation(() => {});
      const profile = { id: 'profile', provider: 'provider', model: 'model' } as never;

      await expect(task.compactConversation('agent', undefined, profile, history)).resolves.toBe(false);
      expect(interrupted).toHaveBeenCalledOnce();
      expect(applyCompaction).not.toHaveBeenCalled();
    });

    it.each([true, false])('keeps working history while the async clear command runs (Stop: %s)', async (stop) => {
      const history: ContextMessage[] = [
        { id: 'original', role: 'user', content: 'Original request' },
        { id: 'result', role: 'assistant', content: 'Observed evidence' },
      ];
      const summary: ContextMessage = { id: 'summary', role: 'assistant', content: 'Valid summary' };
      const olderHistory: ContextMessage[] = [{ id: 'undo', role: 'user', content: 'An earlier conversation' }];
      const manager = task['contextManager'];
      let historyDuringClear: ContextMessage[] | undefined;
      Object.assign(task, {
        agent: { runAgent: vi.fn(async () => [summary]), interrupt: vi.fn() },
        extensionManager: { dispatchEvent: async (_eventName: string, event: unknown) => event },
        findMessageConnectors: vi.fn(() => []),
        promptFinished: vi.fn(),
        cleanupChunkBuffers: vi.fn(),
        waitForCurrentAgentToFinish: vi.fn(async () => {}),
        resolveAgentRunPromises: vi.fn(),
        runNextQueuedPrompt: vi.fn(async () => {}),
        updateContextInfo: vi.fn(),
        sendContextInfoUpdated: vi.fn(),
        sendUserMessage: vi.fn(),
        sendResponseCompleted: vi.fn(),
        sendAddMessage: vi.fn(),
      });
      mockEventManager.sendClearTask = vi.fn();
      mockPromptsManager.getCompactConversationPrompt = vi.fn(async () => 'Summarize');
      vi.spyOn(task, 'saveTask').mockImplementation(async (changes) => Object.assign(task.task, changes));
      vi.spyOn(task, 'updateTask').mockImplementation(async (changes) => Object.assign(task.task, changes));
      vi.spyOn(task, 'addLogMessage').mockImplementation(() => {});
      vi.spyOn(task, 'runCommand').mockImplementation(async () => {
        historyDuringClear = await manager.getContextMessages();
        if (stop) {
          await task.interruptResponse(undefined, true);
        }
      });
      await manager.getContextMessages();
      manager.setContextMessages(olderHistory, false);
      manager.setContextMessages(history, false);
      const profile = { id: 'profile', provider: 'provider', model: 'model' } as never;

      await expect(task.compactConversation('agent', undefined, profile, history)).resolves.toBe(!stop);

      expect(historyDuringClear).toEqual(history);
      expect(mockEventManager.sendClearTask).toHaveBeenCalledTimes(stop ? 0 : 1);
      expect(task.sendResponseCompleted).toHaveBeenCalledTimes(stop ? 0 : 1);
      expect(await manager.getContextMessages()).toEqual(stop ? history : [history[0], summary]);
      expect(manager.undoContextChange()).toEqual(stop ? olderHistory : history);
    });

    it('reconciles a durable terminal root turn without starting the model again', async () => {
      vi.spyOn(task, 'isPromptRunning').mockReturnValue(false);
      const profile = { id: 'profile', provider: 'test-provider', model: 'test-model' } as never;
      const root = {
        turnId: 'original-turn',
        directory: baseDir,
        profileId: 'profile',
        provider: 'test-provider',
        model: 'test-model',
        state: 'success',
        messages: [{ id: 'done', role: 'assistant', content: 'completed evidence' }],
      };
      task.task.state = 'INTERRUPTED';
      task.task.metadata = { recoverableRootTurn: 'original-turn' };
      vi.spyOn(task, 'getTaskAgentProfile').mockResolvedValue(profile);
      vi.spyOn(task as unknown as { readRootTurn: () => Promise<unknown> }, 'readRootTurn').mockResolvedValue(root);
      vi.spyOn(getContextManager().contextManager as unknown as { save(): Promise<void> }, 'save').mockResolvedValue(undefined);
      const save = vi.spyOn(task, 'saveTask').mockResolvedValue(task.task);
      const run = vi.spyOn(task, 'runPromptInAgent').mockResolvedValue([]);
      await task.resumeTask();
      expect(run).not.toHaveBeenCalled();
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ state: 'READY_FOR_REVIEW' }));
    });

    it.each([DefaultTaskState.Interrupted, DefaultTaskState.InProgress])('recovers the original root and durable context from %s', async (state) => {
      vi.spyOn(task, 'isPromptRunning').mockReturnValue(false);
      const profile = { id: 'profile', provider: 'test-provider', model: 'test-model' } as never;
      const root = {
        turnId: 'original-turn',
        directory: baseDir,
        profileId: 'profile',
        provider: 'test-provider',
        model: 'test-model',
        state: 'running',
        messages: [{ id: 'original-turn', role: 'user', content: 'saved input' }],
        pendingTools: [],
      };
      task.task.state = state;
      task.task.metadata = { recoverableRootTurn: 'original-turn' };
      vi.spyOn(task, 'getTaskAgentProfile').mockResolvedValue(profile);
      vi.spyOn(task as unknown as { readRootTurn: () => Promise<unknown> }, 'readRootTurn').mockResolvedValue(root);
      vi.spyOn(task, 'saveTask').mockImplementation(async (changes) => Object.assign(task.task, changes));
      vi.spyOn(task, 'addLogMessage').mockImplementation(() => {});
      const run = vi.spyOn(task, 'runPromptInAgent').mockResolvedValue([]);
      await task.resumeTask();
      expect(run).toHaveBeenCalledWith(
        profile,
        'agent',
        null,
        { id: 'original-turn' },
        root.messages,
        undefined,
        undefined,
        false,
        true,
        undefined,
        undefined,
        root,
      );
    });

    it.each(['development head advances', 'validation changes', 'prerequisites stay unchanged'])('wakes a waiting authorized queue when %s', async (event) => {
      const workflow = await import('../workflow-policy');
      const repository = await import('../repository-workflow');
      const development = await import('../workflow-development');
      const validations = await import('../workflow-project-run');
      const revision = 'a'.repeat(64);
      const observedHead = 'b'.repeat(40);
      const observedValidation = 'c'.repeat(64);
      const spies = [
        vi.spyOn(workflow, 'workflowProjectFor').mockReturnValue({ id: 'fixture' } as never),
        vi.spyOn(repository, 'repositoryContinuationRevision').mockResolvedValue(revision),
        vi.spyOn(development, 'readDevelopmentHead').mockResolvedValue(event === 'development head advances' ? 'd'.repeat(40) : observedHead),
        vi.spyOn(validations, 'readWorkflowValidationRevision').mockResolvedValue(event === 'validation changes' ? 'e'.repeat(64) : observedValidation),
        vi.spyOn(task, 'init').mockResolvedValue(),
        vi.spyOn(task, 'isPromptRunning').mockReturnValue(false),
        vi.spyOn(task, 'getContextFiles').mockResolvedValue([]),
        vi.spyOn(task, 'getTodos').mockResolvedValue([]),
        vi.spyOn(task as unknown as { managedPilotStatePath(): string }, 'managedPilotStatePath').mockReturnValue('/workflow/chat.json'),
      ];
      const run = vi.spyOn(task, 'runManagedDesktopPrompt').mockResolvedValue([]);
      task.task.metadata = { governedContinuation: { kind: 'queue', state: 'waiting', revision, observedHead, observedValidation } };
      try {
        await task.load(true);
        expect(run).not.toHaveBeenCalled();
        await task.load();
        await vi.waitFor(() => expect(development.readDevelopmentHead).toHaveBeenCalledOnce());
        if (event === 'prerequisites stay unchanged') {
          expect(run).not.toHaveBeenCalled();
        } else {
          await vi.waitFor(() => expect(run).toHaveBeenCalledExactlyOnceWith('Riprendi il lavoro', true));
        }
      } finally {
        await task.close();
        for (const spy of spies) {
          spy.mockRestore();
        }
        run.mockRestore();
      }
    });

    const getContextManager = () => {
      return task as unknown as {
        contextManager: {
          addContextMessage: (message: ContextMessage) => void;
          getContextMessages: () => Promise<ContextMessage[]>;
        };
      };
    };

    it.each(['active', 'paused', 'waiting', 'complete'])('reopens only an active persisted governed queue when the task is loaded (%s)', async (state) => {
      const workflow = await import('../workflow-policy');
      const repository = await import('../repository-workflow');
      const projectPolicy = vi.spyOn(workflow, 'workflowProjectFor').mockReturnValue({ id: 'fixture' } as never);
      const revision = 'a'.repeat(64);
      const planRevision = vi.spyOn(repository, 'repositoryContinuationRevision').mockResolvedValue(revision);
      const run = vi.spyOn(task, 'runManagedDesktopPrompt').mockResolvedValue([]);
      const init = vi.spyOn(task, 'init').mockResolvedValue();
      vi.spyOn(task, 'isPromptRunning').mockReturnValue(false);
      vi.spyOn(task, 'getContextFiles').mockResolvedValue([]);
      vi.spyOn(task, 'getTodos').mockResolvedValue([]);
      task.task.metadata = { governedContinuation: { kind: 'queue', state, revision } };
      try {
        await task.load(true);
        expect(run).not.toHaveBeenCalled();
        await task.load();
        await vi.waitFor(() => {
          if (state === 'active') {
            expect(run).toHaveBeenCalledExactlyOnceWith('Riprendi il lavoro', true);
          }
        });
        if (state === 'active') {
          expect(run).toHaveBeenCalledExactlyOnceWith('Riprendi il lavoro', true);
        } else {
          expect(run).not.toHaveBeenCalled();
        }
      } finally {
        init.mockRestore();
        projectPolicy.mockRestore();
        planRevision.mockRestore();
      }
    });

    it('pauses a waiting governed queue on explicit interruption and preserves it on close', async () => {
      const workflow = await import('../workflow-policy');
      const policy = vi.spyOn(workflow, 'workflowProjectFor').mockReturnValue({ id: 'fixture' } as never);
      const save = vi.spyOn(task, 'saveTask').mockImplementation(async (updates) => Object.assign(task.task, updates));
      const queue = { kind: 'queue', state: 'waiting', revision: 'a'.repeat(64), observedHead: 'b'.repeat(40) };
      task.task.metadata = { governedContinuation: queue };
      try {
        await task.interruptResponse(undefined, true);
        expect(save).not.toHaveBeenCalled();
        await task.interruptResponse();
        expect(task.task.metadata.governedContinuation).toEqual({ ...queue, state: 'paused' });
      } finally {
        policy.mockRestore();
        save.mockRestore();
      }
    });

    it('reopens an approved task when the saved service retry becomes due', async () => {
      const workflow = await import('../workflow-policy');
      const repository = await import('../repository-workflow');
      const approval = 'a'.repeat(64);
      const spies = [
        vi.spyOn(workflow, 'workflowProjectFor').mockReturnValue({ id: 'fixture' } as never),
        vi.spyOn(repository, 'readRepositoryWorkflow').mockResolvedValue({ phase: 'approved', revision: approval } as never),
        vi.spyOn(task as unknown as { managedPilotStatePath(): string }, 'managedPilotStatePath').mockReturnValue('/workflow/chat.json'),
        vi.spyOn(task, 'init').mockResolvedValue(),
        vi.spyOn(task, 'isPromptRunning').mockReturnValue(false),
        vi.spyOn(task, 'getContextFiles').mockResolvedValue([]),
        vi.spyOn(task, 'getTodos').mockResolvedValue([]),
      ];
      const run = vi.spyOn(task, 'runManagedDesktopPrompt').mockResolvedValue([]);
      task.task.metadata = { governedContinuation: { kind: 'task', state: 'waiting', approval, retryAt: Date.now() - 1 } };
      try {
        await task.load();
        await vi.waitFor(() => expect(run).toHaveBeenCalledExactlyOnceWith('/workflow resume', true));
      } finally {
        await task.close();
        spies.forEach((spy) => spy.mockRestore());
        run.mockRestore();
      }
    });

    it('waits for a remote governed run to persist even before the task window has initialized', async () => {
      const running = task as unknown as { workflowRunSettled: Promise<void>; workflowRun: AbortController };
      const controller = new AbortController();
      running.workflowRun = controller;
      let settle!: () => void;
      running.workflowRunSettled = new Promise<void>((resolve) => {
        settle = resolve;
      });
      const closed = vi.fn();
      const closing = task.close().then(closed);
      try {
        expect(controller.signal.aborted).toBe(true);
        await Promise.resolve();
        expect(closed).not.toHaveBeenCalled();
      } finally {
        settle();
        await closing;
      }
      expect(closed).toHaveBeenCalledOnce();
    });

    it('executes a saved file-based custom command and removes the original prompt', async () => {
      mockCustomCommandManager.getCommand.mockReturnValue({ name: 'commit' });
      const runCustomCommand = vi.spyOn(task, 'runCustomCommand').mockResolvedValue();
      const contextManager = getContextManager();
      contextManager.contextManager.addContextMessage({
        id: 'saved-command',
        role: MessageRole.User,
        content: '/commit "release message"',
      });

      await task.resumeTask();

      expect(runCustomCommand).toHaveBeenCalledWith('commit', ['release message'], 'agent');
      expect(await contextManager.contextManager.getContextMessages()).toEqual([]);
      expect(mockEventManager.sendTaskMessageRemoved).toHaveBeenCalledWith(baseDir, taskId, ['saved-command']);
    });

    it('executes a saved extension command and removes the original prompt', async () => {
      mockExtensionManager.getCommands.mockReturnValue([{ command: { name: 'commit' } }]);
      const runCustomCommand = vi.spyOn(task, 'runCustomCommand').mockResolvedValue();
      const contextManager = getContextManager();
      contextManager.contextManager.addContextMessage({
        id: 'saved-command',
        role: MessageRole.User,
        content: '/commit this is a message',
      });

      await task.resumeTask();

      expect(runCustomCommand).toHaveBeenCalledWith('commit', ['this', 'is', 'a', 'message'], 'agent');
      expect(await contextManager.contextManager.getContextMessages()).toEqual([]);
      expect(mockEventManager.sendTaskMessageRemoved).toHaveBeenCalledWith(baseDir, taskId, ['saved-command']);
    });

    it('executes a custom command when redoing a saved command prompt', async () => {
      mockCustomCommandManager.getCommand.mockReturnValue({ name: 'commit' });
      const runCustomCommand = vi.spyOn(task, 'runCustomCommand').mockResolvedValue();
      vi.spyOn(task, 'updateContextInfo').mockResolvedValue();
      const contextManager = getContextManager();
      contextManager.contextManager.addContextMessage({
        id: 'saved-command',
        role: MessageRole.User,
        content: '/commit release message',
      });

      await task.redoUserPrompt('saved-command', 'agent');

      expect(runCustomCommand).toHaveBeenCalledWith('commit', ['release', 'message'], 'agent');
      expect(await contextManager.contextManager.getContextMessages()).toEqual([]);
      expect(mockEventManager.sendTaskMessageRemoved).toHaveBeenCalledWith(baseDir, taskId, ['saved-command']);
    });
  });

  describe('order of messages', () => {
    it('should maintain assistant-message, tool-message pairs in the result', () => {
      const contextMessages: ContextMessage[] = [
        createAssistantMessage('msg-1', createSkillToolCall('skill-a', 'call-1')),
        createToolMessage('msg-2', createSkillToolResult('call-1')),
        createAssistantMessage('msg-3', createSkillToolCall('skill-b', 'call-2')),
        createToolMessage('msg-4', createSkillToolResult('call-2')),
      ];

      const result = (task as any).findSkillActivationMessages(contextMessages);

      // The result should contain alternating assistant and tool messages
      expect(result[0].role).toBe('assistant');
      expect(result[1].role).toBe('tool');
      expect(result[2].role).toBe('assistant');
      expect(result[3].role).toBe('tool');
    });
  });
});
