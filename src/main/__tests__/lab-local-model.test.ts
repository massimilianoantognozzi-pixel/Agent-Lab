import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('fs');
vi.unmock('node:fs');
vi.unmock('path');
vi.unmock('node:path');

import {
  createLocalGuardedFetch,
  createLocalLabModel,
  localModelMetadata,
  LOCAL_BASE_URL,
  LOCAL_INPUT_BUDGET,
  LOCAL_MODEL_ID,
  LOCAL_PROVIDER_ID,
} from '../lab-local-model';
import { Agent } from '../agent/agent';
import { assertLabToolInput } from '../lab-mode';

import type { ProviderProfile } from '@common/types';

describe('Agent Lab local inference boundary', () => {
  let project: string;
  beforeEach(() => {
    const root = path.resolve('lab/work/local-gui-boundary-tests');
    mkdirSync(root, { recursive: true });
    project = mkdtempSync(path.join(root, 'case-'));
    vi.stubEnv('AIDER_DESK_LAB_MODE', 'true');
    vi.stubEnv('AIDER_DESK_LAB_LOCAL_MODEL', 'devstral-readonly');
    vi.stubEnv('AIDER_DESK_LAB_WORKSPACE_ROOT', root);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const profile = (): ProviderProfile => ({ id: LOCAL_PROVIDER_ID, provider: { name: 'ollama', baseUrl: LOCAL_BASE_URL } });
  const request = (body = {}) => ({
    method: 'POST',
    body: JSON.stringify({ model: LOCAL_MODEL_ID, messages: [{ role: 'user', content: 'Synthetic request' }], ...body }),
  });
  const localTransport = () =>
    vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify(
          body._debug_render_only
            ? { _debug_info: { rendered_template: 'EXACT_RENDERED_SYNTHETIC_PROMPT' } }
            : { message: { role: 'assistant', content: 'Synthetic response' }, done: true, done_reason: 'stop' },
        ),
      );
    });

  it('declares the real context and output reserve', () => {
    expect(localModelMetadata()).toMatchObject({ maxInputTokens: 32768, maxOutputTokens: 4096, maxOutputTokensLimit: 4096 });
  });

  it('fails closed when local activation is missing', () => {
    vi.stubEnv('AIDER_DESK_LAB_LOCAL_MODEL', '');
    expect(() => createLocalLabModel(profile(), LOCAL_MODEL_ID, project)).toThrow('disabilitate');
  });

  it('rejects foreign providers, cloud models, headers and endpoints before model creation', () => {
    expect(() => createLocalLabModel({ ...profile(), id: 'remote' }, LOCAL_MODEL_ID, project)).toThrow('escluso');
    expect(() => createLocalLabModel(profile(), 'devstral:cloud', project)).toThrow('escluso');
    expect(() => createLocalLabModel({ ...profile(), headers: { Authorization: 'SYNTHETIC' } }, LOCAL_MODEL_ID, project)).toThrow('escluso');
    expect(() => createLocalLabModel({ ...profile(), provider: { name: 'ollama', baseUrl: 'https://ollama.com' } }, LOCAL_MODEL_ID, project)).toThrow(
      'escluso',
    );
    expect(() => createLocalLabModel(profile(), LOCAL_MODEL_ID, path.dirname(path.dirname(project)))).toThrow('fuori');
  });

  it('renders and counts before generation and forces the approved options', async () => {
    const transport = localTransport();
    const count = vi.fn(async () => 1200);
    const guarded = createLocalGuardedFetch(transport, count);
    await guarded(LOCAL_BASE_URL + '/api/chat', request({ options: { num_ctx: 393216, num_predict: 100000 }, truncate: true, shift: true }));
    expect(count).toHaveBeenCalledWith('EXACT_RENDERED_SYNTHETIC_PROMPT');
    expect(transport).toHaveBeenCalledTimes(2);
    const first = JSON.parse(transport.mock.calls[0][1]?.body as string);
    const second = JSON.parse(transport.mock.calls[1][1]?.body as string);
    expect(first).toMatchObject({ _debug_render_only: true, stream: false });
    expect(second).toMatchObject({ _debug_render_only: false, truncate: false, shift: false, options: { num_ctx: 32768, num_predict: 4096 } });
    expect(transport.mock.calls.every((call) => call[1]?.redirect === 'error')).toBe(true);
  });

  it('does not generate when the real rendered input exceeds the reserve', async () => {
    const transport = localTransport();
    const guarded = createLocalGuardedFetch(transport, async () => LOCAL_INPUT_BUDGET + 1);
    await expect(guarded(LOCAL_BASE_URL + '/api/chat', request())).rejects.toThrow('contesto troppo lungo');
    expect(transport).toHaveBeenCalledOnce();
    expect(JSON.parse(transport.mock.calls[0][1]?.body as string)._debug_render_only).toBe(true);
  });

  it('rejects NaN counters and unverified render responses', async () => {
    await expect(createLocalGuardedFetch(localTransport(), async () => NaN)(LOCAL_BASE_URL + '/api/chat', request())).rejects.toThrow('contesto');
    const bad = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    await expect(createLocalGuardedFetch(bad, async () => 10)(LOCAL_BASE_URL + '/api/chat', request())).rejects.toThrow('non verificabile');
    expect(bad).toHaveBeenCalledOnce();
  });

  it('rejects remote destinations, models, images and built-in remote tools without any request', async () => {
    const transport = localTransport();
    const guarded = createLocalGuardedFetch(transport, async () => 10);
    await expect(guarded('https://api.z.ai/api/paas/v4/chat/completions', request())).rejects.toThrow('esterna');
    await expect(guarded(LOCAL_BASE_URL + '/api/chat', request({ model: 'something:cloud' }))).rejects.toThrow('solo');
    await expect(guarded(LOCAL_BASE_URL + '/api/chat', request({ messages: [{ role: 'user', images: ['synthetic'] }] }))).rejects.toThrow('solo');
    await expect(guarded(LOCAL_BASE_URL + '/api/chat', request({ tools: [{ type: 'web_search' }] }))).rejects.toThrow('solo');
    expect(transport).not.toHaveBeenCalled();
  });

  it('does not send forbidden tools to the model in the lab', () => {
    const agent = Object.create(Agent.prototype) as Agent;
    const tools = { 'power---file_read': { execute: vi.fn() }, 'power---bash': { execute: vi.fn() }, 'serena---replace_symbol_body': { execute: vi.fn() } };
    const filtered = agent['wrapToolsWithHooks']({} as never, {} as never, tools as never);
    expect(Object.keys(filtered)).toEqual(['power---file_read']);
  });

  it('rejects home expansion before the reader can expand it outside the task', () => {
    for (const filePath of ['~', '~/synthetic-outside/canary.txt', '~\\synthetic-outside\\canary.txt']) {
      expect(() => assertLabToolInput('power---file_read', { filePath }, project)).toThrow('home esclusa');
    }
  });

  it('compacts using previous-turn usage before starting a new model call', async () => {
    const smartCompactConversation = vi.fn(async () => []);
    const agent = Object.assign(Object.create(Agent.prototype), {
      store: { getSettings: () => ({ taskSettings: { contextCompactingThreshold: { percentage: 75, tokens: 18000 }, contextCompactionType: 'smart' } }) },
      modelManager: { getModelSettings: () => ({ maxInputTokens: 32768 }) },
      prepareMessages: vi.fn(async () => []),
    }) as Agent;
    const previous = { id: 'old', role: 'assistant', content: 'synthetic', usageReport: { sentTokens: 20000, receivedTokens: 30, cacheReadTokens: 0 } };
    const user = { id: 'new', role: 'user', content: 'Continue the synthetic task' };
    await agent['compactMessagesIfNeeded'](
      { task: {}, smartCompactConversation } as never,
      {} as never,
      profile(),
      LOCAL_MODEL_ID,
      user as never,
      [previous] as never,
      [],
      [],
      [user] as never,
    );
    expect(smartCompactConversation).toHaveBeenCalledOnce();
  });
});
