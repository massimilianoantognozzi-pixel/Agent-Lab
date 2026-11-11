import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { prepare, laboratoryEnvironment, repoRoot, labRoot, sampleDir, dataDir } from './prepare.mjs';

const require = createRequire(path.join(repoRoot, 'package.json'));
const { _electron } = require('playwright');
prepare();
fs.mkdirSync(path.join(labRoot, 'artifacts'), { recursive: true });
const report = { startedAt: new Date().toISOString(), failures: [], pageErrors: [] };
let app;
try {
  app = await _electron.launch({ executablePath: require('electron'), args: [repoRoot], cwd: repoRoot, env: laboratoryEnvironment(), timeout: 45000 });
  app.process().stdout.on('data', chunk => fs.appendFileSync(path.join(labRoot, 'work', 'electron-runtime.log'), chunk));
  app.process().stderr.on('data', chunk => fs.appendFileSync(path.join(labRoot, 'work', 'electron-runtime.log'), chunk));
  let page;
  const until = Date.now() + 45000;
  while (Date.now() < until) {
    for (const window of app.windows()) {
      if (await window.evaluate(() => Boolean(window.api)).catch(() => false)) { page = window; break; }
    }
    if (page) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!page) throw new Error('Main window API was not ready');
  page.on('pageerror', error => report.pageErrors.push(error.message));
  report.runtime = await app.evaluate(({ app }) => ({ userData: app.getPath('userData'), electron: process.versions.electron, node: process.versions.node, env: { lab: process.env.AIDER_DESK_LAB_MODE, serena: process.env.SERENA_HOME }, pid: process.pid }));
  if (path.resolve(report.runtime.userData) !== path.resolve(dataDir)) throw new Error('userData isolation mismatch');
  report.opened = await page.evaluate(async dir => {
    await window.api.addOpenProject(dir);
    const tasks = await window.api.getTasks(dir);
    const task = tasks[0] ?? await window.api.createNewTask(dir, { name: 'Verifica laboratorio', activate: true });
    const state = await window.api.loadTask(dir, task.id);
    if (!state.messages.some(message => JSON.stringify(message).includes('Bozza sintetica per verificare la ripresa.'))) {
      await window.api.savePrompt(dir, task.id, 'Bozza sintetica per verificare la ripresa.');
    }
    const skills = await window.api.getSkills(dir, task.id);
    const imported = skills.find(skill => skill.location === 'global');
    const skillActivation = imported ? await window.api.activateSkill(dir, task.id, imported.name) : false;
    if (imported) await window.api.deactivateSkill(dir, task.id, imported.name);
    return { restoredTask: tasks.length > 0, restoredDraft: state.messages.some(message => JSON.stringify(message).includes('Bozza sintetica per verificare la ripresa.')), task, state, skillActivation, projects: await window.api.getOpenProjects(), skills, mcp: await window.api.getMcpServers(), mcpTools: await window.api.loadMcpServerTools('serena') };
  }, sampleDir);
  await page.getByText('Loading task...', { exact: true }).waitFor({ state: 'hidden', timeout: 30000 });
  report.boundaries = await page.evaluate(async ({ dir, taskId, outside }) => {
    const denied = {};
    for (const [name, operation] of Object.entries({
      readOutside: () => window.api.readFile(dir, taskId, outside),
      writeOutside: () => window.api.saveFile(dir, taskId, outside, 'DENIED'),
      openOutside: () => window.api.addOpenProject(outside),
      mcpMutation: () => window.api.replaceMcpServers({}, outside),
      clone: () => window.api.cloneProject('https://example.invalid/synthetic', outside),
      profile: () => window.api.createAgentProfile({ id: 'invalid-synthetic', projectDir: outside }),
    })) {
      try { await operation(); denied[name] = false; } catch (error) { denied[name] = String(error).includes('Agent Lab:'); }
    }
    return denied;
  }, { dir: sampleDir, taskId: report.opened.task.id, outside: path.join(labRoot, 'work', 'outside-api-canary.txt') });
  if (Object.values(report.boundaries).some(denied => !denied)) throw new Error('An IPC boundary check failed');
  report.terminal = await page.evaluate(async ({ dir, taskId }) => {
    const id = await window.api.createTerminal(dir, taskId, 80, 24);
    try {
      await window.api.writeToTerminal(id, "Write-Output ('LAB_ELECTRON_' + 'PTY_OK')\r");
      const until = Date.now() + 10000;
      while (Date.now() < until) {
        const buffer = await window.api.getTerminalBuffer(id);
        if (buffer.data.includes('LAB_ELECTRON_PTY_OK')) return { pass: true, id };
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return { pass: false, id };
    } finally { await window.api.closeTerminal(id); }
  }, { dir: sampleDir, taskId: report.opened.task.id });
  if (!report.terminal.pass) throw new Error('Electron PTY test failed');
  const processReport = await app.evaluate(() => process.report.getReport());
  report.listeners = processReport.libuv.filter(handle => handle.type === 'tcp' && handle.is_active).map(handle => handle.localEndpoint);
  report.loopbackOnly = report.listeners.every(endpoint => !endpoint || ['127.0.0.1', '::1'].includes(endpoint.ip4 ?? endpoint.ip6));
  if (!report.loopbackOnly) throw new Error('Unexpected non-loopback listener');
  await page.screenshot({ path: path.join(labRoot, 'artifacts', 'checkpoint-app.png'), fullPage: true });
  report.windowTitle = await page.title();
  report.visibleText = (await page.locator('body').innerText()).slice(0, 3500);
  fs.writeFileSync(path.join(labRoot, 'work', 'electron-smoke.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ title: report.windowTitle, runtime: report.runtime, task: report.opened.task, skills: report.opened.skills?.length, mcp: report.opened.mcp, pageErrors: report.pageErrors }, null, 2));
} catch (error) {
  report.failures.push(error.stack ?? String(error));
  fs.writeFileSync(path.join(labRoot, 'work', 'electron-smoke.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  if (app) await app.close();
}
