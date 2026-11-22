import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { isImageProviderProfile } from '@common/agent';
import { tool } from 'ai';
import { z } from 'zod';

import { desktopCheckoutKey, type DesktopStopBoundary } from '../desktop-stop';

import { readImageReferences, relativeImagePath, reserveImageOutput, saveNewImage, validateImageOutput } from './image-files';
import { estimateImageOutputUsd, generateOpenAIImage, ImageResponseError, type ImageProviderUsage } from './image-provider';

import type { ContextMessage } from '@common/types';
import type { Task } from '@/task';
import type { Store } from '@/store';

import { AIDER_DESK_DATA_DIR } from '@/constants';
import { atomicWriteJsonFile } from '@/utils/atomic-write';

const fileName = z.string().min(1).max(512);
const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(12000),
  output: fileName,
  references: z.array(fileName).max(8).optional(),
});
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const destinations = new Set<string>();
type Receipt = {
  jobId: string;
  output: string;
  state: 'running' | 'completed' | 'failed';
  model: string;
  size: string;
  quality: string;
  estimatedOutputUsd: number;
  requestId?: string;
  usage?: ImageProviderUsage;
  billing?: 'not_sent' | 'unconfirmed' | 'usage_reported';
  sha256?: string;
  fileStatus?: 'verified' | 'changed' | 'missing' | 'unverified';
  error?: string;
};
type Job = { done: Promise<Receipt> };
const running = new Map<string, Promise<Receipt>>();

const selected = (store: Store) => {
  const config = store.getSettings().imageGeneration;
  const profile = config && store.getProviders().find((item) => item.id === config.providerId);
  if (!config || !profile || !isImageProviderProfile(profile)) {
    throw new Error('Seleziona un profilo OpenAI nativo attivo nelle impostazioni immagini.');
  }
  return { ...config, label: profile.name || profile.id, apiKey: profile.provider.apiKey.trim() };
};

const confirmImage = async (detail: string, editing: boolean, signal: AbortSignal) => {
  if (!process.versions.electron || process.env.AIDER_DESK_HEADLESS === 'true') {
    throw new Error('Conferma richiesta sul desktop.');
  }
  const { BrowserWindow, dialog } = await import('electron');
  const options = {
    type: 'question' as const,
    title: 'Agent-Lab · Immagini',
    message: editing ? 'Modificare questa immagine?' : 'Generare questa immagine?',
    detail,
    buttons: ['Annulla', 'Confermo l’uso dei soli crediti inclusi'],
    cancelId: 0,
    defaultId: 0,
    noLink: true,
    signal,
  };
  const owner = BrowserWindow.getFocusedWindow();
  signal.throwIfAborted();
  const answer = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options);
  signal.throwIfAborted();
  if (answer.response !== 1) {
    throw new Error('Generazione annullata prima dell’invio.');
  }
};

export class ProjectImageJobs {
  private readonly jobs = new Map<string, Job>();
  private notices: ContextMessage[] = [];

  constructor(
    private readonly task: Task,
    private readonly store: Store,
    private readonly signal: AbortSignal,
    private readonly stop: DesktopStopBoundary,
  ) {}

  readonly tools = {
    'images---generate': tool({
      description:
        'Create a project PNG, or edit authorized project PNG/JPEG/WebP references into a new PNG. Use this for requested assets, in chat or as Designer. Choose a new relative output path. Requires desktop consent. A job starts in the background; do independent work and use images---result when the file is needed. Reuse approved assets.',
      inputSchema: requestSchema,
      execute: (input) => this.start(input),
    }),
    'images---result': tool({
      description:
        'Wait for a previously started image job in this task and return its saved file, status and observed usage. Reading an existing receipt does not generate an image.',
      inputSchema: z.object({ jobId: z.string().uuid() }),
      execute: async ({ jobId }) => {
        const { root, directory } = await this.scope();
        const recordPath = path.join(directory, jobId + '.json');
        const active = running.get(recordPath);
        if (active) {
          return active;
        }
        const record = JSON.parse(
          await fs.readFile(recordPath, 'utf8').catch(() => {
            throw new Error('Ricevuta immagini assente in questo task.');
          }),
        ) as Receipt;
        if (record.state === 'running') {
          throw new Error('Richiesta precedente interrotta. Verifica il consumo nel portale OpenAI prima di decidere se riprovare.');
        }
        if (record.state === 'completed') {
          record.fileStatus = 'unverified';
          if (record.sha256) {
            try {
              const [file] = await readImageReferences(root, [record.output]);
              record.fileStatus = hash(file.bytes) === record.sha256 ? 'verified' : 'changed';
            } catch (err) {
              if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                record.fileStatus = 'missing';
              }
            }
          }
        }
        return record;
      },
    }),
  };

  private async scope() {
    const root = await fs.realpath(this.task.getTaskDir());
    const directory = path.join(AIDER_DESK_DATA_DIR, 'image-jobs', hash(desktopCheckoutKey(root) + '\n' + this.task.taskId));
    return { root, directory };
  }

  private async start(input: z.infer<typeof requestSchema>) {
    this.signal.throwIfAborted();
    const { root, directory } = await this.scope();
    const output = relativeImagePath(input.output);
    const names = (input.references ?? []).map(relativeImagePath);
    const key = desktopCheckoutKey(path.join(root, output));
    let held = false;
    let launched = false;
    let release: (() => Promise<void>) | undefined;
    try {
      const config = selected(this.store);
      const { model, size, quality } = config;
      const estimatedOutputUsd = estimateImageOutputUsd(model, quality, size);
      const references = await readImageReferences(root, names);
      const fingerprint = hash(JSON.stringify([key, config.providerId, model, size, quality, input.prompt, references.map((ref) => hash(ref.bytes))]));
      const claim = path.join(directory, fingerprint + '.claim');
      const prior = await fs.readFile(claim, 'utf8').catch((err) => {
        if (err.code !== 'ENOENT') {
          throw err;
        }
        return undefined;
      });
      if (prior !== undefined) {
        if (!z.string().uuid().safeParse(prior).success) {
          throw new Error('Ricevuta precedente incompleta. Verifica il consumo nel portale OpenAI.');
        }
        return {
          jobId: prior,
          output,
          message: 'Richiesta già registrata. Usa images---result per leggerne l’esito.',
        };
      }
      if (destinations.has(key)) {
        throw new Error('Un lavoro grafico sta già usando questa destinazione.');
      }
      destinations.add(key);
      held = true;
      await validateImageOutput(root, output);
      const detail = [
        'Progetto: ' + root,
        'Profilo OpenAI: ' + config.label + ' (' + config.providerId + ')',
        model + ' · ' + size + ' · ' + quality,
        'Destinazione: ' + output,
        'Riferimenti da inviare: ' + (names.join(', ') || 'nessuno'),
        'Stima del solo output: ' + estimatedOutputUsd.toFixed(5) + ' USD. Prompt e riferimenti hanno un costo aggiuntivo.',
        'Conferma solo se hai verificato i crediti inclusi disponibili e che l’organizzazione non possa addebitare un saldo acquistato, una ricarica o altre spese. OpenAI non espone un limite per questa singola richiesta.',
        'Prompt da inviare:\n' + input.prompt,
      ].join('\n\n');
      await confirmImage(detail, names.length > 0, this.signal);
      if (JSON.stringify(config) !== JSON.stringify(selected(this.store)) || (await this.scope()).root !== root) {
        throw new Error('Profilo o progetto cambiato. Ripeti la conferma.');
      }
      if (names.length) {
        const checked = await readImageReferences(root, names);
        if (checked.some((ref, index) => !ref.bytes.equals(references[index].bytes))) {
          throw new Error('Riferimenti cambiati dopo la conferma. Richiedi una nuova anteprima dei dati da inviare.');
        }
      }
      release = await reserveImageOutput(root, output);
      await fs.mkdir(directory, { recursive: true });
      const jobId = randomUUID();
      const receipt: Receipt = {
        jobId,
        output,
        state: 'running',
        model,
        size,
        quality,
        estimatedOutputUsd,
      };
      const record = path.join(directory, jobId + '.json');
      await atomicWriteJsonFile(record, receipt);
      await fs.writeFile(claim, jobId, { flag: 'wx', mode: 0o600 });
      const done = this.stop
        .run(async () => {
          let preview: string | undefined;
          try {
            await validateImageOutput(root, output);
            this.signal.throwIfAborted();
            receipt.billing = 'unconfirmed';
            const result = await generateOpenAIImage({
              apiKey: config.apiKey,
              model,
              size,
              quality,
              prompt: input.prompt,
              references,
              signal: this.signal,
            });
            receipt.usage = result.usage;
            if (result.usage.totalTokens !== undefined) {
              receipt.billing = 'usage_reported';
            }
            receipt.requestId = result.requestId;
            await saveNewImage(root, output, result.bytes, this.signal);
            receipt.state = 'completed';
            receipt.sha256 = hash(result.bytes);
            receipt.fileStatus = 'verified';
            await this.task.recordDesktopWrite(path.join(root, output), null, result.bytes);
            const { nativeImage } = await import('electron');
            const thumbnail = nativeImage.createFromBuffer(result.bytes).resize({ width: 256 }).toPNG();
            if (thumbnail.length && thumbnail.length <= 512 * 1024) {
              preview = thumbnail.toString('base64');
            }
          } catch (error) {
            if (receipt.state !== 'completed') {
              if (error instanceof ImageResponseError) {
                receipt.usage = error.usage;
                receipt.requestId = error.requestId;
                if (error.usage.totalTokens !== undefined) {
                  receipt.billing = 'usage_reported';
                }
              }
              receipt.state = 'failed';
              receipt.billing ??= 'not_sent';
              receipt.error = error instanceof Error ? error.message : 'Esito immagini non confermato.';
            }
          }
          await atomicWriteJsonFile(record, receipt);
          await this.deliver(receipt, preview);
          return receipt;
        }, true)
        .catch(async (error: unknown) => {
          if (receipt.state !== 'running' || receipt.billing) {
            throw error;
          }
          receipt.state = 'failed';
          receipt.billing = 'not_sent';
          receipt.error = 'Sessione chiusa prima dell’invio della richiesta.';
          await atomicWriteJsonFile(record, receipt);
          await this.deliver(receipt);
          return receipt;
        })
        .finally(async () => {
          try {
            await release?.();
          } finally {
            destinations.delete(key);
            running.delete(record);
          }
        });
      running.set(record, done);
      this.jobs.set(jobId, { done });
      this.task.trackWorkerRun(done);
      launched = true;
      return { state: 'running', jobId, output };
    } finally {
      if (!launched) {
        try {
          await release?.();
        } finally {
          if (held) {
            destinations.delete(key);
          }
        }
      }
    }
  }

  private async deliver(receipt: Receipt, preview?: string) {
    const toolCallId = randomUUID();
    const toolName = 'images---result';
    const args = { jobId: receipt.jobId };
    const text = JSON.stringify(receipt);
    const content = [{ type: 'text', text }, ...(preview ? [{ type: 'image', mimeType: 'image/png', data: preview }] : [])];
    const timestamp = Date.now();
    const pair: ContextMessage[] = [
      {
        id: randomUUID(),
        role: 'assistant',
        timestamp,
        content: [{ type: 'tool-call', toolCallId, toolName, input: args }],
      },
      {
        id: randomUUID(),
        role: 'tool',
        timestamp,
        content: [
          {
            type: 'tool-result',
            toolCallId,
            toolName,
            output: { type: 'text', value: text },
          },
        ],
      },
    ];
    await Promise.all([this.task.addContextMessage(pair[0]), this.task.addContextMessage({ ...pair[1], ...(preview ? { imagePreview: preview } : {}) })]);
    this.task.addToolMessage(toolCallId, 'images', 'result', args, JSON.stringify({ content }), undefined, undefined, false, true);
    this.notices.push(...pair);
  }

  async notifications(wait: boolean) {
    if (wait) {
      await Promise.all(Array.from(this.jobs.values(), ({ done }) => done));
    }
    return this.notices.splice(0);
  }
}
