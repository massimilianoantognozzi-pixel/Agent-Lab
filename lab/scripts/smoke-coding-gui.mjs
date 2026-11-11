import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { prepare, repoRoot, labRoot, workspaceRoot } from './prepare.mjs';
import { configureCodingGui, codingModelEnvironment } from './configure-coding-gui.mjs';
import { startLocalBackend } from './managed-local-backend.mjs';

const require = createRequire(path.join(repoRoot, 'package.json'));
const { _electron } = require('playwright');
prepare(); configureCodingGui();
const directory = path.join(workspaceRoot, 'studio-lume-demo'); fs.mkdirSync(directory, { recursive: true });
const resuming = process.argv.includes('--resume');
const previous = resuming ? JSON.parse(fs.readFileSync(path.join(labRoot, 'work', 'coding-gui-proof.json'), 'utf8')) : null;
if (previous) fs.writeFileSync(path.join(labRoot, 'work', 'coding-gui-first-attempt.json'), JSON.stringify(previous, null, 2));
const report = { startedAt: new Date().toISOString(), directory, phases: [], ...(previous ?? {}), resumedAt: resuming ? new Date().toISOString() : undefined, previousErrors: previous?.errors, errors: [], pageErrors: [] };
const save = () => fs.writeFileSync(path.join(labRoot, 'work', 'coding-gui-proof.json'), JSON.stringify(report, null, 2));
let backend; let app; let page;
const wait = async (predicate, timeout = 900000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) { const value = await predicate(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 500)); }
  throw new Error('Prova GUI oltre il tempo previsto.');
};
try {
  backend = await startLocalBackend();
  app = await _electron.launch({ executablePath: require('electron'), args: [repoRoot], cwd: repoRoot, env: codingModelEnvironment(), timeout: 45000 });
  for (const stream of [app.process().stdout, app.process().stderr]) stream.on('data', chunk => fs.appendFileSync(path.join(labRoot, 'work', 'coding-electron.log'), chunk));
  page = await wait(async () => { for (const window of app.windows()) if (await window.evaluate(() => Boolean(window.api)).catch(() => false)) return window; }, 45000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  report.task = await page.evaluate(async ({dir, existingId}) => {
    await window.api.addOpenProject(dir);
    const task = existingId ? (await window.api.getTasks(dir)).find(task => task.id === existingId) : await window.api.createNewTask(dir, { name: 'Studio Lume - prova completa', activate: true }); await window.api.loadTask(dir, task.id);
    window.__codingProof = { completions: [], logs: [], questions: [] };
    window.api.addResponseCompletedListener(dir, task.id, value => window.__codingProof.completions.push(value));
    window.api.addLogListener(dir, task.id, value => window.__codingProof.logs.push(value));
    return task;
  }, {dir: directory, existingId: process.argv.includes('--fresh-resume') ? undefined : previous?.task.id}); save();
  const ask = async prompt => {
    const before = await page.evaluate(() => window.__codingProof.completions.length); const started = Date.now();
    await page.evaluate(({ dir, id, prompt }) => window.api.runPrompt(dir, id, prompt, 'agent'), { dir: directory, id: report.task.id, prompt });
    const phase = await wait(() => page.evaluate(async ({ dir, id, before, started }) => {
      const state = await window.api.loadTask(dir, id);
      if (state.question) {
        const question = JSON.stringify(state.question);
        if (/lab---project_prepare|skills---activate_skill/.test(question)) { window.__codingProof.questions.push(state.question); window.api.answerQuestion(dir, id, 'y'); }
        else throw new Error('Approvazione non prevista: ' + question);
      }
      const task = (await window.api.getTasks(dir)).find(task => task.id === id);
      if (task?.state !== 'IN_PROGRESS' && window.__codingProof.completions.length > before) return { elapsedMs: Date.now() - started, state: task?.state, completions: window.__codingProof.completions.slice(before), messages: state.messages };
      const errors = window.__codingProof.logs.filter(log => log.level === 'error'); if (errors.length) throw new Error(errors.map(log => log.message).join('\n'));
      return null;
    }, { dir: directory, id: report.task.id, before, started }));
    report.phases.push(phase); save(); return phase;
  };
  if (!resuming) await ask(`Realizza davvero una landing completa per Studio Lume, studio web fittizio: hero, servizi, processo, preventivatore interattivo e contatti chiaramente dimostrativi. HTML/CSS/JS vanilla, nessuna risorsa esterna, stile editoriale crema/antracite/arancio scuro, responsive, semantico e accessibile. Non inventare clienti o testimonianze. Il preventivatore ha input numerico #pagine (da 1 a 10, predefinito 3), checkbox #seo, pulsante #calcola e output #totale. Formula 300 + pagine*120 +180 se SEO. Inserendo 2 pagine senza SEO visualizza 540, con SEO 720. Input vuoto o fuori intervallo: #errore visibile e niente prezzo NaN. Non si inviano dati o form. Includi queste prove nel piano: fill #pagine 2, click #calcola, text #totale 540, click #seo, click #calcola, text #totale 720. Crea file compatti, controlla, correggi gli errori e termina con KB, anteprima ed export. Questo e un progetto sintetico autorizzato per verificare l agente.`);
  const manifest = fs.readdirSync(directory).filter(name => !name.startsWith('.'));
  if (!['index.html', 'styles.css', 'app.js'].every(name => manifest.includes(name))) throw new Error('File principali non creati dal modello.');
  report.sourceBefore = Object.fromEntries(manifest.filter(name => fs.statSync(path.join(directory, name)).isFile()).map(name => [name, fs.readFileSync(path.join(directory, name), 'utf8')])); save();
  await ask('Riprendi il progetto vanilla esistente. Prima leggi app.js e index.html. Correggi precisamente questo bug: parseInt trasforma 2.5 in 2, quindi Number.isInteger(pages) risulta sempre vero. Usa Number sul valore originale e verifica intero e intervallo 1-10, compreso vuoto. Mantieni la formula 300 + pagine*120 +180 se SEO. Mantieni checkbox SEO anche premendo Invio. Aggiorna il piano con project_prepare e queste prove in ordine: fill #pagine 2, click #calcola, text #totale 540; click #seo, click #calcola, text #totale 720; click #seo per disattivarlo; fill #pagine 2, press #pagine Enter, text #totale 540; fill #pagine 2.5, click #calcola, text #errore intero; ripeti per vuoto, 0,11 con errore. Il sito deve dichiarare Progetto dimostrativo e avere solo contatti fittizi: email demo@studiolume.example, telefono non attivo, nessuna sede reale. Elimina contatti dal dominio .it. Usa modifiche esatte dal file letto; se una ricerca non corrisponde, scrivi il file completo corretto con file_write. Non cambiare CSS. Verifica, correggi, genera KB, anteprima ed export. Devi scrivere davvero i file, non fornire soltanto indicazioni.');
  report.events = await page.evaluate(() => window.__codingProof);
  await page.screenshot({ path: path.join(labRoot, 'artifacts', 'agent-freelance-gui.png') });
  report.pass = report.pageErrors.length === 0 && (resuming ? report.events.completions.length >= 1 : report.events.completions.length >= 2);
} catch (error) { report.errors.push(error.stack ?? String(error)); report.pass = false; }
finally {
  if (app) { await app.close().then(() => { report.appClosed = true; }).catch(error => report.errors.push(String(error))); }
  if (backend) { await backend.stop().then(() => { report.backendClosed = true; }).catch(error => report.errors.push(String(error))); }
  save(); console.log(JSON.stringify({ pass: report.pass, errors: report.errors, phases: report.phases.map(phase => ({ elapsedMs: phase.elapsedMs, state: phase.state })) }));
}
if (!report.pass) process.exitCode = 1;
