import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { labRoot, repoRoot } from './prepare.mjs';
import { pilotFiles } from './workflow-pilot-fixture.mjs';
import { serveWorkflowPreview } from './launch-workflow-pilot.mjs';

const require = createRequire(path.join(repoRoot, 'package.json'));
const { chromium } = require('playwright');

export const verifyWorkflowBrowser = async ({ view, html }) => {
  // Only render the trusted fixture, never scripts supplied by the coding model.
  assert.equal(html, pilotFiles['index.html'], 'La pagina di riferimento differisce dalla fixture approvata.');
  const root = await fs.mkdtemp(path.join(labRoot, 'work', 'workflow-browser-'));
  let preview;
  let browser;
  try {
    await fs.writeFile(path.join(root, 'index.html'), pilotFiles['index.html']);
    await fs.writeFile(path.join(root, 'view.json'), JSON.stringify(view));
    preview = await serveWorkflowPreview(root);
    browser = await chromium.launch({ channel: 'msedge', headless: true, timeout: 8000 });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(4000);
    await page.route('**/*', route => route.request().url().startsWith(preview.url) ? route.continue() : route.abort());
    await page.goto(preview.url);
    await page.getByLabel('Cerca').fill('Ada');
    await page.getByLabel('Stato').selectOption('Archiviato');
    await page.getByText('Nessun risultato').waitFor();
    await page.getByLabel('Stato').selectOption('Attivo');
    assert.equal(await page.getByRole('row').count(), 2);
    await page.getByRole('button', { name: 'Dettagli' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ada Rossi' });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Chiudi' }).click();
    await dialog.waitFor({ state: 'hidden' });
  } finally {
    await browser?.close();
    preview?.server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let input = '';
    for await (const chunk of process.stdin.setEncoding('utf8')) {
      input += chunk;
      if (input.length > 96 * 1024) throw new Error('Proposta oltre il limite del verificatore.');
    }
    await verifyWorkflowBrowser(JSON.parse(input));
    console.log('WORKFLOW_BROWSER_PASS');
  } catch (error) {
    console.error(error.message.split('\n')[0]);
    process.exitCode = 1;
  }
}
