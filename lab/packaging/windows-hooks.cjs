const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { assertWindowsConfig, windows } = require('./builder-identity.cjs');
const prune = require('../../scripts/before-pack.js').default;
const restore = require('../../scripts/after-pack.js').default;

exports.beforePack = async (context) => {
  if (context.packager.platform.nodeName === 'win32') {
    const { appInfo, config } = context.packager;
    assertWindowsConfig(config, context.packager.info.metadata);
    assert.equal(appInfo.id, windows.appId, 'AppId Windows non coerente con Agent-Lab.');
    assert.equal(appInfo.name, windows.extraMetadata.name, 'Nome pacchetto Windows non coerente con Agent-Lab.');
    assert.equal(appInfo.productName, windows.productName);
    assert.equal(appInfo.productFilename, windows.productName);
  }
  return prune(context);
};

exports.afterPack = async (context) => {
  await restore(context);
  if (context.packager.platform.nodeName === 'win32') {
    // Copy after packing: extraResources with the same source would remove LICENSE from the ASAR.
    await fs.copyFile(path.join(context.packager.projectDir, 'LICENSE'), path.join(context.appOutDir, 'resources', 'LICENSE-Agent-Lab.txt'));
    const { verifyWindowsIdentity } = await import('../scripts/windows-package-layout.mjs');
    await verifyWindowsIdentity(context.appOutDir);
  }
};

exports.artifactBuildStarted = async (event) => {
  if (!/nsis/i.test(event.targetPresentableName)) return;
  const args = process.argv.slice(2);
  const index = args.findIndex((arg) => /^(?:--prepackaged|--pd|-pd)(?:=|$)/.test(arg));
  if (index < 0) return;
  const source = args[index].includes('=') ? args[index].slice(args[index].indexOf('=') + 1) : args[index + 1];
  if (!source) throw new Error('Percorso del pacchetto Windows preconfezionato mancante.');
  const { verifyWindowsIdentity } = await import('../scripts/windows-package-layout.mjs');
  await verifyWindowsIdentity(path.resolve(source));
};
