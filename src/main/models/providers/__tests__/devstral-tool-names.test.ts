import { afterEach, describe, expect, it, vi } from 'vitest';
import { wrapLanguageModel } from 'ai';

import { createOllamaLlm } from '../ollama';
import { devstralToolNames } from '../devstral-tool-names';

import type { ProviderProfile, SettingsData } from '@common/types';
import type { LanguageModelV4, LanguageModelV4CallOptions, LanguageModelV4StreamPart } from '@ai-sdk/provider';

vi.mock('@/logger');

const modelId = 'devstral-aiderdesk:24b';
const createModel = (id = modelId, baseUrl = 'http://127.0.0.1:11435'): LanguageModelV4 =>
  createOllamaLlm(
    { id: 'local-test', provider: { name: 'ollama', baseUrl } } as ProviderProfile,
    { id, providerId: 'local-test' },
    {} as SettingsData,
    '/test',
  ) as LanguageModelV4;

const native = 'power---file_read';
const inputText = 'power---file_read and file_read are literal user text.';
const tool = (name: string) => ({ type: 'function' as const, name, description: inputText, inputSchema: { type: 'object' as const } });
const args = { path: inputText };
const options = (names = [native, 'power---bash']): LanguageModelV4CallOptions => ({
  prompt: [
    { role: 'system', content: inputText },
    { role: 'user', content: [{ type: 'text', text: inputText }] },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'earlier', toolName: native, input: args }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'earlier', toolName: native, output: { type: 'text', value: inputText } }] },
  ],
  tools: names.map(tool),
  toolChoice: { type: 'tool', toolName: native },
});

const interceptWire = (returnName: string) => {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const wire = JSON.parse(String(init.body));
    return Response.json({
      model: wire.model,
      created_at: '2026-11-22T10:00:00Z',
      done: true,
      done_reason: 'stop',
      message: { role: 'assistant', content: '', tool_calls: [{ id: 'next-call', type: 'function', function: { name: returnName, arguments: args } }] },
    });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

afterEach(() => vi.unstubAllGlobals());

describe('local Devstral tool names', () => {
  it.each(['generate', 'stream'] as const)('keeps tool identity across the native Ollama %s call and preserves arbitrary text and IDs', async (mode) => {
    const fetch = interceptWire('file_read');
    const params = options();
    const original = structuredClone(params);
    const model = createModel();
    if (mode === 'generate') {
      const result = await model.doGenerate(params);
      expect(result.content).toContainEqual(
        expect.objectContaining({ type: 'tool-call', toolName: native, toolCallId: 'next-call', input: JSON.stringify(args) }),
      );
    } else {
      const reader = (await model.doStream(params)).stream.getReader();
      const parts: LanguageModelV4StreamPart[] = [];
      for (let item = await reader.read(); !item.done; item = await reader.read()) {
        parts.push(item.value);
      }
      expect(parts).toContainEqual(expect.objectContaining({ type: 'tool-call', toolName: native, toolCallId: 'next-call' }));
    }
    const wire = JSON.parse(String(fetch.mock.calls[0][1].body));
    expect(wire.tools.map((t: { function: { name: string } }) => t.function.name)).toEqual(['file_read', 'bash']);
    expect(wire.tools[0].function).toMatchObject({ description: inputText, parameters: { type: 'object' } });
    expect(wire.tool_choice).toMatchObject({ name: 'file_read' });
    expect(wire.messages[0].content).toBe(inputText);
    expect(wire.messages[1].content).toBe(inputText);
    expect(wire.messages[2].tool_calls[0]).toMatchObject({ id: 'earlier', function: { name: 'file_read', arguments: args } });
    expect(wire.messages[3]).toMatchObject({ role: 'tool', tool_call_id: 'earlier', content: inputText });
    expect(params).toEqual(original);
  });

  it('restores both names in incremental tool input without changing the streamed arguments', async () => {
    const parts: LanguageModelV4StreamPart[] = [
      { type: 'tool-input-start', id: 'x', toolName: 'file_read' },
      { type: 'tool-input-delta', id: 'x', delta: JSON.stringify(args) },
      { type: 'tool-input-end', id: 'x' },
      { type: 'tool-call', toolCallId: 'x', toolName: 'file_read', input: JSON.stringify(args) },
    ];
    const model = wrapLanguageModel({
      model: {
        ...createModel(),
        doStream: async () => ({
          stream: new ReadableStream({
            start(controller) {
              for (const part of parts) {
                controller.enqueue(part);
              }
              controller.close();
            },
          }),
        }),
      },
      middleware: devstralToolNames,
    });
    const reader = (await model.doStream(options())).stream.getReader();
    for (const part of parts) {
      expect((await reader.read()).value).toEqual('toolName' in part ? { ...part, toolName: native } : part);
    }
  });

  it.each([
    [modelId, 'https://ollama.example.test'],
    [modelId, 'http://localhost.example.test:11435'],
    ['devstral-small-2:24b-instruct-2512-q4_K_M', 'http://localhost:11435'],
    ['another-model:24b', 'http://[::1]:11435'],
  ])('keeps native names for %s at %s', async (id, url) => {
    const fetch = interceptWire(native);
    await createModel(id, url).doGenerate(options());
    expect(JSON.parse(String(fetch.mock.calls[0][1].body)).tools[0].function.name).toBe(native);
  });

  it('keeps colliding tools distinct and aliases an independent tool', async () => {
    const fetch = interceptWire('file_read');
    const params = options([native, 'file_read', 'vendor---file_read', 'power---bash', 'future_tool']);
    const result = await createModel().doGenerate(params);
    expect(result.content).toContainEqual(expect.objectContaining({ toolName: 'file_read' }));
    const tools = JSON.parse(String(fetch.mock.calls[0][1].body)).tools as { function: { name: string } }[];
    expect(tools.map((t) => t.function.name)).toEqual([native, 'file_read', 'vendor---file_read', 'bash', 'future_tool']);
  });

  it('leaves provider-defined tools untouched even when their name resembles a native function', async () => {
    const underneath = vi.fn<LanguageModelV4['doGenerate']>().mockRejectedValue(new Error('captured'));
    const model = wrapLanguageModel({ model: { ...createModel(), doGenerate: underneath }, middleware: devstralToolNames });
    const params = options([]);
    params.tools = [{ type: 'provider', id: 'vendor.read', name: native, args: {} }, tool('power---bash')];
    await expect(model.doGenerate(params)).rejects.toThrow('captured');
    expect(underneath.mock.calls[0][0].tools).toEqual([params.tools[0], tool('bash')]);
  });

  it('uses a separate translation table for simultaneous requests on the same model', async () => {
    interceptWire('file_read');
    const model = createModel();
    const [unique, alreadyShort] = await Promise.all([model.doGenerate(options()), model.doGenerate(options([native, 'file_read']))]);
    expect(unique.content).toContainEqual(expect.objectContaining({ toolName: native }));
    expect(alreadyShort.content).toContainEqual(expect.objectContaining({ toolName: 'file_read' }));
  });

  it('does not promote an ambiguous or historical name to a current authority', async () => {
    const fetch = interceptWire('file_read');
    const model = createModel();
    const conflict = options([native, 'vendor---file_read']);
    await expect(model.doGenerate(conflict)).rejects.toThrow('outside the current request');
    const history = options([native]);
    history.prompt.push({ role: 'assistant', content: [{ type: 'tool-call', toolName: 'vendor---file_read', toolCallId: 'old', input: {} }] });
    await expect(model.doGenerate(history)).rejects.toThrow('outside the current request');
    expect(JSON.parse(String(fetch.mock.calls[1][1].body)).tools[0].function.name).toBe(native);
    await expect(model.doGenerate(options(['future_tool']))).rejects.toThrow('outside the current request');
    await expect(model.doGenerate(options([native, native]))).rejects.toThrow('Duplicate tool name');
  });
});
