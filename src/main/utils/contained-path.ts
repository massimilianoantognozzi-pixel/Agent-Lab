import fs from 'node:fs/promises';
import path from 'node:path';

import { AIDER_DESK_DATA_DIR, AIDER_DESK_HOME_DIR } from '@/constants';
import { getProjectAuthorityRoot } from '@/extensions/project-extension-trust';

const contains = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

// Preserve the unresolved tail for creation, but authorize it using the actual existing parent directory.
const existingPathWithTail = async (candidate: string): Promise<string> => {
  const tail: string[] = [];
  let current = candidate;
  for (;;) {
    try {
      const result = await fs.realpath(current);
      return path.join(result, ...tail);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || path.dirname(current) === current) {
        throw error;
      }
      if (
        await fs.lstat(current).then(
          (info) => info.isSymbolicLink(),
          () => false,
        )
      ) {
        throw new Error('A dangling link cannot be used for project file access.');
      }
      tail.unshift(path.basename(current));
      current = path.dirname(current);
    }
  }
};

export const resolveContainedPath = async (root: string, input: string): Promise<string> => {
  const intended = path.resolve(root, input);
  if (!contains(path.resolve(root), intended)) {
    throw new Error('The path is outside the project directory.');
  }
  const canonicalRoot = await fs.realpath(root);
  const candidate = await existingPathWithTail(intended);
  if (!contains(canonicalRoot, candidate)) {
    throw new Error('The path resolves outside the project directory.');
  }
  return candidate;
};

export const resolveProjectToolPath = async (root: string, input: string): Promise<string> => {
  const candidate = await resolveContainedPath(root, input);
  const protectedRoots = [AIDER_DESK_DATA_DIR, AIDER_DESK_HOME_DIR, getProjectAuthorityRoot()].filter(Boolean);
  for (const directory of protectedRoots) {
    const identity = await existingPathWithTail(path.resolve(directory));
    if (contains(identity, candidate)) {
      throw new Error('The path belongs to Agent-Lab private application data.');
    }
  }
  return candidate;
};
