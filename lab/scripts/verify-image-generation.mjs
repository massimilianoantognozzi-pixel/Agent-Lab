import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { _electron, chromium } from '@playwright/test';
import { prepareWorkflowPilot } from './launch-workflow-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mainEntry = path.resolve(process.argv[2] ?? path.join(root, 'out/main/index.js'));
if (process.platform !== 'win32' || process.arch !== 'x64' || path.extname(mainEntry) !== '.js') {
  throw new Error('Il banco usa il main compilato da sorgente di Electron su Windows x64.');
}
await fs.access(mainEntry);
const width = 1536,
  height = 1024;
const asset = 'assets/fondale.png',
  edited = 'assets/fondale-sera.png';
const generate = 'images---generate',
  result = 'images---result',
  delegate = 'subagents---run_task';
const model = 'gpt-image-2.6-sunburst',
  coder = 'modello-coding-sintetico',
  designerModel = 'modello-designer-sintetico';
const dayPrompt = 'Crea il fondale retro diurno della scena di prova.';
const nightPrompt = 'Trasforma il fondale di prova in una scena serale, conservando le montagne.';
const fixtureKey = 'prova-locale-' + randomUUID();
const role = JSON.parse(await fs.readFile(path.join(root, 'src/main/task/workflow-roles.json'), 'utf8')).designer;
const roleName = role.name.toLowerCase().replace(/\s+/g, '-');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const save = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
const bench = path.join(root, 'lab/work/immagini-e2e');
await fs.mkdir(bench, { recursive: true });
const run = await fs.mkdtemp(path.join(bench, 'turno-'));
const { data, project, env } = await prepareWorkflowPilot(run);
const osHome = path.join(run, 'os-home');
for (const dir of [
  osHome,
  path.join(run, 'tmp'),
  path.join(osHome, 'AppData/Local'),
  path.join(osHome, 'AppData/Roaming'),
  path.join(project, 'assets'),
]) {
  await fs.mkdir(dir, { recursive: true });
}

const scene = `<!doctype html><meta charset="utf-8"><title>Scena del collaudo locale</title>
<style>*{margin:0}canvas{display:block;image-rendering:pixelated}</style>
<canvas width="1536" height="1024"></canvas><script>
const c=document.querySelector('canvas'), ctx=c.getContext('2d'), bg=new Image(); let x=80;
function draw(){ctx.drawImage(bg,0,0); ctx.fillStyle='#ffe76f';ctx.fillRect(x,848,32,48);c.dataset.player=String(x);}
addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();x+=16;draw()}});
bg.onload=()=>{if(bg.naturalWidth!==c.width||bg.naturalHeight!==c.height)throw Error('Dimensioni del fondale');draw();c.dataset.ready='true'};
bg.src=new URLSearchParams(location.search).get('time')==='day'?'assets/fondale.png':'assets/fondale-sera.png'</script>`;
await fs.writeFile(path.join(project, 'index.html'), scene);
const localGit = (args) =>
  execFileSync(
    'git',
    ['-C', project, '-c', 'user.name=Agent-Lab test', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', ...args],
    { env: { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(run, 'empty-gitconfig') }, stdio: 'ignore', windowsHide: true },
  );
await fs.writeFile(path.join(run, 'empty-gitconfig'), '');
localGit(['init', '--initial-branch=fixture']);
localGit(['add', 'index.html']);
localGit(['commit', '-m', 'Scena sintetica']);
const listen = (server) => new Promise((yes, no) => server.once('error', no).listen(0, '127.0.0.1', yes));
const origin = (server) => 'http://127.0.0.1:' + server.address().port;
const servers = [];
const pendingCreate = Promise.withResolvers();
const graphicPosts = [],
  toolCalls = [],
  serverErrors = [];
let stage = 'create',
  generated = false,
  delegated = false,
  editing = false,
  waitRequests = 0,
  jobId,
  originalJobId;
let checkIndex = 0,
  checksFinished = false;
const denials = [
  { prompt: dayPrompt, output: asset },
  { prompt: 'Una seconda immagine nello stesso file.', output: asset },
  { prompt: 'Modifica un riferimento esterno alla cartella.', output: 'assets/riferimento-esterno.png', references: ['../privata.png'] },
  { prompt: 'Questo costo non è approvato.', output: 'assets/annullata.png' },
];
let draftContinued = false,
  parentFinished = false,
  electronApp,
  browser;

async function until(predicate, explanation, ms = 45000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (serverErrors.length) throw Error(serverErrors.join('\n'));
    if (await predicate()) return;
    await sleep(180);
  }
  throw Error(explanation);
}
function fixtures() {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 1024;
  const paint = (night) => {
    const small = document.createElement('canvas');
    small.width = 384;
    small.height = 256;
    const g = small.getContext('2d');
    g.fillStyle = night ? '#21193e' : '#76b4d1';
    g.fillRect(0, 0, 384, 256);
    g.fillStyle = night ? '#f9de94' : '#fff1ae';
    g.fillRect(290, 30, 22, 22);
    g.fillRect(294, 26, 14, 30);
    if (night) {
      g.fillStyle = '#e7d6be';
      for (let i = 0; i < 36; i++) g.fillRect((i * 109 + 17) % 380, (i * 43 + 13) % 96, 2, 2);
    }
    for (let x = 0; x < 384; x += 4) {
      let y = 129 - Math.round(24 * Math.sin(x / 25) + 13 * Math.cos(x / 10));
      g.fillStyle = night ? '#504a73' : '#5e8193';
      g.fillRect(x, y, 4, 256 - y);
    }
    for (let x = 0; x < 384; x += 8) {
      let y = 166 - Math.round(12 * Math.sin(x / 20) + 9 * Math.cos(x / 9));
      g.fillStyle = night ? '#2e3759' : '#417d73';
      g.fillRect(x, y, 8, 256 - y);
    }
    g.fillStyle = night ? '#343d46' : '#66583d';
    g.fillRect(0, 224, 384, 32);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  };
  return { day: paint(false), night: paint(true) };
}
function extractJob(messages) {
  const last = messages.filter((m) => m.role === 'tool').at(-1);
  if (!last) return undefined;
  const keys = (value) => {
    if (!value || typeof value !== 'object') return undefined;
    if (typeof value.jobId === 'string') return value.jobId;
    for (const v of Object.values(value)) {
      if (typeof v === 'string') {
        try {
          const found = keys(JSON.parse(v));
          if (found) return found;
        } catch {}
      } else {
        const found = keys(v);
        if (found) return found;
      }
    }
  };
  try {
    const id = keys(JSON.parse(last.content));
    if (id) return id;
  } catch {}
  return String(last.content).match(/\b[0-9a-f]{8}-[0-9a-f-]{27,36}\b/i)?.[0];
}

try {
  browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],
  });
  const game = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const generatedFiles = await game.evaluate(fixtures);
  const day = Buffer.from(generatedFiles.day, 'base64'),
    night = Buffer.from(generatedFiles.night, 'base64');
  assert.notEqual(sha(day), sha(night));
  await fs.writeFile(path.join(run, 'privata.png'), day);

  const graphics = http.createServer(async (req, res) => {
    try {
      assert.equal(req.method, 'POST');
      assert.equal(req.headers.authorization, 'Bearer ' + fixtureKey);
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      let output;
      if (req.url === '/v1/images/generations') {
        const body = JSON.parse(bytes);
        assert.equal(body.model, model);
        assert.equal(body.quality, 'low');
        assert.equal(body.size, width + 'x' + height);
        assert.equal(body.n ?? 1, 1);
        assert.equal(body.prompt, dayPrompt);
        graphicPosts.push({ operation: 'create', sha: sha(day) });
        output = day;
        await Promise.race([
          pendingCreate.promise,
          sleep(15000, undefined, { ref: false }).then(() => {
            throw Error('Il modello è rimasto bloccato sulla generazione.');
          }),
        ]);
      } else {
        assert.equal(req.url, '/v1/images/edits');
        const form = await new Response(bytes, { headers: { 'content-type': req.headers['content-type'] } }).formData();
        assert.equal(form.get('model'), model);
        assert.equal(form.get('quality'), 'low');
        assert.equal(form.get('size'), width + 'x' + height);
        assert.equal(form.get('prompt'), nightPrompt);
        const sources = [...form.getAll('image'), ...form.getAll('image[]')];
        assert.equal(sources.length, 1);
        const input = Buffer.from(await sources[0].arrayBuffer());
        assert.equal(sha(input), sha(day));
        graphicPosts.push({ operation: 'edit', source: sha(input), sha: sha(night) });
        output = night;
      }
      const inputImages = req.url === '/v1/images/edits' ? 40 : 0;
      res.setHeader('content-type', 'application/json');
      res.setHeader('x-request-id', inputImages ? 'req_fixture_edit' : 'req_fixture_create');
      res.end(
        JSON.stringify({
          created: 1730000000,
          data: [{ b64_json: output.toString('base64') }],
          usage: {
            total_tokens: 710 + inputImages,
            input_tokens: 70 + inputImages,
            output_tokens: 640,
            input_tokens_details: { text_tokens: 70, image_tokens: inputImages },
          },
        }),
      );
    } catch (e) {
      serverErrors.push('Images fixture: ' + e.message);
      res.writeHead(400);
      res.end('{"error":{"message":"fixture mismatch"}}');
    }
  });
  servers.push(graphics);
  await listen(graphics);

  const local = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const input = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
      let output = {};
      if (req.url === '/api/tags') output = { models: [coder, designerModel].map((name) => ({ name, details: { context_length: 32768 } })) };
      if (req.url === '/api/show') output = { capabilities: ['completion', 'tools', 'vision'] };
      if (req.url === '/api/version') output = { version: '0.40.17' };
      if (req.url === '/api/chat') {
        await fs.appendFile(
          path.join(run, 'wire-summary.jsonl'),
          JSON.stringify({ model: input.model, stage, tools: input.tools?.map((t) => t.function.name) ?? [], messages: input.messages.length }) +
            '\n',
        );
        const tools = input.tools?.map((t) => t.function.name) ?? [];
        let message = { role: 'assistant', content: 'Prova locale completata.' };
        const action = (name, args) => {
          assert(tools.includes(name), 'Tool assente: ' + name + ' in ' + input.model);
          toolCalls.push({ role: input.model, name });
          return { role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] };
        };
        if (input.model === coder && tools.includes(generate) && stage === 'create') {
          if (!generated) {
            generated = true;
            message = action(generate, { prompt: dayPrompt, output: asset });
          } else {
            originalJobId ??= extractJob(input.messages);
            assert(originalJobId, 'Job ID del primo turno assente');
            draftContinued = true;
            pendingCreate.resolve();
            message.content = 'Il lavoro grafico è stato avviato; attendo la consegna automatica.';
          }
        } else if (input.model === coder && tools.includes(delegate) && stage === 'edit') {
          if (!delegated) {
            delegated = true;
            message = action(delegate, {
              subagentId: roleName,
              prompt: 'Prepara esclusivamente la modifica serale richiesta del fondale sintetico.',
              description: 'Modifica del fondale serale',
            });
          } else {
            parentFinished = true;
            message.content = 'VARIANTE_SERALE_VERIFICATA';
          }
        } else if (input.model === designerModel && tools.length && stage === 'edit') {
          assert(tools.includes(generate), 'Il vero Designer non ha ricevuto gli strumenti immagine');
          assert(!tools.includes(delegate), 'Il profilo sintetico Designer non deve delegare');
          if (!editing) {
            editing = true;
            message = action(generate, { prompt: nightPrompt, output: edited, references: [asset] });
          } else if (waitRequests < 2) {
            jobId ??= extractJob(input.messages);
            assert(jobId, 'Job ID mancante nella risposta che ha ricevuto il Designer');
            waitRequests++;
            message = action(result, { jobId });
          } else {
            message.content = 'La variante del fondale è disponibile.';
          }
        } else if (input.model === coder && tools.includes(generate) && stage === 'checks') {
          if (checkIndex === 1) assert.equal(extractJob(input.messages), originalJobId, 'Il replay non restituisce la ricevuta originaria');
          if (checkIndex < denials.length) {
            message = action(generate, denials[checkIndex++]);
          } else {
            checksFinished = true;
            message.content = 'CONTROLLI_DI_CONSEGNA_CONCLUSI';
          }
        }
        output = {
          model: input.model,
          created_at: new Date().toISOString(),
          message,
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 10,
          eval_count: 5,
        };
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(output));
    } catch (e) {
      serverErrors.push('Coding fixture: ' + e.message);
      res.writeHead(500);
      res.end('{"error":"fixture mismatch"}');
    }
  });
  servers.push(local);
  await listen(local);
  const tmp = http.createServer();
  await listen(tmp);
  const appPort = tmp.address().port;
  await new Promise((y) => tmp.close(y));

  const projectImageProvider = 'images-synthetic';
  const configFile = path.join(data, 'config.json'),
    config = JSON.parse(await fs.readFile(configFile, 'utf8'));
  config.providers = [
    { id: 'coding-synthetic', provider: { name: 'ollama', baseUrl: origin(local) } },
    { id: projectImageProvider, provider: { name: 'openai', apiKey: fixtureKey } },
  ];
  config.openProjects = [
    { active: true, baseDir: project, settings: { currentMode: 'agent', agentProfileId: 'fixture-root', modelEditFormats: {} } },
  ];
  config.settings.imageGeneration = { providerId: projectImageProvider, model, quality: 'low', size: width + 'x' + height };
  config.settings.startupMode = 'empty';
  await save(configFile, config);
  await fs.writeFile(path.join(data, 'setup-complete'), 'fixture');
  await save(path.join(data, 'models.json'), {
    version: 1,
    models: [coder, designerModel].map((id) => ({
      id,
      providerId: 'coding-synthetic',
      isCustom: true,
      supportsTools: true,
      maxInputTokens: 32768,
      maxOutputTokens: 2048,
      inputCostPerToken: 0,
      outputCostPerToken: 0,
      providerOverrides: { disableStreaming: true },
    })),
  });
  const base = {
    provider: 'coding-synthetic',
    usePowerTools: false,
    useAiderTools: false,
    useTaskTools: false,
    useSkillsTools: false,
    useTodoTools: false,
    useMemoryTools: false,
    useExtensionTools: false,
    includeContextFiles: false,
    includeRepoMap: false,
    enabledServers: [],
    toolApprovals: {},
    maxIterations: 12,
  };
  for (const spec of [
    { ...base, id: 'fixture-root', name: 'Prova immagine', model: coder, useSubagents: true, enabledSubagentIds: [role.id] },
    {
      ...base,
      id: role.id,
      name: role.name,
      model: designerModel,
      useSubagents: false,
      subagent: { enabled: true, description: role.description, systemPrompt: role.instructions, invocationMode: 'on-demand' },
    },
  ]) {
    const dir = path.join(run, 'home', 'agents', spec.id);
    await fs.mkdir(dir, { recursive: true });
    await save(path.join(dir, 'config.json'), spec);
  }

  // This bootstrap runs before the real Electron main, including provider initialization. It is present only in this disposable app.
  const guardConfig = {
    model,
    fixtureKey,
    graphics: origin(graphics),
    dialogs: path.join(run, 'dialogs.jsonl'),
    project,
    outputs: [asset, edited],
    prompts: [dayPrompt, nightPrompt],
  };
  await save(path.join(run, 'guard.json'), guardConfig);
  await fs.writeFile(
    path.join(run, 'main.cjs'),
    `
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),tls=require('node:tls'),dns=require('node:dns');
const cfg=require('./guard.json');
const local=h=>!h||['127.0.0.1','localhost','::1','[::1]','::ffff:127.0.0.1'].includes(String(h));
const refuse=()=>{throw Error('Rete esterna esclusa dal banco immagini');};
const check=(a)=>{const q=Array.isArray(a[0])?a[0]:a;const h=typeof q[0]==='object'?q[0]?.host??q[0]?.hostname:typeof q[1]==='string'?q[1]:undefined;if(!local(h))refuse();};
const nc=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...a){check(a);return nc.apply(this,a);};
const tc=tls.connect;tls.connect=function(...a){check(a);return tc.apply(this,a);};
const lookup=dns.lookup;dns.lookup=function(host,...a){if(!local(host))return refuse();return lookup.call(this,host,...a);};
const original=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const request=new Request(input,init),url=new URL(request.url);
 if(url.origin==='https://api.openai.com'&&['/v1/images/generations','/v1/images/edits'].includes(url.pathname)){
   if(request.method!=='POST'||request.headers.get('authorization')!=='Bearer '+cfg.fixtureKey)refuse();
   return original(cfg.graphics+url.pathname,{method:'POST',headers:request.headers,body:await request.arrayBuffer(),signal:request.signal});
 }
 if(url.origin==='https://api.openai.com'&&url.pathname==='/v1/models'&&request.method==='GET')return Response.json({data:[]});
 if(url.hostname==='models.dev'&&url.pathname==='/api.json')return Response.json({});
 if(!local(url.hostname))return refuse();
 return original(request);
};
const {dialog}=require('electron');
dialog.showMessageBox=async(...parts)=>{
 const o=parts.at(-1),i=o.message==='Generare questa immagine?'?0:o.message==='Modificare questa immagine?'?1:-1;
 const exact=i>=0&&o.defaultId===0&&o.cancelId===0&&o.buttons.length===2&&o.detail.includes(cfg.model)&&o.detail.includes(cfg.outputs[i])&&o.detail.includes(cfg.prompts[i]);
 fs.appendFileSync(cfg.dialogs,JSON.stringify({message:o.message,authorized:exact,detail:typeof o.detail==='string'?o.detail.replaceAll(cfg.fixtureKey,'[omesso]'):null,buttons:o.buttons})+'\\n');
 return {response:exact?1:0,checkboxChecked:false};
};
require(${JSON.stringify(mainEntry)});`,
  );
  await save(path.join(run, 'package.json'), { name: 'agent-lab-image-fixture', version: '0.0.0', main: 'main.cjs' });
  Object.assign(env, {
    AIDER_DESK_LOOPBACK_ONLY: 'true',
    AIDER_DESK_PORT: String(appPort),
    AIDER_DESK_GENERAL_MODE: 'true',
    AIDER_DESK_LAB_MODE: 'false',
    AIDER_DESK_HEADLESS: '',
    AIDER_DESK_NO_UPDATES: 'true',
    HOME: osHome,
    USERPROFILE: osHome,
    TMP: path.join(run, 'tmp'),
    TEMP: path.join(run, 'tmp'),
    APPDATA: path.join(osHome, 'AppData/Roaming'),
    LOCALAPPDATA: path.join(osHome, 'AppData/Local'),
    UV_OFFLINE: 'true',
    PIP_NO_INDEX: '1',
    OTEL_SDK_DISABLED: 'true',
  });
  delete env.AIDER_DESK_WORKFLOW_CONFIG;
  delete env.AIDER_DESK_WORKFLOW_PILOT_DIR;
  const startDesktop = async () => {
    electronApp = await _electron.launch({
      executablePath: createRequire(import.meta.url)('electron'),
      args: [run, '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],
      cwd: root,
      env,
      timeout: 60000,
    });
    let renderer;
    await until(
      async () => {
        for (const p of electronApp.windows())
          if (
            await p
              .evaluate(async () => window.api?.getAllAgentProfiles && (await window.api.getAllAgentProfiles()).some((x) => x.id === 'fixture-root'))
              .catch(() => false)
          ) {
            renderer = p;
            return true;
          }
        return false;
      },
      'Renderer non pronto',
      65000,
    );
    return renderer;
  };
  let renderer = await startDesktop();
  const task = await renderer.evaluate(
    async ({ project, coder }) => {
      await window.api.startProject(project);
      const t = await window.api.createNewTask(project, {
        name: 'Fondale di prova',
        provider: 'coding-synthetic',
        model: coder,
        agentProfileId: 'fixture-root',
        mode: 'agent',
        workingMode: 'local',
        activate: true,
        sendEvent: true,
        addInitialContextFiles: false,
        autonomyMode: 'autonomous',
      });
      await window.api.loadTask(project, t.id);
      window.imageFixtureEvents = [];
      window.api.addToolListener(project, t.id, (e) => {
        if (e.serverName === 'images' && e.response) {
          let receipt;
          try {
            const raw = JSON.parse(e.response);
            const text = raw.content?.find((p) => p.type === 'text')?.text;
            if (text) receipt = JSON.parse(text);
          } catch {}
          window.imageFixtureEvents.push({ name: e.toolName, hasImage: e.response.includes('image/png'), size: e.response.length, receipt });
        }
      });
      return t.id;
    },
    { project, coder },
  );
  const send = (prompt) =>
    renderer.evaluate(({ project, task, prompt }) => window.api.runPrompt(project, task, prompt, 'agent'), { project, task, prompt });
  const saved = async (file, expected) => {
    try {
      return sha(await fs.readFile(path.join(project, file))) === sha(expected);
    } catch {
      return false;
    }
  };
  await send(dayPrompt + ' Salva il PNG in ' + asset + '.');
  await until(() => saved(asset, day), 'Il file del primo turno non è stato consegnato', 60000);
  await until(() => renderer.evaluate(() => window.imageFixtureEvents.some((e) => e.hasImage)), 'Preview di completamento assente dal flusso eventi');
  assert(draftContinued);
  await until(
    async () =>
      JSON.stringify(await renderer.evaluate(async ({ project, task }) => window.api.loadTask(project, task), { project, task })).includes(
        'Il lavoro grafico è stato avviato',
      ),
    'Il primo turno non è registrato',
  );
  stage = 'edit';
  await send('Chiedi al Designer UI/UX di preparare la variante serale usando ' + asset + ' come unico riferimento e di salvare ' + edited + '.');
  await until(() => saved(edited, night), 'Il Designer non ha consegnato il file modificato', 65000);
  await until(() => parentFinished, 'Il Designer non ha restituito il risultato al turno principale');
  assert.equal(waitRequests, 2);
  assert.deepEqual(
    graphicPosts.map((x) => x.operation),
    ['create', 'edit'],
  );
  assert(await saved(asset, day));
  assert(await saved(edited, night));
  await until(
    async () =>
      JSON.stringify(await renderer.evaluate(async ({ project, task }) => window.api.loadTask(project, task), { project, task })).includes(
        'VARIANTE_SERALE_VERIFICATA',
      ),
    'Turno padre non ancora salvato',
  );
  stage = 'checks';
  await send('Verifica la ricevuta precedente, gli output protetti, il riferimento fuori scope e il rifiuto esplicito.');
  await until(() => checksFinished, 'Il turno dei controlli non ha terminato');
  await until(
    async () =>
      JSON.stringify(await renderer.evaluate(async ({ project, task }) => window.api.loadTask(project, task), { project, task })).includes(
        'CONTROLLI_DI_CONSEGNA_CONCLUSI',
      ),
    'Il turno dei dinieghi deve terminare',
  );
  assert.equal(graphicPosts.length, 2);
  assert(await saved(asset, day));
  assert(await saved(edited, night));
  assert.equal(sha(await fs.readFile(path.join(run, 'privata.png'))), sha(day));
  for (const absent of ['assets/riferimento-esterno.png', 'assets/annullata.png']) {
    await assert.rejects(fs.access(path.join(project, absent)), { code: 'ENOENT' });
  }
  const dialogs = (await fs.readFile(path.join(run, 'dialogs.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((s) => JSON.parse(s));
  assert.deepEqual(
    dialogs.filter((d) => d.authorized).map((d) => d.message),
    ['Generare questa immagine?', 'Modificare questa immagine?'],
  );

  const gameServer = http.createServer(async (req, res) => {
    try {
      if (new URL(req.url, 'http://localhost').pathname === '/') {
        res.setHeader('content-type', 'text/html');
        res.end(await fs.readFile(path.join(project, 'index.html')));
      } else if (req.url === '/' + edited || req.url === '/' + asset) {
        res.setHeader('content-type', 'image/png');
        res.end(await fs.readFile(path.join(project, req.url === '/' + edited ? edited : asset)));
      } else {
        res.writeHead(404);
        res.end();
      }
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  servers.push(gameServer);
  await listen(gameServer);
  await game.goto(origin(gameServer) + '/?time=day');
  await game.locator('canvas[data-ready="true"]').waitFor();
  assert.deepEqual(await game.locator('canvas').evaluate((c) => [...c.getContext('2d').getImageData(2, 2, 1, 1).data]), [118, 180, 209, 255]);
  await game.screenshot({ path: path.join(run, 'scena-giorno.png') });
  await game.goto(origin(gameServer));
  await game.locator('canvas[data-ready="true"]').waitFor();
  const before = await game.locator('canvas').getAttribute('data-player');
  await game.keyboard.press('ArrowRight');
  const sceneState = await game.locator('canvas').evaluate((c) => ({
    width: c.width,
    height: c.height,
    player: Number(c.dataset.player),
    sky: [...c.getContext('2d').getImageData(2, 2, 1, 1).data],
  }));
  assert.equal(sceneState.player, Number(before) + 16);
  assert.equal(sceneState.width, width);
  assert.equal(sceneState.height, height);
  assert.deepEqual(sceneState.sky, [33, 25, 62, 255]);
  await game.screenshot({ path: path.join(run, 'scena-finale.png') });
  const events = await renderer.evaluate(() => window.imageFixtureEvents);
  const verifiedReceipts = [
    ...new Map(events.filter((e) => e.hasImage && e.receipt?.state === 'completed').map((e) => [e.receipt.jobId, e.receipt])).values(),
  ];
  assert.equal(verifiedReceipts.length, 2);
  for (const r of verifiedReceipts) {
    const edit = r.output === edited;
    assert.equal(r.output, edit ? edited : asset);
    assert.equal(r.requestId, edit ? 'req_fixture_edit' : 'req_fixture_create');
    assert.equal(r.usage?.inputTokens, edit ? 110 : 70);
    assert.equal(r.usage?.outputTokens, 640);
    assert.equal(r.billing, 'usage_reported');
    assert.equal(r.estimatedOutputUsd, 0.01992);
    assert.equal(r.usage?.calculatedCostUsd, edit ? 0.01987 : 0.01955);
    assert.equal(r.usage?.totalTokens, edit ? 750 : 710);
  }
  await electronApp.close();
  electronApp = undefined;
  renderer = await startDesktop();
  const recovered = await renderer.evaluate(
    async ({ project, task }) => {
      await window.api.startProject(project);
      const loaded = await window.api.loadTask(project, task);
      return loaded.messages
        .filter((m) => m.type === 'tool' && m.serverName === 'images' && m.toolName === 'result')
        .flatMap((m) => {
          try {
            const parts = JSON.parse(m.response).content;
            const img = parts?.find((x) => x.type === 'image' && x.mimeType === 'image/png');
            const text = parts?.find((x) => x.type === 'text');
            return img && text ? [{ jobId: JSON.parse(text.text).jobId, thumbnail: img.data }] : [];
          } catch {
            return [];
          }
        });
    },
    { project, task },
  );
  assert.deepEqual([...new Set(recovered.map((r) => r.jobId))].sort(), verifiedReceipts.map((r) => r.jobId).sort());
  const recoveredThumbnails = recovered.map((r) => ({ jobId: r.jobId, sha256: sha(Buffer.from(r.thumbnail, 'base64')) }));
  await renderer.evaluate(
    ({ project, task }) => {
      location.hash = '/home?' + new URLSearchParams({ project: encodeURIComponent(project), task }).toString();
    },
    { project, task },
  );
  const finalText = renderer.getByText('CONTROLLI_DI_CONSEGNA_CONCLUSI', { exact: true }).first();
  await finalText.waitFor({ state: 'visible', timeout: 30000 });
  const scroller = await finalText.evaluateHandle((node) => {
    for (let e = node.parentElement; e; e = e.parentElement) {
      if (/scroll|auto/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 12) return e;
    }
    return document.scrollingElement;
  });
  // The normal task view virtualizes earlier rows. Scroll its own transcript and check both named thumbnails before opening tool details.
  const previews = [];
  for (const output of [asset, edited]) {
    const receipt = verifiedReceipts.find((r) => r.output === output);
    const expected = recoveredThumbnails.find((r) => r.jobId === receipt.jobId).sha256;
    await scroller.evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    let found = false;
    for (let view = 0; view < 32 && !found; view++) {
      await sleep(160);
      const thumbnails = renderer.getByRole('img', { name: output + ' 1', exact: true });
      for (const img of await thumbnails.all()) {
        if (!(await img.isVisible())) continue;
        const meta = await img.evaluate((e) => ({ width: e.naturalWidth, height: e.naturalHeight, src: e.currentSrc || e.src }));
        if (meta.width === 0 || !meta.src.startsWith('data:image/png;base64,')) continue;
        const hash = sha(Buffer.from(meta.src.split(',')[1], 'base64'));
        assert.equal(hash, expected);
        assert.equal(meta.width, 256);
        assert(Math.abs(meta.width / meta.height - width / height) < 0.015);
        await img.click();
        const expanded = renderer.locator('img[class*="max-w-[90vw]"]');
        await expanded.waitFor({ state: 'visible', timeout: 5000 });
        assert.equal(await expanded.getAttribute('src'), meta.src);
        await renderer.screenshot({ path: path.join(run, output === edited ? 'preview.png' : 'preview-giorno.png') });
        await expanded.locator('..').getByRole('button').click();
        await expanded.waitFor({ state: 'hidden', timeout: 5000 });
        previews.push({ output, width: meta.width, height: meta.height, sha256: hash });
        found = true;
        break;
      }
      if (!found)
        await scroller.evaluate((e) => {
          e.scrollTop = Math.max(0, e.scrollTop - Math.max(120, e.clientHeight * 0.6));
        });
    }
    assert(found, 'Miniatura non visibile nella task riaperta: ' + output);
  }
  await scroller.dispose();
  const receipt = {
    model,
    checks: denials.length,
    verifiedReceipts,
    recoveredThumbnails,
    transport: 'fixture su loopback',
    graphics: graphicPosts,
    toolCalls,
    events,
    previews,
    scene: sceneState,
    createContinuedBeforeReceipt: draftContinued,
    explicitWaits: waitRequests,
    receivedEditSource: sha(day),
    consents: dialogs.filter((d) => d.authorized).map((d) => d.message),
    realApiCalls: 0,
  };
  await save(path.join(run, 'receipt.json'), receipt);
  console.log('PASS · ' + path.join(run, 'receipt.json'));
} catch (error) {
  if (electronApp) {
    for (const [index, page] of electronApp.windows().entries()) {
      await fs
        .writeFile(
          path.join(run, 'ui-failure-' + index + '.json'),
          JSON.stringify(
            await page.evaluate(() => ({
              url: location.hash,
              title: document.title,
              body: document.body.innerText.slice(-22000),
              buttons: [...document.querySelectorAll('button,[role=button]')]
                .map((x) => x.innerText?.slice(0, 100))
                .filter(Boolean)
                .slice(-100),
            })),
            null,
            2,
          ),
        )
        .catch(() => {});
      await page.screenshot({ path: path.join(run, 'ui-failure-' + index + '.png'), timeout: 4000 }).catch(() => {});
    }
  }
  throw error;
} finally {
  pendingCreate.resolve();
  await electronApp?.close();
  await browser?.close();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
