/**
 * Tests for getShellInitCommand in src/main/utils/shell.ts.
 *
 * Verifies that the function returns the correct shell init prefix for
 * bash, zsh, fish and an empty string for unsupported shells (e.g. cmd,
 * pwsh, powershell). The expected outputs were observed by running the
 * function directly with each shell name.
 *
 * Since ShellDetector is a private (non-exported) class inside the module
 * and caches its result, the test isolates each case by:
 *   1. Setting process.env.SHELL to a known shell path
 *   2. Mocking fs.existsSync to return true for that path
 *   3. Resetting the module cache so the static cache is cleared
 *   4. Simulating the relevant platform for each shell
 */

import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('path');

vi.mock('os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('os')>()),
  homedir: () => '/home/fixture',
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    accessSync: vi.fn(),
  };
});

vi.mock('@/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/app', () => ({
  getElectronApp: vi.fn(() => ({ isPackaged: false })),
}));

const importShellModule = async () => {
  vi.resetModules();
  return await import('@/utils/shell');
};

it('preapproves a whole literal command and leaves shell forms to normal approval', async () => {
  const { canPreapproveShellCommand } = await importShellModule();
  expect(canPreapproveShellCommand('git status', ['git status'])).toBe(true);
  expect(canPreapproveShellCommand('git status --short', ['git status'])).toBe(false);
  expect(canPreapproveShellCommand('ls ./docs', ['ls .*'])).toBe(true);
  expect(canPreapproveShellCommand('ls "Docs and Examples"', ['ls .*'])).toBe(false);
});

const setupShell = async (shellName: 'bash' | 'zsh' | 'fish' | 'cmd' | 'pwsh' | 'powershell') => {
  const isWindows = shellName === 'cmd' || shellName === 'pwsh' || shellName === 'powershell';
  Object.defineProperty(process, 'platform', { configurable: true, value: isWindows ? 'win32' : 'linux' });
  const bin = path.resolve('shell-fixture', 'bin');
  const systemRoot = path.resolve('shell-fixture', 'Windows');
  let shellPath = path.posix.join('/usr/local/bin', shellName);
  if (isWindows) {
    vi.stubEnv('SYSTEMROOT', systemRoot);
    vi.stubEnv('PATH', bin);
    shellPath = shellName === 'cmd' ? path.join(systemRoot, 'System32', 'cmd.exe') : path.join(bin, `${shellName}.exe`);
  }

  vi.stubEnv('SHELL', isWindows ? undefined : shellPath);

  // Mock existsSync to return true for the configured shell path so the
  // ShellDetector accepts it. Return false for everything else to avoid
  // accidentally matching other paths.
  vi.mocked((await import('fs')).existsSync).mockImplementation(((p: string) => {
    return String(p) === shellPath;
  }) as any);
  return shellPath;
};

describe('getShellInitCommand', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const homeDir = os.homedir();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe('bash shell', () => {
    beforeEach(async () => {
      await setupShell('bash');
    });

    it('returns prefix containing /etc/profile', async () => {
      const { getShellInitCommand } = await importShellModule();
      const result = getShellInitCommand();
      expect(result).toContain('source /etc/profile');
    });

    it('returns prefix containing $HOME/.bash_profile', async () => {
      const { getShellInitCommand } = await importShellModule();
      const result = getShellInitCommand();
      expect(result).toContain(`source ${homeDir}/.bash_profile`);
    });

    it('returns prefix containing $HOME/.bashrc', async () => {
      const { getShellInitCommand } = await importShellModule();
      const result = getShellInitCommand();
      expect(result).toContain(`source ${homeDir}/.bashrc`);
    });

    it('returns prefix containing direnv export for bash', async () => {
      const { getShellInitCommand } = await importShellModule();
      const result = getShellInitCommand();
      expect(result).toContain('direnv export bash');
    });

    it('returns prefix that is non-empty and ends with semicolon+space', async () => {
      const { getShellInitCommand } = await importShellModule();
      const result = getShellInitCommand();
      expect(result.length).toBeGreaterThan(0);
      expect(result.endsWith('; ')).toBe(true);
    });
  });

  describe('zsh shell', () => {
    beforeEach(async () => {
      await setupShell('zsh');
    });

    it('returns prefix containing /etc/zprofile', async () => {
      const { getShellInitCommand } = await importShellModule();
      const result = getShellInitCommand();
      expect(result).toContain('source /etc/zprofile');
    });

    it('returns prefix containing $HOME/.zprofile', async () => {
      const { getShellInitCommand } = await importShellModule();
      const result = getShellInitCommand();
      expect(result).toContain(`source ${homeDir}/.zprofile`);
    });

    it('returns prefix containing /etc/zshrc', async () => {
      const { getShellInitCommand } = await importShellModule();
      const result = getShellInitCommand();
      expect(result).toContain('source /etc/zshrc');
    });

    it('returns prefix containing $HOME/.zshrc', async () => {
      const { getShellInitCommand } = await importShellModule();
      const result = getShellInitCommand();
      expect(result).toContain(`source ${homeDir}/.zshrc`);
    });

    it('returns prefix containing direnv export for zsh', async () => {
      const { getShellInitCommand } = await importShellModule();
      const result = getShellInitCommand();
      expect(result).toContain('direnv export zsh');
    });

    it('returns prefix that is non-empty and ends with semicolon+space', async () => {
      const { getShellInitCommand } = await importShellModule();
      const result = getShellInitCommand();
      expect(result.length).toBeGreaterThan(0);
      expect(result.endsWith('; ')).toBe(true);
    });
  });

  describe('fish shell', () => {
    beforeEach(async () => {
      await setupShell('fish');
    });

    it('returns prefix containing $HOME/.config/fish/config.fish', async () => {
      const { getShellInitCommand } = await importShellModule();
      const result = getShellInitCommand();
      expect(result).toContain(`source ${homeDir}/.config/fish/config.fish`);
    });

    it('returns prefix containing direnv export for fish', async () => {
      const { getShellInitCommand } = await importShellModule();
      const result = getShellInitCommand();
      expect(result).toContain('direnv export fish');
    });

    it('returns prefix that is non-empty and ends with semicolon+space', async () => {
      const { getShellInitCommand } = await importShellModule();
      const result = getShellInitCommand();
      expect(result.length).toBeGreaterThan(0);
      expect(result.endsWith('; ')).toBe(true);
    });
  });

  it.each([
    ['cmd', '/c'],
    ['pwsh', '-Command'],
    ['powershell', '-Command'],
  ] as const)('does not use a Unix init prefix for Windows %s', async (shellName, option) => {
    const shell = await setupShell(shellName);
    const { getShellInitCommand, getShellCommandArgs } = await importShellModule();
    expect(getShellCommandArgs('echo fixture')).toEqual({ shell, args: [option, 'echo fixture'] });
    expect(getShellInitCommand()).toBe('');
  });
});
