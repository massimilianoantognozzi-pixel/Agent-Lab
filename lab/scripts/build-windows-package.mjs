import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { checkSdkBehavior } from '../../packages/app/scripts/check-sdk-behavior.mjs';
import { packageWindowsDistribution } from './windows-package-cloudflared.mjs';
import { verifyWindowsIdentity } from './windows-package-layout.mjs';
import identity from '../packaging/builder-identity.cjs';

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '../..');
const ptyPackage = '@homebridge/node-pty-prebuilt-multiarch';

async function probeNativeRuntime(manifest) {
  const require = createRequire(path.resolve(manifest));
  const marker = `AgentLabPTY-${randomUUID()}`;
  const pty = require(ptyPackage).spawn(process.env.ComSpec, ['/d', '/c', 'echo ' + marker], {
    cwd: process.cwd(),
    env: process.env,
    name: 'xterm',
  });
  await new Promise((resolve, reject) => {
    let text = '';
    const timeout = setTimeout(() => {
      pty.kill();
      reject(new Error('Il terminale non ha risposto.'));
    }, 12000);
    pty.onData((data) => {
      text += data;
    });
    pty.onExit(({ exitCode }) => {
      clearTimeout(timeout);
      if (exitCode === 0 && text.includes(marker)) resolve();
      else reject(new Error(`PTY Windows non verificato (exit ${exitCode}).`));
    });
  });
  const ort = require('onnxruntime-node');
  // Single float Identity graph (opset 13), independent of the user's models.
  const graph = Buffer.from('CAgSCEFnZW50TGFiOjgKEAoBeBIBeSIISWRlbnRpdHkSAnFhWg8KAXgSCgoICAESBAoCCAFiDwoBeRIKCggIARIECgIIAUICEA0=', 'base64');
  const session = await ort.InferenceSession.create(graph, { executionProviders: ['cpu'] });
  try {
    const result = await session.run({ x: new ort.Tensor('float32', Float32Array.of(2), [1]) });
    assert.deepEqual(Array.from(result.y.data), [2]);
  } finally {
    await session.release();
  }
  const testDb = await fs.mkdtemp(path.join(tmpdir(), 'agent-lab-lancedb-'));
  try {
    const db = await require('@lancedb/lancedb').connect(testDb);
    try {
      const table = await db.createTable('native_test', [{ id: 1 }]);
      try {
        assert.equal(await table.countRows(), 1);
      } finally {
        table.close();
      }
    } finally {
      db.close();
    }
  } finally {
    const target = await fs.realpath(testDb);
    if (path.dirname(target) !== (await fs.realpath(tmpdir())) || !path.basename(target).startsWith('agent-lab-lancedb-')) {
      throw new Error('Percorso del database di prova cambiato.');
    }
    await fs.rm(target, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
  }
  await checkSdkBehavior(path.dirname(path.resolve(manifest)));
  console.log(`PTY Windows, ONNX CPU, LanceDB e adattatori SDK verificati con Electron ${process.versions.electron}.`);
}

function verifyNativeRuntime(executable, manifest) {
  execFileSync(executable, [script, '--probe-native', manifest], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    timeout: 18000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
}

async function verifyInstallation() {
  const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8')).packages;
  const modules = path.join(root, 'node_modules');
  if ((await fs.lstat(modules)).isSymbolicLink()) throw new Error('Usa una directory node_modules dedicata al checkout di release.');
  const localLock = path.join(modules, '.package-lock.json');
  if (!existsSync(localLock)) throw new Error('Manca il lock installato. Prepara un checkout di release con npm ci --include=dev --ignore-scripts.');
  const installed = JSON.parse(await fs.readFile(localLock, 'utf8')).packages;
  const mismatch = (name) => {
    throw new Error(`Dipendenze diverse dal lock (${name}). Usa un checkout di release dedicato con npm ci --include=dev --ignore-scripts.`);
  };
  for (const [location, actual] of Object.entries(installed)) {
    const expected = lock[location];
    if (!expected || actual.version !== expected.version || actual.integrity !== expected.integrity || actual.resolved !== expected.resolved)
      mismatch(location);
    if (actual.link) {
      if ((await fs.realpath(path.join(root, location))) !== (await fs.realpath(path.resolve(root, expected.resolved)))) mismatch(location);
    } else if (actual.version) {
      const data = JSON.parse(await fs.readFile(path.join(root, location, 'package.json'), 'utf8'));
      if (data.version !== expected.version) mismatch(location);
    }
  }
  for (const [location, expected] of Object.entries(lock)) {
    if (location && !installed[location] && !expected.optional && !expected.devOptional && !expected.peer) mismatch(location);
  }
}

async function build(args) {
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  assert.ok(existsSync(npmCli), 'Avvia tramite npm run build:win.');
  const run = (entry, commandArgs) => execFileSync(process.execPath, [entry, ...commandArgs], { cwd: root, stdio: 'inherit', windowsHide: true });
  const npm = (...commandArgs) => run(npmCli, commandArgs);
  const builder = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
  const localArgs = [];
  for (let index = 0; index < args.length; index++) {
    const [option, value] = args[index].split('=', 2);
    if (option === '--publish' || option === '-p') {
      if ((value ?? args[++index]) !== 'never') throw new Error('La build Windows produce solo una consegna locale.');
    } else localArgs.push(args[index]);
  }
  args = localArgs;
  const localX64 =
    process.platform === 'win32' &&
    process.arch === 'x64' &&
    args.every((value) => value === '--dir' || value === '--x64' || value.startsWith('--config.directories.output='));
  if (!localX64) {
    const projectRequire = createRequire(path.join(root, 'package.json'));
    const builderRequire = createRequire(projectRequire.resolve('electron-builder/package.json'));
    const { configureBuildCommand, createYargs, normalizeOptions } = projectRequire('electron-builder/out/builder');
    const options = normalizeOptions(
      configureBuildCommand(createYargs())
        .exitProcess(false)
        .parseSync(['--win', ...args]),
    );
    if ([...options.targets.keys()].some((platform) => platform.nodeName !== 'win32')) throw new Error('build:win confeziona solo target Windows.');
    if (options.projectDir && path.resolve(options.projectDir) !== root) throw new Error('La build Windows deve usare il checkout di Agent-Lab.');
    const { Packager } = builderRequire('app-builder-lib');
    const packager = new Packager({ ...options, projectDir: root, publish: 'never' });
    await packager.validateConfig();
    identity.assertWindowsConfig(packager.config, packager.metadata);
    if (options.prepackaged) await verifyWindowsIdentity(path.resolve(root, options.prepackaged), projectRequire);
    else npm('run', 'build');
    run(builder, ['--win', ...args, '--publish', 'never']);
    return;
  }

  // Bootstrap only an empty checkout. A normal build must never remove an existing development installation.
  if (!existsSync(path.join(root, 'node_modules'))) npm('ci', '--include=dev', '--ignore-scripts', '--no-audit');
  await verifyInstallation();
  run(path.join(root, 'node_modules/electron/install.js'), []);
  run(path.join(root, 'node_modules/patch-package/index.js'), ['--error-on-fail']);
  npm('run', 'build:extensions');
  run(path.join(root, 'scripts/download-probe.mjs'), ['--current-platform-only']);

  const require = createRequire(path.join(root, 'package.json'));
  const electron = require('electron');
  const version = JSON.parse(readFileSync(require.resolve('electron/package.json'), 'utf8')).version;
  // Install the producer's Node-API binary, then test it in the actual Electron runtime before excluding only this module.
  npm('rebuild', ptyPackage, 'onnxruntime-node', '--foreground-scripts');
  verifyNativeRuntime(electron, path.join(root, 'package.json'));
  const builderRequire = createRequire(require.resolve('electron-builder/package.json'));
  const libRequire = createRequire(builderRequire.resolve('app-builder-lib/package.json'));
  const { rebuild } = await import(pathToFileURL(libRequire.resolve('@electron/rebuild')).href);
  const rebuilding = rebuild({ buildPath: root, projectRootPath: root, electronVersion: version, arch: 'x64', ignoreModules: [ptyPackage] });
  rebuilding.lifecycle.on('module-found', (name) => console.log('Electron rebuild:', name));
  await rebuilding;

  npm('run', 'build');
  // All other production/optional modules have completed electron-rebuild above.
  const prefix = '--config.directories.output=';
  const output = args.find((value) => value.startsWith(prefix))?.slice(prefix.length) || 'dist';
  await packageWindowsDistribution(root, path.resolve(root, output), args.includes('--dir'), (unpacked) => {
    verifyNativeRuntime(path.join(unpacked, 'Agent-Lab.exe'), path.join(unpacked, 'resources', 'app.asar', 'package.json'));
  });
}

if (process.argv[2] === '--probe-native') {
  try {
    await probeNativeRuntime(process.argv[3]);
    // The dedicated PTY worker can retain a Windows handle after reporting the child exit.
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else {
  await build(process.argv.slice(2));
}
