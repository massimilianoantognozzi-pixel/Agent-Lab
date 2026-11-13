import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const run = promisify(execFile);
const database = ['db', 'kong', 'auth', 'rest', 'storage'].map((service) => `supabase_${service}_edilas-local`);
const access = 'edilas-private-access';
const gateway = 'edilas-private-web';
const owner = 'com.edilas.remote.workspace';

async function start() {
  const tools = await import(pathToFileURL(path.resolve('scripts/local-tools.mjs')).href);
  const { assertProject, assertExistingProjectOwnership, assertLoopbackBindings, docker, networkId, root } = tools;
  assertProject();
  assertExistingProjectOwnership();

  const state = (name) => {
    try {
      return JSON.parse(docker(['container', 'inspect', '--format', '{{json .State}}', name]));
    } catch {
      return undefined;
    }
  };
  const running = (name) => state(name)?.Running;
  const healthy = (name) => {
    const current = state(name);
    return current?.Running && (!current.Health || current.Health.Status === 'healthy');
  };
  if (!database.every(running)) {
    await run(process.execPath, [path.join(root, 'scripts', 'start-local.mjs')], { cwd: root, timeout: 310_000, windowsHide: true });
  }
  assertExistingProjectOwnership();
  assertLoopbackBindings();
  assert.ok(database.every(running), 'Lo stack locale Edilas è incompleto.');

  const privateContainer = (name) =>
    JSON.parse(docker(['container', 'inspect', '--format', '[{{json .Id}}, {{json .Config.Labels}}, {{json .HostConfig}}, {{json .State.Running}}]', name]));
  const [nodeId, nodeLabels, nodeHost, nodeRunning] = privateContainer(access);
  const [gatewayId, gatewayLabels, gatewayHost, gatewayRunning] = privateContainer(gateway);
  for (const [labels, host] of [[nodeLabels, nodeHost], [gatewayLabels, gatewayHost]]) {
    const workspace = labels?.[owner];
    assert.ok(typeof workspace === 'string' && path.isAbsolute(workspace), 'Provenienza del container privato Edilas assente.');
    assert.equal(path.resolve(workspace), path.resolve(root), 'Container privato estraneo al checkout Edilas.');
    assert.ok(!host.Privileged && Object.keys(host.PortBindings ?? {}).length === 0, 'Configurazione del container privato Edilas inattesa.');
  }
  assert.equal(nodeHost.NetworkMode, networkId, 'Il nodo privato Edilas usa una rete inattesa.');
  assert.equal(gatewayHost.NetworkMode, 'container:' + nodeId, 'Il gateway Edilas usa una rete inattesa.');
  assert.equal(gatewayHost.ReadonlyRootfs, true, 'Il gateway Edilas deve avere il filesystem in sola lettura.');
  if (!nodeRunning) docker(['start', nodeId]);
  if (!gatewayRunning) docker(['start', gatewayId]);

  const gatewayReady = () => {
    try {
      docker(
        ['exec', gatewayId, 'node', '--input-type=module', '-e',
          "const response = await fetch('http://127.0.0.1:8080/mobile/', { signal: AbortSignal.timeout(1500) }); if (response.status !== 403) process.exit(1);"],
        { timeout: 5000 },
      );
      return true;
    } catch {
      return false;
    }
  };
  const deadline = Date.now() + 35_000;
  while (Date.now() < deadline) {
    const ready = await fetch(tools.localUrl + '/auth/v1/health', { signal: AbortSignal.timeout(2_000) }).then((response) => response.ok, () => false);
    if (ready && database.every(healthy) && running(access) && gatewayReady()) return;
    await setTimeout(1000);
  }
  throw new Error('Lo stack Edilas non ha risposto dopo l’avvio.');
}

try {
  await start();
  console.log('Stack locale e container privati Edilas pronti.');
} catch (error) {
  // The child command may contain CLI diagnostics with credentials.
  console.error(error instanceof Error && !('cmd' in error) ? error.message.split('\n')[0] : 'Avvio di Edilas non riuscito.');
  process.exitCode = 1;
}
