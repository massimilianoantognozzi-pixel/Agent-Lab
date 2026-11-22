import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { _electron } from '@playwright/test';

import { cloudflaredResource, verifyWindowsCloudflared } from './windows-package-cloudflared.mjs';
import { verifyWindowsLayout } from './windows-package-layout.mjs';

if (process.platform !== 'win32' || !process.argv[2]) {
  throw new Error('Uso su Windows: node lab/scripts/check-windows-package.mjs <directory win-unpacked>');
}
const unpacked = await fs.realpath(process.argv[2]);
const resources = path.join(unpacked, 'resources');
const asar = path.join(resources, 'app.asar');
await verifyWindowsLayout(unpacked);
await verifyWindowsCloudflared(path.join(resources, cloudflaredResource));

const profile = await fs.mkdtemp(path.join(tmpdir(), 'agent-lab-windows-qa-'));
let app;
try {
  const env = {};
  for (const key of ['SystemRoot', 'SystemDrive', 'COMSPEC', 'PATHEXT', 'PATH', 'WINDIR', 'ProgramFiles', 'ProgramFiles(x86)']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const password = randomBytes(24).toString('hex');
  const username = 'package-test';
  const socket = createServer();
  await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((error) => (error ? reject(error) : resolve())));
  for (const name of ['app-data', 'local', 'roaming', 'tmp', 'projects']) await fs.mkdir(path.join(profile, name));
  Object.assign(env, {
    HOME: profile,
    USERPROFILE: profile,
    TEMP: path.join(profile, 'tmp'),
    TMP: path.join(profile, 'tmp'),
    APPDATA: path.join(profile, 'roaming'),
    LOCALAPPDATA: path.join(profile, 'local'),
    AIDER_DESK_DATA_DIR: path.join(profile, 'app-data'),
    AIDER_DESK_HOME_DIR: path.join(profile, '.aider-desk'),
    AIDER_DESK_LAB_MODE: 'true',
    AIDER_DESK_LAB_WORKSPACE_ROOT: path.join(profile, 'projects'),
    AIDER_DESK_SERVER_HOST: '127.0.0.1',
    AIDER_DESK_LOOPBACK_ONLY: 'true',
    AIDER_DESK_PORT: String(port),
    AIDER_DESK_USERNAME: username,
    AIDER_DESK_PASSWORD: password,
    DO_NOT_TRACK: '1',
    OTEL_SDK_DISABLED: 'true',
  });
  const nativeProbe = fileURLToPath(new URL('./build-windows-package.mjs', import.meta.url));
  execFileSync(path.join(unpacked, 'Agent-Lab.exe'), [nativeProbe, '--probe-native', path.join(asar, 'package.json')], {
    cwd: profile,
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
    timeout: 18000,
    windowsHide: true,
  });
  app = await _electron.launch({
    executablePath: path.join(unpacked, 'Agent-Lab.exe'),
    cwd: profile,
    env,
    timeout: 45000,
    args: ['--headless', '--disable-background-networking', '--disable-gpu', '--user-data-dir=' + env.AIDER_DESK_DATA_DIR],
  });
  assert.deepEqual(await app.evaluate(({ app }) => [app.isPackaged, app.getAppPath(), app.getName()]), [true, asar, 'Agent-Lab']);
  let ready = false;
  const deadline = Date.now() + 45000;
  while (!ready && Date.now() < deadline) {
    for (const page of app.windows()) {
      if (
        await page
          .evaluate(() => Boolean(window.api) && document.readyState === 'complete' && document.querySelector('#root')?.childElementCount > 0)
          .catch(() => false)
      ) {
        ready = true;
        break;
      }
    }
    if (!ready) await delay(150);
  }
  assert.ok(ready, 'Il renderer non ha caricato il bridge e la UI.');
  const url = `http://127.0.0.1:${port}/api/health`;
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
  console.log('PASS: contenuti ASAR, risorse Windows, Electron confezionato, bridge, renderer e API locale.');
} finally {
  try {
    if (app) {
      const child = app.process();
      const deadline = setTimeout(() => {
        if (child.exitCode === null) child.kill();
      }, 5000);
      try {
        await app.close();
      } finally {
        clearTimeout(deadline);
      }
    }
  } finally {
    const target = await fs.realpath(profile);
    if (path.dirname(target) !== (await fs.realpath(tmpdir())) || !path.basename(target).startsWith('agent-lab-windows-qa-')) {
      throw new Error('Percorso del profilo di collaudo cambiato.');
    }
    await fs.rm(target, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
  }
}
