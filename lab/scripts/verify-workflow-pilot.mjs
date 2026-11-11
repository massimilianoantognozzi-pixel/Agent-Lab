import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

import { labRoot, repoRoot } from './prepare.mjs';
import { prepareWorkflowPilot, serveWorkflowPreview } from './launch-workflow-pilot.mjs';
import { verifyWorkflowBrowser } from './verify-workflow-browser.mjs';

const require = createRequire(path.join(repoRoot, 'package.json'));
const { _electron, chromium } = require('playwright');
const root = await fs.mkdtemp(path.join(labRoot, 'work', 'workflow-smoke-'));
const { project, env } = await prepareWorkflowPilot(root, { fixture: true });
const preview = await serveWorkflowPreview(project);
let app;
let browser;

try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const web = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await web.goto(preview.url);
  await web.getByText('Ada Rossi').waitFor();
  assert.equal(await web.getByLabel('Cerca').count(), 0);
  const viewFile = path.join(project, 'view.json');
  const original = JSON.parse(await fs.readFile(viewFile, 'utf8'));
  await fs.writeFile(viewFile, JSON.stringify({ ...original, enabled: { search: true, status: true, details: true } }));
  await web.reload();
  await web.getByLabel('Cerca').fill('Ada');
  await web.getByLabel('Stato').selectOption('Archiviato');
  await web.getByText('Nessun risultato').waitFor();
  await web.getByLabel('Stato').selectOption('Attivo');
  await web.getByRole('button', { name: 'Dettagli' }).click();
  const dialog = web.getByRole('dialog', { name: 'Ada Rossi' });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Chiudi' }).click();
  await dialog.waitFor({ state: 'hidden' });
  const probe = spawnSync(process.execPath, [path.join(labRoot, 'scripts', 'verify-workflow-browser.mjs')], {
    env: Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(SystemRoot|WINDIR|LOCALAPPDATA|APPDATA|USERPROFILE|TEMP|TMP)$/i.test(name))),
    input: JSON.stringify({ view: { ...original, enabled: { search: true, status: true, details: true } }, html: await fs.readFile(path.join(project, 'index.html'), 'utf8') }),
    encoding: 'utf8', timeout: 25_000, windowsHide: true,
  });
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(probe.stdout.trim(), 'WORKFLOW_BROWSER_PASS');
  await fs.writeFile(viewFile, JSON.stringify(original));
  console.log('PASS browser: ricerca e stato combinati, lista vuota, apertura e chiusura dettaglio.');

  const build = path.join(labRoot, 'work', 'workflow-pilot-build-reasoning', 'main', 'index.js');
  app = await _electron.launch({ executablePath: require('electron'), args: [build], cwd: repoRoot, env: { ...env, AIDER_DESK_PORT: '24362' }, timeout: 45_000 });
  let page;
  for (let attempt = 0; attempt < 100 && !page; attempt++) {
    for (const candidate of app.windows()) {
      if (await candidate.evaluate(() => Boolean(window.api)).catch(() => false)) {
        page = candidate;
        break;
      }
    }
    if (!page) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(page, 'Finestra Electron non trovata');
  await page.waitForFunction(async () => {
    const data = await window.api.getProviderModels();
    return data.models?.some((model) => model.id === 'gpt-6.1-sol' && model.providerId === 'openai-codex');
  }, null, { timeout: 30_000 });
  console.log('PASS Electron: provider e modello riconosciuti dal runtime.');
  const editor = page.locator('.cm-content[contenteditable="true"]').last();
  await editor.waitFor({ timeout: 30_000 });
  const taskId = await page.evaluate(async (workspace) => (await window.api.getTasks(workspace))[0]?.id, project);
  assert.ok(taskId, 'Task del progetto pilota non trovato');
  await editor.click();
  await page.keyboard.insertText('/workflow status');
  await editor.press('Enter');
  await page.getByText('Invia la descrizione della funzionalità per iniziare il piano.', { exact: true }).waitFor({ timeout: 15_000 });
  const selector = page.getByRole('button', { name: /Ragionamento/ });
  await selector.click();
  await page.getByRole('button', { name: 'Alto', exact: true }).click();
  await page.waitForFunction(async ({workspace, task}) =>
    (await window.api.getTasks(workspace)).some(item => item.id === task && item.metadata?.reasoningEffort === 'high'),
  {workspace: project, task: taskId});
  console.log('PASS Electron: livello Alto selezionato e persistito nel task.');
  const blocked = await page.evaluate(async ({ workspace, task }) => {
    try {
      await window.api.updateTask(workspace, task, { state: 'DONE' });
      return false;
    } catch (error) {
      return String(error).includes('La chiusura richiede');
    }
  }, { workspace: project, task: taskId });
  assert.ok(blocked, 'Il cambio di stato diretto ha superato il gate');
  assert.deepEqual(JSON.parse(await fs.readFile(viewFile, 'utf8')), original);
  console.log('PASS Electron: comando dal campo di chat e chiusura priva di prove respinta.');
} finally {
  await app?.close();
  await browser?.close();
  preview.server.close();
}
