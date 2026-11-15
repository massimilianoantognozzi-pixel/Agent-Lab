import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { simpleGit } from 'simple-git';

import { getAllFiles } from '@/utils/file-system';
import { expandTilde } from '@/agent/utils';

export const NATIVE_EMPTY_TEST_REPORT = Symbol('native-empty-test-report');
export const NATIVE_NPM_TEST_SCRIPT_IDENTIFIED = Symbol('native-npm-test-script-identified');
export const NATIVE_VERIFICATION_RESEARCH_QUERY = Symbol('native-verification-research-query');

const shellOperators = /[;&|><`$\r\n]/;
const pytestCommand = /^(?:pytest(?:\.exe)?|python(?:3(?:\.\d+)?)?(?:\.exe)?[ \t]+-m[ \t]+pytest)(?=[ \t]|$)/i;
const pytestInspectionFlag =
  /^(?:-[qvVhlxs]*h[qvVhlxs]*|--(?:collect-only|collectonly|co|setup-only|setup-plan|fixtures|fixtures-per-test|funcargs|markers|help)|--cache-show(?:=.*)?)$/;
const pythonUnittestCommand = /^python(?:3(?:\.\d+)?)?(?:\.exe)?[ \t]+-m[ \t]+unittest(?=[ \t]|$)/i;
const vitestCommand = /^vitest(?:\.cmd|\.exe)?(?=[ \t]|$)/i;
const jestCommand = /^jest(?:\.cmd|\.exe)?(?=[ \t]|$)/i;
const nodeTestCommand = /^node(?:\.exe)?[ \t]+--test(?=[ \t]|$)/i;
const nodeInspectionFlag = /^(?:-h|-v|--help|--version)$/;

const commandWords = (invocation: string): string[] =>
  (invocation.match(/(?:[^\s"']|"[^"\r\n]*"|'[^'\r\n]*')+/g) ?? []).map((word) => word.replace(/["']/g, ''));

const commandOptions = (invocation: string, prefixLength: number): string[] => {
  const words = commandWords(invocation).slice(prefixLength);
  const separator = words.indexOf('--');
  return separator === -1 ? words : words.slice(0, separator);
};

const isUnittestInspectionCommand = (invocation: string): boolean => commandOptions(invocation, 3).some((arg) => arg === '-h' || arg === '--help');

const isJestInspectionCommand = (invocation: string): boolean => {
  const args = commandOptions(invocation, 1);
  return args.some((arg, index) => {
    const [flag, inline] = arg.split('=', 2);
    return /^(?:-[hv]|--(?:help|version|list-?tests|collect-?tests|show-?config|clear-?cache))$/i.test(flag) && (inline ?? args[index + 1]) !== 'false';
  });
};

const hasPytestInspectionFlag = (invocation: string): boolean => {
  const options = commandWords(invocation);
  if (options.includes('--version')) {
    return true;
  }
  // A single -V can still run tests. Repeated -V selects the verbose version report.
  let shortVersions = 0;
  for (const option of options) {
    if (option === '--') {
      break;
    }
    if (pytestInspectionFlag.test(option)) {
      return true;
    }
    if (/^-[qvVlxs]+$/.test(option)) {
      shortVersions += option.split('V').length - 1;
    }
  }
  return shortVersions > 1;
};

const isVitestInspectionCommand = (invocation: string): boolean => {
  const options = commandOptions(invocation, 1).filter((arg) => arg !== '--color' && arg !== '--no-color');
  return (
    options.includes('-h') ||
    options.includes('--help') ||
    options[0] === 'list' ||
    (options.length > 0 && options.every((arg) => arg === '--version' || arg === '-v'))
  );
};

// Common project verification entry points for goals without a user-named command.
export const isProjectVerificationCommand = (command: string): boolean => {
  if (shellOperators.test(command) || /(?:^|\s)--(?:if-present|passWithNoTests|pass-with-no-tests|allow-no-tests|no-tests-ok)(?:\s|=|$)/i.test(command)) {
    return false;
  }
  const invocation = command.trim();
  if (pytestCommand.test(invocation)) {
    return !hasPytestInspectionFlag(invocation);
  }
  if (vitestCommand.test(invocation)) {
    return !isVitestInspectionCommand(invocation);
  }
  if (jestCommand.test(invocation)) {
    return !isJestInspectionCommand(invocation);
  }
  if (pythonUnittestCommand.test(invocation)) {
    return !isUnittestInspectionCommand(invocation);
  }
  if (nodeTestCommand.test(invocation)) {
    return !nodeInspectionFlag.test(commandWords(invocation)[2] ?? '');
  }
  if (isNpmTestVerification(invocation)) {
    return true;
  }
  return /^(?:(?:npm|pnpm|yarn|bun)(?:\.cmd)? (?:run )?(?:test|check|lint|typecheck|build)(?=[:\s]|$)|(?:ctest|ruff check|cargo test|go test|dotnet test|mvn (?:test|verify)|gradle test)(?=\s|$))/i.test(
    invocation,
  );
};

export const verificationResearchQuery = (command: string): string | undefined => {
  if (!isProjectVerificationCommand(command)) {
    return undefined;
  }
  const invocation = command.trim();
  if (/^node\s+--test\b/i.test(invocation)) {
    return 'Node.js test runner failure diagnostics official documentation';
  }
  if (/^(?:npm|pnpm|yarn|bun)(?:\.cmd)?\s+(?:run\s+)?typecheck\b/i.test(invocation)) {
    return 'npm typecheck script compiler diagnostics official documentation';
  }
  if (pytestCommand.test(invocation) || pythonUnittestCommand.test(invocation)) {
    return 'Python test failure debugging official documentation';
  }
  return 'software regression tests debugging strategy official documentation';
};

const npmOptionsWithValue = new Set(['--prefix', '-w', '--workspace', '--userconfig', '--globalconfig', '--script-shell', '--cache', '--registry']);

const parseNpmTestInvocation = (invocation: string): { name: string; silent: boolean } | undefined => {
  const args = commandWords(invocation);
  if (!/^npm(?:\.cmd)?$/i.test(args[0]?.split(/[\\/]/).at(-1) ?? '')) {
    return undefined;
  }
  const positional: string[] = [];
  let silent = false;
  for (let index = 1; index < args.length && args[index] !== '--'; index++) {
    const arg = args[index];
    if (arg === '--silent' || arg === '-s') {
      silent = true;
    } else if (arg === '--loglevel') {
      silent = args[++index] === 'silent';
    } else if (arg.startsWith('--loglevel=')) {
      silent = arg === '--loglevel=silent';
    } else if (['-q', '--quiet', '-d', '--dd', '--ddd', '--verbose'].includes(arg)) {
      silent = false;
    } else if (npmOptionsWithValue.has(arg)) {
      index++;
    } else if (!arg.startsWith('-') && positional.length < 2) {
      positional.push(arg);
    }
  }
  const [action, script] = positional;
  if (action === 't' || action === 'tst') {
    return { name: 'test', silent };
  }
  const name = action === 'run' || action === 'run-script' ? script : action === 'test' ? action : undefined;
  return name && /^test(?::[\w:-]+)?$/i.test(name) ? { name, silent } : undefined;
};

export const isNpmTestVerification = (command: string): boolean => parseNpmTestInvocation(command) !== undefined;

const selectTestReport = (invocation: string, stdout: unknown): { invocation: string; output: string; hasOtherScripts?: boolean } | undefined => {
  if (typeof stdout !== 'string') {
    return undefined;
  }
  const output = stripVTControlCharacters(stdout);
  const npmTest = parseNpmTestInvocation(invocation);
  if (!npmTest) {
    return { invocation, output };
  }
  // A nested command can print an npm banner even when the outer lifecycle is silent.
  if (npmTest.silent) {
    return undefined;
  }
  const scripts = [...output.matchAll(/^> (?:(\S+@\S+)[ \t]+)?(\S+)\r?\n> ([^\r\n]+)\r?$/gm)];
  const targets = scripts.filter(([, , name]) => name === npmTest.name);
  if (targets.length !== 1) {
    return undefined;
  }
  const [target] = targets;
  const [, packageId, scriptName, script] = target;
  const posttest = scripts.find((entry) => entry.index > target.index && entry[1] === packageId && entry[2] === 'post' + scriptName);
  return { invocation: script, output: output.slice(target.index + target[0].length, posttest?.index), hasOtherScripts: scripts.length > 1 };
};

export const getNpmTestScriptAttribution = (command: string, stdout: unknown): boolean | undefined =>
  isNpmTestVerification(command) ? selectTestReport(command.trim(), stdout) !== undefined : undefined;

const hasEmptyNodeReport = (output: string): boolean => {
  // Node's spec and TAP reporters can exit zero even when nothing passed.
  const summaries = [...output.matchAll(/^(?:#|ℹ)[ \t]+tests[ \t]+\d+\r?\n(?:#|ℹ)[ \t]+suites[ \t]+\d+\r?\n(?:#|ℹ)[ \t]+pass[ \t]+(\d+)\r?$/gm)];
  const passed = summaries.at(-1)?.[1];
  if (passed !== undefined) {
    return passed === '0';
  }
  const trimmed = output.trim();
  return /^Usage: node \[options\]/.test(trimmed) || /^v\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(trimmed);
};

export const hasEmptyNodeTestReport = (command: string, stdout: unknown): boolean => {
  const report = selectTestReport(command.trim(), stdout);
  return (
    !!report &&
    nodeTestCommand.test(report.invocation) &&
    (!isNpmTestVerification(command) || !shellOperators.test(report.invocation)) &&
    hasEmptyNodeReport(report.output)
  );
};

const hasEmptyVitestSummary = (output: string): boolean => {
  const summaries = [...output.matchAll(/^[ \t]*Test Files[ \t]+[^\r\n]+\r?\n[ \t]*Tests[ \t]+([^\r\n]+?)[ \t]+\(\d+\)[ \t]*\r?$/gm)];
  const counts = summaries.at(-1)?.[1].split(' | ');
  return !!counts && counts.every((entry) => /^\d+ (?:skipped|todo)$/.test(entry));
};

const hasEmptyPytestReport = (stdout: unknown): boolean => {
  if (typeof stdout !== 'string') {
    return false;
  }
  const output = stripVTControlCharacters(stdout).trim();
  const lastLine = output.split(/\r?\n/).at(-1)?.trim() ?? '';
  const summary = /^(?:=+ +)?(\d+ [a-z ]+(?:, \d+ [a-z ]+)*) in \d+(?:\.\d+)?s(?: \(\d+:\d{2}:\d{2}\))?(?: +=+)?$/.exec(lastLine);
  if (summary) {
    const counts = summary[1].split(', ');
    return (
      counts.some((entry) => /^[1-9]\d* (?:skipped|xfailed|subtests skipped)$/.test(entry)) &&
      counts.every((entry) => /^\d+ (?:skipped|xfailed|subtests skipped|warnings?|deselected)$/.test(entry))
    );
  }
  // In extra-quiet output, every progress row must show only skips or expected failures.
  return /^(?:[sx]+[ \t]+\[[ \t]*\d{1,3}%\][ \t]*\r?\n)*[sx]+[ \t]+\[100%\]$/.test(output);
};

const readJestReportRejection = (output: string): boolean | undefined => {
  const reports = [...output.matchAll(/^(Test Suites|Tests):[ \t]+((?:\d+ (?:passed|failed|skipped|todo), )*(?:\d+ of )?\d+ total)\r?$/gm)];
  const suites = reports.findLast(([, section]) => section === 'Test Suites')?.[2] ?? '';
  const tests = reports.findLast(([, section]) => section === 'Tests')?.[2] ?? '';
  // Jest can be configured to return zero even when a test or a test suite failed.
  if (/[1-9]\d* failed\b/.test(suites) || /[1-9]\d* failed\b/.test(tests)) {
    return true;
  }
  if (tests) {
    return !/[1-9]\d* passed\b/.test(tests);
  }
  return /^No tests found, exiting with code 0(?:\r?\n|$)/.test(output.trimStart()) ? true : undefined;
};

const readUnittestReportRejection = (output: string): boolean | undefined => {
  const summary =
    /(?:^|\r?\n)-{70}\r?\nRan (\d+) tests? in \d+(?:\.\d+)?s\r?\n\r?\n(?:OK(?: \(((?:skipped|expected failures)=\d+(?:, (?:skipped|expected failures)=\d+)*)\))?|NO TESTS RAN)[ \t\r\n]*$/.exec(
      output,
    );
  if (!summary) {
    return /^usage:[ \t]+(?:\S+[ \t]+-m[ \t]+)?unittest\b/i.test(output.trimStart()) ? true : undefined;
  }
  const ran = Number(summary[1]);
  const outcomes = summary[2] ?? '';
  const skipped = Number(/\bskipped=(\d+)(?:,|$)/.exec(outcomes)?.[1] ?? 0);
  const expectedFailures = Number(/\bexpected failures=(\d+)(?:,|$)/.exec(outcomes)?.[1] ?? 0);
  if (ran === 0 || expectedFailures === ran) {
    return true;
  }
  if (skipped + expectedFailures < ran) {
    return false;
  }
  // Skipped subtests can inflate the count. In that case, look for an actual success in the detailed report.
  const details = output.slice(0, summary.index);
  const progress = details.trimEnd().split(/\r?\n/).at(-1) ?? '';
  const compactPass = progress.length >= ran && /^[.sx]*\.[.sx]*$/.test(progress);
  const verbosePass = /^\S[^\r\n]* \([^\r\n]+\) \.\.\. ok[ \t]*\r?$/m.test(details);
  return !compactPass && !verbosePass;
};

export const hasEmptyNativeTestReport = (command: string, stdout: unknown, stderr: unknown): boolean => {
  const rawInvocation = command.trim();
  const report = selectTestReport(rawInvocation, stdout);
  const npm = isNpmTestVerification(rawInvocation);
  if (npm && (!report || shellOperators.test(report.invocation))) {
    return false;
  }
  const invocation = report?.invocation ?? rawInvocation;
  const output = report?.output ?? '';
  if (nodeTestCommand.test(invocation)) {
    return nodeInspectionFlag.test(commandWords(invocation)[2] ?? '') || hasEmptyNodeReport(output);
  }
  if (shellOperators.test(invocation)) {
    return false;
  }
  if (pytestCommand.test(invocation)) {
    return hasEmptyPytestReport(output);
  }
  if (vitestCommand.test(invocation)) {
    return isVitestInspectionCommand(invocation) || /^vitest\/\S+ [\w-]+ node-v\S+$/.test(output.trim()) || hasEmptyVitestSummary(output);
  }
  const reportCannotVerify = (readReport: (stream: string) => boolean | undefined): boolean => {
    const stdoutVerdict = readReport(output);
    const stderrVerdict = typeof stderr === 'string' ? readReport(stripVTControlCharacters(stderr)) : undefined;
    // npm's separate stderr has no lifecycle headings. An observed report there
    // cannot verify the selected script when other scripts ran as well.
    if (report?.hasOtherScripts) {
      return stdoutVerdict ?? stderrVerdict !== undefined;
    }
    return (stderrVerdict ?? stdoutVerdict) === true;
  };
  if (jestCommand.test(invocation)) {
    return isJestInspectionCommand(invocation) || reportCannotVerify(readJestReportRejection);
  }
  return pythonUnittestCommand.test(invocation) && (isUnittestInspectionCommand(invocation) || reportCannotVerify(readUnittestReportRejection));
};

const privateOrGenerated = /(?:^|\/)(?:node_modules|\.git|\.aider-desk|\.agent-lab|\.env[^/]*|dist|coverage|__pycache__)(?:\/|$)/i;

export type GoalVerificationScope = { root: string; directory: string };

export const resolveGoalVerificationScope = async (checkout: string, directory = '.'): Promise<GoalVerificationScope | undefined> => {
  try {
    const [root, workingDirectory] = await Promise.all([fs.realpath(checkout), fs.realpath(path.resolve(checkout, expandTilde(directory)))]);
    const relative = path.relative(root, workingDirectory);
    if (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && (await fs.stat(workingDirectory)).isDirectory()) {
      return { root, directory: workingDirectory };
    }
    return undefined;
  } catch {
    return undefined;
  }
};

export const verificationWorktreeFiles = async (
  root: string,
  allowSubdirectory = false,
): Promise<{ repository: string; relativeFiles: string[] } | undefined> => {
  const repository = await fs.realpath(root);
  const git = simpleGit(repository);
  const gitRepo = await git.checkIsRepo();
  if (gitRepo && !allowSubdirectory && path.relative(repository, path.normalize((await git.revparse(['--show-toplevel'])).trim()))) {
    return undefined;
  }
  const names = gitRepo ? (await git.raw(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])).split('\0') : await getAllFiles(repository, false);
  const relativeFiles = [...new Set(names.filter((name) => name && !privateOrGenerated.test(name)))].sort();
  return { repository, relativeFiles };
};

export const goalWorktreeRevision = async (root: string): Promise<string | undefined> => {
  const checkout = await verificationWorktreeFiles(root);
  if (!checkout) {
    return undefined;
  }
  const { repository, relativeFiles } = checkout;
  if (!relativeFiles.length) {
    return undefined;
  }
  const revision = createHash('sha256');
  for (const relative of relativeFiles) {
    const absolute = path.resolve(repository, relative);
    const inside = path.relative(repository, absolute);
    if (path.isAbsolute(inside) || inside === '..' || inside.startsWith(`..${path.sep}`)) {
      return undefined;
    }
    revision.update(relative).update('\0');
    let info;
    try {
      info = await fs.lstat(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      revision.update('deleted\0');
      continue;
    }
    if (info.isSymbolicLink() || !info.isFile() || path.relative(absolute, await fs.realpath(absolute))) {
      return undefined;
    }
    revision.update(`${info.mode}:${info.size}\0`);
    for await (const chunk of createReadStream(absolute)) {
      revision.update(chunk);
    }
    revision.update('\0');
  }
  return revision.digest('hex');
};
