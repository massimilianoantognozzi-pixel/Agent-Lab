import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesktopStopBoundary } from '../../desktop-stop';
import { reserveImageOutput } from '../image-files';
import { ImageResponseError } from '../image-provider';
import { ProjectImageJobs } from '../project-images';

import type { generateOpenAIImage } from '../image-provider';
import type { ContextMessage } from '@common/types';
import type { Store } from '@/store';
import type { Task } from '@/task';

const mock = vi.hoisted(() => ({
  data: '',
  home: '',
  authority: '',
  generate: vi.fn<typeof generateOpenAIImage>(),
  dialog: vi.fn<(options: { detail: string; defaultId: number; cancelId: number }) => Promise<{ response: number }>>(),
  thumbnail: vi.fn(() => Buffer.from('preview-only')),
}));
vi.mock('../image-provider', async (original) => ({ ...(await original<typeof import('../image-provider')>()), generateOpenAIImage: mock.generate }));
vi.mock('@/constants', () => ({
  get AIDER_DESK_DATA_DIR() {
    return mock.data;
  },
  get AIDER_DESK_HOME_DIR() {
    return mock.home;
  },
}));
vi.mock('@/extensions/project-extension-trust', () => ({ getProjectAuthorityRoot: () => mock.authority }));
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null },
  dialog: { showMessageBox: mock.dialog },
  nativeImage: { createFromBuffer: () => ({ resize: () => ({ toPNG: mock.thumbnail }) }) },
}));

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X+ikAAAAASUVORK5CYII=', 'base64');
const usage = { inputTokens: 10, inputTextTokens: 10, inputImageTokens: 0, outputTokens: 823, totalTokens: 833, calculatedCostUsd: 0.02474 };
const response = { bytes: image, requestId: 'req_mock_image', usage };
const input = { prompt: 'Disegna una foglia verde di prova.', output: 'assets/foglia.png' };
const opts = { toolCallId: 'unit-call', messages: [], context: {} };
const workers = new Set<Promise<unknown>>();
const controllers = new Set<AbortController>();
const singleReceipt = <T extends { jobId: string }>(value: T | AsyncIterable<T>): T => {
  if ('jobId' in value) {
    return value;
  }
  throw new Error('Il contratto del tool richiede una ricevuta singola.');
};
const profile = () => ({
  id: 'image-account',
  name: 'Account immagini di prova',
  provider: { name: 'openai', apiKey: 'fixture-private-key', useWebSearch: false },
});
const config = () => ({ providerId: 'image-account', model: 'gpt-image-2.6-sunburst', quality: 'low', size: '1024x1024' });

let fixture: string, root: string;
let electronVersion: PropertyDescriptor | undefined;

const session = (id = randomUUID()) => {
  const settings = vi.fn(() => ({ imageGeneration: config() })),
    providers = vi.fn(() => [profile()]);
  const stop = new DesktopStopBoundary(),
    abort = new AbortController();
  controllers.add(abort);
  const context: ContextMessage[] = [];
  const task = {
    taskId: id,
    getTaskDir: vi.fn(() => root),
    recordDesktopWrite: vi.fn().mockResolvedValue(undefined),
    trackWorkerRun: vi.fn((promise: Promise<unknown>) => {
      workers.add(promise);
      const release = () => {
        workers.delete(promise);
      };
      void promise.then(release, release);
    }),
    addToolMessage: vi.fn(),
    addContextMessage: vi.fn(async (msg: ContextMessage) => {
      context.push(msg);
    }),
  };
  const jobs = new ProjectImageJobs(
    task as unknown as Task,
    { getSettings: settings, getProviders: providers } as unknown as Store,
    AbortSignal.any([abort.signal, stop.signal]),
    stop,
  );
  return {
    id,
    jobs,
    stop,
    abort,
    settings,
    providers,
    task,
    context,
    start: async (req: typeof input & { references?: string[] } = input) => singleReceipt(await jobs.tools['images---generate'].execute(req, opts)),
    result: async (jobId: string) => singleReceipt(await jobs.tools['images---result'].execute({ jobId }, opts)),
  };
};

describe('native desktop image jobs', () => {
  beforeEach(async () => {
    fixture = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'agent-lab-image-jobs-')));
    root = path.join(fixture, 'checkout');
    mock.data = path.join(fixture, 'private-data');
    mock.home = path.join(fixture, 'private-home');
    mock.authority = path.join(fixture, 'private-authority');
    await fs.mkdir(root);
    await fs.mkdir(mock.data);
    electronVersion = Object.getOwnPropertyDescriptor(process.versions, 'electron');
    Object.defineProperty(process.versions, 'electron', { configurable: true, value: '44-test' });
    vi.stubEnv('AIDER_DESK_HEADLESS', 'false');
    vi.stubEnv('OPENAI_API_KEY', 'ambient-fixture-key');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('External requests are disabled in this test.')));
    mock.generate.mockReset().mockResolvedValue(response);
    mock.dialog.mockReset().mockResolvedValue({ response: 1 });
    mock.thumbnail.mockClear();
  });

  afterEach(async () => {
    for (const controller of controllers) {
      controller.abort();
    }
    controllers.clear();
    await Promise.allSettled(workers);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    if (electronVersion) {
      Object.defineProperty(process.versions, 'electron', electronVersion);
    } else {
      Reflect.deleteProperty(process.versions, 'electron');
    }
    const local = await fs.realpath(fixture);
    expect(path.dirname(local)).toBe(await fs.realpath(tmpdir()));
    expect(path.basename(local)).toMatch(/^agent-lab-image-jobs-/);
    await fs.rm(local, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  });

  it('requires an explicit desktop confirmation for the exact request and shows the additional input cost before spending', async () => {
    mock.dialog.mockResolvedValueOnce({ response: 0 });
    const s = session();
    await expect(s.start()).rejects.toThrow('annullata');
    const [dialog] = mock.dialog.mock.calls[0];
    expect(dialog.defaultId).toBe(0);
    expect(dialog.cancelId).toBe(0);
    for (const value of [root, 'Account immagini di prova', config().model, input.prompt, input.output, '0.02469', 'costo aggiuntivo', 'crediti inclusi']) {
      expect(dialog.detail).toContain(value);
    }
    expect(dialog.detail).not.toContain(profile().provider.apiKey);
    expect(mock.generate).not.toHaveBeenCalled();
    expect(await fs.readdir(root)).toEqual([]);
    expect(await fs.readdir(mock.data)).toEqual([]);
  });

  it('blocks missing profiles, credentials from the environment, disabled/custom profiles and headless calls before the provider', async () => {
    const s = session(),
      open = profile();
    s.providers.mockReturnValueOnce([]);
    await expect(s.start()).rejects.toThrow('profilo OpenAI');
    s.providers.mockReturnValueOnce([{ ...open, provider: { ...open.provider, apiKey: '' } }]);
    await expect(s.start()).rejects.toThrow('profilo OpenAI');
    const disabled = { ...open, disabled: true },
      custom = { ...open, provider: { ...open.provider, baseURL: 'https://example.invalid' } };
    for (const item of [disabled, custom]) {
      s.providers.mockReturnValueOnce([item]);
      await expect(s.start()).rejects.toThrow('profilo OpenAI');
    }
    vi.stubEnv('AIDER_DESK_HEADLESS', 'true');
    await expect(s.start()).rejects.toThrow('desktop');
    expect(mock.dialog).not.toHaveBeenCalled();
    expect(mock.generate).not.toHaveBeenCalled();
  });

  it('starts in the background, writes one new asset, delivers its receipt and preview, and never sends the replay after restart', async () => {
    const ref = path.join(root, 'source.png');
    await fs.writeFile(ref, image);
    const deferred = Promise.withResolvers<typeof response>(),
      sent = Promise.withResolvers<void>();
    mock.generate.mockImplementationOnce(async () => {
      sent.resolve();
      return deferred.promise;
    });
    const s = session(),
      params = { ...input, references: ['source.png'] };
    const started = await s.start(params);
    const resumed = session(s.id);
    let concurrentReceipt: ReturnType<typeof resumed.result> | undefined;
    try {
      await sent.promise;
      expect(started).toMatchObject({ state: 'running', output: input.output });
      expect(s.task.trackWorkerRun).toHaveBeenCalledTimes(1);
      expect(await s.jobs.notifications(false)).toEqual([]);
      expect(mock.generate.mock.calls[0][0]).toMatchObject({
        apiKey: profile().provider.apiKey,
        prompt: input.prompt,
        references: [{ name: 'source.png', mimeType: 'image/png', bytes: image }],
      });
      await expect(fs.stat(path.join(root, input.output))).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await s.start(params)).jobId).toBe(started.jobId);
      expect((await resumed.start(params)).jobId).toBe(started.jobId);
      concurrentReceipt = resumed.result(started.jobId);
      expect(mock.generate).toHaveBeenCalledTimes(1);
    } finally {
      deferred.resolve(response);
    }
    const done = await s.result(started.jobId);
    expect(await concurrentReceipt).toEqual(done);
    expect(done).toMatchObject({
      jobId: started.jobId,
      state: 'completed',
      billing: 'usage_reported',
      requestId: response.requestId,
      usage,
      estimatedOutputUsd: 0.02469,
    });
    expect(await fs.readFile(path.join(root, input.output))).toEqual(image);
    expect(await fs.readFile(ref)).toEqual(image);
    expect(s.task.recordDesktopWrite).toHaveBeenCalledWith(path.join(root, input.output), null, image);
    expect(s.context.map((m) => m.role)).toEqual(['assistant', 'tool']);
    expect(s.task.addToolMessage).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(s.task.addToolMessage.mock.calls[0])).toContain('image/png');
    expect((await s.jobs.notifications(true)).map((m) => m.role)).toEqual(['assistant', 'tool']);
    expect(await s.jobs.notifications(true)).toEqual([]);
    const restored = session(s.id);
    expect(await restored.start(params)).toMatchObject({ jobId: started.jobId });
    expect(await restored.result(started.jobId)).toEqual(done);
    expect(done.fileStatus).toBe('verified');
    await fs.unlink(path.join(root, input.output));
    expect((await restored.start(params)).jobId).toBe(started.jobId);
    expect(await restored.result(started.jobId)).toMatchObject({ state: 'completed', fileStatus: 'missing', usage });
    expect(mock.dialog).toHaveBeenCalledTimes(1);
    expect(mock.generate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(done)).not.toContain(input.prompt);
    expect(JSON.stringify(done)).not.toContain(profile().provider.apiKey);
    await expect(session().result(started.jobId)).rejects.toThrow('assente');
  });

  it('rejects private/escaping paths, links and an existing destination before either consent or sending', async () => {
    await fs.mkdir(path.join(root, 'assets'));
    await fs.writeFile(path.join(root, input.output), 'keep');
    await fs.writeFile(path.join(root, 'sample.png'), image);
    await fs.link(path.join(root, 'sample.png'), path.join(root, 'copy.png'));
    await fs.symlink(path.join(root, 'assets'), path.join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
    const s = session();
    for (const output of [input.output, '../outside.png', '.git/item.png', 'bad.txt', 'alias/item.png']) {
      await expect(s.start({ ...input, output })).rejects.toThrow();
    }
    await expect(s.start({ ...input, output: 'other.png', references: ['copy.png'] })).rejects.toThrow();
    expect(await fs.readFile(path.join(root, input.output), 'utf8')).toBe('keep');
    expect(mock.dialog).not.toHaveBeenCalled();
    expect(mock.generate).not.toHaveBeenCalled();
  });

  it('rejects a changed reference or changed provider after the confirmation dialog', async () => {
    const s = session();
    await fs.writeFile(path.join(root, 'sample.png'), image);
    mock.dialog.mockImplementationOnce(async () => {
      await fs.appendFile(path.join(root, 'sample.png'), Buffer.from([0]));
      return { response: 1 };
    });
    await expect(s.start({ ...input, references: ['sample.png'] })).rejects.toThrow('Riferimenti cambiati');
    mock.dialog.mockImplementationOnce(async () => {
      s.providers.mockReturnValue([{ ...profile(), provider: { ...profile().provider, apiKey: 'changed-fixture-key' } }]);
      return { response: 1 };
    });
    await expect(s.start()).rejects.toThrow('cambiato');
    expect(mock.generate).not.toHaveBeenCalled();
  });

  it('respects a destination already reserved by another worker on disk', async () => {
    const s = session();
    const release = await reserveImageOutput(root, input.output);
    try {
      await expect(s.start()).rejects.toThrow('prenotata');
      expect(mock.generate).not.toHaveBeenCalled();
    } finally {
      await release();
    }
    const retry = await s.start();
    expect((await s.result(retry.jobId)).state).toBe('completed');
    expect(mock.generate).toHaveBeenCalledTimes(1);
  });

  it('records not_sent when desktop quiescence begins after the receipt but before dispatch', async () => {
    const s = session();
    const write = fs.writeFile.bind(fs);
    vi.spyOn(fs, 'writeFile').mockImplementation(async (file, data, options) => {
      await write(file, data, options);
      if (typeof file === 'string' && file.endsWith('.claim')) {
        s.stop.request();
      }
    });
    const started = await s.start();
    expect(await s.result(started.jobId)).toMatchObject({ state: 'failed', billing: 'not_sent' });
    expect(mock.generate).not.toHaveBeenCalled();
    await expect(fs.stat(path.join(root, input.output))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reports an unconfirmed charge on cancellation after dispatch; replay is a receipt read', async () => {
    const sent = Promise.withResolvers<void>();
    mock.generate.mockImplementationOnce(async ({ signal }) => {
      sent.resolve();
      return new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('Annullata dopo invio')), { once: true });
      });
    });
    const s = session();
    const started = await s.start();
    await sent.promise;
    s.abort.abort();
    const receipt = await s.result(started.jobId);
    expect(receipt).toMatchObject({ state: 'failed', billing: 'unconfirmed' });
    expect(receipt.usage).toBeUndefined();
    const restored = session(s.id);
    expect((await restored.start()).jobId).toBe(started.jobId);
    expect(await restored.result(started.jobId)).toEqual(receipt);
    expect(mock.generate).toHaveBeenCalledTimes(1);
    expect(mock.dialog).toHaveBeenCalledTimes(1);
    await expect(fs.stat(path.join(root, input.output))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('retains measured usage and the original file if another operation creates the destination before delivery', async () => {
    mock.generate.mockImplementationOnce(async () => {
      await fs.writeFile(path.join(root, input.output), 'user file');
      return response;
    });
    const s = session(),
      started = await s.start();
    expect(await s.result(started.jobId)).toMatchObject({ state: 'failed', billing: 'usage_reported', usage, requestId: response.requestId });
    expect(await fs.readFile(path.join(root, input.output), 'utf8')).toBe('user file');
    expect(s.task.recordDesktopWrite).not.toHaveBeenCalled();
    expect(mock.generate).toHaveBeenCalledTimes(1);
  });

  it('retains reported usage on cancellation received between provider completion and saving', async () => {
    const s = session();
    mock.generate.mockImplementationOnce(async () => {
      s.abort.abort();
      return response;
    });
    const started = await s.start();
    expect(await s.result(started.jobId)).toMatchObject({ state: 'failed', billing: 'usage_reported', usage, requestId: response.requestId });
    expect(await fs.readdir(path.join(root, 'assets'))).toEqual([]);
    expect(mock.generate).toHaveBeenCalledTimes(1);
  });

  it('keeps the two context messages of each completed job adjacent when two deliveries finish together', async () => {
    const s = session(),
      gate = Promise.withResolvers<typeof response>();
    mock.generate.mockImplementation(async () => gate.promise);
    try {
      await Promise.all([s.start({ ...input, output: 'a.png' }), s.start({ ...input, output: 'b.png' })]);
    } finally {
      gate.resolve(response);
    }
    const notice = await s.jobs.notifications(true);
    expect(s.context.map((m) => m.role)).toEqual(['assistant', 'tool', 'assistant', 'tool']);
    expect(notice.map((m) => m.id)).toEqual(s.context.map((m) => m.id));
    const callId = (m: ContextMessage) => (Array.isArray(m.content) && 'toolCallId' in m.content[0] ? m.content[0].toolCallId : undefined);
    expect(callId(notice[0])).toBeTruthy();
    expect(callId(notice[0])).toBe(callId(notice[1]));
    expect(callId(notice[2])).toBe(callId(notice[3]));
    expect(callId(notice[0])).not.toBe(callId(notice[2]));
    expect(mock.generate).toHaveBeenCalledTimes(2);
  });

  it('keeps the request ID and measured usage if a charged HTTP response contains an unusable PNG', async () => {
    mock.generate.mockRejectedValueOnce(new ImageResponseError('PNG non valido.', usage, response.requestId));
    const s = session(),
      started = await s.start();
    expect(await s.result(started.jobId)).toMatchObject({ state: 'failed', billing: 'usage_reported', usage, requestId: response.requestId });
    await expect(fs.stat(path.join(root, input.output))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await session(s.id).start()).jobId).toBe(started.jobId);
    expect(mock.generate).toHaveBeenCalledTimes(1);
  });

  it('reports an interrupted persisted receipt on restart without sending the request again', async () => {
    const s = session(),
      started = await s.start();
    const saved = await s.result(started.jobId);
    const bucket = path.join(mock.data, 'image-jobs');
    const [scope] = await fs.readdir(bucket);
    expect(scope).toBeTruthy();
    await fs.writeFile(path.join(bucket, scope, started.jobId + '.json'), JSON.stringify({ ...saved, state: 'running' }));
    const restarted = session(s.id);
    expect((await restarted.start()).jobId).toBe(started.jobId);
    await expect(restarted.result(started.jobId)).rejects.toThrow('Verifica il consumo');
    expect(mock.dialog).toHaveBeenCalledTimes(1);
    expect(mock.generate).toHaveBeenCalledTimes(1);
  });

  it('records an unknown amount, rather than zero, when a completed request contains no usage', async () => {
    mock.generate.mockResolvedValueOnce({ bytes: image, usage: {} });
    const s = session(),
      started = await s.start();
    const receipt = await s.result(started.jobId);
    expect(receipt).toMatchObject({ state: 'completed', billing: 'unconfirmed', usage: {} });
    expect(receipt.usage?.calculatedCostUsd).toBeUndefined();
    expect(await fs.readFile(path.join(root, input.output))).toEqual(image);
    expect(mock.generate).toHaveBeenCalledTimes(1);
  });
});
