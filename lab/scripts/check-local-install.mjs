import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { _electron } from '@playwright/test';

if (process.platform !== 'win32' || !process.argv[2]) {
  throw new Error('Uso: node lab/scripts/check-local-install.mjs <directory win-unpacked>');
}
const executable = path.resolve(process.argv[2], 'Agent-Lab.exe');
await fs.access(executable);
const root = await fs.mkdtemp(path.join(tmpdir(), 'agent-lab-coexist-'));
const roaming = path.join(root, 'roaming');
const project = path.join(root, 'workspace');
const local = path.join(root, 'local');
const temp = path.join(root, 'tmp');
const upstream = [path.join(roaming, 'aider-desk'), path.join(root, '.aider-desk'), path.join(project, '.aider-desk')];
const marker = randomUUID();
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sentinel = http.createServer((_request, response) => response.end(marker));
let app;
let ownsSentinel = false;

try {
  for (const dir of [...upstream, local, temp]) await fs.mkdir(dir, { recursive: true });
  for (const dir of upstream) await fs.writeFile(path.join(dir, 'upstream-sentinel.txt'), marker);
  execFileSync('git', ['init', '--quiet', project], { windowsHide: true });
  const portCheck = http.createServer();
  await new Promise((resolve, reject) => portCheck.once('error', reject).listen(24364, '127.0.0.1', resolve));
  await new Promise((resolve) => portCheck.close(resolve));
  try {
    await new Promise((resolve, reject) => sentinel.once('error', reject).listen(24337, '127.0.0.1', resolve));
    ownsSentinel = true;
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
  }

  const env = {};
  for (const key of ['SystemRoot', 'SystemDrive', 'COMSPEC', 'PATHEXT', 'PATH', 'WINDIR', 'ProgramFiles', 'ProgramFiles(x86)']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, {
    USERPROFILE: root,
    HOME: root,
    HOMEDRIVE: path.parse(root).root.slice(0, 2),
    HOMEPATH: root.slice(2),
    APPDATA: roaming,
    LOCALAPPDATA: local,
    TEMP: temp,
    TMP: temp,
    DO_NOT_TRACK: '1',
    OTEL_SDK_DISABLED: 'true',
    PIP_NO_INDEX: '1',
    UV_OFFLINE: '1',
    UV_CACHE_DIR: path.join(root, 'uv-cache'),
    GIT_CONFIG_GLOBAL: path.join(root, 'gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
  });
  // No Agent-Lab path, port, update or language overrides. Chromium receives no --user-data-dir switch.
  app = await _electron.launch({
    executablePath: executable,
    cwd: root,
    env,
    args: ['--disable-background-networking'],
    timeout: 60000,
  });
  const info = await app.evaluate(({ app: electronApp }) => ({
    name: electronApp.getName(),
    packaged: electronApp.isPackaged,
    profile: electronApp.getPath('userData'),
    pid: process.pid,
    executable: process.execPath,
    dir: process.env.AIDER_DESK_DIR,
    version: electronApp.getVersion(),
  }));
  assert.equal(info.packaged, true);
  assert.equal(info.name, 'Agent-Lab');
  assert.equal(info.dir, '.agent-lab');
  assert.equal(path.relative(executable, info.executable), '');
  assert.equal(path.relative(path.join(roaming, 'Agent-Lab'), info.profile), '');
  let page;
  const deadline = Date.now() + 60_000;
  while (!page && Date.now() < deadline) {
    for (const candidate of app.windows()) {
      if (
        await candidate
          .evaluate(() => Boolean(window.api?.loadSettings && document.querySelector('#root')?.childElementCount))
          .catch(() => false)
      ) {
        page = candidate;
        break;
      }
    }
    if (!page) await delay(200);
  }
  assert.ok(page, 'La finestra principale non è pronta.');
  assert.equal(await page.title(), 'Agent-Lab');
  const settings = await page.evaluate(() => window.api.loadSettings());
  assert.equal(settings.language, 'it');
  assert.equal(settings.aiderDeskAutoUpdate, false);
  const versions = await page.evaluate(() => window.api.getVersions());
  assert.equal(versions.aiderDeskCurrentVersion, info.version);
  assert.equal(versions.applicationUpdatesSupported, false);
  await assert.rejects(
    page.evaluate(() => window.api.downloadLatestAiderDesk()),
    /non disponibile/,
  );
  const listener = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '(Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort 24364 -ErrorAction Stop).OwningProcess',
    ],
    { encoding: 'utf8', windowsHide: true },
  ).trim();
  assert.equal(listener, String(info.pid));
  const health = await fetch('http://127.0.0.1:24364/api/health', { signal: AbortSignal.timeout(4000) });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  assert.equal((await fs.stat(path.join(root, '.agent-lab'))).isDirectory(), true);
  const id = await page.evaluate(async (dir) => {
    await window.api.startProject(dir);
    const task = await window.api.createNewTask(dir, { name: 'Verifica coesistenza', activate: false, addInitialContextFiles: false });
    await window.api.updateTask(dir, task.id, { name: 'Prova locale salvata' });
    return task.id;
  }, project);
  const saved = JSON.parse(await fs.readFile(path.join(project, '.agent-lab', 'tasks', id, 'settings.json'), 'utf8'));
  assert.equal(saved.name, 'Prova locale salvata');
  const child = app.process();
  const timeout = setTimeout(() => {
    if (child.exitCode === null) child.kill();
  }, 10_000);
  try {
    await app.close();
  } finally {
    clearTimeout(timeout);
  }
  app = undefined;
  for (const dir of upstream) {
    assert.deepEqual(await fs.readdir(dir), ['upstream-sentinel.txt']);
    assert.equal(digest(await fs.readFile(path.join(dir, 'upstream-sentinel.txt'))), digest(marker));
  }
  if (ownsSentinel) assert.equal(await (await fetch('http://127.0.0.1:24337')).text(), marker);
  console.log(
    JSON.stringify({
      product: info.name,
      version: info.version,
      port: 24364,
      upstreamPortOccupied: true,
      upstreamSentinels: upstream.length,
      newProjectState: true,
      appUpdates: false,
    }),
  );
} finally {
  if (app) await app.close().catch(() => {});
  if (ownsSentinel) {
    sentinel.closeAllConnections();
    await new Promise((resolve) => sentinel.close(resolve));
  }
  if (path.dirname(await fs.realpath(root)) !== (await fs.realpath(tmpdir())) || !path.basename(root).startsWith('agent-lab-coexist-'))
    throw new Error('Percorso di prova inatteso.');
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
