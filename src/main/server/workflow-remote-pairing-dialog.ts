import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { BrowserWindow } from 'electron';

type PreparedPairing = { html: string; digest: string };

export const createRemotePairingDialog = (directory: string, prepare: () => Promise<PreparedPairing>) => {
  let active: { window: BrowserWindow; digest: string; paired: boolean } | undefined;
  let opening: Promise<void> | undefined;
  let cancelledDigest: string | undefined;

  const open = async (parent: BrowserWindow) => {
    if (parent.isDestroyed()) {
      throw new Error('La finestra di Agent-Lab non è disponibile.');
    }
    const pairing = await prepare();
    const file = path.join(directory, 'remote-desktop-qr-' + randomUUID() + '.html');
    await fs.writeFile(file, pairing.html, { flag: 'wx' });
    try {
      if (parent.isDestroyed()) {
        throw new Error('La finestra di Agent-Lab è stata chiusa.');
      }
      const window = new BrowserWindow({
        parent,
        modal: true,
        show: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        width: 450,
        height: 575,
        title: 'Associa telefono · Agent-Lab',
        autoHideMenuBar: true,
        backgroundColor: '#080808',
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false },
      });
      const dialog = { window, digest: pairing.digest, paired: false };
      active = dialog;
      window.removeMenu();
      window.on('page-title-updated', (event) => event.preventDefault());
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event) => event.preventDefault());
      window.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'Escape') {
          event.preventDefault();
          window.close();
        }
      });
      window.once('closed', () => {
        if (active === dialog) {
          active = undefined;
        }
        if (!dialog.paired) {
          cancelledDigest = dialog.digest;
        }
        void fs.rm(file, { force: true }).catch(() => undefined);
        if (dialog.paired && !parent.isDestroyed()) {
          if (parent.isMinimized()) {
            parent.restore();
          }
          parent.show();
          parent.focus();
        }
      });
      try {
        await window.loadFile(file);
        if (!window.isDestroyed()) {
          window.show();
        }
      } catch (error) {
        if (!window.isDestroyed()) {
          window.close();
        }
        throw error;
      }
    } catch (error) {
      await fs.rm(file, { force: true }).catch(() => undefined);
      throw error;
    }
  };

  return {
    show: (parent: BrowserWindow): Promise<void> => {
      if (active && !active.window.isDestroyed()) {
        active.window.focus();
        return Promise.resolve();
      }
      opening ??= open(parent).finally(() => {
        opening = undefined;
      });
      return opening;
    },
    confirm: (digest: string) => {
      if (active && active.digest === digest && !active.window.isDestroyed()) {
        active.paired = true;
        active.window.close();
      }
    },
    isCancelled: (digest: string) => cancelledDigest === digest,
    close: () => {
      if (active && !active.window.isDestroyed()) {
        active.window.close();
      }
    },
  };
};
