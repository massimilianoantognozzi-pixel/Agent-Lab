import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { extract } from 'tar';
import { checkSdkBehavior } from './check-sdk-behavior.mjs';
import { stageTransformers } from './stage-transformers.mjs';

const script = fileURLToPath(import.meta.url);
const app = path.dirname(path.dirname(script));
const root = path.resolve(app, '../..');
const out = path.join(app, 'out');
const manifest = JSON.parse(await fs.readFile(path.join(app, 'package.json'), 'utf8'));
const lockFile = path.join(app, 'package-lock.json');
const privateModules = path.join(out, 'node_modules');
const receiptName = 'SDK-BUILD.json';
const receipt = path.join(privateModules, receiptName);
const requesty = '@requesty/ai-sdk';
const patchName = `@requesty+ai-sdk+${manifest.devDependencies[requesty]}.patch`;
const patch = path.join(root, 'patches', patchName);
const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
const fileDigest = async (file) => digest(await fs.readFile(file));

async function treeDigest(dir, top = false) {
  const entries = (await fs.readdir(dir)).sort();
  const hashes = [];
  for (const entry of entries) {
    if (top && entry === receiptName) continue;
    const file = path.join(dir, entry);
    const stat = await fs.lstat(file);
    if (!stat.isDirectory() && !stat.isFile()) throw new Error(`Unexpected SDK entry: ${file}`);
    hashes.push([entry, stat.isDirectory() ? await treeDigest(file) : await fileDigest(file)]);
  }
  return digest(JSON.stringify(hashes));
}

const inputDigests = {
  manifest: await fileDigest(path.join(app, 'package.json')),
  lock: await fileDigest(lockFile),
  patch: await fileDigest(patch),
  script: await fileDigest(script),
  check: await fileDigest(path.join(path.dirname(script), 'check-sdk-behavior.mjs')),
  transformers: await fileDigest(path.join(path.dirname(script), 'stage-transformers.mjs')),
};
const downloader = 'scripts/download-probe.mjs';
if ((await fileDigest(path.join(root, downloader))) !== (await fileDigest(path.join(app, downloader)))) {
  throw new Error('Rebuild the CLI to include the current Probe downloader.');
}
for (const asset of ['cli.js', 'runner.js', 'renderer/index.html']) await fs.access(path.join(out, asset));

async function isPrepared() {
  try {
    const recorded = JSON.parse(await fs.readFile(receipt, 'utf8'));
    return Object.entries(inputDigests).every(([name, hash]) => hash === recorded[name]) && (await treeDigest(privateModules, true)) === recorded.tree;
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return false;
    throw error;
  }
}

const publishLock = path.join(out, '.private-sdk-build.lock');

// A recently created module directory can still be open on Windows. Keep the previous tree until the rename succeeds.
async function publishDirectory(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 5) throw error;
      await delay(150 * 2 ** attempt);
    }
  }
}

async function buildPrivateModules() {
  // Build in isolation and retain the previous tree until the new one is verified.
  await fs.mkdir(path.join(app, 'resources'), { recursive: true });
  const lock = await fs.open(publishLock, 'wx');
  let temp;
  let stage;
  let retainBackup = false;
  try {
    if (await isPrepared()) return;
    temp = await fs.mkdtemp(path.join(tmpdir(), 'aiderdesk-cli-sdk-'));
    stage = await fs.mkdtemp(path.join(app, 'resources', '.sdk-stage-'));
    // Keep the full reviewed dependency graph for npm ci. The staging manifest below only selects what npm packs.
    await fs.copyFile(path.join(app, 'package.json'), path.join(temp, 'package.json'));
    await fs.copyFile(lockFile, path.join(temp, 'package-lock.json'));
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error('Prepare private SDKs using npm run prepare:sdks.');
    const runNpm = (args) => execFileSync(process.execPath, [npmCli, ...args], { cwd: temp, stdio: 'inherit' });
    runNpm(['ci', '--include=dev', '--ignore-scripts', '--no-audit']);
    await fs.mkdir(path.join(temp, 'patches'));
    await fs.copyFile(patch, path.join(temp, 'patches', patchName));
    execFileSync(process.execPath, [path.join(root, 'node_modules/patch-package/index.js'), '--error-on-fail'], { cwd: temp, stdio: 'inherit' });

    await checkSdkBehavior(temp);

    // Leave message validation enabled in upstream ai. Only the Requesty file adapter is patched.
    const dependencies = { ai: manifest.dependencies.ai, [requesty]: manifest.devDependencies[requesty] };
    const selection = { name: 'aiderdesk-private-sdks', version: '0.0.0', files: [], dependencies, bundleDependencies: Object.keys(dependencies) };
    await fs.writeFile(path.join(temp, 'package.json'), JSON.stringify(selection));
    runNpm(['pack', '--ignore-scripts', '--silent']);
    await extract({
      file: path.join(temp, 'aiderdesk-private-sdks-0.0.0.tgz'),
      cwd: stage,
      strip: 1,
      strict: true,
      filter: (name, entry) => name.startsWith('package/node_modules/') && ['File', 'Directory'].includes(entry.type),
    });
    const stagedModules = path.join(stage, 'node_modules');
    for (const name of Object.keys(dependencies)) {
      const actual = JSON.parse(await fs.readFile(path.join(stagedModules, name, 'package.json'), 'utf8'));
      if (actual.version !== dependencies[name]) throw new Error(`Incorrect private SDK version: ${name}`);
    }
    await stageTransformers(temp, stagedModules, manifest);
    const tree = await treeDigest(stagedModules, true);
    await fs.writeFile(path.join(stagedModules, receiptName), JSON.stringify({ ...inputDigests, tree }) + '\n');
    const backup = path.join(stage, 'previous');
    let hasBackup = false;
    try {
      await publishDirectory(privateModules, backup);
      hasBackup = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      await publishDirectory(stagedModules, privateModules);
    } catch (error) {
      if (hasBackup) {
        retainBackup = true;
        await publishDirectory(backup, privateModules);
        retainBackup = false;
      }
      throw error;
    }
  } finally {
    try {
      for (const [dir, parent] of [
        [retainBackup ? undefined : stage, path.join(app, 'resources')],
        [temp, tmpdir()],
      ]) {
        if (!dir) continue;
        if (path.dirname(await fs.realpath(dir)) !== (await fs.realpath(parent))) {
          throw new Error('The private SDK build directory changed during packaging.');
        }
        await fs.rm(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
      }
    } finally {
      await lock.close();
      await fs.unlink(publishLock);
    }
  }
}

if (process.argv.includes('--verify')) {
  if (
    await fs.stat(publishLock).then(
      () => true,
      (error) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      },
    )
  )
    throw new Error('The CLI is preparing its private SDKs.');
  if (!(await isPrepared())) throw new Error('Rebuild the CLI: private SDK files or inputs have changed.');
} else {
  await buildPrivateModules();
}
