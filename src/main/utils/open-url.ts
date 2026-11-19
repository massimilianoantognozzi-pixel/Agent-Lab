import { execFileSync } from 'node:child_process';
import { join } from 'path';
import os from 'os';

import icon from '../../../resources/icon.png?asset';

import { isElectron } from '@/app';
import { desktopExternalUrl } from '@/desktop-boundary';
import logger from '@/logger';

/**
 * Opens a URL either in external browser or a new BrowserWindow.
 * In Node/Docker environments, 'window' falls back to external with a warning.
 *
 * @param url - URL to open
 * @param target - Where to open: 'external' (system browser) or 'window' (new Electron window)
 * @param title - Window title (only used when opening in a new window)
 */
export const openUrl = async (url: string, target: 'external' | 'window' = 'window', title?: string): Promise<Electron.BrowserWindow | null> => {
  logger.debug('[openUrl] Opening URL.', { position: target });

  if (isElectron()) {
    const { shell, BrowserWindow } = await import('electron');

    if (target === 'window') {
      try {
        const win = new BrowserWindow({
          width: 1200,
          height: 800,
          title: title || 'AiderDesk',
          icon,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        });
        win.removeMenu();
        win.maximize();

        // If URL starts with #/, it's an internal app route
        let loadUrl = url;
        if (url.startsWith('#/')) {
          loadUrl = process.env['ELECTRON_RENDERER_URL']
            ? `${process.env['ELECTRON_RENDERER_URL']}${url}`
            : `file://${join(__dirname, '../renderer/index.html')}${url}`;
        }

        await win.loadURL(loadUrl);
        return win;
      } catch (error) {
        logger.error('[openUrl] Failed to open the requested browser window.');
        throw error;
      }
    } else {
      await shell.openExternal(url);
      return null;
    }
  } else {
    if (target === 'window') {
      logger.warn('[openUrl] Opening URL in window not supported in headless mode, opening externally');
    }
    openInExternalBrowser(url);
    return null;
  }
};

/**
 * Opens a URL in the system's default browser using platform-specific commands.
 * Works in Node.js environments without Electron.
 */
const openInExternalBrowser = (url: string): void => {
  try {
    const destination = desktopExternalUrl(url);
    if (!destination) {
      throw new Error('External browser URLs must use HTTP, HTTPS or mailto.');
    }
    const browser = process.env.PLANNOTATOR_BROWSER || process.env.BROWSER;
    const platform = process.platform;
    const wsl = platform === 'linux' && os.release().toLowerCase().includes('microsoft');
    const options = { stdio: 'ignore' as const, windowsHide: true };

    if (browser) {
      if (process.env.PLANNOTATOR_BROWSER && platform === 'darwin') {
        execFileSync('open', ['-a', browser, destination], options);
      } else {
        // Browser overrides identify an executable, never shell command text.
        execFileSync(browser, [destination], options);
      }
    } else if (platform === 'win32' || wsl) {
      // Feed the URL as data, including across WSL's Windows interop boundary.
      // No part of it is inserted into PowerShell source or a cmd.exe command.
      execFileSync(
        'powershell.exe',
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference = "Stop"; Start-Process -FilePath ([Console]::In.ReadToEnd())'],
        {
          ...options,
          input: destination,
          stdio: ['pipe', 'ignore', 'ignore'],
        },
      );
    } else if (platform === 'darwin') {
      execFileSync('open', [destination], options);
    } else {
      execFileSync('xdg-open', [destination], options);
    }
  } catch (error) {
    logger.error('[openUrl] Failed to open the requested external URL.');
    throw error;
  }
};
