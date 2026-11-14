import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { simpleGit } from 'simple-git';

import { getAllFiles } from '@/utils/file-system';
import { expandTilde } from '@/agent/utils';

// Common project verification entry points for goals without a user-named command.
export const isProjectVerificationCommand = (command: string) =>
  !/[;&|><`$\r\n]/.test(command) &&
  !/(?:^|\s)--(?:if-present|passWithNoTests|pass-with-no-tests|allow-no-tests|no-tests-ok)(?:\s|=|$)/i.test(command) &&
  /^(?:(?:npm|pnpm|yarn|bun)(?:\.cmd)? (?:run )?(?:test|check|lint|typecheck|build)(?=[:\s]|$)|(?:pytest|vitest|jest|ctest|ruff check|cargo test|go test|dotnet test|mvn (?:test|verify)|gradle test|python -m (?:pytest|unittest)|node --test)(?=\s|$))/i.test(
    command.trim(),
  );

const privateOrGenerated = /(?:^|\/)(?:node_modules|\.git|\.aider-desk|\.agent-lab|\.env[^/]*|dist|coverage|__pycache__)(?:\/|$)/i;

export const isGoalVerificationDirectory = async (checkout: string, directory: string): Promise<boolean> => {
  try {
    const [root, workingDirectory] = await Promise.all([fs.realpath(checkout), fs.realpath(path.resolve(checkout, expandTilde(directory)))]);
    const relative = path.relative(root, workingDirectory);
    return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && (await fs.stat(workingDirectory)).isDirectory();
  } catch {
    return false;
  }
};

export const goalWorktreeRevision = async (root: string): Promise<string | undefined> => {
  const repository = await fs.realpath(root);
  const git = simpleGit(repository);
  const gitRepo = await git.checkIsRepo();
  if (gitRepo && path.relative(repository, path.normalize((await git.revparse(['--show-toplevel'])).trim()))) {
    return undefined;
  }
  const names = gitRepo ? (await git.raw(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])).split('\0') : await getAllFiles(repository, false);
  const relativeFiles = [...new Set(names.filter((name) => name && !privateOrGenerated.test(name)))].sort();
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
