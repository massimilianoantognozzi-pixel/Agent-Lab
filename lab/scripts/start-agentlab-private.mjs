import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { labRoot } from './prepare.mjs';

const nodeName = 'agentlab-remote-tailnet';
const relayName = 'agentlab-remote-relay';
const tag = 'com.agentlab.purpose=private-remote';
const tailImage = 'sha256:ed6480b33c6eb67c9cbd203ed42b9fb57e361986725b6856def71b7a3d9e276c';
const nodeImage = 'sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205';
const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 20000, windowsHide: true });
const requireSuccess = (result, message) => { if (result.status !== 0) throw Error(message); return result.stdout; };
const ensure = (name, argv, version) => {
  const exists = docker('container', 'inspect', name, '--format', '{{index .Config.Labels "com.agentlab.purpose"}} {{.State.Running}} {{index .Config.Labels "com.agentlab.relay-version"}}');
  if (exists.status === 0) {
    const [label, running, installed] = exists.stdout.trim().split(/\s+/);
    assert.equal(label, 'private-remote', 'Un contenitore estraneo usa il nome previsto.');
    if (!version || installed === version) {
      if (running !== 'true') requireSuccess(docker('start', name), 'Impossibile avviare ' + name);
      return;
    }
    requireSuccess(docker('rm', '--force', name), 'Impossibile aggiornare il relay Agent-Lab.');
  }
  const versionLabel = version ? ['--label', 'com.agentlab.relay-version=' + version] : [];
  requireSuccess(docker('run', '--detach', '--pull=never', '--name', name, '--label', tag, ...versionLabel, ...argv), 'Impossibile creare ' + name);
};

ensure(nodeName, [
  '--hostname', 'agent-lab', '--restart', 'unless-stopped', '--entrypoint', '/usr/local/bin/tailscaled',
  '--mount', 'type=volume,source=agentlab-remote-tailnet-state,target=/var/lib/tailscale',
  tailImage, '--tun=userspace-networking', '--state=/var/lib/tailscale/tailscaled.state', '--socket=/var/run/tailscale/tailscaled.sock',
]);
const relayFile = path.join(labRoot, 'scripts', 'agentlab-tailnet-relay.mjs');
const relayVersion = createHash('sha256').update(fs.readFileSync(relayFile)).digest('hex');
ensure(relayName, [
  '--network', 'container:' + nodeName, '--restart', 'unless-stopped',
  '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=65534:65534',
  '--pids-limit=64', '--memory=96m',
  '--mount', 'type=bind,source=' + relayFile + ',target=/relay.mjs,readonly',
  nodeImage, 'node', '/relay.mjs',
], relayVersion);
console.log('Istanza privata Agent-Lab e ponte locale avviati.');
