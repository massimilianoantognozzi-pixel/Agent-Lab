import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { prepare, repoRoot, labRoot, sampleDir } from './prepare.mjs';
import { configureLocalGui, localModelEnvironment } from './configure-local-gui.mjs';
import { startLocalBackend } from './managed-local-backend.mjs';

const require = createRequire(path.join(repoRoot, 'package.json'));
const { _electron } = require('playwright');
prepare(); configureLocalGui();
const report = { startedAt: new Date().toISOString(), checks: {}, failures: [], pageErrors: [] };
let app; let backend; let page;
const save = () => fs.writeFileSync(path.join(labRoot, 'work', 'local-gui-smoke.json'), JSON.stringify(report, null, 2));
const waitFor = async (predicate, timeout = 150000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) { const result = await predicate(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 350)); }
  throw new Error('GUI proof timed out.');
};
try {
  backend = await startLocalBackend();
  report.backend = backend.ready;
  app = await _electron.launch({ executablePath: require('electron'), args: [repoRoot], cwd: repoRoot, env: localModelEnvironment(), timeout: 45000 });
  for (const stream of [app.process().stdout, app.process().stderr]) stream.on('data', chunk => fs.appendFileSync(path.join(labRoot, 'work', 'local-gui-electron.log'), chunk));
  page = await waitFor(async () => {
    for (const window of app.windows()) if (await window.evaluate(() => Boolean(window.api)).catch(() => false)) return window;
  }, 45000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  report.profile = await page.evaluate(async dir => {
    await window.api.addOpenProject(dir);
    const task = await window.api.createNewTask(dir, { name: 'Devstral locale - verifica GUI', activate: true });
    await window.api.loadTask(dir, task.id);
    return { task, providers: await window.api.getProviders(), models: await window.api.getProviderModels() };
  }, sampleDir);
  report.taskId = report.profile.task.id;
  await page.evaluate(({ dir, taskId }) => {
    window.__localGuiProof = { completed: [], logs: [], approvals: [] };
    window.api.addResponseCompletedListener(dir, taskId, data => window.__localGuiProof.completed.push(data));
    window.api.addLogListener(dir, taskId, data => window.__localGuiProof.logs.push(data));
  }, { dir: sampleDir, taskId: report.taskId });
  const ask = async prompt => {
    const start = Date.now();
    const before = await page.evaluate(() => window.__localGuiProof.completed.length);
    await page.evaluate(({ dir, taskId, prompt }) => window.api.runPrompt(dir, taskId, prompt, 'agent'), { dir: sampleDir, taskId: report.taskId, prompt });
    return waitFor(async () => page.evaluate(async ({ dir, taskId, before, start }) => {
      const state = await window.api.loadTask(dir, taskId);
      if (state.question) {
        const question = JSON.stringify(state.question);
        if (/calculator\.py|initial_instructions|check_onboarding_performed/.test(question)) {
          window.__localGuiProof.approvals.push(state.question);
          window.api.answerQuestion(dir, taskId, 'y');
        } else throw new Error('Unexpected approval request: ' + state.question.text);
      }
      const completed = window.__localGuiProof.completed.slice(before);
      const task = (await window.api.getTasks(dir)).find(task => task.id === taskId);
      if (completed.length && task?.state !== 'IN_PROGRESS') return { completed, elapsedMs: Date.now() - start, messages: state.messages };
      const errors = window.__localGuiProof.logs.filter(log => log.level === 'error');
      if (errors.length) throw new Error(errors.map(log => log.message).join('\n'));
      return null;
    }, { dir: sampleDir, taskId: report.taskId, before, start }));
  };
  report.greeting = await ask('Senza usare strumenti, rispondi esattamente: Devstral locale collegato');
  report.checks.greeting = JSON.stringify(report.greeting.completed).includes('Devstral locale collegato');
  if (!report.checks.greeting) throw new Error('Expected local GUI greeting not received.');
  report.read = await ask('Usa power---file_read per leggere calculator.py nel progetto attivo. Poi indica il nome della funzione e spiega brevemente il calcolo. Non modificare file.');
  report.checks.read = JSON.stringify(report.read.completed).includes('calculate_subtotal');
  if (!report.checks.read) throw new Error('Expected function name not received from sample read.');
  report.checks.outsideDenied = await page.evaluate(async ({ dir, taskId }) => {
    try { await window.api.readFile(dir, taskId, '~/Desktop/Agent-Lab/lab/work/synthetic-outside-canary.txt'); return false; }
    catch (error) { return String(error).includes('fuori'); }
  }, { dir: sampleDir, taskId: report.taskId });
  if (!report.checks.outsideDenied) throw new Error('Outside IPC read was not refused.');
  report.events = await page.evaluate(() => window.__localGuiProof);
  const setupExtraTask = async name => page.evaluate(async ({ dir, name }) => {
    const task = await window.api.createNewTask(dir, { name, activate: false });
    await window.api.loadTask(dir, task.id);
    window.__extraProof = { logs: [], completed: [] };
    window.api.addLogListener(dir, task.id, data => window.__extraProof.logs.push(data));
    window.api.addResponseCompletedListener(dir, task.id, data => window.__extraProof.completed.push(data));
    return task;
  }, { dir: sampleDir, name });
  const budgetTask = await setupExtraTask('Verifica tecnica del budget');
  await page.evaluate(({ dir, taskId }) => window.api.runPrompt(dir, taskId, 'Prova di rifiuto del contesto: rispondi soltanto OK.\n' + ' x'.repeat(15500), 'agent'), { dir: sampleDir, taskId: budgetTask.id });
  report.budget = await waitFor(async () => page.evaluate(() => {
    const error = window.__extraProof.logs.find(log => log.level === 'error' && log.message?.includes('contesto troppo lungo'));
    return error ? { error: error.message, completions: window.__extraProof.completed.length } : null;
  }), 45000);
  report.checks.oversizedRejected = report.budget.completions === 0;
  if (!report.checks.oversizedRejected) throw new Error('Oversized request unexpectedly generated a completion.');
  await waitFor(async () => page.evaluate(async ({ dir, id }) => (await window.api.getTasks(dir)).find(task => task.id === id)?.state !== 'IN_PROGRESS', { dir: sampleDir, id: budgetTask.id }), 10000);
  const cancelTask = await setupExtraTask('Verifica tecnica interruzione');
  const cancellationStart = Date.now();
  await page.evaluate(({ dir, taskId }) => window.api.runPrompt(dir, taskId, 'Non usare strumenti. Genera un elenco numerato da 1 a 10000, una riga per numero, scrivendo ogni volta il testo prova locale. Inizia subito dal numero 1.', 'agent'), { dir: sampleDir, taskId: cancelTask.id });
  const logFile = path.join(labRoot, 'profile', 'data', 'logs', 'combined-2026-10-25.log');
  await waitFor(async () => fs.readFileSync(logFile, 'utf8').split(/\r?\n/).some(line => {
    try { const row = JSON.parse(line); return row.message === 'Agent Lab local context preflight' && Date.parse(row.timestamp) >= cancellationStart && row.tokens <= 24576; } catch { return false; }
  }), 45000);
  await new Promise(resolve => setTimeout(resolve, 500));
  const stopStarted = Date.now();
  await page.evaluate(({ dir, id }) => window.api.interruptResponse(dir, id), { dir: sampleDir, id: cancelTask.id });
  report.cancel = await waitFor(async () => page.evaluate(async ({ dir, id }) => {
    const task = (await window.api.getTasks(dir)).find(task => task.id === id);
    return task?.state === 'INTERRUPTED' ? { state: task.state } : null;
  }, { dir: sampleDir, id: cancelTask.id }), 10000);
  report.cancel.elapsedMs = Date.now() - stopStarted;
  report.checks.cancelled = true;
  await page.evaluate(async ({ dir, ids }) => { for (const id of ids) await window.api.updateTask(dir, id, { archived: true }); }, { dir: sampleDir, ids: [budgetTask.id, cancelTask.id] });
  await page.getByText('Devstral locale - verifica GUI', { exact: true }).first().click();
  await page.getByText('Loading task...', { exact: true }).waitFor({ state: 'hidden', timeout: 10000 });
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) if (window.webContents.getURL().includes('index.html')) window.setSize(1240, 850); });
  await page.screenshot({ path: path.join(labRoot, 'artifacts', 'devstral-local-gui.png'), fullPage: true });
  report.visibleText = (await page.locator('body').innerText()).slice(0, 7000);
  report.pass = true;
} catch (error) {
  report.failures.push(error.stack ?? String(error)); process.exitCode = 1;
  console.error(error.message);
  if (page) await page.screenshot({ path: path.join(labRoot, 'artifacts', 'devstral-local-gui-failure.png'), fullPage: true }).catch(() => {});
} finally {
  if (app) await app.close().then(() => { report.appClosed = true; }).catch(error => { report.failures.push(error.message); process.exitCode = 1; });
  if (backend) await backend.stop().then(() => { report.backendClosed = true; }).catch(error => { report.failures.push(error.message); process.exitCode = 1; });
  report.pass = report.pass === true && report.failures.length === 0 && report.appClosed && report.backendClosed;
  save(); console.log(JSON.stringify({ pass: report.pass, checks: report.checks, failures: report.failures }));
}
