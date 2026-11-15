import { randomUUID } from 'node:crypto';

import type { ContextAssistantMessage, ContextToolMessage, JSONValue, PromptContext, ProviderOptions } from '@common/types';
import type { LanguageModelCallEndEvent, ProviderMetadata, ToolExecutionEndEvent, ToolSet } from 'ai';

const recordedProviderOptions = (metadata: ProviderMetadata | undefined): ProviderOptions | undefined =>
  metadata && (JSON.parse(JSON.stringify(metadata)) as ProviderOptions);

export const recoverCompletedToolStep = (
  sample: Pick<LanguageModelCallEndEvent, 'callId' | 'content' | 'finishReason'>,
  started: ReadonlyMap<string, string>,
  completed: ReadonlyMap<string, ToolExecutionEndEvent>,
  tools: ToolSet,
  responseId: string,
  promptContext?: PromptContext,
  canPollProcess?: (processId: string, output: object) => boolean,
): [ContextAssistantMessage, ContextToolMessage] | undefined => {
  if (sample.finishReason !== 'tool-calls' && sample.finishReason !== 'stop') {
    return undefined;
  }

  const assistant: Exclude<ContextAssistantMessage['content'], string> = [];
  const results: ContextToolMessage['content'] = [];
  const seen = new Set<string>();
  for (const part of sample.content) {
    if (part.type === 'source') {
      continue;
    }
    if (part.type === 'text' || part.type === 'reasoning') {
      assistant.push({ type: part.type, text: part.text, providerOptions: recordedProviderOptions(part.providerMetadata) });
      continue;
    }
    if (part.type !== 'tool-call' || part.providerExecuted || part.invalid || seen.has(part.toolCallId)) {
      return undefined;
    }

    const { toolCallId, toolName, input, providerMetadata } = part;
    const execution = completed.get(toolCallId);
    const tool = Object.hasOwn(tools, toolName) ? tools[toolName] : undefined;
    if (
      !tool ||
      tool.toModelOutput ||
      started.get(toolCallId) !== sample.callId ||
      !execution ||
      execution.callId !== sample.callId ||
      execution.toolCall.toolName !== toolName ||
      execution.toolOutput.type !== 'tool-result'
    ) {
      return undefined;
    }
    const value = execution.toolOutput.output;
    if (
      (toolName === 'power---bash' || toolName === 'power---bash_poll') &&
      value &&
      typeof value === 'object' &&
      'exitCode' in value &&
      value.exitCode === null &&
      (!('processId' in value) || typeof value.processId !== 'string' || !canPollProcess?.(value.processId, value))
    ) {
      return undefined;
    }

    // Match the SDK's default serialization without executing a tool or a custom output hook again.
    let output: ContextToolMessage['content'][number]['output'];
    try {
      output = typeof value === 'string' ? { type: 'text', value } : { type: 'json', value: JSON.parse(JSON.stringify(value) ?? 'null') as JSONValue };
    } catch {
      return undefined;
    }
    seen.add(toolCallId);
    assistant.push({ type: 'tool-call', toolCallId, toolName, input, providerOptions: recordedProviderOptions(providerMetadata) });
    results.push({ type: 'tool-result', toolCallId, toolName, output, providerOptions: recordedProviderOptions(execution.toolOutput.providerMetadata) });
  }

  if (!seen.size || seen.size !== started.size || seen.size !== completed.size) {
    return undefined;
  }
  const timestamp = Date.now();
  return [
    { id: responseId, role: 'assistant', content: assistant, promptContext, timestamp },
    { id: randomUUID(), role: 'tool', content: results, promptContext, timestamp },
  ];
};
