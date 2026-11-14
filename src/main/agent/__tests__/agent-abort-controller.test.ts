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
      expect(compact.mock.calls.map((args) => (args as unknown[]).at(-1))).toEqual([false, true]);
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
