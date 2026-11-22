import { parseEnv } from 'node:util';

import { v1beta1 } from '@google-cloud/aiplatform';
import { GoogleAuth } from 'google-auth-library';
import { Model, ModelInfo, ProviderProfile, Reasoning, SettingsData, UsageReportData } from '@common/types';
import { isVertexAiProvider, LlmProvider, VertexAiProvider } from '@common/agent';
import { createVertex } from '@ai-sdk/google-vertex';

import type { LanguageModel, LanguageModelUsage } from 'ai';
import type { SharedV4ProviderOptions } from '@ai-sdk/provider';

import { AiderModelMapping, LlmProviderStrategy, LoadModelsResponse } from '@/models';
import logger from '@/logger';
import { Task } from '@/task/task';
import { calculateCost } from '@/models/providers/default';

const parseCredentialJson = (value: string) => {
  // JSON.parse errors can quote the supplied credential in logs and UI errors.
  try {
    const credentials = JSON.parse(value);
    if (credentials && typeof credentials === 'object' && !Array.isArray(credentials) && Object.keys(credentials).length > 0) {
      return credentials;
    }
  } catch {
    // The operator sees the same message for malformed JSON and an invalid top-level shape.
  }
  throw new Error('Il JSON delle credenziali Vertex non è valido.');
};

// Identity, tenant and region belong to the operator. Never resolve them from the checkout's Aider or dotenv files.
const vertexConfig = (provider: VertexAiProvider, settings: SettingsData) => {
  const entries = parseEnv(settings.aider.environmentVariables);
  const project = provider.project || entries.VERTEXAI_PROJECT || entries.VERTEX_PROJECT || process.env.VERTEXAI_PROJECT || process.env.VERTEX_PROJECT;
  const location =
    provider.location || entries.VERTEXAI_LOCATION || entries.VERTEX_LOCATION || process.env.VERTEXAI_LOCATION || process.env.VERTEX_LOCATION || 'global';
  const configured = entries.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  let googleAuthOptions;
  if (provider.googleCloudCredentialsJson) {
    googleAuthOptions = { credentials: parseCredentialJson(provider.googleCloudCredentialsJson) };
  } else if (configured?.trimStart().startsWith('{')) {
    googleAuthOptions = { credentials: parseCredentialJson(configured) };
  } else if (entries.GOOGLE_APPLICATION_CREDENTIALS) {
    googleAuthOptions = { keyFilename: entries.GOOGLE_APPLICATION_CREDENTIALS };
  }
  // A path supplied by process.env is resolved by the standard ADC chain.
  return { project, location, googleAuthOptions };
};

export const loadVertexAIModels = async (profile: ProviderProfile, settings: SettingsData): Promise<LoadModelsResponse> => {
  if (!isVertexAiProvider(profile.provider)) {
    return { models: [], success: false };
  }

  const provider = profile.provider as VertexAiProvider;

  try {
    const { project, location, googleAuthOptions } = vertexConfig(provider, settings);
    if (!project) {
      return { models: [], success: false };
    }
    const auth = new GoogleAuth({ ...googleAuthOptions, projectId: project, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

    const clientOptions = {
      apiEndpoint: 'aiplatform.googleapis.com',
      auth,
    };

    const modelGardenServiceClient = new v1beta1.ModelGardenServiceClient(clientOptions);
    const [response] = await modelGardenServiceClient.listPublisherModels({
      parent: 'publishers/google',
    });

    const models = response
      .map((model) => {
        const modelId = model.name?.split('/').pop();

        return {
          id: modelId,
          providerId: profile.id,
          temperature: 0.7, // Default temperature for Vertex AI models
        };
      })
      .filter((model) => model.id) as Model[];

    logger.info(`Loaded ${models.length} Vertex AI models for project ${project} in location ${location} for profile ${profile.id}`);
    return { models, success: true };
  } catch (error) {
    const errorMsg = typeof error === 'string' ? error : error instanceof Error ? error.message : 'Error loading Vertex AI models';
    logger.error(errorMsg);
    return { models: [], success: false, error: errorMsg };
  }
};

export const hasVertexAiEnvVars = (): boolean => {
  // Vertex AI doesn't have a simple environment variable check like other providers
  // It requires project, location, and potentially credentials
  return false;
};

export const getVertexAiAiderMapping = (provider: ProviderProfile, modelId: string): AiderModelMapping => {
  const vertexProvider = provider.provider as VertexAiProvider;
  const envVars: Record<string, string> = {};

  if (vertexProvider.project) {
    envVars.VERTEXAI_PROJECT = vertexProvider.project;
  }

  if (vertexProvider.location) {
    envVars.VERTEXAI_LOCATION = vertexProvider.location;
  }

  if (vertexProvider.googleCloudCredentialsJson) {
    envVars.GOOGLE_APPLICATION_CREDENTIALS_JSON = vertexProvider.googleCloudCredentialsJson;
  }

  // Aider uses vertex_ai prefix instead of vertex-ai
  return {
    modelName: `vertex_ai/${modelId}`,
    environmentVariables: envVars,
  };
};

// === LLM Creation Functions ===
export const createVertexAiLlm: (...args: Parameters<LlmProviderStrategy['createLlm']>) => LanguageModel = (profile, model, settings) => {
  const provider = profile.provider as VertexAiProvider;
  const { project, location, googleAuthOptions } = vertexConfig(provider, settings);

  if (!project) {
    throw new Error('Vertex AI project is required in Providers settings or Aider environment variables (VERTEXAI_PROJECT)');
  }

  const vertexProvider = createVertex({
    project,
    location,
    headers: profile.headers,
    // This profile uses OAuth/ADC like the model catalog. An ambient Express API key must not switch identities.
    apiKey: '',
    googleAuthOptions,
  });
  return vertexProvider(model.id);
};

type VertexGoogleMetadata = {
  vertex: {
    cachedContentTokenCount?: number;
  };
};

const getVertexAiUsageReport = (
  task: Task,
  provider: ProviderProfile,
  model: Model,
  usage: LanguageModelUsage,
  providerMetadata?: unknown,
): UsageReportData => {
  const totalSentTokens = usage.inputTokens || 0;
  const receivedTokens = usage.outputTokens || 0;

  // Extract cache read tokens from provider metadata
  const { vertex } = (providerMetadata as VertexGoogleMetadata) || {};
  const cacheReadTokens = vertex?.cachedContentTokenCount ?? usage.inputTokenDetails?.cacheReadTokens ?? 0;

  // Calculate sentTokens after deducting cached tokens
  const sentTokens = totalSentTokens - cacheReadTokens;

  // Calculate cost internally with already deducted sentTokens
  const messageCost = calculateCost(model, sentTokens, receivedTokens, cacheReadTokens);

  return {
    model: `${provider.id}/${model.id}`,
    sentTokens,
    receivedTokens,
    cacheReadTokens,
    messageCost,
    agentTotalCost: task.task.agentTotalCost + messageCost,
  };
};

export const getVertexAiProviderOptions = (llmProvider: LlmProvider, model: Model, reasoning?: Reasoning): SharedV4ProviderOptions | undefined => {
  if (isVertexAiProvider(llmProvider)) {
    const providerOverrides = model.providerOverrides as Partial<VertexAiProvider> | undefined;

    // Use model-specific overrides, falling back to provider defaults
    const includeThoughts = providerOverrides?.includeThoughts ?? llmProvider.includeThoughts;
    const thinkingBudget = providerOverrides?.thinkingBudget ?? llmProvider.thinkingBudget;

    // When the top-level reasoning parameter is set (not undefined or 'provider-default'),
    // omit thinkingBudget from thinkingConfig so the AI SDK's portable reasoning takes effect.
    // Keep includeThoughts if set so reasoning output is still returned.
    if (reasoning && reasoning !== 'provider-default') {
      return {
        vertex: {
          ...(includeThoughts && {
            thinkingConfig: {
              includeThoughts: true,
            },
          }),
        },
      };
    }

    return {
      vertex: {
        ...((includeThoughts || thinkingBudget) && {
          thinkingConfig: {
            includeThoughts: includeThoughts && (thinkingBudget ?? 0) > 0,
            thinkingBudget,
          },
        }),
      },
    };
  }

  return undefined;
};

const getVertexAiModelInfo = (_provider: ProviderProfile, modelId: string, allModelInfos: Record<string, ModelInfo>): ModelInfo | undefined => {
  const fullModelId = `google-vertex/${modelId}`;
  return allModelInfos[fullModelId];
};

// === Complete Strategy Implementation ===
export const vertexAiProviderStrategy: LlmProviderStrategy = {
  // Core LLM functions
  createLlm: createVertexAiLlm,
  getUsageReport: getVertexAiUsageReport,

  // Model discovery functions
  loadModels: loadVertexAIModels,
  hasEnvVars: hasVertexAiEnvVars,
  getAiderMapping: getVertexAiAiderMapping,
  getModelInfo: getVertexAiModelInfo,

  // Configuration helpers
  getProviderOptions: getVertexAiProviderOptions,
};
