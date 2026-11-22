import { describe, expect, it, vi } from 'vitest';

import { VersionsManager } from '../versions-manager';

vi.mock('@/app', () => ({ getElectronApp: () => ({ isPackaged: true, getVersion: () => '0.88.0' }), isDev: () => false }));
vi.mock('@/desktop-product', () => ({ isLocalAgentLabInstall: () => true }));
vi.mock('@/lab-mode', () => ({ isLabMode: () => false }));
vi.mock('@/utils', () => ({ getCurrentPythonLibVersion: async () => '1.0', getLatestPythonLibVersion: async () => '1.1' }));
vi.mock('@/logger', () => ({ default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('node:fs', async (load) => ({ ...(await load<typeof import('node:fs')>()), existsSync: () => true }));

describe('installed local Agent-Lab updates', () => {
  it('reports the installed version and refuses the application update even when a manifest exists', async () => {
    const updated = vi.fn();
    const manager = new VersionsManager({ sendVersionsInfoUpdated: updated } as never, { getSettings: () => ({ aiderDeskAutoUpdate: true }) } as never);
    try {
      expect(await manager.getVersions()).toMatchObject({ aiderDeskCurrentVersion: '0.88.0', applicationUpdatesSupported: false });
      const forced = await manager.getVersions(true);
      expect(forced).toMatchObject({
        aiderDeskCurrentVersion: '0.88.0',
        aiderCurrentVersion: '1.0',
        aiderDeskAvailableVersion: null,
        applicationUpdatesSupported: false,
      });
      await expect(manager.downloadLatestAiderDesk()).rejects.toThrow('non disponibile per questa build');
    } finally {
      manager.destroy();
    }
  });
});
