import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { labRoot } from './prepare.mjs';

const profile = path.join(labRoot, 'profile', 'workflow-pilot');
const evidence = JSON.parse(await fs.readFile(path.join(profile, 'data', 'workflow-environment-live-delivery.json'), 'utf8'));
const original = path.join(profile, 'repository-example');
const candidate = evidence.candidate;
const bench = path.join(profile, 'benchmark-normal');
const checker = path.join(labRoot, 'scripts', 'verify-turni-contract.mjs');
const inspect = spawnSync('docker', ['image', 'inspect', 'node:24-bookworm-slim', '--format', '{{.Id}}'], { encoding: 'utf8', windowsHide: true });
assert.equal(inspect.status, 0, 'Immagine Node locale indisponibile.');
const image = inspect.stdout.trim();
assert.match(image, /^sha256:[0-9a-f]{64}$/);
const work = await fs.mkdtemp(path.join(labRoot, 'work', 'workflow-docker-'));
const results = [];
try {
  for (const [label, root, expected] of [['originale', original, 1], ['governato', candidate, 0], ...(process.argv.includes('--normal') ? [['normale', bench, undefined]] : [])]) {
    const fixture = path.join(work, label);
    await fs.mkdir(path.join(fixture, 'src'), { recursive: true });
    for (const name of ['turni.ts', 'labels.json']) {
      await fs.copyFile(path.join(root, 'src', name), path.join(fixture, 'src', name));
    }
    const proc = spawnSync('docker', [
      'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL',
      '--security-opt=no-new-privileges', '--user=65534:65534', '--pids-limit=64', '--memory=256m',
      '--mount', 'type=bind,source=' + fixture + ',target=/workspace,readonly',
      '--mount', 'type=bind,source=' + checker + ',target=/verify.mjs,readonly',
      image, 'node', '/verify.mjs',
    ], { encoding: 'utf8', timeout: 25_000, windowsHide: true });
    const report = proc.stdout?.trim() ?? '';
    if (proc.error || !report.includes('ISOLATION_PASS')) throw Error('Docker: isolamento non verificato per ' + label + ' (exit ' + proc.status + ').');
    if (expected !== undefined) assert.equal(proc.status, expected, label + ': ' + report);
    assert.ok(proc.status === 0 ? report.includes('CONTRACT_PASS') : report.includes('CONTRACT_FAIL'));
    const result = { label, contract: proc.status === 0 ? 'PASS' : 'FAIL', isolamento: 'PASS', exitCode: proc.status };
    results.push(result);
    console.log(JSON.stringify(result));
  }
  await fs.writeFile(path.join(profile, 'data', 'workflow-docker-evidence.json'), JSON.stringify({ image, results }, null, 2));
} finally {
  await fs.rm(work, { recursive: true, force: true });
}
