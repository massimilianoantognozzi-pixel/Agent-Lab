import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { createOllama } from 'ollama-ai-provider-v2';
import { simulateStreamingMiddleware, wrapLanguageModel } from 'ai';
import { isOllamaProvider } from '@common/agent';

import type { Model, ProviderProfile } from '@common/types';
import type { LanguageModel } from 'ai';

import { assertLabWorkspace, isLabMode, isGeneralMode } from '@/lab-mode';
import logger from '@/logger';

export const LOCAL_PROVIDER_ID = 'lab-local-devstral';
export const LOCAL_MODEL_ID = 'devstral-small-2:24b-instruct-2512-q4_K_M';
export const LOCAL_BASE_URL = 'http://127.0.0.1:11435';
export const LOCAL_CONTEXT = 32768;
export const LOCAL_OUTPUT = 4096;
export const LOCAL_INPUT_BUDGET = 24576;
export const isLocalLabEnabled = (): boolean =>
  (isLabMode() || isGeneralMode()) && ['devstral-readonly', 'devstral-coding'].includes(process.env.AIDER_DESK_LAB_LOCAL_MODEL ?? '');

export const localModelMetadata = (): Model => ({
  id: LOCAL_MODEL_ID,
  providerId: LOCAL_PROVIDER_ID,
  maxInputTokens: LOCAL_CONTEXT,
  maxOutputTokens: LOCAL_OUTPUT,
  maxOutputTokensLimit: LOCAL_OUTPUT,
  supportsTools: true,
  inputCostPerToken: 0,
  outputCostPerToken: 0,
});

let tokenizerPromise: Promise<(text: string) => number> | undefined;
const countLocalTokens = async (text: string): Promise<number> => {
  tokenizerPromise ??= (async () => {
    const directory = process.env.AIDER_DESK_LAB_TOKENIZER_DIR;
    if (!directory || !path.isAbsolute(directory)) {
      throw new Error('Agent Lab: tokenizer locale non configurato.');
    }
    const expected = {
      'tokenizer.json': '99cf274236c60277fcfad861a5a1007518687ad06ba8938760f50b55ffa0b1ef', // gitleaks:allow SHA-256 file checksum
      'tokenizer_config.json': '4a05af595aa11c3436d3b68a616219ae99b303426f708a12b31bc9ce32530728', // gitleaks:allow SHA-256 file checksum
    };
    const data: Record<string, object> = {};
    for (const [file, digest] of Object.entries(expected)) {
      const bytes = fs.readFileSync(path.join(directory, file));
      if (createHash('sha256').update(bytes).digest('hex') !== digest) {
        throw new Error('Agent Lab: tokenizer diverso da quello verificato.');
      }
      data[file] = JSON.parse(bytes.toString('utf8'));
    }
    const { PreTrainedTokenizer } = await import('@huggingface/transformers');
    const tokenizer = new PreTrainedTokenizer(data['tokenizer.json'], data['tokenizer_config.json']);
    return (input: string) => tokenizer.encode(input, { add_special_tokens: false }).length;
  })();
  return (await tokenizerPromise)(text);
};

export const createLocalGuardedFetch =
  (transport: typeof fetch = fetch, countTokens: (text: string) => Promise<number> = countLocalTokens): typeof fetch =>
  async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== `${LOCAL_BASE_URL}/api/chat` || init?.method !== 'POST' || typeof init.body !== 'string' || Buffer.byteLength(init.body) > 1000000) {
      throw new Error('Agent Lab: richiesta esterna o non valida esclusa dal collegamento locale.');
    }
    const body = JSON.parse(init.body) as {
      model?: unknown;
      messages?: Array<{ images?: unknown[] }>;
      tools?: Array<{ type?: unknown }>;
      options?: Record<string, unknown>;
      keep_alive?: string;
      truncate?: boolean;
      shift?: boolean;
    };
    if (
      body.model !== LOCAL_MODEL_ID ||
      !Array.isArray(body.messages) ||
      body.messages.some((message) => message.images?.length) ||
      body.tools?.some((tool) => tool.type !== 'function')
    ) {
      throw new Error('Agent Lab: solo Devstral locale con testo e strumenti locali consentiti.');
    }
    body.options = { ...(body.options ?? {}), num_ctx: LOCAL_CONTEXT, num_predict: LOCAL_OUTPUT };
    body.keep_alive = '10m';
    body.truncate = false;
    body.shift = false;
    const options = { ...init, redirect: 'error' as const };
    const renderedResponse = await transport(url, {
      ...options,
      body: JSON.stringify({ ...body, stream: false, _debug_render_only: true }),
    });
    if (!renderedResponse.ok) {
      throw new Error(`Agent Lab: preparazione locale non riuscita (HTTP ${renderedResponse.status}).`);
    }
    const rendered = await renderedResponse.json();
    const prompt = rendered._debug_info?.rendered_template;
    if (typeof prompt !== 'string' || (rendered._debug_info?.image_count ?? 0) !== 0) {
      throw new Error('Agent Lab: conteggio del contesto locale non verificabile.');
    }
    const tokens = await countTokens(prompt);
    logger.info('Agent Lab local context preflight', { tokens, inputBudget: LOCAL_INPUT_BUDGET, reservedOutput: LOCAL_OUTPUT });
    if (!Number.isFinite(tokens) || tokens < 0 || tokens > LOCAL_INPUT_BUDGET) {
      throw new Error(
        `Agent Lab: contesto troppo lungo (${tokens} token, massimo ${LOCAL_INPUT_BUDGET}). Compatta la conversazione o riduci i file prima di continuare.`,
      );
    }
    return transport(url, { ...options, body: JSON.stringify({ ...body, _debug_render_only: false }) });
  };

export const createLocalLabModel = (profile: ProviderProfile, model: string | Model, projectDir: string): LanguageModel => {
  if (!isLocalLabEnabled()) {
    throw new Error('Agent Lab: inferenze verso provider disabilitate nel checkpoint iniziale.');
  }
  assertLabWorkspace(projectDir);
  const id = typeof model === 'string' ? model : model.id;
  if (
    profile.id !== LOCAL_PROVIDER_ID ||
    profile.disabled ||
    profile.extensionId ||
    !isOllamaProvider(profile.provider) ||
    profile.provider.baseUrl !== LOCAL_BASE_URL ||
    Object.keys(profile.headers ?? {}).length ||
    id !== LOCAL_MODEL_ID ||
    (typeof model !== 'string' && model.providerId !== LOCAL_PROVIDER_ID)
  ) {
    throw new Error('Agent Lab: provider o modello esterno escluso dalla prova locale.');
  }
  const provider = createOllama({ baseURL: `${LOCAL_BASE_URL}/api`, fetch: createLocalGuardedFetch() });
  return wrapLanguageModel({ model: provider(LOCAL_MODEL_ID), middleware: simulateStreamingMiddleware() });
};
