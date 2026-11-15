import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { recoverCompletedToolStep } from '../recover-completed-tool-step';

import type { LanguageModelCallEndEvent, ToolExecutionEndEvent, ToolSet, TypedToolCall } from 'ai';

const shellCall: TypedToolCall<ToolSet> = {
  type: 'tool-call',
  toolCallId: 'shell-call',
  toolName: 'power---bash',
  input: { command: 'node --test' },
  providerMetadata: { anthropic: { signature: 'fixture-signature' } },
};
const sample: Pick<LanguageModelCallEndEvent, 'callId' | 'finishReason' | 'content'> = {
  callId: 'ended-sample',
  finishReason: 'tool-calls',
  content: [shellCall],
};

const execution = (output: unknown): ToolExecutionEndEvent => ({
  callId: sample.callId,
  toolCall: shellCall,
  messages: [],
  toolContext: undefined,
  toolExecutionMs: 5,
  toolOutput: { ...shellCall, type: 'tool-result', output },
});
const started = new Map([[shellCall.toolCallId, sample.callId]]);
const shell = { inputSchema: z.object({}) };
const tools = { 'power---bash': shell };

describe('completed tool output after a transport reset', () => {
  it('keeps the original call, input, provider metadata, and terminal output together', () => {
    const output = { stdout: 'VERIFIED', stderr: '', exitCode: 0 };
    const messages = recoverCompletedToolStep(sample, started, new Map([[shellCall.toolCallId, execution(output)]]), tools, 'response', { id: 'turn' });
    expect(messages?.[0]).toMatchObject({
      id: 'response',
      role: 'assistant',
      promptContext: { id: 'turn' },
      content: [{ type: 'tool-call', toolCallId: shellCall.toolCallId, input: shellCall.input, providerOptions: shellCall.providerMetadata }],
    });
    expect(messages?.[1]).toMatchObject({
      role: 'tool',
      promptContext: { id: 'turn' },
      content: [{ type: 'tool-result', toolCallId: shellCall.toolCallId, output: { type: 'json', value: output } }],
    });
  });

  it('requires every call to have its own result for the same sampled response', () => {
    const terminal = execution({ exitCode: 1 });
    const second = { ...shellCall, toolCallId: 'another-call' };
    expect(
      recoverCompletedToolStep({ ...sample, content: [...sample.content, second] }, started, new Map([[shellCall.toolCallId, terminal]]), tools, 'response'),
    ).toBeUndefined();
    expect(
      recoverCompletedToolStep(sample, started, new Map([[shellCall.toolCallId, { ...terminal, callId: 'older-sample' }]]), tools, 'response'),
    ).toBeUndefined();
  });

  it('leaves an outstanding process or a custom output hook to the existing recovery path', () => {
    const pending = execution({ exitCode: null, processId: 'already-running' });
    expect(recoverCompletedToolStep(sample, started, new Map([[shellCall.toolCallId, pending]]), tools, 'response')).toBeUndefined();
    const custom = { 'power---bash': { ...shell, toModelOutput: () => ({ type: 'text' as const, value: 'custom' }) } };
    expect(recoverCompletedToolStep(sample, started, new Map([[shellCall.toolCallId, execution({ exitCode: 0 })]]), custom, 'response')).toBeUndefined();
  });

  it('preserves the original process handle when the current shell session can still poll it', () => {
    const value = { exitCode: null, processId: 'owned-process', stdout: 'started', stderr: '' };
    const completed = new Map([[shellCall.toolCallId, execution(value)]]);
    const recovered = recoverCompletedToolStep(sample, started, completed, tools, 'response', undefined, (processId) => processId === 'owned-process');
    expect(recovered?.[1].content).toEqual([
      {
        type: 'tool-result',
        toolCallId: shellCall.toolCallId,
        toolName: shellCall.toolName,
        output: { type: 'json', value },
        providerOptions: shellCall.providerMetadata,
      },
    ]);
    expect(recoverCompletedToolStep(sample, started, completed, tools, 'response', undefined, () => false)).toBeUndefined();
  });
});
