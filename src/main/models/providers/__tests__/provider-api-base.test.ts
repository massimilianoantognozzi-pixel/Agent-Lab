import { generateText, streamText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { anthropicCompatibleProviderStrategy } from '../anthropic-compatible';
import { geminiProviderStrategy } from '../gemini';

import type { ProviderProfile, SettingsData } from '@common/types';

import { uncachedGoalTokens } from '@/task/agent-goal';

vi.mock('@/logger');

const settings = { aider: { environmentVariables: '', options: '' } } as SettingsData;
const origin = 'http://127.0.0.1:20000';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('provider API base', () => {
  it.each([
    [origin, '/v1beta'],
    [`${origin}/v1beta/`, '/v1beta'],
    [`${origin}/gateway/v1/`, '/gateway/v1'],
    [`${origin}/proxy/`, '/proxy'],
    [undefined, '/v1beta'],
  ])('uses one Gemini API base for listing and generation (%s)', async (customBaseUrl, prefix) => {
    if (!customBaseUrl) {
      vi.stubEnv('GEMINI_API_BASE_URL', origin);
    }
    const modelName = 'gemini-pro-fixture';
    const requests: string[] = [];
    vi.stubGlobal('fetch', async (input: string) => {
      const { pathname } = new URL(input);
      requests.push(pathname);
      if (pathname.endsWith('/models')) {
        return Response.json({ models: [{ name: `models/${modelName}`, supportedGenerationMethods: ['generateContent'] }] });
      }
      const payload = {
        candidates: [{ content: { role: 'model', parts: [{ text: 'Fixture reply' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 5, totalTokenCount: 25 },
      };
      return pathname.endsWith(':streamGenerateContent')
        ? new Response(`data: ${JSON.stringify(payload)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
        : Response.json(payload);
    });
    const profile = { id: 'gemini', provider: { name: 'gemini', customBaseUrl, apiKey: 'fixture' } } as ProviderProfile;
    const catalog = await geminiProviderStrategy.loadModels(profile, settings);
    const model = await geminiProviderStrategy.createLlm(profile, { id: modelName, providerId: profile.id }, settings, '/fixture');

    expect(catalog.models.map(({ id }) => id)).toEqual([modelName]);
    expect((await generateText({ model, prompt: 'Reply briefly' })).text).toBe('Fixture reply');
    const streaming = streamText({ model, prompt: 'Reply briefly' });
    expect(await streaming.text).toBe('Fixture reply');
    expect(uncachedGoalTokens(await streaming.totalUsage)).toBe(25);
    expect(requests).toEqual([`${prefix}/models`, `${prefix}/models/${modelName}:generateContent`, `${prefix}/models/${modelName}:streamGenerateContent`]);
  });

  it('keeps an Anthropic-compatible v1 prefix with a trailing slash', async () => {
    const modelName = 'claude-fixture';
    const requests: string[] = [];
    vi.stubGlobal('fetch', async (input: string) => {
      const { pathname } = new URL(input);
      requests.push(pathname);
      return pathname.endsWith('/models')
        ? Response.json({ data: [{ id: modelName }] })
        : Response.json({
            id: 'message-fixture',
            type: 'message',
            role: 'assistant',
            model: modelName,
            content: [{ type: 'text', text: 'Fixture reply' }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 11, output_tokens: 7, cache_creation_input_tokens: 5, cache_read_input_tokens: 20 },
          });
    });
    const profile = { id: 'anthropic', provider: { name: 'anthropic-compatible', baseUrl: `${origin}/v1/`, apiKey: 'fixture' } } as ProviderProfile;
    const catalog = await anthropicCompatibleProviderStrategy.loadModels(profile, settings);
    const model = await anthropicCompatibleProviderStrategy.createLlm(profile, { id: modelName, providerId: profile.id }, settings, '/fixture');

    expect(catalog.models.map(({ id }) => id)).toEqual([modelName]);
    const result = await generateText({ model, prompt: 'Reply briefly', maxOutputTokens: 100 });
    expect(result.text).toBe('Fixture reply');
    expect(uncachedGoalTokens(result.totalUsage)).toBe(23);
    expect(requests).toEqual(['/v1/models', '/v1/messages']);
  });
});
