import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { windows } from '../packaging/builder-identity.cjs';

export async function verifyWindowsIdentity(unpacked, projectRequire = createRequire(import.meta.url)) {
  const builderRequire = createRequire(projectRequire.resolve('electron-builder/package.json'));
  const { extractFile } = createRequire(builderRequire.resolve('app-builder-lib/package.json'))('@electron/asar');
  const resources = path.join(unpacked, 'resources');
  const asar = path.join(resources, 'app.asar');
  const metadata = JSON.parse(extractFile(asar, 'package.json'));
  const expected = windows.extraMetadata;
  assert.equal(metadata.name, expected.name);
  assert.equal(metadata.productName, windows.productName);
  assert.equal(metadata.appId, windows.appId);
  assert.equal(metadata.repository?.url, expected.repository.url);
  assert.equal(metadata.homepage, expected.homepage);
  assert.equal(metadata.description, expected.description);
  assert.equal(metadata.license, 'Apache-2.0');
  assert.ok((await fs.stat(path.join(unpacked, windows.productName + '.exe'))).isFile());
  for (const manifest of ['app-update.yml', 'dev-app-update.yml']) {
    await assert.rejects(fs.stat(path.join(resources, manifest)), (error) => error.code === 'ENOENT');
  }
  const license = await fs.readFile(path.join(resources, 'LICENSE-Agent-Lab.txt'));
  assert.deepEqual(extractFile(asar, 'LICENSE'), license);
  assert.match(license.toString('utf8'), /Apache License[\s\S]*Version 2\.0/);
  const notice = await fs.readFile(path.join(resources, 'NOTICE-Agent-Lab.txt'), 'utf8');
  assert.ok(notice.includes(expected.description) && notice.includes('AiderDesk 0.88.0') && notice.includes('Apache License 2.0'));
}

export async function verifyWindowsLayout(unpacked, projectRequire = createRequire(import.meta.url)) {
  await verifyWindowsIdentity(unpacked, projectRequire);
  const resources = path.join(unpacked, 'resources');
  const builderRequire = createRequire(projectRequire.resolve('electron-builder/package.json'));
  const { listPackage } = createRequire(builderRequire.resolve('app-builder-lib/package.json'))('@electron/asar');
  const asar = path.join(resources, 'app.asar');
  const entries = listPackage(asar).map((name) => name.replaceAll('\\', '/'));
  assert.deepEqual(entries.filter((name) => name.lastIndexOf('/') === 0).sort(), ['/LICENSE', '/node_modules', '/out', '/package.json']);
  for (const entry of ['/out/main/index.js', '/out/preload/index.js', '/out/renderer/index.html']) assert.ok(entries.includes(entry), entry);
  assert.ok(!entries.includes('/node_modules/cloudflared/bin/cloudflared.exe'), 'Il modulo contiene una seconda copia di Cloudflared.');
  for (const asset of [
    'icon.png',
    'connector/connector.py',
    'skills/agent-creator/SKILL.md',
    'skills/extension-creator/SKILL.md',
    'prompts/system-prompt.hbs',
    'win/probe.exe',
  ]) {
    assert.ok((await fs.stat(path.join(resources, asset))).isFile(), asset);
  }
}
