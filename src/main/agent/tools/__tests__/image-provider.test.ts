import { Buffer } from 'node:buffer';
import { crc32, deflateSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { estimateImageOutputUsd, generateOpenAIImage, imageModels, imageQualities, imageSizes } from '../image-provider';

import type { ImageReference } from '../image-provider';

const fetchImage = vi.fn<typeof fetch>();
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const chunk = (type: string, data: Buffer): Buffer => {
  const contents = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(contents));
  return Buffer.concat([length, contents, checksum]);
};
const png = (width: number, height: number, pixels = Buffer.alloc(height * (width + 1))) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
};
const square = png(1024, 1024);
const rectangle = png(1536, 1024);
const standard = {
  apiKey: 'fixture-secret',
  model: imageModels[0],
  prompt: 'Un fondale verde',
  quality: 'low' as const,
  size: '1024x1024' as const,
  references: [] as ImageReference[],
};
const jsonImage = (bytes: Buffer, usage?: unknown) =>
  Response.json({ output_format: 'png', data: [{ b64_json: bytes.toString('base64') }], usage }, { headers: { 'x-request-id': 'req_test-001' } });

describe('OpenAI Images adapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchImage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchImage.mockReset();
  });

  it('matches the official 2.6 output calculator for every offered model, quality and size', () => {
    const squareUsd = [0.02469, 0.04347, 0.05268, 0.09366, 0.21072];
    const rectangleUsd = [0.01992, 0.03396, 0.04116, 0.07377, 0.16464];
    for (const model of imageModels) {
      for (const [index, quality] of imageQualities.entries()) {
        expect(imageSizes.map((size) => estimateImageOutputUsd(model, quality, size))).toEqual([squareUsd[index], rectangleUsd[index], rectangleUsd[index]]);
      }
    }
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('generates exactly one PNG, restricts redirects and prices the actual token breakdown', async () => {
    fetchImage.mockResolvedValueOnce(
      jsonImage(square, {
        input_tokens: 12,
        input_tokens_details: { text_tokens: 9, image_tokens: 3 },
        output_tokens: 823,
        output_tokens_details: { image_tokens: 823, text_tokens: 0 },
        total_tokens: 835,
      }),
    );
    const result = await generateOpenAIImage(standard);
    const [url, request] = fetchImage.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect(request).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: 'Bearer fixture-secret', 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(request?.body as string)).toEqual({
      model: imageModels[0],
      prompt: standard.prompt,
      quality: 'low',
      size: '1024x1024',
      n: 1,
      output_format: 'png',
    });
    expect(result.bytes.equals(square)).toBe(true);
    expect(result.requestId).toBe('req_test-001');
    expect(result.usage).toEqual({
      inputTokens: 12,
      inputTextTokens: 9,
      inputImageTokens: 3,
      outputTokens: 823,
      totalTokens: 835,
      calculatedCostUsd: 0.024759,
    });
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });

  it('retains the provider request ID and observed usage when a billed response contains an unusable image', async () => {
    fetchImage.mockResolvedValueOnce(jsonImage(rectangle, { input_tokens: 2, output_tokens: 664, total_tokens: 666 }));
    await expect(generateOpenAIImage(standard)).rejects.toMatchObject({
      requestId: 'req_test-001',
      usage: { inputTokens: 2, outputTokens: 664, totalTokens: 666 },
    });
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });

  it('edits ordered authorized byte buffers using multipart image[] without exposing filenames from the project', async () => {
    const references = [
      { name: 'C:\\privato\\cliente.png', mimeType: 'image/png', bytes: square },
      { name: 'private.jpg', mimeType: 'image/jpeg', bytes: Buffer.from([255, 216, 255, 224, 0, 2, 255, 217]) },
      { name: 'private.webp', mimeType: 'image/webp', bytes: Buffer.from('RIFF\x04\x00\x00\x00WEBP', 'binary') },
    ];
    fetchImage.mockResolvedValueOnce(jsonImage(rectangle));
    const result = await generateOpenAIImage({ ...standard, model: imageModels[1], quality: 'max', size: '1536x1024', references });
    const [url, request] = fetchImage.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    expect(request?.redirect).toBe('error');
    expect(new Headers(request?.headers).has('Content-Type')).toBe(false);
    const form = request?.body as FormData;
    expect(form.get('model')).toBe(imageModels[1]);
    expect(form.get('n')).toBe('1');
    expect(form.get('size')).toBe('1536x1024');
    expect(form.get('quality')).toBe('max');
    expect(form.get('output_format')).toBe('png');
    expect(form.get('prompt')).toBe(standard.prompt);
    const files = form.getAll('image[]') as File[];
    expect(files.map((file) => file.name)).toEqual(['reference-1.png', 'reference-2.jpg', 'reference-3.webp']);
    for (const [index, file] of files.entries()) {
      expect(file.type).toBe(references[index].mimeType);
      expect(Buffer.from(await file.arrayBuffer()).equals(references[index].bytes)).toBe(true);
    }
    expect(result.bytes.equals(rectangle)).toBe(true);
    expect(result.usage).toEqual({});
  });

  it.each([
    { input_tokens: 10, output_tokens: 50, total_tokens: 60 },
    { input_tokens: 10, input_tokens_details: { image_tokens: 3, text_tokens: 7 }, output_tokens: 50, total_tokens: 61 },
    { input_tokens: 10, input_tokens_details: { image_tokens: 4, text_tokens: 7 }, output_tokens: 50, total_tokens: 60 },
    {
      input_tokens: 10,
      input_tokens_details: { image_tokens: 3, text_tokens: 7 },
      output_tokens: 50,
      total_tokens: 60,
      output_tokens_details: { image_tokens: 49, text_tokens: 1 },
    },
    { input_tokens: 10, input_tokens_details: { image_tokens: 3, text_tokens: 7, cached_tokens: 2 }, output_tokens: 50, total_tokens: 60 },
  ])('preserves valid counters but leaves an incomplete or unpriceable usage amount unknown', async (usage) => {
    fetchImage.mockResolvedValueOnce(jsonImage(square, usage));
    const result = await generateOpenAIImage(standard);
    expect(result.usage.outputTokens).toBe(50);
    expect(result.usage.calculatedCostUsd).toBeUndefined();
  });

  it.each([
    { model: 'other' },
    { quality: 'auto' },
    { size: 'auto' },
    { prompt: ' ' },
    { prompt: 'a'.repeat(32001) },
    { apiKey: 'credential\r\nInjected: true' },
    { references: Array(17).fill({ name: 'bad', mimeType: 'image/png', bytes: square }) },
    { references: [{ name: 'fake.png', mimeType: 'image/png', bytes: Buffer.from('not a png') }] },
  ])('rejects out-of-contract inputs before any network activity', async (changes) => {
    await expect(generateOpenAIImage({ ...standard, ...changes } as Parameters<typeof generateOpenAIImage>[0])).rejects.toThrow();
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 429, 500])('does not echo provider errors or replay a charged request (HTTP %i)', async (status) => {
    fetchImage.mockResolvedValueOnce(Response.json({ error: { message: `echo ${standard.apiKey}, ${standard.prompt}` } }, { status }));
    const failure = await generateOpenAIImage(standard).catch((error: Error) => error.message);
    expect(failure).toContain(`HTTP ${status}`);
    expect(failure).not.toContain(standard.apiKey);
    expect(failure).not.toContain(standard.prompt);
    if (status === 429) {
      expect(failure).toContain('quota');
    }
    if (status >= 500) {
      expect(failure).toContain('non confermato');
    }
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });

  it('sanitizes network errors and handles both caller cancellation and timeout', async () => {
    fetchImage.mockRejectedValueOnce(new Error(standard.apiKey));
    await expect(generateOpenAIImage(standard)).rejects.toThrow('Esito della richiesta immagini non confermato');
    const before = new AbortController();
    before.abort(standard.apiKey);
    await expect(generateOpenAIImage({ ...standard, signal: before.signal })).rejects.toThrow('annullata');
    const timeout = new AbortController();
    timeout.abort();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    await expect(generateOpenAIImage(standard)).rejects.toThrow('Tempo massimo');
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });

  it('stops reading and sanitizes an abort while the image body is still downloading', async () => {
    const abort = new AbortController();
    let reading: () => void = () => {};
    const signalReady = new Promise<void>((resolve) => {
      reading = resolve;
    });
    const cancel = vi.fn();
    fetchImage.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          pull() {
            reading();
          },
          cancel,
        }),
      ),
    );
    const result = generateOpenAIImage({ ...standard, signal: abort.signal });
    await signalReady;
    abort.abort('private reason');
    await expect(result).rejects.toThrow('annullata');
    expect(cancel).toHaveBeenCalled();
  });

  it('bounds the reported and streamed length before decoding an untrusted body', async () => {
    const cancel = vi.fn();
    fetchImage.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { headers: { 'Content-Length': String(64 * 1024 * 1024) } }));
    await expect(generateOpenAIImage(standard)).rejects.toThrow('troppo grande');
    expect(cancel).toHaveBeenCalled();
    const part = new Uint8Array(4 * 1024 * 1024);
    const stop = vi.fn();
    fetchImage.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(part);
          },
          cancel: stop,
        }),
      ),
    );
    await expect(generateOpenAIImage(standard)).rejects.toThrow('troppo grande');
    expect(stop).toHaveBeenCalled();
  });

  it('accepts an interlaced indexed-colour PNG, including its valid palette', async () => {
    const hdr = Buffer.alloc(13);
    hdr.writeUInt32BE(1024);
    hdr.writeUInt32BE(1024, 4);
    hdr[8] = 1;
    hdr[9] = 3;
    hdr[12] = 1;
    const passes = [
      [128, 128],
      [128, 128],
      [256, 128],
      [256, 256],
      [512, 256],
      [512, 512],
      [1024, 512],
    ];
    const length = passes.reduce((n, [w, h]) => n + (1 + w / 8) * h, 0);
    const image = Buffer.concat([
      signature,
      chunk('IHDR', hdr),
      chunk('PLTE', Buffer.from([0, 0, 0, 255, 255, 255])),
      chunk('IDAT', deflateSync(Buffer.alloc(length))),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    fetchImage.mockResolvedValueOnce(jsonImage(image));
    expect((await generateOpenAIImage(standard)).bytes.equals(image)).toBe(true);
  });

  it('rejects truncated, wrong-size, bad-CRC and malformed raster data, including superficially valid PNGs', async () => {
    const corrupt = Buffer.from(square);
    corrupt[29] ^= 1;
    const filter = Buffer.alloc(1024 * 1025);
    filter[1025] = 5;
    const samples = [signature, rectangle, corrupt, Buffer.concat([square, Buffer.from([0])]), png(1024, 1024, Buffer.alloc(32)), png(1024, 1024, filter)];
    for (const image of samples) {
      fetchImage.mockResolvedValueOnce(jsonImage(image));
      await expect(generateOpenAIImage(standard)).rejects.toThrow('PNG non valido');
    }
    fetchImage.mockResolvedValueOnce(Response.json({ data: [{ b64_json: square.toString('base64') + ' ' }] }));
    await expect(generateOpenAIImage(standard)).rejects.toThrow('PNG non valido');
    fetchImage.mockResolvedValueOnce(Response.json({ data: [{ url: 'http://external.invalid/file' }] }));
    await expect(generateOpenAIImage(standard)).rejects.toThrow('PNG non valido');
    expect(fetchImage).toHaveBeenCalledTimes(samples.length + 2);
  });
});
