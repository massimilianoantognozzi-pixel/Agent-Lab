import { describe, expect, it, vi } from 'vitest';

import { AiderManager } from '../aider-manager';

type FakeAiderProcess = { pid?: number };

const createManager = () => {
  const task = {
    getProjectDir: () => '/tmp/aider-desk-test-project',
    getTaskDir: () => '/tmp/aider-desk-test-project/task',
    task: { id: 'task-id' },
    taskId: 'task-id',
  };
  const eventManager = {
    sendAiderConnectorStatus: vi.fn(),
  };

  return {
    manager: new AiderManager(task as never, {} as never, {} as never, eventManager as never, () => [], {} as never),
    eventManager,
  };
};

describe('AiderManager process lifecycle', () => {
  it('delivers the latest startup model selection before announcing readiness', () => {
    const { manager, eventManager } = createManager();
    const internals = manager as unknown as {
      sendSetModels: (main: string, weak: string | null, format: string, env: Record<string, string>) => void;
    };
    internals.sendSetModels('old-model', null, 'diff', {});
    internals.sendSetModels('ollama_chat/local-model', null, 'diff', { OLLAMA_API_BASE: 'http://127.0.0.1:11435' });
    const sendSetModelsMessage = vi.fn();
    const connector = { source: 'aider', listenTo: ['set-models'], sendSetModelsMessage };
    manager.handleConnectorAdded(connector as never);
    expect(sendSetModelsMessage).toHaveBeenCalledExactlyOnceWith('ollama_chat/local-model', null, 'diff', { OLLAMA_API_BASE: 'http://127.0.0.1:11435' });
    expect(sendSetModelsMessage.mock.invocationCallOrder[0]).toBeLessThan(eventManager.sendAiderConnectorStatus.mock.invocationCallOrder[0]);
    manager.handleConnectorAdded(connector as never);
    expect(sendSetModelsMessage).toHaveBeenCalledTimes(1);
  });

  it('clears the started state and reports a startup failure when the child exits naturally', () => {
    const { manager, eventManager } = createManager();
    const process = { pid: 1234 } as FakeAiderProcess;
    const internals = manager as unknown as {
      aiderProcess: FakeAiderProcess | null;
      aiderStarting: boolean;
      currentCommand: string | null;
      handleAiderProcessExit: (process: FakeAiderProcess, code: number | null) => void;
    };

    internals.aiderProcess = process;
    internals.aiderStarting = true;
    internals.currentCommand = 'ask';

    internals.handleAiderProcessExit(process, 0);

    expect(manager.isStarted()).toBe(false);
    expect(internals.currentCommand).toBeNull();
    expect(eventManager.sendAiderConnectorStatus).toHaveBeenCalledWith(
      { state: 'failed', error: 'Aider process exited before the connector became ready (code 0)' },
      '/tmp/aider-desk-test-project',
      'task-id',
    );
  });
});
