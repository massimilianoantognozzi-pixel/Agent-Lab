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
import { describe, expect, it, vi } from 'vitest';
import { DefaultTaskState, ToolApprovalState, type AgentProfile } from '@common/types';
import { TOOL_GROUP_NAME_SEPARATOR } from '@common/tools';
import { z } from 'zod';
import { APICallError } from 'ai';

import type { Task } from '@/task';
import type { AgentGoalTurn } from '@/task/agent-goal';

import { workerToolFingerprint } from '@/agent/worker-checkpoint';

vi.mock('@/logger');
const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: generateTextMock,
}));

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
      if (kind === 'retry after') {
        expect(performance.now() - started).toBeGreaterThanOrEqual(18);
        expect(task.updateTask).not.toHaveBeenCalled();
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
      expect(compact.mock.calls.map((args) => (args as unknown[]).at(-2))).toEqual([false, true]);
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
