const assert = require('node:assert/strict');
const path = require('node:path');

const fork = 'https://github.com/massimilianoantognozzi-pixel/Agent-Lab';
const appId = 'io.github.massimilianoantognozzi-pixel.agentlab';
const productName = 'Agent-Lab';
const credit = 'Agent-Lab, basato su AiderDesk';

// AppInfo.name and productName are global to one electron-builder invocation.
// Windows needs both to differ from the original app when NSIS chooses the install directory and registry key.
const windows = {
  appId,
  productName,
  publish: null,
  copyright: 'Agent-Lab, basato su AiderDesk 0.88.0 — Apache License 2.0',
  extraMetadata: {
    name: 'agent-lab',
    productName,
    appId,
    description: credit,
    homepage: fork,
    repository: { type: 'git', url: fork + '.git' },
    bugs: { url: fork + '/issues' },
    license: 'Apache-2.0',
    author: { name: '' },
  },
};
const original = {
  appId: 'com.hotovo.aider-desk',
  productName: 'aider-desk',
  publish: { provider: 'github', releaseType: 'draft', vPrefixedTagName: true, publishAutoUpdate: true },
};

function selectIdentity(args = process.argv.slice(2), host = process.platform) {
  const flags = args.map((arg) => arg.split('=')[0]);
  const short = flags.filter((arg) => /^-[wmol]+$/.test(arg)).join('');
  const win = flags.includes('--win') || flags.includes('--windows') || short.includes('w');
  const other = flags.some((arg) => ['--mac', '--macos', '--linux'].includes(arg)) || /[mol]/.test(short);
  if (win && other) throw new Error('Genera Windows e gli altri sistemi in invocazioni separate: i pacchetti usano identità diverse.');
  return structuredClone(win || (!other && host === 'win32') ? windows : original);
}

function assertWindowsConfig(config, metadata) {
  assert.equal(config.appId, appId, 'AppId Windows diverso da Agent-Lab.');
  assert.equal(config.win?.appId ?? config.appId, appId);
  assert.equal(config.productName, productName);
  assert.equal(config.win?.executableName ?? config.executableName, productName);
  assert.equal(config.win?.publish, null, 'La confezione Windows locale richiede publish: null.');
  assert.equal(config.publish, null);
  assert.equal(config.nsis?.shortcutName, 'Agent-Lab Desktop');
  assert.equal(config.nsis?.uninstallDisplayName, productName);
  assert.equal(config.nsis?.artifactName, 'Agent-Lab-${version}-setup.${ext}');
  if (config.nsis.guid) assert.equal(config.nsis.guid.toLowerCase(), 'd0db30c5-c14a-5718-a749-53b3584ca86b');
  if (config.nsis.publish !== undefined) assert.equal(config.nsis.publish, null);
  assert.equal(metadata.name, windows.extraMetadata.name);
  assert.equal(metadata.productName, productName);
  assert.equal(metadata.appId, appId);
  assert.equal(metadata.description, credit);
  assert.equal(metadata.repository?.url, windows.extraMetadata.repository.url);
}

module.exports = () => (path.basename(process.argv[1] || '') === 'build-windows-package.mjs' ? structuredClone(windows) : selectIdentity());
module.exports.assertWindowsConfig = assertWindowsConfig;
module.exports.windows = windows;
module.exports.selectIdentity = selectIdentity;
