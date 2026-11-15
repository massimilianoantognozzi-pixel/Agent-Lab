import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaProvider } from '@common/agent';
import { ProviderProfile, SettingsData } from '@common/types';
import { generateText, streamText } from 'ai';

import { createOllamaLlm, loadOllamaModels } from '../ollama';

import { uncachedGoalTokens } from '@/task/agent-goal';

vi.mock('@/logger');

const profile: ProviderProfile = {
  id: 'ollama-test',
  provider: { name: 'ollama', baseUrl: 'http://localhost:11434' } as OllamaProvider,
} as unknown as ProviderProfile;

const settings = {
  aider: { environmentVariables: '', options: '' },
} as unknown as SettingsData;

const mockFetch = (payload: unknown) => {
  (global.fetch as any) = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  } as any);
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Ollama native usage', () => {
  it.each([
    [{}, undefined],
    [{ prompt_eval_count: 21 }, undefined],
    [{ prompt_eval_count: 0, eval_count: 0 }, 0],
    [{ prompt_eval_count: 21, eval_count: 8 }, 29],
  ])('preserves missing and explicit usage counters (%o)', async (counters, expected) => {
    const fetch = vi.fn(async () =>
      Response.json({
        model: 'devstral-fixture',
        created_at: '2026-01-01T00:00:00Z',
        done: true,
        done_reason: 'stop',
        message: { role: 'assistant', content: 'Verified adapter response' },
        ...counters,
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const model = createOllamaLlm(profile, { id: 'devstral-fixture', providerId: profile.id }, settings, '/fixture');
    const direct = await generateText({ model, prompt: 'Reply briefly' });
    const streamed = streamText({ model, prompt: 'Reply briefly' });

    expect(direct.text).toBe('Verified adapter response');
    expect(await streamed.text).toBe(direct.text);
    expect(uncachedGoalTokens(direct.totalUsage)).toBe(expected);
    expect(uncachedGoalTokens(await streamed.totalUsage)).toBe(expected);
    expect(fetch.mock.calls).toHaveLength(2);
  });
});

describe('loadOllamaModels', () => {
  it('sets maxInputTokens from the model context_length when present', async () => {
    mockFetch({
      models: [
        { name: 'model-a:latest', details: { context_length: 262144 } },
        { name: 'model-b:latest', details: {} },
      ],
    });

    const result = await loadOllamaModels(profile, settings);

    expect(result.success).toBe(true);
    expect(result.models).toEqual([
      { id: 'model-a:latest', providerId: 'ollama-test', maxInputTokens: 262144 },
      { id: 'model-b:latest', providerId: 'ollama-test', maxInputTokens: undefined },
    ]);
  });

  it('ignores non-positive or missing context_length', async () => {
    mockFetch({
      models: [{ name: 'model-zero:latest', details: { context_length: 0 } }, { name: 'model-none:latest' }],
    });

    const result = await loadOllamaModels(profile, settings);

    expect(result.models).toEqual([
      { id: 'model-zero:latest', providerId: 'ollama-test', maxInputTokens: undefined },
      { id: 'model-none:latest', providerId: 'ollama-test', maxInputTokens: undefined },
    ]);
  });
});
