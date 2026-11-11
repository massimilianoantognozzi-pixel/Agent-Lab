import { afterEach, expect, it, vi } from 'vitest';

import { ExtensionManager } from '../extensions/extension-manager';
vi.mock('@/logger');
afterEach(() => vi.unstubAllEnvs());
it('never reaches the host-code loader or watcher from any laboratory load route', async () => {
  vi.stubEnv('AIDER_DESK_LAB_MODE', 'true');
  const loadExtension = vi.fn(() => {
    throw new Error('Host-code loader must not run');
  });
  const manager = { loader: { loadExtension } };
  const methods = ExtensionManager.prototype as unknown as {
    loadAndInitializeExtension(file: string): Promise<{ success: boolean }>;
    setupWatcherForDir(dir: string, callback: () => Promise<void>): Promise<unknown>;
  };
  expect((await methods.loadAndInitializeExtension.call(manager, 'untrusted-project-extension.js')).success).toBe(false);
  expect(await methods.setupWatcherForDir.call(manager, 'untrusted-project', async () => {})).toBeNull();
  expect(loadExtension).not.toHaveBeenCalled();
});
