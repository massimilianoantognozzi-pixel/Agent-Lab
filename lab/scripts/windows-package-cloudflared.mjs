import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { verifyWindowsLayout } from './windows-package-layout.mjs';

// Upstream release checksums: https://github.com/cloudflare/cloudflared/releases/tag/2026.11.1
const release = '2026.11.1';
const size = 55483112;
const sha256 = '341deda3db5ec498a0482254d6c38c0b7cf01a30c37bb5dd95d2216d08955e35';
export const cloudflaredResource = 'app.asar.unpacked/node_modules/cloudflared/bin/cloudflared.exe';

export async function verifyWindowsCloudflared(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.size !== size) throw new Error('Dimensione Cloudflared Windows diversa dal rilascio verificato.');
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  if (hash.digest('hex') !== sha256) throw new Error('SHA-256 Cloudflared Windows diverso dal rilascio verificato.');
}

export async function stageWindowsCloudflared(installed, destination) {
  // Reuse the installed copy only if it matches. A mismatching file is left in its original location.
  const local = await fs.lstat(installed).catch((error) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (local?.isFile() && local.size === size) {
    await fs.copyFile(installed, destination, fs.constants.COPYFILE_EXCL);
    try {
      await verifyWindowsCloudflared(destination);
      return;
    } catch {
      await fs.unlink(destination);
    }
  }
  const url = `https://github.com/cloudflare/cloudflared/releases/download/${release}/cloudflared-windows-amd64.exe`;
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok || !response.body) throw new Error(`Download Cloudflared ${release} fallito (HTTP ${response.status}).`);
  let received = 0;
  const limit = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > size) callback(new Error('Cloudflared supera la dimensione prevista.'));
      else callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(destination, { flags: 'wx' }));
  await verifyWindowsCloudflared(destination);
}

export async function packageWindowsDistribution(root, output, dirOnly, verifyRuntime) {
  const require = createRequire(path.join(root, 'package.json'));
  const yaml = require('yaml');
  const config = yaml.parse(await fs.readFile(path.join(root, 'electron-builder.yml'), 'utf8'));
  const out = path.join(root, 'out');
  const stage = await fs.mkdtemp(path.join(out, '.windows-package-'));
  try {
    const binary = path.join(stage, 'cloudflared.exe');
    await stageWindowsCloudflared(path.join(root, 'node_modules/cloudflared/bin/cloudflared.exe'), binary);
    // Rebuild was completed by the caller. Only the pinned file is copied to the path used by the tunnel manager.
    config.npmRebuild = false;
    config.directories.output = output;
    config.files = [...config.files, '!node_modules/cloudflared/bin/cloudflared.exe'];
    config.win.extraResources = [...(config.win.extraResources ?? []), { from: binary, to: cloudflaredResource }];
    const file = path.join(stage, 'electron-builder.yml');
    await fs.writeFile(file, yaml.stringify(config));
    const args = [path.join(root, 'node_modules/electron-builder/cli.js'), '--projectDir', root, '--win', '--x64'];
    const options = { cwd: root, stdio: 'inherit', windowsHide: true };
    const common = ['--config', file, '--publish', 'never'];
    execFileSync(process.execPath, [...args, '--dir', ...common], options);
    const unpacked = path.join(output, 'win-unpacked');
    await verifyWindowsLayout(unpacked, require);
    await verifyWindowsCloudflared(path.join(unpacked, 'resources', cloudflaredResource));
    if (verifyRuntime) await verifyRuntime(unpacked);
    if (!dirOnly) {
      execFileSync(process.execPath, [...args, '--prepackaged', unpacked, ...common], options);
    }
    console.log(`Cloudflared Windows ${release} verificato, SHA-256 ${sha256}.`);
  } finally {
    if (path.dirname(await fs.realpath(stage)) !== (await fs.realpath(out))) throw new Error('Percorso di confezionamento Windows cambiato.');
    await fs.rm(stage, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}
