import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareWorkflowEnvironment } from './workflow-environment.mjs';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agentlab-contratto-turni-'));
try {
  const data = path.join(directory, 'profilo');
  const pilot = { data, env: {} };
  const { repository } = await prepareWorkflowEnvironment(pilot, directory, { remote: false });
  const exampleFile = path.join(data, 'managed-workflow.example.json');
  const example = JSON.parse(await fs.readFile(exampleFile, 'utf8')).projects[0];
  const check = example.checks.find(({ id }) => id === 'regression-filter');
  assert.equal(check?.type, 'docker');
  assert.match(check.image, /^sha256:[a-f0-9]{64}$/);
  const verifier = 'checks/verify-turni.mjs';
  assert.ok(example.context.includes(verifier));
  assert.ok(!example.editable.includes(verifier));

  const run = (expected, label) => {
    const result = spawnSync('docker', [
      'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL',
      '--security-opt=no-new-privileges', '--user=65534:65534', '--pids-limit=64', '--memory=256m',
      '--mount', 'type=bind,source=' + repository + ',target=/workspace,readonly',
      check.image, ...check.args,
    ], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
    if (result.error) throw result.error;
    assert.equal(result.status, expected, label + ': ' + result.stderr);
    assert.match(result.stdout, /ISOLATION_PASS/);
    assert.ok(result.stdout.includes(expected === 0 ? 'CONTRACT_PASS' : 'CONTRACT_FAIL'));
    console.log(label + ' · exit ' + result.status);
  };

  run(1, 'Filtro iniziale invertito');
  const candidate = path.join(repository, 'src', 'turni.ts');
  await fs.writeFile(candidate, 'export const activeShifts = items => items.filter(entry => entry.active);');
  run(0, 'Implementazione equivalente con sintassi diversa');
  await fs.writeFile(candidate, 'export const activeShifts = items => items.filter(entry => entry.active).reverse();');
  run(1, 'Elementi corretti in ordine errato');

  const legacy = JSON.stringify({ version: 1, projects: [{ ...example, checks: [{ id: 'syntax', type: 'typescript', file: 'src/turni.ts' }] }] });
  const installedFile = path.join(data, 'managed-workflow.json');
  await fs.writeFile(exampleFile, legacy);
  await fs.writeFile(installedFile, legacy);
  await prepareWorkflowEnvironment(pilot, directory, { remote: false });
  assert.equal(await fs.readFile(exampleFile, 'utf8'), legacy);
  assert.equal(await fs.readFile(installedFile, 'utf8'), legacy);
  console.log('Configurazione preesistente preservata');
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
