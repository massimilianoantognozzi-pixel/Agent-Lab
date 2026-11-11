import { expect, it, vi } from 'vitest';

import { Agent } from '../agent/agent';
import { ContextManager } from '../task/context-manager';
vi.mock('@/logger');
it('finishes an errored tool card with its real error instead of leaving an empty spinner', async () => {
  const addToolMessage = vi.fn();
  const agent = Object.assign(Object.create(Agent.prototype), {
    modelManager: { getUsageReport: vi.fn(() => ({ sentTokens: 1, receivedTokens: 1 })) },
  }) as Agent;
  await agent['processStep'](
    'response',
    {
      content: [
        {
          type: 'tool-error',
          toolCallId: 'failed-call',
          toolName: 'lab---file_edit',
          input: { file: 'app.js' },
          error: new Error('Il testo cercato non esiste'),
        },
      ],
      toolCalls: [],
      toolResults: [],
      finishReason: 'tool-calls',
      usage: {},
      response: { messages: [] },
    } as never,
    { addToolMessage, addLogMessage: vi.fn() } as never,
    { id: 'lab-local-devstral', provider: { name: 'ollama' } } as never,
    'test-model',
  );
  expect(addToolMessage).toHaveBeenCalledOnce();
  const args = addToolMessage.mock.calls[0];
  expect(args[0]).toBe('failed-call');
  expect(args[4]).not.toBe('');
  expect(JSON.parse(args[4])).toMatchObject({ isError: true, content: [{ type: 'text', text: 'Il testo cercato non esiste' }] });
});
it('restores historical failed cards as finished errors after reopening', () => {
  const task = { taskId: 'test', getProjectDir: () => '/synthetic' };
  const manager = new ContextManager(task as never, 'test', []);
  const data = manager.getContextMessagesData([
    { id: 'a', role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'failed', toolName: 'lab---file_edit', input: { file: 'app.js' } }] },
    {
      id: 'b',
      role: 'tool',
      content: [
        { type: 'tool-result', toolCallId: 'failed', toolName: 'lab---file_edit', output: { type: 'error-text', value: 'La ricerca non corrisponde' } },
      ],
    },
  ]);
  const message = data.find((message) => message.type === 'tool');
  expect(message?.type).toBe('tool');
  if (message?.type === 'tool') {
    expect(message.finished).toBe(true);
    expect(JSON.parse(message.response!)).toMatchObject({ isError: true });
  }
});
