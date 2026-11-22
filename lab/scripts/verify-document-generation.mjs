import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { _electron } from '@playwright/test';

import { prepareWorkflowPilot } from './launch-workflow-pilot.mjs';

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = path.join(root, 'lab/fixtures/document-generation');
const args = process.argv.slice(2);
const packaged = args[0] === '--exe';
if ((packaged && args.length !== 2) || (!packaged && args.length > 1))
  throw Error('Uso: node lab/scripts/verify-document-generation.mjs [main.js | --exe percorso/Agent-Lab.exe]');
const executable = packaged ? path.resolve(args[1]) : createRequire(import.meta.url)('electron');
const resources = packaged ? path.join(path.dirname(executable), 'resources') : path.join(root, 'resources');
const entry = packaged ? undefined : path.resolve(args[0] ?? path.join(root, 'out/main/index.js'));
const generate = 'documents---generate';
const model = 'coding-document-fixture';
const providerId = 'local-document-fixture';
const profileId = 'collaudo-documenti';
const outputDirectory = 'consegne/preventivo';
const token = 'fixture-' + randomUUID();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fileSHA = async (file) => {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
};
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const save = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
const listen = (server) => new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
const spec = await read(path.join(fixture, 'preventivo.json'));
const bench = path.join(root, 'lab/work/documenti-e2e');
await fs.mkdir(bench, { recursive: true });
const run = await fs.mkdtemp(path.join(bench, 'turno-'));
const { data, env, project } = await prepareWorkflowPilot(run);
const osHome = path.join(run, 'os-home');
for (const dir of [osHome, path.join(run, 'tmp'), path.join(osHome, 'AppData/Roaming'), path.join(osHome, 'AppData/Local'), project]) {
  await fs.mkdir(dir, { recursive: true });
}
const delivery = path.join(project, outputDirectory);
const expectedFiles = ['document.docx', 'document.pdf', 'workbook.xlsx'];
const expectedPreviews = ['page-001.png', 'page-002.png', 'sheet-001.png'];

function documentRequest() {
  const sum = spec.items.reduce((total, item) => total + item.quantity * item.unitCents, 0);
  const tax = (subtotal) => Math.round((subtotal * spec.taxPercent) / 100);
  const money = (cents) => cents / 100;
  const rows = spec.items.map((item, i) => [
    item.code + ' ' + item.label,
    item.quantity,
    money(item.unitCents),
    {
      formula: '=B' + (i + 2) + '*C' + (i + 2),
      expected: money(item.quantity * item.unitCents),
    },
  ]);
  const subtotal = rows.length + 2;
  rows.push(
    ['Imponibile', null, null, { formula: '=SUM(D2:D' + (subtotal - 1) + ')', expected: money(sum) }],
    [
      'IVA ' + spec.taxPercent + '%',
      null,
      null,
      {
        formula: '=ROUND(D' + subtotal + '*' + spec.taxPercent + '/100,2)',
        expected: money(tax(sum)),
      },
    ],
    [
      'Totale preventivo',
      null,
      null,
      {
        formula: '=D' + subtotal + '+D' + (subtotal + 1),
        expected: money(sum + tax(sum)),
      },
    ],
  );
  const first = spec.items[0];
  const newTotal = sum + (spec.editedQuantity - first.quantity) * first.unitCents;
  return {
    outputDirectory,
    formats: ['docx', 'pdf', 'xlsx'],
    document: {
      title: spec.title,
      paragraphs: spec.paragraphs,
      summary: spec.summary,
      tableFromSheet: 'Preventivo',
      pageBreakBeforeRows: spec.pageBreakBeforeRows,
      sheets: [
        {
          name: 'Preventivo',
          columns: spec.columns,
          rows,
          numberFormats: ['General', '0', '#,##0.00 "€"', '#,##0.00 "€"'],
          inputCheck: {
            cell: 'B2',
            value: spec.editedQuantity,
            expect: [
              {
                cell: 'D2',
                value: money(spec.editedQuantity * first.unitCents),
              },
              {
                cell: 'D' + (subtotal + 2),
                value: money(newTotal + tax(newTotal)),
              },
            ],
          },
        },
      ],
    },
  };
}

const payload = documentRequest();
const requests = [];
const errors = [];
const phases = { create: {}, duplicate: {} };
let phase = 'setup';
const server = http.createServer(async (req, res) => {
  try {
    assert.equal(req.headers.authorization, 'Bearer ' + token);
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/models' && req.method === 'GET') {
      res.end(JSON.stringify({ data: [{ id: model, object: 'model' }] }));
      return;
    }
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(req.method, 'POST');
    assert.notEqual(phase, 'reopen', 'La sola riapertura ha richiesto una generazione.');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks));
    assert.equal(body.model, model);
    assert.notEqual(body.stream, true);
    const offered = (body.tools ?? []).map((t) => t.function.name);
    const current = phases[phase];
    let message = { role: 'assistant', content: 'Verifica locale conclusa.' };
    let finish = 'stop';
    const toolResult = body.messages?.findLast((m) => m.role === 'tool' && m.tool_call_id === 'fixture_' + phase);
    if (current && toolResult) {
      current.result = typeof toolResult.content === 'string' ? toolResult.content : JSON.stringify(toolResult.content);
      message.content = phase === 'create' ? 'Consegna documentale verificata.' : 'Verifica della destinazione già utilizzata conclusa.';
    } else if (current && offered.includes(generate) && !current.called) {
      current.called = true;
      message = {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'fixture_' + phase,
            type: 'function',
            function: { name: generate, arguments: JSON.stringify(payload) },
          },
        ],
      };
      finish = 'tool_calls';
    }
    requests.push({
      phase,
      model: body.model,
      offered: offered.includes(generate),
      toolIssued: finish === 'tool_calls',
      hasToolResult: Boolean(toolResult),
    });
    res.end(
      JSON.stringify({
        id: 'msg_' + randomUUID(),
        object: 'chat.completion',
        created: 1,
        model,
        choices: [{ index: 0, finish_reason: finish, message }],
        usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
      }),
    );
  } catch (error) {
    errors.push(error.message);
    res.writeHead(500).end(
      JSON.stringify({
        error: { message: 'Richiesta imprevista nel provider di prova.' },
      }),
    );
  }
});

const sortedHashes = async (folder) => {
  const files = await fs.readdir(folder, { withFileTypes: true });
  return Object.fromEntries(
    await Promise.all(
      files
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (f) => {
          assert(f.isFile(), 'Elemento non regolare nella consegna');
          return [f.name, await fileSHA(path.join(folder, f.name))];
        }),
    ),
  );
};
const until = async (predicate, message, timeout = 90000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (errors.length) throw Error(errors[0]);
    const value = await predicate();
    if (value) return value;
    await sleep(300);
  }
  throw Error(message);
};
const runDocker = async (args, timeout = 150000) =>
  (
    await execute('docker', args, {
      windowsHide: true,
      timeout,
      maxBuffer: 2 * 1024 * 1024,
    })
  ).stdout.trim();

async function inspectFiles() {
  const recipe = await fileSHA(path.join(resources, 'office/Dockerfile'));
  const endpoint = await runDocker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  assert.match(endpoint, /^npipe:\/\/\/\/\.\/pipe\/(?:docker_engine|dockerDesktopLinuxEngine)$/i);
  const docker = (args) => runDocker(['--host', endpoint, ...args]);
  const image = await docker(['image', 'inspect', '--format', '{{.Id}}', 'agent-lab-office:' + recipe.slice(0, 20)]);
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  const bind = (source, target) => 'type=bind,"source=' + source.replaceAll('"', '""') + '",target=' + target + ',readonly';
  const result = await docker([
    'run',
    '--rm',
    '--pull=never',
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--memory=1g',
    '--cpus=2',
    '--pids-limit=160',
    '--user=65534:65534',
    '--tmpfs',
    '/tmp:rw,nosuid,nodev,size=500m',
    '--mount',
    bind(fixture, '/qa'),
    '--mount',
    bind(delivery, '/delivery'),
    '--entrypoint',
    'python3',
    image,
    '/qa/verify_delivery.py',
    '/delivery',
  ]);
  return { image, ...JSON.parse(result) };
}

let app;
function restrictDesktopNetwork() {
  const local = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, options) => {
    const address = new URL(typeof input === 'string' ? input : input.url || input.href);
    if (!local.has(address.hostname)) throw Error('Rete esterna esclusa nel desktop di prova.');
    return originalFetch(input, options);
  };
  const { Socket } = process.getBuiltinModule('node:net');
  const originalConnect = Socket.prototype.connect;
  Socket.prototype.connect = function (...input) {
    const parts = Array.isArray(input[0]) ? input[0] : input;
    const host = typeof parts[0] === 'object' ? parts[0]?.host : typeof parts[0] === 'number' && typeof parts[1] === 'string' ? parts[1] : undefined;
    if (host && !local.has(host)) throw Error('Socket esterno escluso nel desktop di prova.');
    return originalConnect.apply(this, input);
  };
}
const openDesktop = async () => {
  app = await _electron.launch({
    executablePath: executable,
    args: [...(packaged ? [] : [run]), '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],
    cwd: run,
    env,
    timeout: 60000,
  });
  if (packaged) {
    await app.evaluate(restrictDesktopNetwork);
    const info = await app.evaluate(({ app: electron }) => ({
      packaged: electron.isPackaged,
      executable: process.execPath,
      resources: process.resourcesPath,
      profile: electron.getPath('userData'),
    }));
    assert(info.packaged);
    assert.equal(path.relative(executable, info.executable), '');
    assert.equal(path.relative(resources, info.resources), '');
    assert.equal(path.relative(data, info.profile), '');
  }
  return until(async () => {
    for (const page of app.windows()) {
      if (
        await page
          .evaluate(async (id) => window.api?.getAllAgentProfiles && (await window.api.getAllAgentProfiles()).some((r) => r.id === id), profileId)
          .catch(() => false)
      )
        return page;
    }
  }, 'Profilo di prova non caricato.');
};

async function visibleThumbnails(page, expected) {
  const images = page.getByRole('img', { name: new RegExp('^' + outputDirectory + ' [0-9]+$') });
  try {
    return await until(
      async () => {
        const candidates = await images.evaluateAll((items) =>
          items
            .filter((img) => img.naturalWidth && img.naturalHeight && img.getClientRects().length)
            .map((img) => ({ alt: img.alt, width: img.naturalWidth, height: img.naturalHeight, source: img.currentSrc })),
        );
        if (candidates.length !== expected) return;
        return candidates.map(({ source, ...other }) => {
          assert(source.startsWith('data:image/png;base64,'));
          return { ...other, sha256: hash(Buffer.from(source.slice('data:image/png;base64,'.length), 'base64')) };
        });
      },
      'La chat non mostra le ' + expected + ' anteprime attese.',
      30000,
    );
  } catch (error) {
    const details = await page.evaluate(() => ({
      route: location.hash,
      text: document.body.innerText.slice(-6000),
      images: [...document.images].map((img) => ({ alt: img.alt, width: img.naturalWidth, height: img.naturalHeight, visible: !!img.getClientRects().length })),
    }));
    await save(path.join(run, 'diagnosi-' + phase + '.json'), details);
    await page.screenshot({ path: path.join(run, 'diagnosi-' + phase + '.png') });
    throw error;
  }
}

function thumbnailHashes(messages) {
  return messages
    .filter((m) => m.type === 'tool' && m.serverName === 'documents' && m.toolName === 'generate')
    .flatMap((m) => {
      try {
        const content = JSON.parse(m.response ?? 'null')?.content;
        return content?.filter((part) => part.type === 'image' && part.mimeType === 'image/png').map((part) => hash(Buffer.from(part.data, 'base64'))) ?? [];
      } catch {
        return [];
      }
    });
}
const report = {
  provider: model,
  project,
  inputs: payload,
  requests,
};
try {
  assert.equal(process.platform, 'win32', 'Il banco desktop è qualificato su Windows con Docker Desktop.');
  if (packaged) {
    const { extractFile } = await import('@electron/asar');
    const archive = path.join(resources, 'app.asar');
    const manifest = JSON.parse(extractFile(archive, 'package.json').toString('utf8'));
    report.mainSha256 = hash(extractFile(archive, path.normalize(manifest.main)));
    report.package = { executable, exeSha256: await fileSHA(executable), asarSha256: await fileSHA(archive), resources };
  } else report.mainSha256 = await fileSHA(entry);
  await listen(server);
  const idle = http.createServer();
  await listen(idle);
  const port = idle.address().port;
  await new Promise((ok) => idle.close(ok));
  const settings = await read(path.join(data, 'config.json'));
  settings.providers = [
    {
      id: providerId,
      provider: {
        name: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1',
        apiKey: token,
        disableStreaming: true,
        trackTokenUsage: true,
      },
    },
  ];
  settings.openProjects = [
    {
      active: true,
      baseDir: project,
      settings: {
        currentMode: 'agent',
        agentProfileId: profileId,
        modelEditFormats: {},
      },
    },
  ];
  settings.settings.startupMode = 'empty';
  await save(path.join(data, 'config.json'), settings);
  await fs.writeFile(path.join(data, 'setup-complete'), 'fixture');
  await save(path.join(data, 'models.json'), {
    version: 1,
    models: [
      {
        id: model,
        providerId,
        isCustom: true,
        supportsTools: true,
        maxInputTokens: 32768,
        maxOutputTokens: 4096,
        inputCostPerToken: 0,
        outputCostPerToken: 0,
        providerOverrides: { disableStreaming: true },
      },
    ],
  });
  const profile = path.join(run, 'home', 'agents', profileId);
  await fs.mkdir(profile, { recursive: true });
  await save(path.join(profile, 'config.json'), {
    id: profileId,
    name: 'Prova documenti',
    provider: providerId,
    model,
    usePowerTools: false,
    useAiderTools: false,
    useTaskTools: false,
    useSkillsTools: false,
    useTodoTools: false,
    useMemoryTools: false,
    useExtensionTools: false,
    useSubagents: false,
    includeContextFiles: false,
    includeRepoMap: false,
    enabledServers: [],
    toolApprovals: { [generate]: 'always' },
    maxIterations: 8,
  });
  const gitConfig = path.join(run, 'gitconfig');
  await fs.writeFile(gitConfig, '');
  Object.assign(env, {
    AIDER_DESK_RESOURCES_DIR: resources,
    AIDER_DESK_LOOPBACK_ONLY: 'true',
    AIDER_DESK_PORT: String(port),
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
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: run,
  });
  delete env.AIDER_DESK_WORKFLOW_CONFIG;
  delete env.AIDER_DESK_WORKFLOW_PILOT_DIR;
  await execute('git', ['init', '--quiet', '--template=', project], {
    cwd: run,
    env,
    windowsHide: true,
  });
  await fs.writeFile(path.join(project, '.gitignore'), '.aider-desk/\n');
  const themeFile = path.join(project, 'document-templates/default.json');
  await fs.mkdir(path.dirname(themeFile));
  await save(themeFile, {
    name: 'Officina Demo',
    accent: '#28536B',
    organization: 'Officina Demo',
    footer: 'Dati sintetici',
  });
  if (!packaged)
    await save(path.join(run, 'package.json'), {
      name: 'agent-lab-document-qa',
      version: '1.0.0',
      main: 'main.cjs',
    });
  if (!packaged) await fs.writeFile(path.join(run, 'main.cjs'), '(' + restrictDesktopNetwork.toString() + ')();\nrequire(' + JSON.stringify(entry) + ');\n');
  let page = await openDesktop();
  const task = await page.evaluate(
    async ({ project, providerId, profileId, model }) => {
      await window.api.startProject(project);
      const t = await window.api.createNewTask(project, {
        name: 'Preventivo sintetico',
        provider: providerId,
        model,
        agentProfileId: profileId,
        mode: 'agent',
        workingMode: 'local',
        activate: true,
        sendEvent: true,
        addInitialContextFiles: false,
        autonomyMode: 'autonomous',
      });
      await window.api.loadTask(project, t.id);
      window.documentFixtureEvents = [];
      window.api.addToolListener(project, t.id, (event) => {
        if (event.serverName !== 'documents' || event.toolName !== 'generate' || !event.response) return;
        try {
          const result = JSON.parse(event.response);
          const images = result.content?.filter((part) => part.type === 'image' && part.mimeType === 'image/png').map((part) => part.data.length) ?? [];
          window.documentFixtureEvents.push({ id: event.id, images });
        } catch {}
      });
      location.hash =
        '/home?' +
        new URLSearchParams({
          project: encodeURIComponent(project),
          task: t.id,
        }).toString();
      return t.id;
    },
    { project, providerId, profileId, model },
  );
  report.task = task;
  const send = async (name, prompt) => {
    phase = name;
    await page.evaluate(({ project, task, prompt }) => window.api.runPrompt(project, task, prompt, 'agent'), { project, task, prompt });
    await until(() => phases[name].result, 'La chat non ha ricevuto il risultato ' + name, 360000);
    await save(path.join(run, name + '-tool.json'), {
      tool: generate,
      result: phases[name].result,
    });
  };
  await send(
    'create',
    'Prepara il preventivo sintetico in Word, PDF ed Excel nella nuova cartella ' +
      outputDirectory +
      '. Verifica le pagine e il ricalcolo del totale se cambia una quantità.',
  );
  const receipt = await read(path.join(delivery, 'receipt.json')).catch((e) => {
    throw Error('Consegna non disponibile: ' + phases.create.result.slice(0, 500) + ' (' + e.code + ')');
  });
  assert.equal(receipt.status, 'verified');
  assert.equal(receipt.pages, 2);
  assert.equal(receipt.template, 'Officina Demo');
  assert.equal(receipt.templateSource, 'document-templates/default.json');
  assert.equal(receipt.templateSha256, await fileSHA(themeFile));
  for (const file of expectedFiles) assert(receipt.files.includes(file), 'Ricevuta senza ' + file);
  for (const file of expectedPreviews) assert(receipt.previews.includes(file), 'Ricevuta senza ' + file);
  assert(receipt.engines?.length && receipt.checks?.length, 'Ricevuta senza controlli o motori');
  assert(
    receipt.checks.some((check) => check.includes('B2') && /2 risultati/.test(check)),
    'La ricevuta non attesta la prova di modifica prevista su B2.',
  );
  const hashes = await sortedHashes(delivery);
  assert.equal(receipt.sourceSha256, hashes['source.json']);
  for (const file of [...receipt.files, ...receipt.previews]) assert.equal(receipt.hashes[file], hashes[file], 'Digest della ricevuta diverso per ' + file);
  report.workerReceipt = receipt;
  report.liveThumbnails = await page.evaluate(() => window.documentFixtureEvents);
  const thumbnailCount = Math.min(4, receipt.previews.length);
  report.visibleThumbnails = await visibleThumbnails(page, thumbnailCount);
  const liveHashes = report.visibleThumbnails.map((image) => image.sha256);
  await page.screenshot({ path: path.join(run, 'anteprime-chat.png') });
  report.independent = await inspectFiles();
  report.deliveryHashes = hashes;
  await send('duplicate', 'Controlla la richiesta ripetuta nella stessa cartella, preservando la consegna esistente.');
  assert.match(phases.duplicate.result, /esist|già|already|occupied/i);
  assert.deepEqual(await sortedHashes(delivery), hashes, 'La prova duplicata ha modificato la consegna');
  await until(
    () =>
      page.evaluate(async ({ project, task }) => (await window.api.getTasks(project)).some((t) => t.id === task && t.state === 'READY_FOR_REVIEW'), {
        project,
        task,
      }),
    'Il turno non si è concluso sul desktop.',
  );
  const loadTask = () => page.evaluate(({ project, task }) => window.api.loadTask(project, task), { project, task });
  const history = await loadTask();
  const transcript = JSON.stringify(history.messages);
  report.loadedThumbnails = thumbnailHashes(history.messages);
  assert.deepEqual(report.loadedThumbnails, liveHashes, 'loadTask non ripristina le immagini presenti nell’evento live.');
  assert(transcript.includes('document.pdf') && transcript.includes('workbook.xlsx'), 'La cronologia della chat non contiene la consegna.');
  report.duplicatePreserved = true;
  await app.close();
  app = undefined;
  phase = 'reopen';
  page = await openDesktop();
  await page.evaluate((p) => window.api.startProject(p), project);
  const reopened = await loadTask();
  report.reopenedThumbnails = thumbnailHashes(reopened.messages);
  assert.deepEqual(report.reopenedThumbnails, liveHashes, 'Il riavvio ha perso o alterato le immagini della consegna.');
  await page.evaluate(
    ({ project, task }) => {
      location.hash = '/home?' + new URLSearchParams({ project: encodeURIComponent(project), task }).toString();
    },
    { project, task },
  );
  report.reopenedView = await visibleThumbnails(page, thumbnailCount);
  assert.deepEqual(
    report.reopenedView.map((image) => image.sha256),
    liveHashes,
    'Nel DOM riaperto le miniature sono diverse.',
  );
  await page.screenshot({ path: path.join(run, 'anteprime-riapertura.png') });
  assert.deepEqual(await sortedHashes(delivery), hashes);
  assert.deepEqual(errors, []);
  report.status = 'passed';
  console.log('PASS ' + path.join(run, 'qa.json'));
} catch (error) {
  report.status = 'failed';
  report.error = error.message.replaceAll(token, '[omesso]');
  console.error('FAIL ' + path.join(run, 'qa.json') + ' — ' + report.error);
  process.exitCode = 1;
} finally {
  await app?.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((ok) => server.close(ok));
  await save(path.join(run, 'qa.json'), report);
}
