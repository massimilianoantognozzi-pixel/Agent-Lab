/**
 * Regression tests for Agent.runAgent abort controller registration.
 *
 * Agent.isRunning() reports registered controllers, Task.isPromptRunning() relies
 * on it, and it decides whether incoming prompts are queued or started concurrently.
 *
 * The dispatch-phase controller is constructed unconditionally (agent.ts), while the
 * run controller is only constructed when neither caller nor extension provided a
 * signal. Runs are stopped early right after registration and assertions are made on
 * how many controllers were constructed by agent code.
 */
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

import { describe, expect, it, vi } from 'vitest';
import { ContextCompactionType, DefaultTaskState, ToolApprovalState, type AgentProfile, type ContextMessage } from '@common/types';
import { TOOL_GROUP_NAME_SEPARATOR } from '@common/tools';
import { z } from 'zod';
import { APICallError } from 'ai';

import type { Task } from '@/task';
import type { AgentGoalTurn } from '@/task/agent-goal';

import { AgentDesignReviewPending } from '@/task/agent-design-review';
import { NATIVE_EMPTY_TEST_REPORT, NATIVE_VERIFICATION_RESEARCH_QUERY, verificationResearchQuery } from '@/task/goal-verification';
import { workerToolFingerprint } from '@/agent/worker-checkpoint';

vi.mock('@/logger');
vi.mock('node:timers/promises', async (importOriginal) => {
  const timers = await importOriginal<typeof import('node:timers/promises')>();
  return { ...timers, setTimeout: vi.fn(timers.setTimeout) };
});
const { generateTextMock, streamTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn(), streamTextMock: vi.fn() }));
vi.mock('ai', async (importOriginal) => {
  const original = await importOriginal<typeof import('ai')>();
  return {
    ...original,
    generateText: generateTextMock,
    streamText: (...args: Parameters<typeof original.streamText>) =>
      streamTextMock.getMockImplementation() ? streamTextMock(...args) : original.streamText(...args),
  };
});

const { Agent: AgentClass } = await import('../agent');
type Agent = InstanceType<typeof AgentClass>;

const createAgent = (modelError?: Error) => {
  const modelManager = {
    getProviders: vi.fn(() => [{ id: 'test-provider', name: 'Test Provider', provider: { name: 'Test Provider' } }]),
    getCacheControl: vi.fn(() => null),
    getProviderParameters: vi.fn(() => ({})),
    getProviderOptions: vi.fn(() => ({})),
    // Escape hatch: stops the run right after controller registration
    normalizeMessages: vi.fn(() => {
      if (modelError) {
        return [];
      }
      throw new Error('stop');
    }),
    createLlm: vi.fn(async () => {
      throw modelError;
    }),
  };

  const extensionManager = {
    dispatchEvent: vi.fn(async (_eventName: string, event: Record<string, unknown>) => ({ ...event })),
  };

  const agent = new AgentClass(
    ...([
      { getSettings: vi.fn(() => ({})), getUserId: vi.fn(() => 'test-user') },
      { getProjectProfiles: vi.fn(() => ({})) },
      {},
      { getMergedServers: vi.fn(() => ({})) },
      modelManager,
      { captureAgentRun: vi.fn() },
      {},
      { getSystemPrompt: vi.fn(async () => 'system prompt') },
      extensionManager,
    ] as unknown as ConstructorParameters<typeof AgentClass>),
  ) as unknown as Agent;

  if (modelError) {
    agent['getAvailableTools'] = vi.fn(async () => ({}));
  }

  return { agent, extensionManager };
};

const createTask = () =>
  ({
    taskId: 'test-task',
    getProjectDir: vi.fn(() => '/test/project'),
    getProject: vi.fn(() => ({ baseDir: '/test/project' })),
    project: { baseDir: '/test/project' },
    task: {},
    getContextMessages: vi.fn(async () => []),
    getContextFiles: vi.fn(async () => []),
    addContextMessage: vi.fn(async () => {}),
    addLogMessage: vi.fn(),
    updateTask: vi.fn(async () => {}),
  }) as unknown as Task;

const profile = {
  id: 'test-profile',
  name: 'Test Profile',
  provider: 'test-provider',
  model: 'test-model',
  isSubagent: false,
} as AgentProfile;

type RunAgentArgs = Parameters<Agent['runAgent']>;

// Counts AbortController constructions performed by agent code, ignoring ones from the test itself
const withAgentAbortControllerCounting = async <T>(fn: () => Promise<T>): Promise<{ result: T; agentControllerCount: number }> => {
  const Original = global.AbortController;
  let count = 0;
  class Counting extends AbortController {
    constructor(...args: ConstructorParameters<typeof AbortController>) {
      super(...args);
      if ((new Error().stack ?? '').includes('/src/main/agent/')) {
        count++;
      }
    }
  }
  global.AbortController = Counting as typeof AbortController;
  try {
    const result = await fn();
    return { result, agentControllerCount: count };
  } finally {
    global.AbortController = Original;
  }
};

const stopExpected = async (promise: Promise<unknown>) =>
  promise.catch((error: unknown) => {
    if (!(error instanceof Error) || error.message !== 'stop') {
      throw error;
    }
  });

describe('Agent.runAgent abort controller registration', () => {
  it('changes strategy once after repeated goal reads with the same native verification', async () => {
    const { agent } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { getTaskDir: () => '/test/project', setState: vi.fn() });
    const modelManager = agent['modelManager'];
    vi.mocked(modelManager.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof modelManager.createLlm>>);
    modelManager.getModelSettings = vi.fn();
    modelManager.getUsageReport = vi.fn();
    modelManager.isStreamingDisabled = vi.fn(() => true);
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    agent['processStep'] = vi.fn(async () => [{ id: 'answer', role: 'assistant' as const, content: 'Work continues' }]);
    agent['getAvailableTools'] = vi.fn(async () => ({
      get_goal: { inputSchema: z.object({}) },
      update_goal: { inputSchema: z.object({}) },
      'power---bash': { inputSchema: z.object({}) },
    }));
    const signal = new AbortController().signal;
    const completion = vi.fn();
    const goal = {
      goal: { id: 'fixture', objective: 'Verify and document the change', status: 'active' },
      signal,
      getAvailableVerification: () => [{ toolCallId: 'native-verifier', command: 'npm test' }],
      onUsage: vi.fn(async () => true),
      commitCompletion: completion,
    } as unknown as AgentGoalTurn;
    generateTextMock.mockReset();
    for (const name of ['get_goal', 'get_goal', 'power---bash', 'get_goal', 'get_goal']) {
      generateTextMock.mockImplementationOnce(async ({ onStepEnd }) =>
        onStepEnd({
          finishReason: 'tool-calls',
          toolCalls: [{ toolName: name, toolCallId: 'call' }],
          toolResults: [{ toolName: name, toolCallId: 'call', output: { goal: goal.goal, availableVerification: goal.getAvailableVerification() } }],
          usage: { inputTokens: 10, outputTokens: 5 },
        }),
      );
    }
    generateTextMock.mockImplementationOnce(async ({ onStepEnd }) => onStepEnd({ finishReason: 'stop', toolCalls: [] }));
    try {
      const args = [
        task,
        profile,
        null,
        'agent',
        { id: 'goal-turn' },
        [],
        [],
        undefined,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        goal,
      ] satisfies RunAgentArgs;
      await agent.runAgent(...args);
      expect(generateTextMock.mock.calls.map(([options]) => options.activeTools)).toEqual([
        undefined,
        undefined,
        ['update_goal', 'power---bash'],
        undefined,
        undefined,
        undefined,
      ]);
      expect(generateTextMock.mock.calls[2][0].instructions).toContain('remaining work');
      expect(JSON.stringify(generateTextMock.mock.calls[2][0].messages)).toContain('native-verifier');
      expect(completion).not.toHaveBeenCalled();
    } finally {
      generateTextMock.mockReset();
    }
  });
  it('keeps the recovery input empty even if an extension proposes a new prompt', async () => {
    const { agent, extensionManager } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { getTaskDir: () => '/test/project' });
    const modelManager = agent['modelManager'];
    vi.mocked(modelManager.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof modelManager.createLlm>>);
    modelManager.getModelSettings = vi.fn();
    modelManager.isStreamingDisabled = vi.fn(() => true);
    const turnId = 'recorded-turn';
    const messages = [{ id: turnId, role: 'user' as const, content: 'Original request' }];
    vi.mocked(modelManager.normalizeMessages).mockImplementation((_provider, _model, input) => input);
    extensionManager.dispatchEvent.mockImplementation(async (name, event) =>
      name === 'onAgentStarted'
        ? { ...event, prompt: 'Synthetic extension input', promptContext: { id: 'replaced-turn' }, modelCallSettings: { reasoning: 'low' } }
        : event,
    );
    const compact = vi.fn(async () => true);
    agent['compactMessagesIfNeeded'] = compact;
    agent['processStep'] = vi.fn(async () => [{ id: 'done', role: 'assistant' as const, content: 'verified' }]);
    generateTextMock.mockReset();
    generateTextMock.mockImplementationOnce(async ({ onStepEnd }) => onStepEnd({ finishReason: 'stop' }));
    try {
      await agent.runAgent(
        task,
        { ...profile, isSubagent: true },
        null,
        'subagent',
        { id: turnId },
        messages,
        [],
        undefined,
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'Recover saved turn',
        undefined,
        undefined,
        { provider: 'test-provider', model: 'test-model', reasoning: 'high', providerReasoningEffort: 'xhigh' },
      );
      expect(generateTextMock.mock.calls[0][0].instructions).toContain('Recover saved turn');
      expect(JSON.stringify(generateTextMock.mock.calls[0][0].messages)).toContain('Original request');
      expect(JSON.stringify(generateTextMock.mock.calls[0][0].messages)).not.toContain('Synthetic extension input');
      expect(generateTextMock.mock.calls[0][0].reasoning).toBe('high');
      expect(modelManager.getProviderOptions).toHaveBeenCalledWith(
        expect.objectContaining({ provider: expect.objectContaining({ reasoningEffort: 'xhigh' }) }),
        'test-model',
        'high',
      );
      expect((compact.mock.calls[0] as unknown[])[9]).toEqual({ id: turnId });
    } finally {
      generateTextMock.mockReset();
    }
  });

  it('blocks the same interrupted shell invocation before executing it, including after hook rewrites', async () => {
    const { agent, extensionManager } = createAgent();
    const task = Object.assign(createTask(), { addToolMessage: vi.fn(), getTaskDir: () => '/fixture' });
    const execute = vi.fn(async () => ({ exitCode: 0 }));
    const toolName = 'power---bash';
    const checkpoint = new Set([workerToolFingerprint(toolName, { command: 'node once.cjs', timeout: 500 })]);
    extensionManager.dispatchEvent.mockImplementation(async (name, event) =>
      name === 'onToolCalled' ? { ...event, input: { command: 'node once.cjs', timeout: 1000 } } : event,
    );
    const tools = agent['wrapToolsWithHooks'](
      task,
      profile,
      { [toolName]: { inputSchema: z.object({}), execute } },
      undefined,
      undefined,
      undefined,
      checkpoint,
    );
    await expect(tools[toolName].execute!({ command: 'node check.cjs' }, { toolCallId: 'call' } as never)).resolves.toMatchObject({
      error: expect.stringContaining('interrupted'),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not launch a descendant tool if another worker exhausts the budget during middleware', async () => {
    const { agent, extensionManager } = createAgent();
    const task = Object.assign(createTask(), { addToolMessage: vi.fn(), getTaskDir: () => '/fixture' });
    const execute = vi.fn(async () => ({ exitCode: 0 }));
    let budgetAvailable = true;
    extensionManager.dispatchEvent.mockImplementation(async (name, event) => {
      if (name === 'onToolCalled') {
        budgetAvailable = false;
      }
      return event;
    });
    const name = 'power---bash';
    const args: Parameters<Agent['wrapToolsWithHooks']> = [task, profile, { [name]: { inputSchema: z.object({}), execute } }];
    args[10] = { onUsage: async () => true, canSample: () => budgetAvailable };
    const tools = agent['wrapToolsWithHooks'](...args);

    await expect(tools[name].execute!({ command: 'node verify.cjs' }, { toolCallId: 'call' } as never)).resolves.toMatchObject({ error: expect.any(String) });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    [false, { error: 'Command denied by local settings' }],
    [true, { exitCode: 1 }],
  ])('records native shell execution for budget wrap-up only with process evidence (%s)', async (expected, output) => {
    const { agent } = createAgent();
    const task = Object.assign(createTask(), { addToolMessage: vi.fn(), getTaskDir: () => '/fixture' });
    const shell = { inputSchema: z.object({}), execute: vi.fn(async () => output) };
    const goal = {
      goal: { id: 'goal' },
      canExecute: async () => true,
      invalidateVerification: vi.fn(),
      beginVerification: async () => undefined,
    } as unknown as AgentGoalTurn;
    const executed = new Set<string>();
    const args: Parameters<Agent['wrapToolsWithHooks']> = [task, profile, { 'power---bash': shell }];
    args[7] = () => goal;
    args[8] = shell;
    args[11] = executed;
    const tools = agent['wrapToolsWithHooks'](...args);

    await expect(tools['power---bash'].execute!({ command: 'node verify.cjs' }, { toolCallId: 'call' } as never)).resolves.toEqual(output);
    expect(executed.has('call')).toBe(expected);
  });

  it('records the final native verification receipt from polling a yielded command', async () => {
    const { agent } = createAgent();
    const task = Object.assign(createTask(), { addToolMessage: vi.fn(), getTaskDir: () => '/fixture' });
    const shell = { inputSchema: z.object({}), execute: vi.fn(async () => ({ exitCode: null, processId: 'process-1' })) };
    const poll = { inputSchema: z.object({}), execute: vi.fn(async () => ({ exitCode: 0, stdout: 'verified' })) };
    const verification = { command: 'npm test', revision: 'revision', generation: 1 };
    const acceptToolResult = vi.fn(async () => {});
    const goal = {
      goal: { id: 'fixture', objective: 'Run the verifier' },
      signal: new AbortController().signal,
      canExecute: vi.fn(async () => true),
      beginVerification: vi.fn(async () => verification),
      acceptToolResult,
      invalidateVerification: vi.fn(),
    } as unknown as AgentGoalTurn;
    const wrap = agent['wrapToolsWithHooks'] as (...args: unknown[]) => Record<string, { execute: (input: unknown, options: unknown) => Promise<unknown> }>;
    const tools = wrap.call(
      agent,
      task,
      profile,
      { 'power---bash': shell, 'power---bash_poll': poll },
      undefined,
      undefined,
      undefined,
      undefined,
      () => goal,
      shell,
      poll,
    );
    await tools['power---bash'].execute({ command: 'npm test', yieldMs: 1 }, { toolCallId: 'yielded-call' });
    expect(acceptToolResult).not.toHaveBeenCalled();
    await tools['power---bash_poll'].execute({ processId: 'unknown-id' }, { toolCallId: 'unknown-poll' });
    expect(acceptToolResult).not.toHaveBeenCalled();
    poll.execute.mockResolvedValueOnce({ exitCode: null, stdout: 'running' } as unknown as Awaited<ReturnType<typeof poll.execute>>);
    await tools['power---bash_poll'].execute({ processId: 'process-1' }, { toolCallId: 'pending-poll' });
    expect(acceptToolResult).not.toHaveBeenCalled();
    await Promise.all([
      tools['power---bash_poll'].execute({ processId: 'process-1' }, { toolCallId: 'completed-poll' }),
      tools['power---bash_poll'].execute({ processId: 'process-1' }, { toolCallId: 'concurrent-poll' }),
    ]);
    expect(acceptToolResult).toHaveBeenCalledTimes(1);
    expect(acceptToolResult).toHaveBeenCalledWith(
      expect.stringMatching(/^(completed|concurrent)-poll$/),
      verification,
      { exitCode: 0, stdout: 'verified' },
      expect.any(Function),
      undefined,
    );
  });

  it.each([false, true])('qualifies a later turn polling the same goal and invalidates a changed session (%s)', async (invalidate) => {
    const { agent } = createAgent();
    const task = Object.assign(createTask(), { addToolMessage: vi.fn(), getTaskDir: () => '/fixture' });
    const shell = { inputSchema: z.object({}), execute: vi.fn(async () => ({ exitCode: null, processId: 'process-1' })) };
    const poll = { inputSchema: z.object({}), execute: vi.fn(async () => ({ exitCode: 0, stdout: 'verified' })) };
    const verification = { command: 'npm test', revision: 'revision', generation: 1 };
    const accepted = vi.fn(async () => {});
    const goal = { id: 'goal', objective: 'Verify the work', verifier: 'npm test' };
    const original = {
      goal,
      signal: new AbortController().signal,
      canExecute: async () => true,
      beginVerification: async () => verification,
      invalidateVerification: vi.fn(),
    } as unknown as AgentGoalTurn;
    const successor = {
      ...original,
      continueVerification: (value: typeof verification) => ({ ...value, generation: 4 }),
      acceptToolResult: accepted,
    } as unknown as AgentGoalTurn;
    const toolSet = { 'power---bash': shell, 'power---bash_poll': poll };
    const wrap = (turn: AgentGoalTurn) =>
      agent['wrapToolsWithHooks'](task, profile, toolSet, undefined, undefined, undefined, undefined, () => turn, shell, poll);
    await wrap(original)['power---bash'].execute!({ command: 'npm test', yieldMs: 1 }, { toolCallId: 'start' } as never);
    if (invalidate) {
      agent.invalidateCommandVerifications();
    }
    await wrap(successor)['power---bash_poll'].execute!({ processId: 'process-1' }, { toolCallId: 'later-poll' } as never);
    if (invalidate) {
      expect(accepted).not.toHaveBeenCalled();
    } else {
      expect(accepted).toHaveBeenCalledExactlyOnceWith(
        'later-poll',
        { ...verification, generation: 4 },
        { exitCode: 0, stdout: 'verified' },
        expect.any(Function),
        undefined,
      );
    }
  });

  it('stops only yielded native processes owned by the paused goal', async () => {
    const { agent } = createAgent();
    const task = Object.assign(createTask(), { addToolMessage: vi.fn(), getTaskDir: () => '/fixture' });
    const cancelGoalProcess = vi.fn();
    const cancelOtherProcess = vi.fn();
    const command = {
      directory: '/fixture',
      profileId: profile.id,
      preview: () => ({ stdout: '', stderr: '', exitCode: null }),
      completion: new Promise<never>(() => {}),
    };
    agent['commandSession'].commands.set('goal-process', { ...command, cancel: cancelGoalProcess });
    agent['commandSession'].commands.set('ordinary-process', { ...command, cancel: cancelOtherProcess });
    const shell = { inputSchema: z.object({}), execute: vi.fn(async () => ({ exitCode: null, processId: 'goal-process' })) };
    const goal = {
      goal: { id: 'goal' },
      signal: new AbortController().signal,
      canExecute: async () => true,
      beginVerification: async () => undefined,
      invalidateVerification: vi.fn(),
    } as unknown as AgentGoalTurn;
    const tools = agent['wrapToolsWithHooks'](task, profile, { 'power---bash': shell }, undefined, undefined, undefined, undefined, () => goal, shell);
    await tools['power---bash'].execute!({ command: 'node fixture.cjs', yieldMs: 1 }, { toolCallId: 'start' } as never);
    agent.stopGoalCommands('other-goal');
    expect(cancelGoalProcess).not.toHaveBeenCalled();
    agent.stopGoalCommands('goal');
    agent.stopGoalCommands('goal');
    expect(cancelGoalProcess).toHaveBeenCalledExactlyOnceWith();
    expect(cancelOtherProcess).not.toHaveBeenCalled();
  });

  it('uses the original native poll capability when extensions change tool definitions', async () => {
    const { agent } = createAgent();
    const task = Object.assign(createTask(), { addToolMessage: vi.fn(), getTaskDir: () => '/fixture' });
    const originalExecute = vi.fn(async () => ({ exitCode: 0 }));
    const nativePoll = { inputSchema: z.object({}), execute: originalExecute };
    const replacement = { inputSchema: z.object({}), execute: vi.fn(async () => ({ exitCode: 99 })) };
    const wrapPoll = (definition: typeof nativePoll) =>
      agent['wrapToolsWithHooks'](
        task,
        profile,
        { 'power---bash_poll': definition },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        nativePoll,
        undefined,
        undefined,
        originalExecute,
      )['power---bash_poll'];
    const capability = (poll: object) => Object.getOwnPropertySymbols(poll).find(({ description }) => description === 'native-bash-poll-capability');
    const originalWrapper = wrapPoll(nativePoll);
    expect(capability(originalWrapper)).toBeDefined();
    expect(capability(wrapPoll(replacement))).toBeUndefined();
    nativePoll.execute = replacement.execute;
    expect(capability(wrapPoll(nativePoll))).toBeUndefined();
    await expect(originalWrapper.execute!({ processId: 'fixture' }, { toolCallId: 'poll' } as never)).resolves.toEqual({ exitCode: 0 });
    expect(replacement.execute).not.toHaveBeenCalled();
  });
  it('does not start a model call whose preflight was pending at task shutdown', async () => {
    const { agent, extensionManager } = createAgent();
    let release!: (prompt: string) => void;
    const preflight = new Promise<string>((resolve) => {
      release = resolve;
    });
    agent['promptsManager'].getSystemPrompt = vi.fn(() => preflight);
    const worker = agent.runAgent(createTask(), profile, 'prompt');
    await vi.waitFor(() => expect(agent['promptsManager'].getSystemPrompt).toHaveBeenCalled());
    await agent.stopAndDrainCommands();
    release('prompt');
    await expect(worker).resolves.toEqual([]);
    expect(extensionManager.dispatchEvent).not.toHaveBeenCalled();
  });
  it('creates its own controller after the onAgentStarted dispatch so the run reports as running', async () => {
    const { agent } = createAgent();

    const { agentControllerCount } = await withAgentAbortControllerCounting(async () => stopExpected(agent.runAgent(createTask(), profile, 'prompt')));

    // one for the temporary onAgentStarted dispatch, one for the actual run
    expect(agentControllerCount).toBe(2);
  });

  it('does not create its own controller when the extension provides one', async () => {
    const extensionSignal = new AbortController().signal;
    const { agent, extensionManager } = createAgent();
    extensionManager.dispatchEvent.mockImplementation(async (_eventName: string, event: Record<string, unknown>) => ({
      ...event,
      modelCallSettings: { ...(event.modelCallSettings as object), abortSignal: extensionSignal },
    }));

    const { agentControllerCount } = await withAgentAbortControllerCounting(async () => stopExpected(agent.runAgent(createTask(), profile, 'prompt')));

    // one for the temporary onAgentStarted dispatch only - the extension signal is kept for the run
    expect(agentControllerCount).toBe(1);
  });

  it('does not create its own controller when the caller provides one', async () => {
    const callerSignal = new AbortController().signal;
    const args: RunAgentArgs = [createTask(), profile, 'prompt', 'agent', undefined, undefined, undefined, undefined, true, callerSignal];
    const { agent } = createAgent();

    const { agentControllerCount } = await withAgentAbortControllerCounting(async () => stopExpected(agent.runAgent(...args)));

    // one for the temporary onAgentStarted dispatch only - it stays unregistered
    expect(agentControllerCount).toBe(1);
  });
});

describe('Agent.runAgent error propagation', () => {
  it('does not interrupt a read recovery when the provider does not force named tools', async () => {
    const { generateText: sdkGenerateText } = await vi.importActual<typeof import('ai')>('ai');
    const { agent } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { getTaskDir: () => '/test/project' });
    const models = agent['modelManager'];
    const localModel = {
      specificationVersion: 'v4',
      provider: 'fixture',
      modelId: 'fixture',
      supportedUrls: {},
      doGenerate: vi.fn(async () => ({
        content: [{ type: 'text', text: 'A provider can respond without invoking a tool.' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: { inputTokens: { total: 10 }, outputTokens: { total: 5 } },
        warnings: [],
      })),
    };
    vi.mocked(models.createLlm).mockResolvedValue(localModel as unknown as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    agent['getAvailableTools'] = vi.fn(async () => ({ 'power---file_read': { inputSchema: z.object({}), execute: vi.fn() } }));
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    agent['processStep'] = vi.fn(async () => [{ id: 'response', role: 'assistant' as const, content: 'Fixture result' }]);
    generateTextMock.mockReset();
    generateTextMock.mockImplementationOnce(async ({ onStepEnd }) =>
      onStepEnd({
        finishReason: 'tool-calls',
        toolResults: [{ toolName: 'power---file_edit', input: { filePath: 'filter.js' }, output: 'No edit applied: identical.' }],
      }),
    );
    generateTextMock.mockImplementationOnce((options) => sdkGenerateText(options));
    generateTextMock.mockImplementationOnce(async ({ onStepEnd }) => onStepEnd({ finishReason: 'stop' }));
    try {
      await agent.runAgent(task, profile, 'Inspect the fixture', 'agent', { id: 'root' });
      expect(localModel.doGenerate).toHaveBeenCalledTimes(1);
      expect(generateTextMock).toHaveBeenCalledTimes(3);
      expect(generateTextMock.mock.calls[2][0].activeTools).toBeUndefined();
      expect(task.updateTask).not.toHaveBeenCalled();
    } finally {
      generateTextMock.mockReset();
    }
  });

  it.each([ToolApprovalState.Always, ToolApprovalState.Never])('recovers an unchanged edit through the existing read policy (%s)', async (policy) => {
    const { agent } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { getTaskDir: () => '/test/project' });
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    const fileEdit = 'power---file_edit';
    const fileRead = 'power---file_read';
    const file = { filePath: 'filter.js' };
    const tools = {
      [fileEdit]: { inputSchema: z.object({}), execute: vi.fn() },
      [fileRead]: { inputSchema: z.object({}), execute: vi.fn() },
    };
    agent['getAvailableTools'] = vi.fn(async () => tools);
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    agent['processStep'] = vi.fn(async () => [{ id: 'response', role: 'assistant' as const, content: 'Fixture result' }]);
    generateTextMock.mockReset();
    generateTextMock.mockImplementationOnce(async ({ onStepEnd }) =>
      onStepEnd({
        finishReason: 'tool-calls',
        toolResults: [{ toolName: fileEdit, input: file, output: 'No edit applied: the replacement is identical.' }],
      }),
    );
    if (policy !== ToolApprovalState.Never) {
      generateTextMock.mockImplementationOnce(async ({ onStepEnd }) =>
        onStepEnd({
          finishReason: 'tool-calls',
          toolResults: [{ toolName: fileRead, input: { filePath: path.resolve(task.getTaskDir(), file.filePath) }, output: 'Actual contents from disk' }],
        }),
      );
    }
    generateTextMock.mockImplementationOnce(async ({ onStepEnd }) => onStepEnd({ finishReason: 'stop' }));

    try {
      await agent.runAgent(task, { ...profile, toolApprovals: { [fileRead]: policy } }, 'Correct the filter', 'agent', { id: 'root' });
      if (policy === ToolApprovalState.Never) {
        expect(generateTextMock).toHaveBeenCalledTimes(2);
        expect(generateTextMock.mock.calls[1][0].toolChoice).toBeUndefined();
      } else {
        expect(generateTextMock).toHaveBeenCalledTimes(3);
        expect(generateTextMock.mock.calls[1][0]).toMatchObject({ activeTools: [fileRead], toolChoice: 'auto' });
        expect(generateTextMock.mock.calls[2][0].toolChoice).toBeUndefined();
        expect(generateTextMock.mock.calls[2][0].instructions).toContain('short, unique search fragment');
      }
      expect(tools[fileRead].execute).not.toHaveBeenCalled();
    } finally {
      generateTextMock.mockReset();
    }
  });

  it('requests one status summary with no tools after an executed tool exhausts the goal budget', async () => {
    const { agent } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { getTaskDir: () => '/test/project', setState: vi.fn() });
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.getUsageReport = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    agent['getAvailableTools'] = vi.fn(async (...args: Parameters<Agent['getAvailableTools']>) => ({
      'power---bash': {
        inputSchema: z.object({}),
        execute: vi.fn(async () => {
          args[16]?.add('verifier');
          return { exitCode: 1 };
        }),
      },
    }));
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    agent['processStep'] = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'tool-call',
          role: 'assistant',
          content: [{ type: 'tool-call', toolCallId: 'verifier', toolName: 'power---bash', input: { command: 'node verify.cjs' } }],
        },
        {
          id: 'verified-tool',
          role: 'tool',
          content: [{ type: 'tool-result', toolCallId: 'verifier', toolName: 'power---bash', output: { type: 'json', value: { exitCode: 1 } } }],
        },
      ])
      .mockResolvedValueOnce([{ id: 'status-summary', role: 'assistant', content: 'Remaining work after budget limit' }]);
    const goalRecord = { id: 'goal', objective: 'Verify the result', tokenBudget: 10, status: 'active', tokensUsed: 0 };
    const goal = {
      goal: goalRecord,
      signal: new AbortController().signal,
      getAvailableVerification: () => [],
      canExecute: async () => goalRecord.status === 'active',
      readGoal: async () => goalRecord,
      onUsage: async (tokens: number) => {
        goalRecord.tokensUsed += tokens;
        goalRecord.status = 'budget_limited';
        return false;
      },
    } as unknown as AgentGoalTurn;
    const args: RunAgentArgs = [task, profile, null, 'agent', { id: 'turn' }];
    args[18] = goal;
    const persist = vi.fn(async () => {});
    args[13] = persist;
    generateTextMock.mockReset();
    generateTextMock.mockImplementationOnce(async ({ onStepEnd, tools }) => {
      await tools['power---bash'].execute();
      await onStepEnd({ finishReason: 'tool-calls', usage: { totalTokens: 10 } });
    });
    generateTextMock.mockImplementationOnce(async ({ onStepEnd }) => {
      expect(persist).toHaveBeenCalledWith({ messages: expect.arrayContaining([expect.objectContaining({ id: 'verified-tool' })]) });
      await onStepEnd({ finishReason: 'stop', usage: { totalTokens: 2 } });
    });

    try {
      const messages = await agent.runAgent(...args);
      expect(generateTextMock).toHaveBeenCalledTimes(2);
      expect(generateTextMock.mock.calls[1][0]).toMatchObject({ tools: {}, activeTools: [], instructions: expect.stringContaining('token budget') });
      expect(messages.map(({ id }) => id)).toEqual(['tool-call', 'verified-tool', 'status-summary']);
      expect(goalRecord).toMatchObject({ status: 'budget_limited', tokensUsed: 12 });
    } finally {
      generateTextMock.mockReset();
    }
  });

  it.each(['root', 'descendant'] as const)('does not sample again after a %s compaction exhausts the shared goal budget', async (scope) => {
    const { agent } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { getTaskDir: () => '/test/project' });
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.getUsageReport = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    let remaining = 10;
    const goal = {
      goal: { id: 'active-goal', objective: 'Verify the result', tokenBudget: remaining },
      signal: new AbortController().signal,
      getAvailableVerification: () => [],
      canExecute: async () => remaining > 0,
      onUsage: async (tokens: number) => (remaining -= tokens) > 0,
    } as unknown as AgentGoalTurn;
    agent['compactMessagesIfNeeded'] = vi.fn(async (...args: Parameters<Agent['compactMessagesIfNeeded']>) => {
      await args[12]?.onUsage(10, false);
      return true;
    });
    agent['processStep'] = vi.fn(async () => [{ id: 'unexpected', role: 'assistant' as const, content: 'Should not have sampled' }]);
    generateTextMock.mockReset();
    generateTextMock.mockImplementation(async ({ onStepEnd }) => onStepEnd({ finishReason: 'stop', usage: { totalTokens: 1 } }));
    const args: RunAgentArgs = [task, profile, null, 'agent', { id: 'turn' }];
    if (scope === 'root') {
      args[18] = goal;
    } else {
      args[19] = { onUsage: goal.onUsage, canSample: goal.canExecute };
    }
    try {
      await agent.runAgent(...args);
      expect(remaining).toBe(0);
      expect(generateTextMock).not.toHaveBeenCalled();
      expect(task.updateTask).not.toHaveBeenCalled();
    } finally {
      generateTextMock.mockReset();
    }
  });

  it.each([
    { scope: 'root', output: undefined },
    { scope: 'worker', output: undefined },
    { scope: 'worker', output: 'Preface\n### **Conversation Summary**\n' },
  ])('preserves the $scope working history when compaction produces no summary ($output)', async ({ scope, output }) => {
    const { agent } = createAgent(new Error('fixture'));
    const user: ContextMessage = { id: 'user', role: 'user', content: 'Preserve the exact original request' };
    const evidence: ContextMessage = { id: 'evidence', role: 'assistant', content: 'Preserve the already observed tool outcome' };
    const contextMessages = [user];
    const resultMessages = [evidence];
    const messages = [user, evidence];
    const task = Object.assign(createTask(), {
      task: { id: 'test-task', contextCompactingThresholdTokens: 1 },
      getTaskDir: () => '/test/project',
      getContextMessages: vi.fn(async () => [user]),
      compactConversation: vi.fn(async () => false),
      sendTaskMessageRemoved: vi.fn(),
      reloadGroupMessages: vi.fn(),
    });
    const models = agent['modelManager'];
    const [provider] = models.getProviders();
    models.getModelSettings = vi.fn();
    vi.mocked(agent['store'].getSettings).mockReturnValue({ taskSettings: { contextCompactingThreshold: { percentage: 95, tokens: 100 } } } as never);
    agent['promptsManager'].getCompactConversationPrompt = vi.fn(async () => 'Compact the existing conversation');
    agent.generateText = vi.fn(async () => output);
    agent['prepareMessages'] = vi.fn(async () => []);

    await expect(
      agent['compactMessagesIfNeeded'](
        task,
        { ...profile, isSubagent: scope === 'worker', autoCompactionType: ContextCompactionType.Compact },
        provider,
        'test-model',
        user,
        contextMessages,
        [],
        messages as never,
        resultMessages,
      ),
    ).resolves.toBe(true);

    expect(contextMessages).toEqual([user]);
    expect(resultMessages).toEqual([evidence]);
    expect(messages).toEqual([user, evidence]);
    expect(agent['prepareMessages']).not.toHaveBeenCalled();
    expect(task.reloadGroupMessages).not.toHaveBeenCalled();
  });

  it.each(['connection reset', 'provider unavailable'] as const)('retries a %s without streaming on the same turn', async (kind) => {
    const { agent } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { getTaskDir: () => '/test/project', setState: vi.fn() });
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    models.isRetryable = vi.fn(() => true);
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    agent['processStep'] = vi.fn(async () => [{ id: 'done', role: 'assistant' as const, content: 'Recovered' }]);
    const error =
      kind === 'connection reset'
        ? Object.assign(new Error('Connection failed'), { code: 'ECONNRESET' })
        : new APICallError({ message: 'Service unavailable', statusCode: 503, isRetryable: true, url: 'http://127.0.0.1', requestBodyValues: {} });
    generateTextMock.mockReset();
    generateTextMock.mockRejectedValueOnce(error);
    generateTextMock.mockImplementationOnce(async ({ onStepEnd }) => onStepEnd({ finishReason: 'stop' }));

    try {
      const messages = await agent.runAgent(task, profile, 'Finish after recovery', 'agent', { id: 'root' });
      expect(generateTextMock).toHaveBeenCalledTimes(2);
      expect(messages.at(-1)).toMatchObject({ id: 'done' });
      expect(task.updateTask).not.toHaveBeenCalled();
    } finally {
      generateTextMock.mockReset();
    }
  });

  it.each(['adapter veto', 'quota exhausted', 'tool executed', 'retry after'] as const)('honors the %s retry boundary', async (kind) => {
    const { agent } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { getTaskDir: () => '/test/project', setState: vi.fn() });
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    models.isRetryable = vi.fn(() => kind !== 'adapter veto');
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    agent['processStep'] = vi.fn(async () => [{ id: 'done', role: 'assistant' as const, content: 'Recovered' }]);
    const reportUsageLimit = vi.fn(async () => {});
    const reportTerminalError = vi.fn(async () => {});
    const goal = {
      goal: { id: 'goal', objective: 'Recover from provider failures' },
      signal: new AbortController().signal,
      getAvailableVerification: () => [],
      onUsage: vi.fn(async () => true),
      reportUsageLimit,
      reportTerminalError,
    } as unknown as AgentGoalTurn;
    const error = new APICallError({
      message: 'Provider unavailable',
      statusCode: kind === 'quota exhausted' || kind === 'retry after' ? 429 : 503,
      isRetryable: true,
      responseHeaders: { 'retry-after-ms': '20' },
      responseBody: kind === 'quota exhausted' ? '{"error":{"code":"insufficient_quota"}}' : undefined,
      url: 'http://127.0.0.1',
      requestBodyValues: {},
    });
    generateTextMock.mockReset();
    generateTextMock.mockImplementationOnce(async ({ onToolExecutionStart }) => {
      if (kind === 'tool executed') {
        onToolExecutionStart();
      }
      throw error;
    });
    generateTextMock.mockImplementationOnce(async ({ onStepEnd }) => onStepEnd({ finishReason: 'stop' }));
    const args: RunAgentArgs = [task, profile, null, 'agent', { id: 'root' }];
    args[18] = goal;

    try {
      const started = performance.now();
      await agent.runAgent(...args);
      expect(generateTextMock).toHaveBeenCalledTimes(kind === 'retry after' ? 2 : 1);
      expect(generateTextMock.mock.calls.every(([options]) => options.maxRetries === 0)).toBe(true);
      expect(reportUsageLimit).toHaveBeenCalledTimes(kind === 'quota exhausted' ? 1 : 0);
      expect(reportTerminalError).toHaveBeenCalledTimes(kind === 'adapter veto' ? 1 : 0);
      if (kind === 'quota exhausted') {
        expect(task.updateTask).not.toHaveBeenCalled();
      }
      if (kind === 'retry after') {
        expect(performance.now() - started).toBeGreaterThanOrEqual(18);
        expect(task.updateTask).not.toHaveBeenCalled();
      }
    } finally {
      generateTextMock.mockReset();
    }
  });

  it.each(['ordinary', 'metered'] as const)('keeps a %s root turn alive beyond finite connection retries', async (kind) => {
    const { agent } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { getTaskDir: () => '/test/project' });
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    models.isRetryable = vi.fn(() => true);
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    agent['processStep'] = vi.fn(async () => [{ id: 'reconnected', role: 'assistant' as const, content: 'Connected' }]);
    const cause = new AggregateError([
      Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED', syscall: 'connect' }),
      Object.assign(new Error('Connection timed out'), { code: 'ETIMEDOUT', syscall: 'connect' }),
    ]);
    const error =
      kind === 'metered'
        ? cause
        : new APICallError({ message: 'Cannot connect to API', cause, isRetryable: true, url: 'http://127.0.0.1', requestBodyValues: {} });
    generateTextMock.mockReset();
    for (let attempt = 0; attempt < 6; attempt++) {
      generateTextMock.mockRejectedValueOnce(error);
    }
    generateTextMock.mockImplementationOnce(async ({ onStepEnd }) => onStepEnd({ finishReason: 'stop' }));
    const onUsage = vi.fn<(tokens?: number) => Promise<boolean>>(async () => true);
    const args: RunAgentArgs = [task, { ...profile, maxIterations: 1 }, 'Finish after reconnection', 'agent', { id: 'root' }];
    if (kind === 'metered') {
      args[18] = {
        goal: { id: 'goal', objective: 'Finish after reconnection', tokenBudget: 50 },
        signal: new AbortController().signal,
        getAvailableVerification: () => [],
        canExecute: async () => true,
        onUsage,
      } as unknown as AgentGoalTurn;
    }
    vi.mocked(wait).mockClear();
    try {
      await vi.mocked(wait).withImplementation(
        async () => undefined,
        async () => {
          const messages = await agent.runAgent(...args);
          expect(generateTextMock).toHaveBeenCalledTimes(7);
          expect(vi.mocked(wait).mock.calls.map(([delay]) => delay)).toEqual([5000, 10000, 20000, 40000, 60000, 60000]);
          expect(messages.at(-1)).toMatchObject({ id: 'reconnected' });
          expect(task.updateTask).not.toHaveBeenCalled();
          if (kind === 'metered') {
            expect(onUsage.mock.calls.slice(0, 6)).toEqual([[0], [0], [0], [0], [0], [0]]);
          }
        },
      );
    } finally {
      generateTextMock.mockReset();
    }
  });

  it.each(['HTTP unavailable', 'connection reset', 'mixed connection errors', 'Bedrock connection refused'] as const)(
    'retains finite retries for %s',
    async (kind) => {
      const { agent } = createAgent(new Error('fixture'));
      const task = Object.assign(createTask(), { getTaskDir: () => '/test/project' });
      const models = agent['modelManager'];
      vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
      if (kind === 'Bedrock connection refused') {
        const [provider] = models.getProviders();
        vi.mocked(models.getProviders).mockReturnValue([{ ...provider, provider: { ...provider.provider, name: 'bedrock' } } as typeof provider]);
      }
      models.getModelSettings = vi.fn();
      models.isStreamingDisabled = vi.fn(() => true);
      models.isRetryable = vi.fn(() => true);
      agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
      const cause =
        kind === 'mixed connection errors'
          ? Object.assign(new AggregateError([Object.assign(new Error('Socket reset'), { code: 'ECONNRESET' })]), { code: 'ECONNREFUSED' })
          : Object.assign(new Error(kind), { code: kind === 'connection reset' ? 'ECONNRESET' : 'ECONNREFUSED' });
      const error = new APICallError({
        message: kind,
        statusCode: kind === 'HTTP unavailable' ? 503 : undefined,
        cause,
        isRetryable: true,
        url: 'http://127.0.0.1',
        requestBodyValues: {},
      });
      generateTextMock.mockReset();
      // Let the test report an extra retry without leaving an unbounded mocked run.
      for (let attempt = 0; attempt < 4; attempt++) {
        generateTextMock.mockRejectedValueOnce(error);
      }
      try {
        await vi.mocked(wait).withImplementation(
          async () => undefined,
          async () => {
            await agent.runAgent(task, { ...profile, maxIterations: 1 }, 'Finish after recovery', 'agent', { id: 'root' });
            expect(generateTextMock).toHaveBeenCalledTimes(4);
            expect(task.updateTask).toHaveBeenCalledWith({ state: DefaultTaskState.Interrupted });
          },
        );
      } finally {
        generateTextMock.mockReset();
      }
    },
  );

  it('interrupts an outstanding provider reconnection wait when the root turn is stopped', async () => {
    const { agent, extensionManager } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { getTaskDir: () => '/test/project' });
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    const controller = new AbortController();
    generateTextMock.mockReset();
    generateTextMock.mockRejectedValue(Object.assign(new Error('Provider connection refused'), { code: 'ECONNREFUSED' }));
    const args: RunAgentArgs = [task, profile, 'Finish after recovery', 'agent', { id: 'root' }];
    args[9] = controller.signal;
    const run = agent.runAgent(...args);
    try {
      await vi.waitFor(() => expect(task.addLogMessage).toHaveBeenCalledWith('loading', 'Riconnessione al provider in attesa della rete…', false, args[4]));
      controller.abort();
      await run;
      expect(generateTextMock).toHaveBeenCalledTimes(1);
      expect(extensionManager.dispatchEvent).toHaveBeenCalledWith('onAgentFinished', expect.objectContaining({ aborted: true }), task.project, task);
    } finally {
      controller.abort();
      await run;
      generateTextMock.mockReset();
    }
  });

  it.each([true, false])('keeps the native tool result when a turn reaches its iteration limit (active goal: %s)', async (activeGoal) => {
    const { agent } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { getTaskDir: () => '/test/project' });
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    const evidence: ContextMessage = {
      id: 'failed-check',
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId: 'check', toolName: 'power---bash', output: { type: 'text', value: 'Observed failure' } }],
    };
    agent['processStep'] = vi.fn(async () => [evidence]);
    const reportTerminalError = vi.fn(async () => {});
    const goal = {
      goal: { id: 'active-goal', objective: 'Resolve the regression' },
      signal: new AbortController().signal,
      getAvailableVerification: () => [],
      onUsage: vi.fn(async () => true),
      reportTerminalError,
    } as unknown as AgentGoalTurn;
    const args: RunAgentArgs = [task, { ...profile, maxIterations: 1 }, 'Resolve the regression', 'agent', { id: 'turn' }];
    args[18] = activeGoal ? goal : undefined;
    generateTextMock.mockReset();
    generateTextMock.mockImplementationOnce(async ({ onStepEnd }) => onStepEnd({ finishReason: 'tool-calls' }));

    try {
      const messages = await agent.runAgent(...args);
      expect(generateTextMock).toHaveBeenCalledOnce();
      expect(messages).toContain(evidence);
      expect(reportTerminalError).not.toHaveBeenCalled();
      if (activeGoal) {
        expect(task.updateTask).not.toHaveBeenCalledWith({ state: DefaultTaskState.Interrupted });
      } else {
        expect(task.updateTask).toHaveBeenCalledWith({ state: DefaultTaskState.Interrupted });
      }
    } finally {
      generateTextMock.mockReset();
    }
  });

  it.each(['interrupt', 'interrupt-without-usage', 'step-failure'] as const)('accounts usable model reports on %s', async (failure) => {
    const { agent } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { getTaskDir: () => '/test/project' });
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.getUsageReport = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    const controller = new AbortController();
    const onUsage = vi.fn(async () => true);
    const goal = {
      goal: { id: 'active-goal', objective: 'Verify the result' },
      signal: controller.signal,
      getAvailableVerification: () => [],
      onUsage,
      reportTerminalError: vi.fn(async () => {}),
    } as unknown as AgentGoalTurn;
    if (failure === 'step-failure') {
      agent['processStep'] = vi.fn(async () => {
        throw new Error('response processing failure');
      });
    }
    generateTextMock.mockReset();
    generateTextMock.mockImplementationOnce(async ({ onStepEnd }) => {
      if (failure !== 'step-failure') {
        controller.abort();
      }
      const usage =
        failure === 'interrupt-without-usage' ? { inputTokens: undefined } : { inputTokens: 31, outputTokens: 9, inputTokenDetails: { cacheReadTokens: 11 } };
      await onStepEnd({ finishReason: 'stop', usage });
    });
    const args: RunAgentArgs = [task, profile, null, 'agent', { id: 'turn' }];
    args[18] = goal;

    try {
      await agent.runAgent(...args);
      if (failure === 'interrupt-without-usage') {
        expect(onUsage).not.toHaveBeenCalled();
      } else {
        expect(onUsage).toHaveBeenCalledExactlyOnceWith(29);
      }
      expect(generateTextMock).toHaveBeenCalledTimes(1);
    } finally {
      generateTextMock.mockReset();
    }
  });

  it('samples separately identified steering inputs after the current response, in order', async () => {
    const { agent } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { addUserMessage: vi.fn(), getTaskDir: () => '/test/project', setState: vi.fn() });
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    models.normalizeMessages = vi.fn((_provider, _model, messages) => messages);
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    agent['processStep'] = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'step-1', role: 'assistant', content: 'Initial response' }])
      .mockResolvedValueOnce([{ id: 'step-2', role: 'assistant', content: 'Follow-up response' }]);
    const steering = [
      { id: 'steer-a', role: 'user' as const, content: 'Correction A', promptContext: { id: 'root' } },
      { id: 'steer-b', role: 'user' as const, content: 'Correction B', promptContext: { id: 'root' } },
    ];
    const takeSteering = vi.fn(async () => [] as typeof steering).mockResolvedValueOnce(steering);
    const args: RunAgentArgs = [task, profile, 'Initial request', 'agent', { id: 'root' }];
    args[22] = { take: takeSteering, hasPendingOrClose: vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false) };
    generateTextMock.mockReset();
    generateTextMock.mockImplementation(async ({ onStepEnd }) => onStepEnd({ finishReason: 'stop' }));
    try {
      const result = await agent.runAgent(...args);

      expect(task.addLogMessage).not.toHaveBeenCalledWith('error', expect.anything(), expect.anything(), expect.anything());
      expect(generateTextMock).toHaveBeenCalledTimes(2);
      expect(generateTextMock.mock.calls[1][0].messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Correction A' }),
          expect.objectContaining({ role: 'user', content: 'Correction B' }),
        ]),
      );
      expect(result.map(({ id }) => id)).toEqual(['root', 'step-1', 'steer-a', 'steer-b', 'step-2']);
      expect(task.addUserMessage.mock.calls.map(([id]) => id)).toEqual(['steer-a', 'steer-b']);
    } finally {
      generateTextMock.mockReset();
    }
  });

  it.each([false, true])('keeps a goal active when Designer requests a correction or is pending (%s)', async (pending) => {
    const { agent } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { getTaskDir: () => '/test/project' });
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    agent['processStep'] = vi.fn(async () => [{ id: 'sample', role: 'assistant' as const, content: 'Completion requested.' }]);
    const invalidateVerification = vi.fn();
    const reportTerminalError = vi.fn(async () => {});
    const goal = {
      goal: { id: 'active-goal', objective: 'Correct the view' },
      signal: new AbortController().signal,
      getAvailableVerification: () => [],
      canExecute: vi.fn(async () => true),
      onUsage: vi.fn(async () => true).mockResolvedValueOnce(false),
      invalidateVerification,
      reportTerminalError,
    } as unknown as AgentGoalTurn;
    const args: RunAgentArgs = [task, profile, 'Correct the view', 'agent', { id: 'turn' }];
    args[18] = goal;
    const review = vi.fn(async () => undefined as string | undefined);
    if (pending) {
      review.mockRejectedValueOnce(new AgentDesignReviewPending('Pending Designer evidence'));
    } else {
      review.mockResolvedValueOnce('Correct the stale visible label.');
    }
    args[23] = review;
    generateTextMock.mockReset();
    generateTextMock.mockImplementation(async ({ onStepEnd }) => onStepEnd({ finishReason: 'stop' }));

    try {
      await agent.runAgent(...args);
      expect(reportTerminalError).not.toHaveBeenCalled();
      expect(generateTextMock).toHaveBeenCalledTimes(pending ? 1 : 2);
      expect(review).toHaveBeenCalledTimes(pending ? 1 : 2);
      expect(invalidateVerification).toHaveBeenCalledTimes(pending ? 0 : 1);
      if (pending) {
        expect(task.updateTask).toHaveBeenCalledWith({ state: DefaultTaskState.Interrupted });
      }
    } finally {
      generateTextMock.mockReset();
    }
  });

  it.each([
    ['maximum context length', undefined],
    ['Bad Request', JSON.stringify({ error: { code: '1261', message: 'Prompt too long' } })],
    ['Bad Request', JSON.stringify({ error: { code: '1261', message: 'Prompt exceeds max length' } })],
  ])('compacts after provider context overflow (%s) and retries the failed step once', async (message, responseBody) => {
    const { agent } = createAgent(new Error('fixture'));
    const task = createTask();
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    const compact = vi.fn(async () => true);
    agent['compactMessagesIfNeeded'] = compact;
    agent['processStep'] = vi.fn(async () => [{ id: 'done', role: 'assistant' as const, content: 'verified' }]);
    generateTextMock.mockReset();
    generateTextMock.mockRejectedValueOnce(new APICallError({ message, responseBody, url: 'https://example.invalid', requestBodyValues: {}, statusCode: 400 }));
    generateTextMock.mockImplementationOnce(async ({ onStepEnd }) => onStepEnd({ finishReason: 'stop' }));
    try {
      await expect(agent.runAgent(task, { ...profile, isSubagent: true, maxIterations: 1 }, 'prompt', 'subagent')).resolves.toBeDefined();
      expect(generateTextMock).toHaveBeenCalledTimes(2);
      expect(compact.mock.calls.map((args) => (args as unknown[])[11])).toEqual([false, true]);
    } finally {
      generateTextMock.mockReset();
    }
  });
  it('bounds repeated tool-only stops and returns an incomplete outcome to the caller', async () => {
    const { agent, extensionManager } = createAgent(new Error('model fixture'));
    const task = createTask();
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    agent['processStep'] = vi.fn(async () => [{ id: 'tool-result', role: 'tool' as const, content: [] }]);
    generateTextMock.mockClear();
    generateTextMock.mockImplementation(async ({ onStepEnd }) => onStepEnd({ finishReason: 'stop' }));
    try {
      await expect(agent.runAgent(task, { ...profile, isSubagent: true, maxIterations: 6 }, 'prompt', 'subagent')).rejects.toThrow(
        'Il modello si è fermato dopo l’esecuzione di uno strumento',
      );
      expect(generateTextMock).toHaveBeenCalledTimes(4);
      expect(generateTextMock.mock.calls.slice(1).map(([call]) => call.instructions)).toEqual(
        Array.from({ length: 3 }, () => expect.stringContaining('Usa il risultato dello strumento')),
      );
      expect(extensionManager.dispatchEvent).not.toHaveBeenCalledWith('onAgentFinished', expect.anything(), expect.anything(), expect.anything());
    } finally {
      generateTextMock.mockReset();
    }
  });

  it('records the completed tool and provider usage after a late reset at the iteration limit', async () => {
    const { agent } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { getTaskDir: () => '/test/project', addToolMessage: vi.fn(), sendTaskMessageRemoved: vi.fn() });
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.getUsageReport = vi.fn(() => ({ sentTokens: 12, receivedTokens: 8 }) as never);
    models.isStreamingDisabled = vi.fn(() => false);
    models.isToolCallStreamingDisabled = vi.fn(() => false);
    models.isRetryable = vi.fn(() => true);
    agent['getAvailableTools'] = vi.fn(async () => ({ 'power---bash': { inputSchema: z.object({}) } }));
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    const onUsage = vi.fn(async () => true);
    const goal = {
      goal: { id: 'goal', objective: 'Keep verified results', tokenBudget: 200 },
      signal: new AbortController().signal,
      canExecute: async () => true,
      getAvailableVerification: () => [],
      onUsage,
    } as unknown as AgentGoalTurn;
    const reset = new APICallError({ message: 'Fixture stream reset', url: 'http://127.0.0.1', requestBodyValues: {}, isRetryable: true, statusCode: 200 });
    const callId = 'sample';
    const call = { type: 'tool-call', toolCallId: 'completed-native', toolName: 'power---bash', input: { command: 'node --test' } };
    const result = { ...call, type: 'tool-result', output: { exitCode: 0, stdout: 'recorded native output' } };
    streamTextMock.mockImplementation(({ onLanguageModelCallEnd, onToolExecutionStart, onToolExecutionEnd }) => ({
      stream: (async function* () {
        onLanguageModelCallEnd({ callId, finishReason: 'tool-calls', content: [call], usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 } });
        onToolExecutionStart({ callId, toolCall: call });
        onToolExecutionEnd({ callId, toolCall: call, toolOutput: result });
        yield call;
        yield result;
        throw reset;
      })(),
    }));
    const args: RunAgentArgs = [task, { ...profile, maxIterations: 1 }, 'Keep the test result', 'agent', { id: 'root' }];
    args[18] = goal;
    try {
      const messages = await agent.runAgent(...args);
      expect(onUsage).toHaveBeenCalledExactlyOnceWith(20);
      expect(streamTextMock).toHaveBeenCalledTimes(1);
      expect(messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ role: 'tool', content: [expect.objectContaining({ toolCallId: call.toolCallId })] })]),
      );
      expect(task.updateTask).toHaveBeenCalledWith({ state: DefaultTaskState.Interrupted });
    } finally {
      streamTextMock.mockReset();
    }
  });

  it.each([
    {
      scenario: 'Node failures',
      command: 'node --test "C:/isolated/private-test-name.cjs"',
      query: 'Node.js test runner failure diagnostics official documentation',
    },
    {
      scenario: 'typecheck failures',
      command: 'npm run typecheck -- "C:/isolated/private-test-name.ts"',
      query: 'npm typecheck script compiler diagnostics official documentation',
    },
    { scenario: 'exhausted iterations', command: 'node --test', maxIterations: 2 },
    { scenario: 'empty Node reports', command: 'node --test', query: 'Node.js test runner failure diagnostics official documentation', emptyReport: true },
    { scenario: 'polled Node failures', command: 'node --test', query: 'Node.js test runner failure diagnostics official documentation', polled: true },
  ])('uses targeted verification recovery for $scenario', async ({ command, query, maxIterations = 6, emptyReport, polled }) => {
    const { agent } = createAgent(new Error('fixture'));
    const task = Object.assign(createTask(), { getTaskDir: () => '/test/project' });
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    const search = vi.fn(async () => '## Search Results: official diagnostic fixture');
    vi.spyOn(agent, 'createTechnicalSearch').mockReturnValue(search);
    agent['processStep'] = vi.fn(async (_id, step) =>
      step.finishReason === 'stop'
        ? [{ id: 'done', role: 'assistant' as const, content: 'The final check passed.' }]
        : [{ id: 'tool-result', role: 'tool' as const, content: [] }],
    );

    let attempts = 0;
    generateTextMock.mockReset();
    generateTextMock.mockImplementation(async ({ onStepEnd }) => {
      attempts++;
      if (attempts === 5) {
        await onStepEnd({ finishReason: 'stop' });
        return;
      }
      const ranTests = attempts === 4;
      const output = { exitCode: ranTests || emptyReport ? 0 : 1, stderr: 'private-fixture-output' };
      Object.defineProperty(output, NATIVE_EMPTY_TEST_REPORT, { value: Boolean(emptyReport && !ranTests) });
      Object.defineProperty(output, NATIVE_VERIFICATION_RESEARCH_QUERY, { value: verificationResearchQuery(command) });
      await onStepEnd({
        finishReason: 'tool-calls',
        toolResults: [
          polled ? { toolName: 'power---bash_poll', input: { processId: 'fixture' }, output } : { toolName: 'power---bash', input: { command }, output },
        ],
      });
    });

    try {
      await agent.runAgent(task, { ...profile, maxIterations }, 'Fix and verify the fixture', 'agent');
      if (!query) {
        expect(search).not.toHaveBeenCalled();
        expect(generateTextMock).toHaveBeenCalledTimes(maxIterations);
        return;
      }
      expect(search).toHaveBeenCalledExactlyOnceWith(query);
      expect(generateTextMock).toHaveBeenCalledTimes(5);
      expect(generateTextMock.mock.calls[2][0].instructions).toContain('change the diagnostic strategy');
      expect(generateTextMock.mock.calls[2][0].messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining('untrustedTechnicalReferences') })]),
      );
      expect(generateTextMock.mock.calls[4][0].instructions).not.toContain('change the diagnostic strategy');
      expect(search.mock.calls.flat().join(' ')).not.toContain('private-');
    } finally {
      generateTextMock.mockReset();
    }
  });

  it.each(['step', 'length', 'content-filter', 'iterations', 'abort'] as const)('reports %s termination accurately for a subagent', async (termination) => {
    const error = new Error('step processing failed');
    const { agent, extensionManager } = createAgent(new Error('model fixture'));
    const task = createTask();
    const models = agent['modelManager'];
    vi.mocked(models.createLlm).mockResolvedValue({} as Awaited<ReturnType<typeof models.createLlm>>);
    models.getModelSettings = vi.fn();
    models.isStreamingDisabled = vi.fn(() => true);
    agent['compactMessagesIfNeeded'] = vi.fn(async () => true);
    const controller = new AbortController();
    agent['processStep'] = vi.fn(async () => {
      if (termination === 'step') {
        throw error;
      }
      return [];
    });
    generateTextMock.mockImplementationOnce(async ({ onStepEnd }) => {
      const finishReason = termination === 'iterations' ? 'tool-calls' : termination === 'step' || termination === 'abort' ? 'stop' : termination;
      await onStepEnd({ finishReason });
      if (termination === 'abort') {
        controller.abort();
      }
    });

    const run = agent.runAgent(
      task,
      { ...profile, isSubagent: true, maxIterations: 1 },
      'prompt',
      'subagent',
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      controller.signal,
    );
    if (termination === 'abort') {
      await expect(run).resolves.toBeDefined();
      expect(extensionManager.dispatchEvent).toHaveBeenCalledWith(
        'onAgentFinished',
        expect.objectContaining({ aborted: true }),
        expect.anything(),
        expect.anything(),
      );
    } else {
      const failures = {
        step: 'step processing failed',
        length: 'limite di output',
        'content-filter': 'filtrato la risposta',
        iterations: 'Limite di iterazioni',
      };
      await expect(run).rejects.toThrow(failures[termination]);
      expect(extensionManager.dispatchEvent).not.toHaveBeenCalledWith('onAgentFinished', expect.anything(), expect.anything(), expect.anything());
    }
    expect(task.updateTask).not.toHaveBeenCalled();
  });
  it('propagates subagent errors instead of returning incomplete messages', async () => {
    const error = new Error('model failure');
    const { agent } = createAgent(error);
    const task = createTask();

    await expect(agent.runAgent(task, { ...profile, isSubagent: true }, 'prompt', 'subagent')).rejects.toBe(error);
    expect(task.updateTask).not.toHaveBeenCalled();
    expect(agent.isRunning()).toBe(false);
  });

  it('preserves interrupted-state handling for main agent errors', async () => {
    const { agent } = createAgent(new Error('model failure'));
    const task = createTask();

    await expect(agent.runAgent(task, profile, 'prompt')).resolves.toBeDefined();
    expect(task.updateTask).toHaveBeenCalledWith({ state: DefaultTaskState.Interrupted });
    expect(agent.isRunning()).toBe(false);
  });
});

it('uses the approved global search extension through the same adapter for different model providers', async () => {
  const { agent } = createAgent();
  const task = createTask();
  const manager = agent['extensionManager'];
  manager.isInitialized = vi.fn(() => true);
  const execute = vi.fn(async () => '## Search Results: fixture');
  manager.createExtensionToolset = vi.fn(() => ({ search: { inputSchema: z.object({ query: z.string() }), execute } }));
  expect(agent.createTechnicalSearch(task, profile)).toBeUndefined();
  const key = 'searxng-search' + TOOL_GROUP_NAME_SEPARATOR + 'search';
  const approved = { ...profile, toolApprovals: { [key]: ToolApprovalState.Always } };
  for (const provider of ['test-provider', 'local-model']) {
    await expect(agent.createTechnicalSearch(task, { ...approved, provider })?.('TypeScript syntax diagnostics')).resolves.toContain('Search Results');
  }
  expect(manager.createExtensionToolset).toHaveBeenCalledWith(task, 'agent', expect.anything(), {}, expect.anything(), undefined, 'searxng-search');
  expect(execute).toHaveBeenCalledTimes(2);
  expect(agent.createTechnicalSearch(task, { ...approved, toolApprovals: { [key]: ToolApprovalState.Ask } })).toBeUndefined();
  vi.stubEnv('AIDER_DESK_LAB_MODE', 'true');
  try {
    expect(agent.createTechnicalSearch(task, approved)).toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
  }
});
