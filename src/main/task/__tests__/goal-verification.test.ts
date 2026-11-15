import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test, vi } from 'vitest';

import {
  getNpmTestScriptAttribution,
  goalWorktreeRevision,
  hasEmptyNativeTestReport,
  hasEmptyNodeTestReport,
  isProjectVerificationCommand,
  resolveGoalVerificationScope,
} from '../goal-verification';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

test('rejects trivial shell evidence and accepts ordinary project check entry points', () => {
  expect(isProjectVerificationCommand('echo OK')).toBe(false);
  expect(isProjectVerificationCommand('npm test || echo OK')).toBe(false);
  expect(isProjectVerificationCommand('npm test --if-present')).toBe(false);
  expect(isProjectVerificationCommand('vitest --passWithNoTests')).toBe(false);
  expect(isProjectVerificationCommand('vitest list --no-color')).toBe(false);
  expect(isProjectVerificationCommand('vitest --no-color list')).toBe(false);
  expect(isProjectVerificationCommand('vitest run "--help"')).toBe(false);
  expect(isProjectVerificationCommand('vitest --version')).toBe(false);
  expect(isProjectVerificationCommand('vitest run --version')).toBe(true);
  expect(isProjectVerificationCommand('npm run test:node -- --no-color')).toBe(true);
  expect(isProjectVerificationCommand('python -m pytest tests/test_core.py')).toBe(true);
});

test('recognizes empty and all-skipped Node reports without rejecting a completed test', () => {
  expect(hasEmptyNodeTestReport('node --test', '# tests 0\n# suites 0\n# pass 0\n# fail 0\n')).toBe(true);
  expect(hasEmptyNodeTestReport('node --test fixture.test.js', 'ℹ tests 1\nℹ suites 0\nℹ pass 0\nℹ skipped 1\n')).toBe(true);
  expect(hasEmptyNodeTestReport('node --test', '# tests 1\n# suites 0\n# pass 1\n')).toBe(false);
  expect(hasEmptyNodeTestReport('node verify.cjs', '# tests 0\n# suites 0\n# pass 0\n')).toBe(false);
});

test.each(['--help', '-h', '--version', '-v'])('rejects Node test inspection via %s even though Node exits zero', (option) => {
  const invocation = `node --test ${option}`;
  const output = execFileSync(process.execPath, ['--test', option], { encoding: 'utf8' });
  expect(output.trim()).not.toBe('');
  expect(output).not.toMatch(/^(?:#|ℹ) tests /m);
  expect(hasEmptyNativeTestReport(invocation, output, '')).toBe(true);
  expect(hasEmptyNativeTestReport('npm test', `> fixture@1.0.0 test\n> ${invocation}\n\n${output}`, '')).toBe(true);
  expect(isProjectVerificationCommand(invocation)).toBe(false);
});

test('keeps Node test filters and paths containing inspection flags eligible', () => {
  expect(isProjectVerificationCommand('node --test --test-name-pattern "verify --help output" fixture.test.cjs')).toBe(true);
  expect(isProjectVerificationCommand('node --test -- --help')).toBe(true);
  expect(isProjectVerificationCommand('node --test fixture.test.cjs --help')).toBe(true);
  expect(hasEmptyNativeTestReport('node --test', 'Usage: node [options]\nℹ tests 1\nℹ suites 0\nℹ pass 1\n', '')).toBe(false);
});

test.each(['--listTests', '--list-tests', '--collectTests', '--showConfig', '--clearCache', '--help', '--version'])(
  'rejects Jest inspection with %s even when it exits successfully',
  (option) => {
    const command = `jest --runInBand ${option}`;
    expect(isProjectVerificationCommand(command)).toBe(false);
    expect(hasEmptyNativeTestReport(command, '', '')).toBe(true);
    expect(hasEmptyNativeTestReport('npm test', `> fixture@1.0.0 test\n> ${command}\n`, '')).toBe(true);
  },
);

test('keeps Jest executions with inspection disabled or flags used as paths eligible', () => {
  expect(isProjectVerificationCommand('jest --listTests=false --runInBand keep.test.js')).toBe(true);
  expect(isProjectVerificationCommand('jest --list-tests false --runInBand keep.test.js')).toBe(true);
  expect(isProjectVerificationCommand('jest -- --listTests')).toBe(true);
});

test('recognizes the Jest report when every test was skipped', () => {
  const skipped = 'Test Suites: 1 skipped, 0 of 1 total\r\nTests:       1 skipped, 1 total\r\nSnapshots:   0 total\r\n';
  const passed = 'Test Suites: 1 passed, 1 total\r\nTests:       1 passed, 1 total\r\n';
  const banner = '> fixture@1.0.0 test\n> jest --runInBand\n\n';
  expect(hasEmptyNativeTestReport('jest --runInBand', '', skipped)).toBe(true);
  expect(hasEmptyNativeTestReport('jest --runInBand', '', passed)).toBe(false);
  expect(hasEmptyNativeTestReport('npm test', banner, skipped)).toBe(true);
  expect(hasEmptyNativeTestReport('npm test', banner, passed)).toBe(false);
  expect(hasEmptyNativeTestReport('npm test', banner + skipped + '> fixture@1.0.0 posttest\n> jest --runInBand\n\n' + passed, '')).toBe(true);
  const pretest = '> fixture@1.0.0 pretest\n> node check-env.cjs\n\n';
  expect(hasEmptyNativeTestReport('npm test', pretest + banner, skipped)).toBe(true);
  expect(hasEmptyNativeTestReport('npm test', pretest + banner, passed)).toBe(true);
  expect(hasEmptyNativeTestReport('npm test', pretest + banner + passed, skipped)).toBe(false);
});

test('rejects Jest summaries with failures even when the runner exits zero', () => {
  const mixed = 'Test Suites: 1 failed, 1 total\nTests:       1 failed, 1 passed, 2 total\n';
  const failedSuite = 'Test Suites: 1 failed, 1 passed, 2 total\nTests:       1 passed, 1 total\n';
  const clean = 'Test Suites: 1 passed, 1 total\nTests:       1 passed, 1 skipped, 2 total\n';
  const npm = '> fixture@1.0.0 test\n> jest --runInBand\n\n';
  expect(hasEmptyNativeTestReport('jest --runInBand', '', mixed)).toBe(true);
  expect(hasEmptyNativeTestReport('jest --runInBand', '', failedSuite)).toBe(true);
  expect(hasEmptyNativeTestReport('npm test', npm, mixed)).toBe(true);
  expect(hasEmptyNativeTestReport('jest --runInBand', '', clean)).toBe(false);
});

test.each(['-h', 'discover --help'])('rejects unittest inspection with %s', (option) => {
  const command = `python -m unittest ${option}`;
  expect(isProjectVerificationCommand(command)).toBe(false);
  expect(hasEmptyNativeTestReport(command, '', '')).toBe(true);
  expect(hasEmptyNativeTestReport('npm test', `> fixture@1.0.0 test\n> ${command}\n`, '')).toBe(true);
});

test('rejects unittest help produced by abbreviated or combined options', () => {
  const usage = 'usage: python.exe -m unittest discover [-h] [-v] [-q]\r\n';
  expect(hasEmptyNativeTestReport('python -m unittest -qh', usage, '')).toBe(true);
  expect(hasEmptyNativeTestReport('python -m unittest discover --he', usage, '')).toBe(true);
  expect(hasEmptyNativeTestReport('npm test', '> fixture@1.0.0 test\n> python -m unittest discover --he\n\n' + usage, '')).toBe(true);
  const passing = '----------------------------------------------------------------------\r\nRan 1 test in 0.000s\r\n\r\nOK\r\n';
  expect(hasEmptyNativeTestReport('python -m unittest', usage, passing)).toBe(false);
});

test('recognizes empty unittest output without rejecting a passing test alongside skipped subtests', () => {
  const command = 'python -m unittest discover';
  const report = '----------------------------------------------------------------------\nRan 2 tests in 0.000s\n\nOK (skipped=2)\n';
  expect(hasEmptyNativeTestReport(command, '', 'ss\n' + report)).toBe(true);
  expect(hasEmptyNativeTestReport(command, 'ss\n' + report, '')).toBe(true);
  expect(hasEmptyNativeTestReport(command, '', '.ss\n' + report)).toBe(false);
  expect(hasEmptyNativeTestReport(command, '', report.replace('Ran 2 tests', 'Ran 0 tests').replace(' (skipped=2)', ''))).toBe(true);
  expect(hasEmptyNativeTestReport('python verify.py', '', 'ss\n' + report)).toBe(false);
});

test('distinguishes expected unittest failures from successful assertions', () => {
  const command = 'python -m unittest discover';
  const report = (count: number, outcomes: string) =>
    `----------------------------------------------------------------------\r\nRan ${count} test${count === 1 ? '' : 's'} in 0.000s\r\n\r\nOK (${outcomes})\r\n`;
  expect(hasEmptyNativeTestReport(command, '', 'x\r\n' + report(1, 'expected failures=1'))).toBe(true);
  expect(hasEmptyNativeTestReport(command, '', 'test_expected ... expected failure\r\n' + report(1, 'expected failures=1'))).toBe(true);
  expect(hasEmptyNativeTestReport(command, '', 'sx\r\n' + report(2, 'skipped=1, expected failures=1'))).toBe(true);
  expect(hasEmptyNativeTestReport(command, '', 'x.\r\n' + report(2, 'expected failures=1'))).toBe(false);
  expect(hasEmptyNativeTestReport(command, '', '.ssx\r\n' + report(3, 'skipped=2, expected failures=1'))).toBe(false);
});

test('requires a positive unittest status when the counts leave no success identifiable', () => {
  const report = '----------------------------------------------------------------------\nRan 2 tests in 0.000s\n\nOK (skipped=1, expected failures=1)\n';
  const verbose =
    "test_expected (test_profiles.Mixed.test_expected) ... expected failure\ntest_skip (test_profiles.Mixed.test_skip) ... skipped 'fixture control'\n\n";
  const successful = 'test_pass (test_profiles.Mixed.test_pass) ... ok\n';
  expect(hasEmptyNativeTestReport('python -m unittest -v', '', verbose + report)).toBe(true);
  expect(hasEmptyNativeTestReport('python -m unittest -q', '', report)).toBe(true);
  expect(hasEmptyNativeTestReport('python -m unittest -v', '', successful + verbose + report)).toBe(false);
  expect(hasEmptyNativeTestReport('python -m unittest', '', '.\nxs\n' + report)).toBe(true);
});

test('rejects pytest collection and inspection commands as automatically selected test verification', () => {
  expect(isProjectVerificationCommand('python -m pytest --collect-only')).toBe(false);
  expect(isProjectVerificationCommand('pytest --co -q')).toBe(false);
  expect(isProjectVerificationCommand('pytest --collectonly')).toBe(false);
  expect(isProjectVerificationCommand('pytest --markers')).toBe(false);
  expect(isProjectVerificationCommand('pytest --cache-show')).toBe(false);
  expect(isProjectVerificationCommand('pytest --cache-show=cache/*')).toBe(false);
  expect(isProjectVerificationCommand('pytest --setup-plan')).toBe(false);
  expect(isProjectVerificationCommand('pytest --setup-only')).toBe(false);
  expect(isProjectVerificationCommand('pytest --fixtures-per-test')).toBe(false);
  expect(isProjectVerificationCommand('pytest --version')).toBe(false);
  expect(isProjectVerificationCommand('pytest -VV')).toBe(false);
  expect(isProjectVerificationCommand('python -m pytest "--collect-only"')).toBe(false);
  expect(isProjectVerificationCommand("pytest '--version'")).toBe(false);
  expect(isProjectVerificationCommand('pytest -qh')).toBe(false);
  expect(isProjectVerificationCommand('pytest --setup-show test_core.py')).toBe(true);
});

test('keeps pytest selectors and positional paths containing an inspection flag eligible', () => {
  expect(isProjectVerificationCommand('pytest -k "a --collect-only b"')).toBe(true);
  expect(isProjectVerificationCommand("pytest -k 'a --collect-only b'")).toBe(true);
  expect(isProjectVerificationCommand('pytest -- --collect-only')).toBe(true);
  expect(isProjectVerificationCommand('pytest -kV')).toBe(true);
  expect(isProjectVerificationCommand('pytest -V')).toBe(true);
  expect(isProjectVerificationCommand('pytest -qV')).toBe(true);
});

test('uses the final pytest summary or an entirely skipped quiet run to detect missing successful tests', () => {
  const command = 'python -m pytest -q -p no:cacheprovider';
  const skipped = 'sx     [100%]\r\n1 skipped, 1 xfailed in 0.02s\r\n';
  expect(hasEmptyNativeTestReport(command, skipped, '')).toBe(true);
  expect(hasEmptyNativeTestReport('pytest.exe', '\x1b[33m==== 2 skipped, 1 warning in 0.01s ====\x1b[0m\n', '')).toBe(true);
  expect(hasEmptyNativeTestReport('pytest -qq', 'ss [ 50%]\nx [100%]\n', '')).toBe(true);
  expect(hasEmptyNativeTestReport('pytest -qq', '.s [ 50%]\nx [100%]\n', '')).toBe(false);
  expect(hasEmptyNativeTestReport(command, skipped + '\n1 passed, 1 skipped in 0.02s\n', '')).toBe(false);
  expect(hasEmptyNativeTestReport(command, '1 xpassed in 0.02s\n', '')).toBe(false);
  expect(hasEmptyNativeTestReport('python verify.py', skipped, '')).toBe(false);
});

test('uses the final Vitest test count for ordinary runs and the selected npm test script', () => {
  const skipped = ' Test Files  1 skipped (1)\r\n      Tests  2 skipped | 1 todo (3)\r\n';
  const passed = ' Test Files  1 passed (1)\r\n      Tests  1 passed | 2 skipped (3)\r\n';
  const lifecycle = (name: string, result: string) => `\n> fixture@1.0.0 ${name}\n> vitest run --no-color\n\n${result}`;
  expect(hasEmptyNativeTestReport('vitest run --no-color', skipped, '')).toBe(true);
  expect(hasEmptyNativeTestReport('vitest.cmd run', skipped + passed, '')).toBe(false);
  expect(hasEmptyNativeTestReport('npm test', lifecycle('test', skipped) + lifecycle('posttest', passed), '')).toBe(true);
  expect(hasEmptyNativeTestReport('npm test', lifecycle('test', passed) + lifecycle('posttest', skipped), '')).toBe(false);
  expect(hasEmptyNativeTestReport('npm run build', lifecycle('test', skipped), '')).toBe(false);
  expect(hasEmptyNativeTestReport('npm test', '> fixture@1.0.0 test\n> vitest list --no-color\n', '')).toBe(true);
  expect(hasEmptyNativeTestReport('npm test', '> fixture@1.0.0 test\n> vitest run --help\n', '')).toBe(true);
  expect(hasEmptyNativeTestReport('vitest --root suite --version', 'vitest/4.1.12 win32-x64 node-v24.14.0\n', '')).toBe(true);
});

test('recognizes Node reports from the selected npm test script', () => {
  const npmReport = '> fixture@1.0.0 test\n> node --test\n\nℹ tests 1\nℹ suites 0\nℹ pass 0\nℹ skipped 1\n';
  expect(hasEmptyNodeTestReport('npm test', npmReport)).toBe(true);
  expect(hasEmptyNodeTestReport('npm.cmd run test:unit', npmReport.replace(' test\n', ' test:unit\n'))).toBe(true);
  expect(hasEmptyNodeTestReport('npm test', npmReport.replace('ℹ pass 0', 'ℹ pass 1'))).toBe(false);
  expect(hasEmptyNodeTestReport('npm test', npmReport.replace('> node --test', '> node --test && node verify.cjs'))).toBe(false);
  expect(hasEmptyNodeTestReport('npm run build', npmReport)).toBe(false);
});

test('requires an identifiable outer npm lifecycle even when a silent command prints a nested heading', () => {
  const report = '> fixture@1.0.0 test\n> node --test && node cleanup.cjs\n# tests 1\n# suites 0\n# pass 1\n';
  expect(getNpmTestScriptAttribution('npm test', report)).toBe(true);
  expect(getNpmTestScriptAttribution('npm test', '# tests 1\n# suites 0\n# pass 1\n')).toBe(false);
  expect(getNpmTestScriptAttribution('npm test --silent', report)).toBe(false);
  expect(getNpmTestScriptAttribution('npm.cmd --loglevel silent run-script test', report)).toBe(false);
  expect(getNpmTestScriptAttribution('npm test --loglevel=notice --silent', report)).toBe(false);
  expect(getNpmTestScriptAttribution('npm test --silent --loglevel=notice', report)).toBe(true);
  expect(getNpmTestScriptAttribution('npm test -- --silent', report)).toBe(true);
  expect(getNpmTestScriptAttribution('npm "test" --silent', report)).toBe(false);
  expect(getNpmTestScriptAttribution('npm run "test:unit" --silent', report)).toBe(false);
  expect(getNpmTestScriptAttribution('npm run --silent test', report)).toBe(false);
  expect(getNpmTestScriptAttribution('npm --prefix checks run "test"', report)).toBe(true);
  expect(getNpmTestScriptAttribution('npm t -s', report)).toBe(false);
  expect(getNpmTestScriptAttribution('node --test', report)).toBeUndefined();
  expect(hasEmptyNativeTestReport('npm test', report.replace('# pass 1', '# pass 0'), '')).toBe(false);
});

test('keeps the selected npm test report separate from lifecycle hooks', () => {
  const zero = 'ℹ tests 1\nℹ suites 0\nℹ pass 0\nℹ skipped 1\n';
  const passed = 'ℹ tests 1\nℹ suites 0\nℹ pass 1\nℹ skipped 0\n';
  const lifecycle = (name: string, report: string) => `\n> fixture@1.0.0 ${name}\n> node --test\n\n${report}`;

  expect(hasEmptyNodeTestReport('npm test', lifecycle('test', zero) + lifecycle('posttest', passed))).toBe(true);
  expect(hasEmptyNodeTestReport('npm test', lifecycle('test', passed) + lifecycle('posttest', zero))).toBe(false);
  expect(hasEmptyNodeTestReport('npm test', lifecycle('pretest', zero) + lifecycle('test', passed))).toBe(false);
});

test('keeps ordinary diagnostics and other packages inside the selected npm test report', () => {
  const header = '> fixture@1.0.0 test:unit\n> node --test\n\n';
  const zero = 'ℹ tests 1\nℹ suites 0\nℹ pass 0\nℹ skipped 1\n';
  const passed = 'ℹ tests 1\nℹ suites 0\nℹ pass 1\nℹ skipped 0\n';
  expect(hasEmptyNodeTestReport('npm run test:unit', header + '> diagnostic\n> progress\n' + zero)).toBe(true);
  expect(hasEmptyNodeTestReport('npm run test:unit', header + '> other@1.0.0 posttest:unit\n> node verify.cjs\n' + zero)).toBe(true);
  expect(hasEmptyNodeTestReport('npm run test:unit', header + zero + '> fixture@1.0.0 posttest:unit\n> node --test\n' + passed)).toBe(true);
});

test('binds evidence to the bytes of tracked and untracked source inputs', async () => {
  const fixtureDir = path.resolve('lab/work/boundary-tests');
  await fs.mkdir(fixtureDir, { recursive: true });
  const repo = await fs.mkdtemp(path.join(fixtureDir, 'goal-verifier-'));
  execFileSync('git', ['init', '-q'], { cwd: repo, windowsHide: true });
  await fs.writeFile(path.join(repo, 'source.txt'), 'version 1');
  await fs.writeFile(path.join(repo, 'new-input.txt'), 'original');
  execFileSync('git', ['add', 'source.txt'], { cwd: repo, windowsHide: true });
  const verified = await goalWorktreeRevision(repo);
  expect(verified).toMatch(/^[0-9a-f]{64}$/);
  expect(await goalWorktreeRevision(repo)).toBe(verified);
  await fs.writeFile(path.join(repo, 'new-input.txt'), 'replaced');
  expect(await goalWorktreeRevision(repo)).not.toBe(verified);
  await fs.writeFile(path.join(repo, 'new-input.txt'), 'original');
  await fs.writeFile(path.join(repo, 'source.txt'), 'version 2');
  expect(await goalWorktreeRevision(repo)).not.toBe(verified);
});

test('qualifies an explicit verification directory only inside the real checkout', async () => {
  const base = path.resolve('lab/work/boundary-tests');
  await fs.mkdir(base, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(base, 'goal-cwd-'));
  const checkout = path.join(fixture, 'checkout');
  const child = path.join(checkout, 'tests');
  const unrelated = path.join(fixture, 'unrelated');
  await fs.mkdir(child, { recursive: true });
  await fs.mkdir(unrelated);
  await fs.symlink(unrelated, path.join(checkout, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const root = await fs.realpath(checkout);
  await expect(resolveGoalVerificationScope(checkout)).resolves.toEqual({ root, directory: root });
  await expect(resolveGoalVerificationScope(checkout, 'tests')).resolves.toEqual({ root, directory: await fs.realpath(child) });
  await expect(resolveGoalVerificationScope(checkout, 'linked')).resolves.toBeUndefined();
  await expect(resolveGoalVerificationScope(checkout, '../unrelated')).resolves.toBeUndefined();
  await expect(resolveGoalVerificationScope(checkout, 'missing')).resolves.toBeUndefined();
});
