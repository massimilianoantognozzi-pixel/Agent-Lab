import path from 'node:path';
import { homedir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { AIDER_DESK_DIR, AIDER_DESK_EXTENSIONS_DIR, AIDER_DESK_GLOBAL_EXTENSIONS_DIR } from '../constants';

describe('Extension Directory Constants', () => {
  const configuredDirectory = process.env.AIDER_DESK_DIR || '.aider-desk';

  it('should define AIDER_DESK_EXTENSIONS_DIR as project-specific extension directory', () => {
    expect(AIDER_DESK_EXTENSIONS_DIR).toBeDefined();
    expect(AIDER_DESK_EXTENSIONS_DIR).toBe(path.join(configuredDirectory, 'extensions'));
  });

  it('should define AIDER_DESK_GLOBAL_EXTENSIONS_DIR using user home directory', () => {
    expect(AIDER_DESK_GLOBAL_EXTENSIONS_DIR).toBeDefined();
    const configuredHome = process.env.AIDER_DESK_HOME_DIR || path.join(homedir(), configuredDirectory);
    expect(AIDER_DESK_GLOBAL_EXTENSIONS_DIR).toBe(path.join(configuredHome, 'extensions'));
  });

  it('should base project extensions on AIDER_DESK_DIR', () => {
    expect(AIDER_DESK_EXTENSIONS_DIR).toContain(AIDER_DESK_DIR);
  });
});
