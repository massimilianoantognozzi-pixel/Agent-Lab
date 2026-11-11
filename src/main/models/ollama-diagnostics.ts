import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Opt-in test diagnostics: shape/counters only, never prompts, code or headers.
export const createOllamaDiagnosticFetch =
  (directory: string): typeof fetch =>
  async (input, init) => {
    const response = await globalThis.fetch(input, init);
    try {
      const value = await response.clone().json();
      const message = value.message ?? {};
      const text = typeof message.content === 'string' ? message.content : '';
      const close = text.lastIndexOf('</think>');
      const record = {
        at: new Date().toISOString(),
        status: response.status,
        responseKeys: Object.keys(value),
        messageKeys: Object.keys(message),
        contentType: typeof message.content,
        contentLength: text.length,
        thinkingLength: typeof message.thinking === 'string' ? message.thinking.length : 0,
        startsWithThink: text.trimStart().startsWith('<think>'),
        closedThink: close >= 0,
        textAfterThink: close >= 0 ? text.slice(close + 8).trim().length : null,
        toolMarker: text.includes('[TOOL_CALLS]'),
        toolCalls: (message.tool_calls ?? []).map((call: { function?: { name?: string; arguments?: unknown } }) => ({
          name: call.function?.name,
          argumentType: typeof call.function?.arguments,
        })),
        doneReason: value.done_reason,
        promptTokens: value.prompt_eval_count,
        outputTokens: value.eval_count,
      };
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, Date.now() + '-' + randomUUID() + '.json'), JSON.stringify(record, null, 2), { flag: 'wx' });
    } catch {
      /* Diagnostics never affect normal model operation. */
    }
    return response;
  };
