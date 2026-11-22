import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createVertex } from '@ai-sdk/google-vertex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createVertexAiLlm, loadVertexAIModels } from '../vertex-ai';

import type { ProviderProfile, SettingsData } from '@common/types';

import { getEffectiveEnvironmentVariable } from '@/utils/environment';
import logger from '@/logger';

const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn().mockResolvedValue([[{ name: 'publishers/google/models/demo' }]]),
}));
vi.unmock('fs');
vi.unmock('path');
vi.mock('@/logger');
vi.mock('@ai-sdk/google-vertex', async (load) => {
  const real = await load<typeof import('@ai-sdk/google-vertex')>();
  return { ...real, createVertex: vi.fn(real.createVertex) };
});
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    constructor(options: unknown) {
      mock.auth(options);
    }
  },
}));
vi.mock('@google-cloud/aiplatform', () => ({
  v1beta1: {
    ModelGardenServiceClient: class {
      listPublisherModels = mock.list;
    },
  },
}));

const model = { id: 'demo', providerId: 'vertex' };
const settings = (environmentVariables = '') => ({ aider: { environmentVariables, options: '' } }) as SettingsData;
const profile = (extra: Record<string, string> = {}) => ({ id: 'vertex', provider: { name: 'vertex-ai', ...extra } }) as ProviderProfile;

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ['VERTEXAI_PROJECT', 'VERTEXAI_LOCATION', 'VERTEX_PROJECT', 'VERTEX_LOCATION', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_VERTEX_API_KEY']) {
    vi.stubEnv(key, undefined);
  }
});
afterEach(() => vi.unstubAllEnvs());

describe('Vertex identity and routing', () => {
  it('rejects malformed explicit credentials without echoing them or falling back to another account', async () => {
    for (const invalid of ['fixture-only', 'null', '[]', '{}']) {
      const supplied = profile({ project: 'fixture', googleCloudCredentialsJson: invalid });
      expect(() => createVertexAiLlm(supplied, model, settings(), '/fixture')).toThrow('Il JSON delle credenziali Vertex non è valido.');
      expect((await loadVertexAIModels(supplied, settings())).success).toBe(false);
    }
    expect(logger.error).toHaveBeenLastCalledWith('Il JSON delle credenziali Vertex non è valido.');
    expect(mock.auth).not.toHaveBeenCalled();
  });
  it('uses the profile OAuth identity even if the environment also defines an Express key', async () => {
    const credentials = { type: 'authorized_user', client_id: 'fixture-client' };
    vi.stubEnv('GOOGLE_VERTEX_API_KEY', 'synthetic-express');
    const selected = profile({ project: 'fixture-project', googleCloudCredentialsJson: JSON.stringify(credentials) });
    await loadVertexAIModels(selected, settings());
    expect(mock.auth).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'fixture-project', credentials }));
    // The real factory refuses tuned models in Express mode. Creation is local and performs no request.
    expect(() => createVertexAiLlm(selected, { ...model, id: 'endpoints/123' }, settings(), '/fixture')).not.toThrow();
    expect(createVertex).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'fixture-project', location: 'global', apiKey: '', googleAuthOptions: { credentials } }),
    );
  });

  it('uses secure operator settings for the project, regional endpoint and ADC file', async () => {
    const account = path.resolve('fixture-account.json');
    const configured = settings('VERTEXAI_PROJECT=regional-project\nVERTEXAI_LOCATION=europe-west4\nGOOGLE_APPLICATION_CREDENTIALS=' + account);
    const result = await loadVertexAIModels(profile(), configured);
    expect(result).toMatchObject({ success: true, models: [{ id: 'demo' }] });
    expect(mock.auth).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'regional-project', keyFilename: account }));
    createVertexAiLlm(profile(), model, configured, '/fixture');
    expect(createVertex).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'regional-project', location: 'europe-west4', googleAuthOptions: { keyFilename: account } }),
    );
  });

  it('keeps legacy operator environment names and inline credential JSON', async () => {
    vi.stubEnv('VERTEX_PROJECT', 'legacy-project');
    vi.stubEnv('VERTEX_LOCATION', 'global');
    vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', ' {"client_id":"fixture"}');
    await expect(loadVertexAIModels(profile(), settings())).resolves.toMatchObject({ success: true });
    expect(mock.auth).toHaveBeenCalledWith(expect.objectContaining({ credentials: { client_id: 'fixture' } }));
    expect(mock.list).toHaveBeenCalledWith({ parent: 'publishers/google' });
  });

  it('ignores both checkout configuration files for account, project and region', async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'agentlab-vertex-checkout-'));
    try {
      await fs.writeFile(path.join(repo, '.env'), 'VERTEXAI_PROJECT=repo-project\nVERTEXAI_LOCATION=us\nGOOGLE_APPLICATION_CREDENTIALS=repo-account.json');
      await fs.writeFile(path.join(repo, '.aider.conf.yml'), 'env-file: repo.env\n');
      await fs.writeFile(path.join(repo, 'repo.env'), 'GOOGLE_APPLICATION_CREDENTIALS=repo-account-second.json\n');
      expect(getEffectiveEnvironmentVariable('GOOGLE_APPLICATION_CREDENTIALS', settings(), repo)?.value).toBe('repo-account-second.json');
      expect(getEffectiveEnvironmentVariable('VERTEXAI_PROJECT', settings(), repo)?.value).toBe('repo-project');
      expect(() => createVertexAiLlm(profile(), model, settings(), repo)).toThrow('project is required');
      vi.stubEnv('VERTEXAI_PROJECT', 'operator-project');
      vi.stubEnv('VERTEXAI_LOCATION', 'eu');
      const account = path.resolve('process-account.json');
      vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', account);
      createVertexAiLlm(profile(), model, settings(), repo);
      expect(createVertex).toHaveBeenCalledWith(expect.objectContaining({ project: 'operator-project', location: 'eu', googleAuthOptions: undefined }));
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });

  it('rejects an invalid operator region with the real SDK hostname check', () => {
    expect(() => createVertexAiLlm(profile({ project: 'fixture', location: 'not a region' }), model, settings(), '/fixture')).toThrow(/DNS label/);
  });
});
