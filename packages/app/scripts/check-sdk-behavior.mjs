import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise the SDKs that the CLI will load. Both model and HTTP transport stay local to the build.
export async function checkSdkBehavior(project) {
  const require = createRequire(path.join(project, 'package.json'));
  const { generateText } = require('ai');
  const model = {
    specificationVersion: 'v4',
    provider: 'fixture',
    modelId: 'input-check',
    supportedUrls: {},
    doGenerate() {
      throw new Error('Invalid messages reached the model.');
    },
  };
  await assert.rejects(
    generateText({ model, messages: [{ role: 'user', content: 42 }], maxRetries: 0 }),
    (error) => error.name === 'AI_InvalidPromptError' && error.message.includes('ModelMessage[] schema'),
  );

  const { createRequesty } = require('@requesty/ai-sdk');
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X+ikAAAAASUVORK5CYII=';
  let imageUrl;
  const provider = createRequesty({
    apiKey: 'local-fixture',
    baseURL: 'https://fixture.invalid',
    fetch: async (_url, options) => {
      imageUrl = JSON.parse(options.body).messages[0].content[0].image_url.url;
      return Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
    },
  });
  await provider('fixture').doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'file', mediaType: 'image/png', data: { type: 'data', data: image } }] }],
  });
  assert.equal(imageUrl, image);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await checkSdkBehavior(process.cwd());
    console.log('AI SDK: validazione dei messaggi e allegati Requesty verificati.');
  } catch (error) {
    console.error(
      'Controllo AI SDK fallito. Un checkout precedente può conservare la vecchia patch di ai. Segui la procedura di installazione pulita del README in una copia dedicata e riprova.',
    );
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
