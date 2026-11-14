/* eslint-disable import/order */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { newAgentGoal, type AgentGoal } from '../agent-goal';
import { describeInterruptedTools, reconcileTurnProgress, rememberCompletedShell, type RootTurnRecord } from '@/agent/worker-checkpoint';

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

    it('rejects shell success without a check and revokes a staged completion when a later tool can mutate files', async () => {
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
      expect(run).toHaveBeenCalledWith(profile, 'plan', null, { id: 'plan-turn' }, root.messages, undefined, undefined, true, true, undefined, undefined, root);
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
        true,
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
