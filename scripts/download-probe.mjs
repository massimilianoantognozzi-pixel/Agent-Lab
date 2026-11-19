import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import AdmZip from 'adm-zip';
import { extract } from 'tar';

const version = 'v0.6.0-rc325';
const explicitResources = process.argv.find((argument) => argument.startsWith('--resources-dir='))?.slice('--resources-dir='.length);
const resources = path.resolve(explicitResources || process.env.RESOURCES_DIR || './resources');
const releaseUrl = `https://github.com/probelabs/probe/releases/download/${version}`;

// Archive digests from the pinned GitHub release and executable digests of those verified archives.
const platforms = [
  ['linux', 'x64', 'x86_64-unknown-linux-musl.tar.gz', 'linux-x64', 10572603, 'a94bc97a55e13533bc2cd35fbaf252215d78af4e86f281ed6ebfc07d58923b4e', 'd893720e44bf7509b179cb338d10b71709ac69c0ea1707ee8f921f468cf0407e'],
  ['linux', 'arm64', 'aarch64-unknown-linux-musl.tar.gz', 'linux-arm64', 9955452, '0931c22bc4dcd965f845de1b5f47164b48e119cc48a0b156ee0d286ec40aaa11', '90c6bf675fc3a66c89171558d8625bc102d163d20ab096f1d1cd0fb7d24930ff'],
  ['darwin', 'x64', 'x86_64-apple-darwin.tar.gz', 'macos-x64', 9553503, '28288b99e353454e10ba6cd1efee88c338b747f31d4a90bc74f1f01842e9e5f2', 'c16d0a6fae16b97efc86a0cd58da0e7e74468f445b9facd1b8aad32273957eba'],
  ['darwin', 'arm64', 'aarch64-apple-darwin.tar.gz', 'macos-arm64', 9452690, 'e9cc75331d013b637e25ede62026f47e28a8c518e2d8ace2990578cd414dbbf6', 'c2c3d788a53c3005029397a1ef575194f220fea8c5b43f09a5f333f822c74033'],
  ['win32', 'x64', 'x86_64-pc-windows-msvc.zip', 'win', 9634305, 'f3af0f0f838b35ba185a82fc842492d91472b437249e74adb608575a12e04e06', '4468c1874e236e976d25faa803f18b0f55f942f526335747acbce2dbf9a1c023'],
];

const digest = (data) => createHash('sha256').update(data).digest('hex');
const proxy = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
let proxyConfigured = false;

const readVerified = async (file, expected) => {
  try {
    if (!(await fs.lstat(file)).isFile()) {
      return undefined;
    }
    const data = await fs.readFile(file);
    return digest(data) === expected ? data : undefined;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

const download = async (file, size, checksum) => {
  if (proxy && !proxyConfigured) {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(proxy));
    proxyConfigured = true;
    console.log('Using the configured proxy for Probe downloads.');
  }
  const response = await fetch(`${releaseUrl}/${file}`, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok || !response.body) {
    throw new Error('Probe archive could not be downloaded.');
  }
  const parts = [];
  let received = 0;
  for await (const part of response.body) {
    received += part.byteLength;
    if (received > size) {
      throw new Error('Probe archive is larger than the pinned release.');
    }
    parts.push(part);
  }
  const data = Buffer.concat(parts);
  if (received !== size || digest(data) !== checksum) {
    throw new Error('Probe archive failed integrity verification.');
  }
  return data;
};

const publish = async (stage, destination, data) => {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(stage, 'verified-executable');
  await fs.writeFile(temporary, data, { flag: 'wx', mode: 0o755 });
  await fs.rename(temporary, destination);
};

const install = async ([platform, arch, suffix, target, size, archiveChecksum, binaryChecksum]) => {
  const filename = `probe-${version}-${suffix}`;
  const name = platform === 'win32' ? 'probe.exe' : 'probe';
  const destination = path.join(resources, target, name);
  const alias = platform !== 'win32' && platform === process.platform && arch === process.arch
    ? path.join(resources, platform === 'darwin' ? 'macos' : 'linux', name)
    : undefined;
  const cached = await readVerified(destination, binaryChecksum);
  if (cached && (!alias || (await readVerified(alias, binaryChecksum)))) {
    console.log(`Verified cached Probe for ${platform}/${arch}.`);
    return;
  }

  const parent = await fs.realpath(resources);
  const stage = await fs.mkdtemp(path.join(parent, '.probe-stage-'));
  try {
    let binary = cached;
    if (!binary) {
      const data = await download(filename, size, archiveChecksum);
      const folder = filename.replace(/\.(?:zip|tar\.gz)$/, '');
      const knownEntries = [name, `${folder}/${name}`];
      if (filename.endsWith('.zip')) {
        const zip = new AdmZip(data);
        // The pinned Windows release stores ZIP entry names with backslashes.
        const entry = zip.getEntries().find((item) => !item.isDirectory && knownEntries.includes(item.entryName.replaceAll('\\', '/')));
        binary = entry?.getData();
      } else {
        const archive = path.join(stage, 'release.tar.gz');
        await fs.writeFile(archive, data, { flag: 'wx' });
        await extract({ file: archive, cwd: stage, strict: true, filter: (entry, metadata) => metadata.type === 'File' && knownEntries.includes(entry) });
        for (const candidate of knownEntries) {
          binary = await readVerified(path.join(stage, candidate), binaryChecksum);
          if (binary) break;
        }
      }
      if (!binary || digest(binary) !== binaryChecksum) {
        throw new Error('Probe executable failed integrity verification.');
      }
      await publish(stage, destination, binary);
    }
    if (alias) {
      await publish(stage, alias, binary);
    }
    console.log(`Verified Probe for ${platform}/${arch}.`);
  } finally {
    if (path.dirname(await fs.realpath(stage)) === parent && path.basename(stage).startsWith('.probe-stage-')) {
      await fs.rm(stage, { recursive: true, force: true });
    }
  }
};

await fs.mkdir(resources, { recursive: true });
const currentOnly = process.argv.includes('--current-platform-only');
const targets = currentOnly ? platforms.filter(([platform, arch]) => platform === process.platform && arch === process.arch) : platforms;
if (!targets.length) {
  console.error('Probe is unavailable for this platform and architecture.');
  process.exitCode = 1;
}
for (const target of targets) {
  try {
    await install(target);
  } catch (error) {
    // Network and proxy errors can include authenticated URLs in their details.
    const category = /integrity|pinned release/.test(error.message) ? 'integrity verification failed' : 'installation or verification failed';
    console.error(`Probe ${target[0]}/${target[1]} ${category}.`);
    process.exitCode = 1;
  }
}
