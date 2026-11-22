import { Buffer } from 'node:buffer';
import { promisify } from 'node:util';
import { crc32, inflate } from 'node:zlib';

export const imageModels = ['gpt-image-2.6-sunburst', 'gpt-image-2.6-flare'] as const;
export const imageQualities = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export const imageSizes = ['1024x1024', '1536x1024', '1024x1536'] as const;
export type ImageModel = (typeof imageModels)[number];
export type ImageQuality = (typeof imageQualities)[number];
export type ImageSize = (typeof imageSizes)[number];

export interface ImageReference {
  name: string;
  mimeType: string;
  bytes: Buffer;
}

export interface ImageProviderUsage {
  inputTokens?: number;
  inputTextTokens?: number;
  inputImageTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  calculatedCostUsd?: number;
}

interface ImageRequest {
  apiKey: string;
  model: ImageModel;
  prompt: string;
  quality: ImageQuality;
  size: ImageSize;
  references: readonly ImageReference[];
  signal?: AbortSignal;
}

interface ImageResult {
  bytes: Buffer;
  usage: ImageProviderUsage;
  requestId?: string;
}

export class ImageResponseError extends Error {
  constructor(
    message: string,
    readonly usage: ImageProviderUsage,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

// Billable output tokens for one PNG, from the GPT-Image-2.6 calculator (2026-11-22).
// https://developers.openai.com/api/docs/guides/image-generation#calculating-costs
// The two rectangular sizes have the same price. Input tokens are billed separately.
const outputTokens: Record<ImageQuality, { square: number; rectangle: number }> = {
  low: { square: 823, rectangle: 664 },
  medium: { square: 1449, rectangle: 1132 },
  high: { square: 1756, rectangle: 1372 },
  xhigh: { square: 3122, rectangle: 2459 },
  max: { square: 7024, rectangle: 5488 },
};
// Standard Images API prices in USD per million tokens, shared by Sunburst and Flare.
// https://developers.openai.com/api/docs/pricing#image-generation
const rates = { textInput: 5, imageInput: 8, imageOutput: 30 };
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maxImageBytes = 16 * 1024 * 1024;
const maxJsonBytes = 4 * Math.ceil(maxImageBytes / 3) + 1024 * 1024;
const inflatePng = promisify(inflate);

export const estimateImageOutputUsd = (model: ImageModel, quality: ImageQuality, size: ImageSize): number => {
  if (!imageModels.includes(model) || !imageQualities.includes(quality) || !imageSizes.includes(size)) {
    throw new Error('Impostazioni del modello immagini non supportate.');
  }
  const tokens = outputTokens[quality][size === '1024x1024' ? 'square' : 'rectangle'];
  return (tokens * rates.imageOutput) / 1_000_000;
};

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const count = (value: unknown): number | undefined => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined);

const measureUsage = (value: unknown): ImageProviderUsage => {
  const raw = record(value);
  const input = record(raw.input_tokens_details);
  const output = record(raw.output_tokens_details);
  const usage: ImageProviderUsage = {};
  const values = {
    inputTokens: count(raw.input_tokens),
    inputTextTokens: count(input.text_tokens),
    inputImageTokens: count(input.image_tokens),
    outputTokens: count(raw.output_tokens),
    totalTokens: count(raw.total_tokens),
  };
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      usage[key as keyof typeof values] = value;
    }
  }
  const { inputTokens, inputTextTokens, inputImageTokens, outputTokens, totalTokens } = values;
  // This direct PNG endpoint reports text/image inputs and image output. Never infer missing token categories.
  if (
    inputTokens !== undefined &&
    inputTextTokens !== undefined &&
    inputImageTokens !== undefined &&
    outputTokens !== undefined &&
    totalTokens !== undefined &&
    inputTextTokens + inputImageTokens === inputTokens &&
    inputTokens + outputTokens === totalTokens &&
    (raw.output_tokens_details === undefined || (output.image_tokens === outputTokens && output.text_tokens === 0)) &&
    (input.cached_tokens === undefined || input.cached_tokens === 0)
  ) {
    usage.calculatedCostUsd = (inputTextTokens * rates.textInput + inputImageTokens * rates.imageInput + outputTokens * rates.imageOutput) / 1_000_000;
  }
  return usage;
};

const referenceExtension = (reference: ImageReference): string => {
  if (!reference || typeof reference !== 'object') {
    throw new Error('Riferimento immagine non valido.');
  }
  const { bytes, mimeType } = reference;
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length >= 50_000_000) {
    throw new Error('Dimensione del riferimento immagine non valida.');
  }
  if (mimeType === 'image/png' && bytes.subarray(0, 8).equals(pngSignature)) {
    return 'png';
  }
  if (mimeType === 'image/jpeg' && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return 'jpg';
  }
  if (mimeType === 'image/webp' && bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') {
    return 'webp';
  }
  throw new Error('Il formato del riferimento non corrisponde a PNG, JPEG o WebP.');
};

const readJson = async (response: Response, signal: AbortSignal): Promise<unknown> => {
  if (!response.body) {
    throw new Error();
  }
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  const chunks: Uint8Array[] = [];
  let received = 0;
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (Number(response.headers.get('content-length')) > maxJsonBytes) {
      throw new Error();
    }
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      received += chunk.value.byteLength;
      if (received > maxJsonBytes) {
        throw new Error();
      }
      chunks.push(chunk.value);
    }
    signal.throwIfAborted();
    return JSON.parse(Buffer.concat(chunks, received).toString('utf8'));
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
};

const pngError = () => new Error('OpenAI ha restituito un PNG non valido o di dimensioni diverse da quelle richieste.');

// Validate the decompressed scanline sizes without decoding pixels or requiring Electron in the headless service.
const validatePixels = async (compressed: Buffer[], width: number, height: number, bitsPerPixel: number, interlaced: boolean): Promise<void> => {
  const passes = interlaced
    ? [
        [0, 0, 8, 8],
        [4, 0, 8, 8],
        [0, 4, 4, 8],
        [2, 0, 4, 4],
        [0, 2, 2, 4],
        [1, 0, 2, 2],
        [0, 1, 1, 2],
      ]
    : [[0, 0, 1, 1]];
  const rows = passes.map(([x, y, dx, dy]) => ({
    count: Math.ceil((height - y) / dy),
    bytes: 1 + Math.ceil((Math.ceil((width - x) / dx) * bitsPerPixel) / 8),
  }));
  const length = rows.reduce((total, pass) => total + pass.count * pass.bytes, 0);
  let pixels: Buffer;
  try {
    pixels = await inflatePng(Buffer.concat(compressed), { maxOutputLength: length });
  } catch {
    throw pngError();
  }
  if (pixels.length !== length) {
    throw pngError();
  }
  let offset = 0;
  for (const pass of rows) {
    for (let y = 0; y < pass.count; y++, offset += pass.bytes) {
      if (pixels[offset] > 4) {
        throw pngError();
      }
    }
  }
};

const decodeOutput = async (b64: unknown, size: ImageSize): Promise<Buffer> => {
  if (typeof b64 !== 'string' || !b64.length || b64.length > 4 * Math.ceil(maxImageBytes / 3)) {
    throw pngError();
  }
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length < 45 || bytes.length > maxImageBytes || bytes.toString('base64') !== b64 || !bytes.subarray(0, 8).equals(pngSignature)) {
    throw pngError();
  }
  const [width, height] = size.split('x').map(Number);
  if (bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height) {
    throw pngError();
  }
  const depth = bytes[24],
    color = bytes[25],
    interlace = bytes[28];
  const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  const channels = [1, 0, 3, 1, 2, 0, 4];
  if (!depths[color]?.includes(depth) || bytes[26] !== 0 || bytes[27] !== 0 || interlace > 1) {
    throw pngError();
  }
  const compressed: Buffer[] = [];
  let palette = false,
    dataClosed = false;
  for (let offset = 8; offset + 12 <= bytes.length; ) {
    const chunkLength = bytes.readUInt32BE(offset),
      end = offset + 8 + chunkLength;
    if (end + 4 > bytes.length || crc32(bytes.subarray(offset + 4, end)) !== bytes.readUInt32BE(end)) {
      throw pngError();
    }
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    if (type === 'IHDR') {
      if (offset !== 8) {
        throw pngError();
      }
    } else if (type === 'PLTE') {
      if (
        palette ||
        compressed.length ||
        color === 0 ||
        color === 4 ||
        !chunkLength ||
        chunkLength % 3 ||
        chunkLength > 768 ||
        (color === 3 && chunkLength / 3 > 2 ** depth)
      ) {
        throw pngError();
      }
      palette = true;
    } else if (type === 'IDAT') {
      if (dataClosed || (color === 3 && !palette) || compressed.length >= 65536) {
        throw pngError();
      }
      compressed.push(bytes.subarray(offset + 8, end));
    } else if (type === 'IEND') {
      if (chunkLength || end + 4 !== bytes.length || !compressed.length) {
        throw pngError();
      }
      await validatePixels(compressed, width, height, channels[color] * depth, interlace === 1);
      return bytes;
    } else {
      if (!/^[a-z][A-Za-z][A-Z][A-Za-z]$/.test(type)) {
        throw pngError();
      }
      if (compressed.length) {
        dataClosed = true;
      }
    }
    offset = end + 4;
  }
  throw pngError();
};

const interrupted = (timeout: AbortSignal) => new Error(timeout.aborted ? 'Tempo massimo della richiesta immagini superato.' : 'Richiesta immagini annullata.');

export const generateOpenAIImage = async ({ apiKey, model, prompt, quality, size, references, signal }: ImageRequest): Promise<ImageResult> => {
  estimateImageOutputUsd(model, quality, size);
  if (typeof apiKey !== 'string' || !apiKey || /[^\x21-\x7e]/.test(apiKey)) {
    throw new Error('Chiave API OpenAI mancante o non valida.');
  }
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 64000 || [...prompt].length > 32000) {
    throw new Error('Descrizione immagine non valida (massimo 32.000 caratteri).');
  }
  if (!Array.isArray(references) || references.length > 16) {
    throw new Error('Numero di riferimenti immagine non valido (massimo 16).');
  }
  const timeout = AbortSignal.timeout(30 * 60 * 1000),
    combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  if (combined.aborted) {
    throw interrupted(timeout);
  }
  const fields = { model, prompt, quality, size, output_format: 'png', n: 1 };
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  let body: string | FormData;
  if (references.length) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      form.set(key, String(value));
    }
    for (const [index, reference] of references.entries()) {
      const extension = referenceExtension(reference);
      form.append('image[]', new Blob([Uint8Array.from(reference.bytes)], { type: reference.mimeType }), `reference-${index + 1}.${extension}`);
    }
    body = form;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(fields);
  }
  let response: Response;
  try {
    response = await fetch(references.length ? 'https://api.openai.com/v1/images/edits' : 'https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: combined,
    });
  } catch {
    if (combined.aborted) {
      throw interrupted(timeout);
    }
    throw new Error('Connessione a OpenAI non riuscita. Esito della richiesta immagini non confermato.');
  }
  const id = response.headers.get('x-request-id');
  const requestId = id && /^req_[a-zA-Z0-9_-]{1,120}$/.test(id) ? id : undefined;
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    if (response.status === 429) {
      throw new ImageResponseError('OpenAI segnala un limite di quota o frequenza (HTTP 429).', {}, requestId);
    }
    if (response.status >= 500) {
      throw new ImageResponseError(`Esito della richiesta immagini non confermato da OpenAI (HTTP ${response.status}).`, {}, requestId);
    }
    throw new ImageResponseError(`OpenAI ha rifiutato la richiesta immagini (HTTP ${response.status}).`, {}, requestId);
  }
  let payload: Record<string, unknown>;
  try {
    payload = record(await readJson(response, combined));
  } catch {
    throw new ImageResponseError(combined.aborted ? interrupted(timeout).message : 'Risposta immagini OpenAI non valida o troppo grande.', {}, requestId);
  }
  const usage = measureUsage(payload.usage);
  try {
    if (!Array.isArray(payload.data) || payload.data.length !== 1 || (payload.output_format !== undefined && payload.output_format !== 'png')) {
      throw pngError();
    }
    const bytes = await decodeOutput(record(payload.data[0]).b64_json, size);
    combined.throwIfAborted();
    return { bytes, usage, requestId };
  } catch {
    throw new ImageResponseError(combined.aborted ? interrupted(timeout).message : pngError().message, usage, requestId);
  }
};
