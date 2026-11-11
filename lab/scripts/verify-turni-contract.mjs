import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const workspace = process.argv[2] ?? '/workspace';
try {
  assert.deepEqual(Object.keys(os.networkInterfaces()).filter(name => name !== 'lo'), []);
  await assert.rejects(fs.writeFile(workspace + '/write-denied', 'probe'), { code: 'EROFS' });
  console.log('ISOLATION_PASS');
} catch (error) {
  console.log('ISOLATION_FAIL ' + (error.code ?? 'network'));
  process.exit(12);
}

const shifts = Object.freeze([
  Object.freeze({ name: 'Marta', active: true }),
  Object.freeze({ name: 'Luca', active: false }),
  Object.freeze({ name: 'Ada', active: true }),
]);
try {
  const { activeShifts } = await import(pathToFileURL(workspace + '/src/turni.ts').href);
  const labels = JSON.parse(await fs.readFile(workspace + '/src/labels.json', 'utf8'));
  assert.deepEqual(activeShifts(shifts), [shifts[0], shifts[2]]);
  assert.deepEqual(activeShifts([]), []);
  assert.equal(shifts.length, 3);
  assert.deepEqual(labels, { title: 'Turni', empty: 'Nessun turno attivo' });
  console.log('CONTRACT_PASS');
} catch (error) {
  console.log('CONTRACT_FAIL ' + (error.code ?? 'runtime'));
  process.exitCode = 1;
}
