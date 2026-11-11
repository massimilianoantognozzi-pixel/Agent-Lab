import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { prepareWorkflowPilot } from './launch-workflow-pilot.mjs';
import { prepareWorkflowEnvironment } from './workflow-environment.mjs';
import { labRoot, repoRoot } from './prepare.mjs';

const require = createRequire(path.join(repoRoot, 'package.json'));
const { _electron, chromium } = require('playwright');
const root = await fs.mkdtemp(path.join(labRoot, 'work', 'workflow-environment-smoke-'));
const freshRoot = path.join(root, 'fresh-profile');
const freshPilot = await prepareWorkflowPilot(freshRoot);
const fresh = await prepareWorkflowEnvironment(freshPilot, freshRoot);
const freshSettings = JSON.parse(await fs.readFile(path.join(fresh.data, 'config.json'), 'utf8'));
assert.deepEqual(freshSettings.providers, []);
assert.deepEqual(freshSettings.openProjects, []);
assert.equal(fresh.env.AIDER_DESK_WORKFLOW_PILOT_DIR, undefined);
assert.equal(fresh.env.AIDER_DESK_WORKFLOW_CONFIG, undefined);
assert.equal(fresh.env.AIDER_DESK_WORKFLOW_REMOTE_PAIRING, undefined);
await assert.rejects(fs.access(path.join(freshRoot, 'home', 'extensions', 'openai-codex')), { code: 'ENOENT' });
await assert.rejects(fs.access(path.join(freshRoot, 'home', 'agents', 'workflow-pilot', 'config.json')), { code: 'ENOENT' });
const example = JSON.parse(await fs.readFile(path.join(fresh.data, 'managed-workflow.example.json'), 'utf8'));
assert.equal(example.projects[0].provider, 'your-provider-id');
assert.equal(example.projects[0].model, 'your-model-id');
example.projects[0] = { ...example.projects[0], id: 'own-project', provider: 'own-provider', model: 'own-model' };
await fs.writeFile(path.join(fresh.data, 'managed-workflow.json'), JSON.stringify(example));
const configured = await prepareWorkflowEnvironment(freshPilot, freshRoot);
assert.ok(configured.env.AIDER_DESK_WORKFLOW_CONFIG);
const configuredPairing = JSON.parse(await fs.readFile(configured.env.AIDER_DESK_WORKFLOW_REMOTE_PAIRING, 'utf8'));
assert.equal(configuredPairing.project, 'own-project');
console.log('PASS primo avvio senza provider; configurazione e associazione abilitate con il progetto e il modello scelti.');
const fixture = { fixture: true };
const { data, env, repository } = await prepareWorkflowEnvironment(await prepareWorkflowPilot(root, fixture), root, fixture);
const build = path.join(labRoot, 'work', 'workflow-environment-desktop-pair-build', 'main', 'index.js');
const key = path.join(root, 'smoke-key.pem');
const cert = path.join(root, 'smoke-cert.pem');
const openssl = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
execFileSync(openssl, ['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-keyout',key,'-out',cert], { stdio:'ignore',windowsHide:true });
let backendUrl;
const proxy = https.createServer({ key:await fs.readFile(key), cert:await fs.readFile(cert) }, (incoming, outgoing) => {
  if (!backendUrl || !incoming.url?.startsWith('/') || incoming.url.startsWith('//')) { outgoing.writeHead(503).end(); return; }
  const upstream = http.request({ hostname:'127.0.0.1',port:new URL(backendUrl).port,path:incoming.url,method:incoming.method,headers:incoming.headers }, response => {
    outgoing.writeHead(response.statusCode, response.headers); response.pipe(outgoing);
  });
  upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(503);outgoing.end();});
  incoming.pipe(upstream);
});
await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
const webOrigin = 'https://127.0.0.1:' + proxy.address().port;
const url = webOrigin + '/';
let app;
let browser;
try {
  app = await _electron.launch({ executablePath: require('electron'), args: [build], cwd: repoRoot, env: { ...env, AIDER_DESK_PORT: '24367', AIDER_DESK_WORKFLOW_WEB_ORIGIN: webOrigin }, timeout: 45_000 });
  const expires = Date.now() + 15_000;
  const address = path.join(data, 'remote-session.json');
  while (true) {
    try { await fs.access(address); break; } catch {
      if (Date.now() > expires) throw Error('Il processo Electron non ha avviato il server remoto.');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  ({ url: backendUrl } = JSON.parse(await fs.readFile(address, 'utf8')));
  const pairingFile = path.join(data, 'remote-pairing.json');
  const originalPairing = JSON.parse(await fs.readFile(pairingFile, 'utf8'));
  assert.equal((await fetch(backendUrl + 'api/tasks')).status, 401);
  const manifestResponse = await fetch(backendUrl + 'manifest.webmanifest');
  assert.match(manifestResponse.headers.get('content-type') ?? '', /application\/manifest\+json/);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.display, 'standalone');
  for (const size of [192, 512]) {
    const icon = await fetch(backendUrl + 'icon-' + size + '.png');
    assert.equal(icon.headers.get('content-type'), 'image/png');
    const bytes = Buffer.from(await icon.arrayBuffer());
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  let desktop;
  for (let i = 0; i < 80 && !desktop; i++) {
    for (const window of app.windows()) {
      if (await window.evaluate(() => Boolean(window.api)).catch(() => false)) { desktop = window; break; }
    }
    if (!desktop) await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(desktop);
  await desktop.waitForFunction(async project => (await window.api.getOpenProjects()).some(item => item.baseDir === project), repository);
  await desktop.evaluate(async project => { await window.api.startProject(project); }, repository);

  const showPhonePairing = async instance => {
    await instance.evaluate(({ Menu }) => {
      const item = Menu.getApplicationMenu()?.getMenuItemById('agentlab-pair-phone');
      if (!item) throw Error('Comando nativo Associa telefono assente.');
      item.click();
    });
    for (let attempt = 0; attempt < 70; attempt++) {
      for (const window of instance.windows()) {
        if (await window.getByRole('heading', {name:'Associa il telefono'}).isVisible().catch(()=>false)) return window;
      }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw Error('Finestra QR nativa non trovata.');
  };
  const pairingWindow = await showPhonePairing(app);
  const { code } = JSON.parse(await fs.readFile(pairingFile, 'utf8'));
  assert.equal(code !== originalPairing.code, true);
  browser = await chromium.launch({ channel: 'msedge', headless: true, timeout: 15_000 });
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  const mobile = await mobileContext.newPage();
  await mobile.goto(backendUrl);
  await mobile.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  assert.deepEqual(await mobile.evaluate(() => caches.keys()), []);
  await mobile.context().setOffline(true);
  await mobile.goto(backendUrl, {waitUntil: 'domcontentloaded'});
  await mobile.getByRole('heading', {name:'Agent-Lab non raggiungibile'}).waitFor();
  await mobile.context().setOffline(false);
  let pairRequests = 0;
  mobile.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/pair')) pairRequests++; });
  await mobile.goto('about:blank');
  await mobile.goto(url + '#pair=' + code);
  await mobile.getByRole('heading', { name: 'Associa il dispositivo' }).waitFor();
  await mobile.waitForFunction(() => location.hash === '');
  const filled = await mobile.evaluate(expected => document.querySelector('#code').value === expected, code);
  assert.equal(filled, true);
  assert.equal(pairRequests, 0);
  const qrClosed = pairingWindow.waitForEvent('close', { timeout:10000 });
  await mobile.getByRole('button', { name: 'Associa', exact: true }).click();
  await Promise.all([qrClosed, mobile.getByRole('heading', { name: 'Progetti', exact: true }).waitFor()]);
  assert.equal(desktop.isClosed(), false);
  const deviceCookie = (await mobile.context().cookies(url)).find(cookie => cookie.name === '__Host-agentlab-device');
  assert.equal(Boolean(deviceCookie?.httpOnly && deviceCookie?.secure && deviceCookie?.sameSite === 'Strict'), true);
  assert.equal(await mobile.evaluate(() => sessionStorage.getItem('agentlab-remote')), null);
  await mobile.locator('#create').click();
  await mobile.locator('#chat-title').filter({ hasText: 'Nuova chat' }).waitFor();
  await mobile.locator('#autonomy').click();
  await mobile.getByText('Progetto associato', { exact: true }).filter({ visible: true }).waitFor();
  await mobile.getByRole('button', { name: /Manuale/ }).click();
  assert.equal(await mobile.locator('#autonomy-label').innerText(), 'Manuale');
  if (await mobile.locator('#close-sheet').isVisible()) await mobile.locator('#close-sheet').click();
  await mobile.locator('#effort').click();
  await mobile.getByRole('button', { name: 'Alto', exact: true }).click();
  if (await mobile.locator('#close-sheet').isVisible()) await mobile.locator('#close-sheet').click();
  let submitted;
  let onSubmission;
  const submission = new Promise(resolve => { onSubmission = resolve; });
  await mobile.route('**/api/action', async route => {
    const input = route.request().postDataJSON();
    if (input?.action === 'run') {
      submitted = input;
      await route.fulfill({ status: 202, json: { accepted: true } });
      onSubmission();
    } else {
      await route.continue();
    }
  });
  await mobile.getByRole('textbox', { name: 'Richiesta' }).fill('Controlla i turni.');
  await mobile.getByRole('button', { name: 'Invia richiesta' }).click();
  await Promise.race([submission, new Promise((_, reject) => {
    setTimeout(() => reject(Error('Invio della richiesta non osservato.')), 10000).unref();
  })]);
  await desktop.waitForFunction(async project => (await window.api.getTasks(project)).some(task => task.name === 'Nuova chat' &&
    task.autonomyMode === 'manual' && task.metadata?.reasoningEffort === 'high'), repository);
  const taskId = await desktop.evaluate(async project => (await window.api.getTasks(project)).find(task => task.name === 'Nuova chat')?.id, repository);
  assert.ok(taskId);
  assert.equal(submitted?.id, taskId);
  assert.match(submitted?.prompt ?? '', /^\/workflow (?:bug|change|feature) Controlla i turni\.$/);
  await desktop.evaluate(async ({ project, taskId }) => window.api.savePrompt(project, taskId, '/workflow change Leggi il filtro dei turni.'), { project: repository, taskId });
  await mobile.getByText('Leggi il filtro dei turni.', { exact: true }).waitFor();
  await mobile.locator('#autonomy').click();
  await mobile.getByRole('button', { name: /Autonoma/ }).click();
  if (await mobile.locator('#close-sheet').isVisible()) await mobile.locator('#close-sheet').click();
  await desktop.waitForFunction(async ({ project, taskId }) => (await window.api.getTasks(project)).some(task => task.id === taskId && task.autonomyMode === 'autonomous'), { project: repository, taskId });
  await desktop.evaluate(async project => window.api.patchProjectSettings(project, { autonomyModeLocked: true }), repository);
  const blocked = await mobile.evaluate(async id => {
    const response = await fetch('/api/action', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'settings',id,autonomy:'guided'}) });
    return response.status;
  }, taskId);
  assert.equal(blocked, 400);
  await mobile.setViewportSize({ width: 320, height: 700 });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.getByRole('button', { name: 'Torna alla Home' }).click();
  await mobile.getByRole('button', { name: 'Cerca conversazioni' }).click();
  await mobile.getByRole('searchbox', { name: 'Cerca conversazioni' }).fill('Nuova chat');
  await mobile.locator('#tasks').getByRole('button', { name: /Nuova chat/ }).click();
  await mobile.getByText('Leggi il filtro dei turni.', { exact: true }).waitFor();
  await mobile.getByRole('button', { name: 'Torna alla Home' }).click();
  await app.close();
  const restarted = await prepareWorkflowEnvironment(await prepareWorkflowPilot(root, fixture), root, fixture);
  app = await _electron.launch({ executablePath: require('electron'), args: [build], cwd: repoRoot, env: { ...restarted.env, AIDER_DESK_PORT: '24367', AIDER_DESK_WORKFLOW_WEB_ORIGIN: webOrigin }, timeout: 45_000 });
  const reopenDeadline = Date.now() + 15_000;
  for (;;) {
    try { await fs.access(address); break; } catch {
      if (Date.now() > reopenDeadline) throw Error('La porta remota non è ricomparsa dopo il riavvio.');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  ({ url: backendUrl } = JSON.parse(await fs.readFile(address, 'utf8')));
  let reopenedDesktop;
  for (let attempt = 0; attempt < 60 && !reopenedDesktop; attempt++) {
    for (const window of app.windows()) {
      if (await window.evaluate(() => Boolean(window.api)).catch(() => false)) { reopenedDesktop = window; break; }
    }
    if (!reopenedDesktop) await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(reopenedDesktop, 'Agent-Lab non riaperto.');
  await reopenedDesktop.evaluate(async project => { await window.api.startProject(project); }, repository);
  const reopened = await mobileContext.newPage();
  await reopened.goto(url);
  await reopened.getByRole('heading', { name: 'Progetti', exact: true }).waitFor();
  assert.equal(await reopened.evaluate(() => sessionStorage.getItem('agentlab-remote')), null);
  const anotherQr = await showPhonePairing(app);
  assert.equal(await reopened.evaluate(async () => (await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'device-ready' }),
  })).status), 200);
  assert.equal(anotherQr.isClosed(), false);
  const { code: cancelledCode } = JSON.parse(await fs.readFile(pairingFile, 'utf8'));
  await (await app.browserWindow(anotherQr)).evaluate(window => window.close());
  assert.equal(await reopened.evaluate(async code => (await fetch('/api/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, client: 'web' }),
  })).status, cancelledCode), 403);
  assert.equal(await reopened.evaluate(async () => (await fetch('/api/tasks')).status), 200);
  await reopened.getByRole('button', { name: 'Apri menu' }).click();
  await reopened.getByRole('button', { name: 'Disconnetti dispositivo', exact: true }).click();
  await reopened.getByRole('heading', { name: 'Associa il dispositivo' }).waitFor();
  assert.equal((await fetch(backendUrl + 'api/tasks')).status, 401);
  console.log('PASS Electron/Edge: QR nativo, chiusura dopo la Home, vecchio dispositivo ignorato, QR annullato respinto, ripresa e revoca. Home e lock PC verificati.');
} finally {
  await browser?.close();
  await app?.close();
  proxy.closeAllConnections();
  await new Promise(resolve=>proxy.close(resolve));
}
