import { execFileSync } from 'node:child_process';
import os from 'os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openUrl } from '../open-url';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('@/app', () => ({ isElectron: () => false, isDev: () => false }));
vi.mock('@/logger', () => ({
  default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../resources/icon.png?asset', () => ({
  default: 'fixture-icon',
}));

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
describe('headless URL opening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BROWSER', undefined);
    vi.stubEnv('PLANNOTATOR_BROWSER', undefined);
  });
  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(['https://example.invalid/$(touch%20marker)', 'https://example.invalid/`id`?x=one&y=two', 'mailto:test@example.invalid?subject=hello'])(
    'passes a URL as one data argument on Linux: %s',
    async (url) => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.spyOn(os, 'release').mockReturnValue('6.1-fixture');
      await expect(openUrl(url, 'external')).resolves.toBeNull();
      expect(execFileSync).toHaveBeenCalledExactlyOnceWith('xdg-open', [new URL(url).href], { stdio: 'ignore', windowsHide: true });
    },
  );

  it('keeps a configured browser executable and its URL as separate arguments', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    vi.spyOn(os, 'release').mockReturnValue('6.1-fixture');
    vi.stubEnv('BROWSER', '/opt/browser with spaces');
    await openUrl('https://example.invalid/a?x=$(id)&y=two', 'external');
    expect(execFileSync).toHaveBeenCalledExactlyOnceWith('/opt/browser with spaces', ['https://example.invalid/a?x=$(id)&y=two'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  });

  it('uses the selected macOS application without shell interpolation', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    vi.stubEnv('PLANNOTATOR_BROWSER', 'Browser App');
    await openUrl('https://example.invalid/', 'external');
    expect(execFileSync).toHaveBeenCalledExactlyOnceWith('open', ['-a', 'Browser App', 'https://example.invalid/'], { stdio: 'ignore', windowsHide: true });
  });

  it.each(['win32', 'wsl'])('keeps the URL out of PowerShell source on %s', async (platform) => {
    Object.defineProperty(process, 'platform', {
      value: platform === 'wsl' ? 'linux' : platform,
    });
    vi.spyOn(os, 'release').mockReturnValue('microsoft-standard-WSL2');
    const url = 'https://example.invalid/?x=$(id)&other=value';
    await openUrl(url, 'external');
    expect(execFileSync).toHaveBeenCalledOnce();
    const [file, args, options] = vi.mocked(execFileSync).mock.calls[0];
    expect(file).toBe('powershell.exe');
    expect(JSON.stringify(args)).not.toContain(url);
    expect(options).toMatchObject({
      input: url,
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
  });

  it.each(['javascript:alert(1)', 'file:///private/fixture', 'not a URL'])('rejects unsupported external destinations before launching: %s', async (url) => {
    await expect(openUrl(url, 'external')).rejects.toThrow('External browser URLs');
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
