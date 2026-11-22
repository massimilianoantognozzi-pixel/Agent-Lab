import {
  POWER_TOOL_BASH,
  POWER_TOOL_FILE_EDIT,
  POWER_TOOL_FILE_READ,
  POWER_TOOL_FILE_WRITE,
  POWER_TOOL_GROUP_NAME,
  TOOL_GROUP_NAME_SEPARATOR,
} from '@common/tools';

import type { LanguageModelV4CallOptions, LanguageModelV4Middleware } from '@ai-sdk/provider';

const shortNames = [POWER_TOOL_FILE_READ, POWER_TOOL_FILE_EDIT, POWER_TOOL_FILE_WRITE, POWER_TOOL_BASH];

export const usesLocalDevstralToolNames = (modelId: string, baseUrl: string): boolean => {
  if (modelId !== 'devstral-aiderdesk:24b' || !URL.canParse(baseUrl)) {
    return false;
  }
  const url = new URL(baseUrl);
  return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
};

const prepareRequest = (params: LanguageModelV4CallOptions) => {
  const tools = params.tools ?? [];
  const available = new Set(tools.map((tool) => tool.name));
  const functions = new Set(tools.filter((tool) => tool.type === 'function').map((tool) => tool.name));
  if (available.size !== tools.length) {
    throw new Error('Duplicate tool name in the Devstral request.');
  }

  // History can retain a differently scoped tool after it disappears from the current catalog.
  const known = new Set(available);
  for (const message of params.prompt) {
    if (message.role === 'assistant' || message.role === 'tool') {
      for (const part of message.content) {
        if (part.type === 'tool-call' || part.type === 'tool-result') {
          known.add(part.toolName);
        }
      }
    }
  }
  const aliases = new Map<string, string>();
  const nativeNames = new Map<string, string>();
  const knownNames = [...known];
  for (const short of shortNames) {
    const suffix = TOOL_GROUP_NAME_SEPARATOR + short;
    const native = POWER_TOOL_GROUP_NAME + suffix;
    if (functions.has(native) && !knownNames.some((name) => name !== native && (name === short || name.endsWith(suffix)))) {
      aliases.set(native, short);
      nativeNames.set(short, native);
    }
  }

  const outbound = <T extends { type: string }>(part: T): T => {
    if ((part.type === 'tool' || part.type === 'tool-call' || part.type === 'tool-result') && 'toolName' in part && typeof part.toolName === 'string') {
      const alias = aliases.get(part.toolName);
      if (alias) {
        return { ...part, toolName: alias };
      }
    }
    return part;
  };
  const restore = <T extends { type: string }>(part: T): T => {
    if (
      (part.type === 'tool-call' || part.type === 'tool-result' || part.type === 'tool-input-start') &&
      'toolName' in part &&
      typeof part.toolName === 'string'
    ) {
      const native = nativeNames.get(part.toolName) ?? part.toolName;
      if (!available.has(native)) {
        throw new Error('Devstral returned a tool outside the current request.');
      }
      return native === part.toolName ? part : { ...part, toolName: native };
    }
    return part;
  };

  if (!aliases.size) {
    return { params, restore };
  }
  const prompt = params.prompt.map((message) => {
    if (message.role === 'assistant') {
      return { ...message, content: message.content.map(outbound) };
    }
    if (message.role === 'tool') {
      return { ...message, content: message.content.map(outbound) };
    }
    return message;
  });
  return {
    params: {
      ...params,
      prompt,
      tools: tools.map((tool) => (aliases.has(tool.name) ? { ...tool, name: aliases.get(tool.name)! } : tool)),
      toolChoice: params.toolChoice && outbound(params.toolChoice),
    },
    restore,
  };
};

export const devstralToolNames: LanguageModelV4Middleware = {
  specificationVersion: 'v4',
  wrapGenerate: async ({ model, params }) => {
    const request = prepareRequest(params);
    const result = await model.doGenerate(request.params);
    return { ...result, content: result.content.map(request.restore) };
  },
  wrapStream: async ({ model, params }) => {
    const request = prepareRequest(params);
    const result = await model.doStream(request.params);
    return {
      ...result,
      stream: result.stream.pipeThrough(new TransformStream({ transform: (part, controller) => controller.enqueue(request.restore(part)) })),
    };
  },
};
