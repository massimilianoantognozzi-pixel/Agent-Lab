import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { _electron } from '@playwright/test';
import { prepareWorkflowPilot } from './launch-workflow-pilot.mjs';
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Questa prova richiede il desktop Windows x64.');
const repo = process.cwd(),
  benchRoot = path.resolve('lab/work/computer-use-desktop');
const target = path.resolve(process.argv[2] ?? 'out/main/index.js');
const packaged = path.extname(target).toLowerCase() === '.exe';
await fs.mkdir(benchRoot, { recursive: true });
const runDirectory = await fs.mkdtemp(path.join(benchRoot, 'desktop-')),
  { data, project, env } = await prepareWorkflowPilot(runDirectory);
const home = path.join(runDirectory, 'home'),
  osHome = path.join(runDirectory, 'os-home');
for (const d of [project, osHome, path.join(osHome, 'AppData/Local'), path.join(osHome, 'AppData/Roaming'), path.join(runDirectory, 'tmp')])
  await fs.mkdir(d, { recursive: true });
const id = 'cua-fixture',
  model = 'cua-qualification',
  value = 'prova-' + randomUUID();
let receivedValue = '',
  stepIndex = 0,
  observed = false;
const calls = [],
  dialogs = [];
// The local model drives the real tool loop using only handles returned by Agent-Lab.
const browserTool = 'computer---browser';
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const testSite = http.createServer((request, reply) => {
  if (request.url.startsWith('/done?')) {
    receivedValue = new URL(request.url, 'http://localhost').searchParams.get('v');
    reply.end('salvato');
    return;
  }
  reply.setHeader('Content-Type', 'text/html');
  reply.end(
    '<title>Agent-Lab test</title><label>Messaggio<input></label><button>Salva</button><output></output><script>document.querySelector("button").onclick=async()=>{await fetch("/done?v="+encodeURIComponent(document.querySelector("input").value));document.querySelector("output").textContent="Valore registrato"}</script>',
  );
});
await listen(testSite);
const modelServer = http.createServer(async (request, reply) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
    let response;
    if (request.url === '/api/tags') response = { models: [{ name: model, model, details: { family: 'test' } }] };
    else if (request.url === '/api/show') response = { capabilities: ['completion', 'tools'] };
    else if (request.url === '/api/version') response = { version: '0.40.17' };
    else if (request.url === '/api/chat') {
      const tools = body.tools?.map((t) => t.function.name) ?? [];
      let message = { role: 'assistant', content: 'Prova conclusa.' };
      if (tools.includes(browserTool) && stepIndex < 8) {
        const last = body.messages.filter((m) => m.role === 'tool').at(-1);
        let found;
        if ([4, 6].includes(stepIndex)) {
          const report = last?.content ?? '';
          const items = JSON.parse(report).controls;
          found = items.find((c) => c.role === (stepIndex === 4 ? 'textbox' : 'button')).ref;
        }
        const steps = [
          { action: 'open' },
          { action: 'observe' },
          { action: 'navigate', url: 'http://127.0.0.1:' + testSite.address().port },
          { action: 'observe' },
          { action: 'type', ref: found, text: value },
          { action: 'observe' },
          { action: 'click', ref: found },
          { action: 'observe' },
        ];

        const actionRequest = steps[stepIndex++];
        message = { role: 'assistant', content: '', tool_calls: [{ function: { name: browserTool, arguments: { request: actionRequest } } }] };
        calls.push(actionRequest.action);
      } else if (tools.includes(browserTool) && stepIndex === 8) {
        const last = body.messages.filter((m) => m.role === 'tool').at(-1);
        observed = String(last?.content).includes('Valore registrato');
      }
      response = {
        model,
        created_at: new Date().toISOString(),
        message,
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 10,
        eval_count: 5,
      };
    } else response = {};
    reply.setHeader('Content-Type', 'application/json');
    reply.end(JSON.stringify(response));
  } catch (e) {
    console.error('Risposta del banco:', e.message);
    reply.writeHead(500);
    reply.end(JSON.stringify({ error: e.message }));
  }
});
await listen(modelServer);
const config = JSON.parse(await fs.readFile(path.join(data, 'config.json'), 'utf8'));
config.providers = [{ id, name: id, provider: { name: 'ollama', baseUrl: 'http://127.0.0.1:' + modelServer.address().port } }];
config.openProjects = [{ active: true, baseDir: project, settings: { currentMode: 'agent', agentProfileId: id, modelEditFormats: {} } }];
config.settings.startupMode = 'empty';
const write = (file, content) => fs.writeFile(file, JSON.stringify(content, null, 2));
await write(path.join(data, 'config.json'), config);
await fs.writeFile(path.join(data, 'setup-complete'), 'fixture');
await write(path.join(data, 'models.json'), {
  version: 1,
  models: [
    {
      id: model,
      providerId: id,
      isCustom: true,
      supportsTools: true,
      maxInputTokens: 32768,
      maxOutputTokens: 2048,
      inputCostPerToken: 0,
      outputCostPerToken: 0,
      providerOverrides: { disableStreaming: true },
    },
  ],
});
const profileDir = path.join(home, 'agents', id);
await fs.mkdir(profileDir, { recursive: true });
await write(path.join(profileDir, 'config.json'), {
  id,
  name: id,
  model,
  provider: id,
  usePowerTools: false,
  useAiderTools: false,
  useTaskTools: false,
  useMemoryTools: false,
  useSkillsTools: false,
  useTodoTools: false,
  useExtensionTools: false,
  useSubagents: false,
  includeContextFiles: false,
  includeRepoMap: false,
  enabledServers: [],
  maxIterations: 15,
});
const socket = http.createServer();
await listen(socket);
const port = socket.address().port;
await new Promise((ok) => socket.close(ok));
Object.assign(env, {
  AIDER_DESK_LOOPBACK_ONLY: 'true',
  AIDER_DESK_PORT: String(port),
  AIDER_DESK_GENERAL_MODE: 'false',
  LOG_LEVEL: 'debug',
  AIDER_DESK_HEADLESS: '',
  AIDER_DESK_NO_UPDATES: 'true',
  HOME: osHome,
  USERPROFILE: osHome,
  TEMP: path.join(runDirectory, 'tmp'),
  TMP: path.join(runDirectory, 'tmp'),
  APPDATA: path.join(osHome, 'AppData/Roaming'),
  LOCALAPPDATA: path.join(osHome, 'AppData/Local'),
  UV_OFFLINE: 'true',
  PIP_NO_INDEX: '1',
});
delete env.AIDER_DESK_WORKFLOW_CONFIG;
let app;
try {
  app = await _electron.launch({
    executablePath: packaged ? target : createRequire(import.meta.url)('electron'),
    args: [...(packaged ? [] : [target]), '--disable-background-networking'],
    env,
    cwd: repo,
    timeout: 60000,
  });
  await app.evaluate(({ dialog }) => {
    globalThis.cuaDialogEvents = [];
    dialog.showMessageBox = async (...args) => {
      const options = args.at(-1);
      const ok = options.message === 'Aprire un browser isolato per questo incarico?' && options.detail.includes('cua-qualification');
      globalThis.cuaDialogEvents.push({ allowed: ok });
      return { response: ok ? 1 : 0, checkboxChecked: false };
    };
  });
  let renderer;
  for (let i = 0; i < 160 && !renderer; i++) {
    for (const page of app.windows()) {
      if (
        await page
          .evaluate(
            async (id) => window.api?.getAllAgentProfiles && (await window.api.getAllAgentProfiles()).some((x) => x.id === id),
            id,
          )
          .catch(() => false)
      ) {
        renderer = page;
        break;
      }
    }
    if (!renderer) await wait(400);
  }
  assert.ok(renderer);
  const task = await renderer.evaluate(
    async ({ project, id, model }) => {
      await window.api.startProject(project);
      const t = await window.api.createNewTask(project, {
        name: 'Qualifica Computer Use',
        provider: id,
        model,
        agentProfileId: id,
        mode: 'agent',
        workingMode: 'local',
        activate: true,
        sendEvent: true,
        addInitialContextFiles: false,
        autonomyMode: 'autonomous',
      });
      await window.api.loadTask(project, t.id);
      return t.id;
    },
    { project, id, model },
  );
  await renderer.evaluate(
    ({ project, task }) => {
      void window.api.runPrompt(project, task, 'Usa il browser privato per la prova della scheda locale.', 'agent');
    },
    { project, task },
  );
  for (let i = 0; i < 260 && (receivedValue !== value || !observed); i++) await wait(350);
  dialogs.push(...(await app.evaluate(() => globalThis.cuaDialogEvents)));
  await write(path.join(runDirectory, 'receipt.json'), {
    passed: receivedValue === value && observed,
    steps: calls,
    dialogs,
    observed,
    model: 'simulato su loopback',
  });
  assert.equal(receivedValue, value);
  assert.deepEqual(dialogs, [{ allowed: true }]);
  const logDir = path.join(data, 'logs');
  for (const entry of await fs.readdir(logDir)) {
    if (entry.endsWith('.log')) {
      assert.ok(!(await fs.readFile(path.join(logDir, entry), 'utf8')).includes(value), 'Valore del modulo duplicato nel log ' + entry);
    }
  }
  assert.ok(observed, 'Il modello deve ricevere la conferma visibile nella pagina');
  console.log('ELECTRON UI PASS', path.join(runDirectory, 'receipt.json'));
} finally {
  await app?.close();
  for (const server of [testSite, modelServer]) {
    server.closeAllConnections();
    server.close();
  }
}
