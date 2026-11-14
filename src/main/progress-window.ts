import { join } from 'path';

import { BrowserWindow } from 'electron';

import { isDev } from '@/app';

export class ProgressWindow {
  private window: BrowserWindow;
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;

  constructor(options: { width?: number; height?: number; icon?: string; splashImage?: string }) {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    this.window = new BrowserWindow({
      width: options.width ?? 540,
      height: options.height ?? 400,
      resizable: false,
      frame: false,
      show: true,
      transparent: true,
      icon: options.icon,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.window.on('ready-to-show', () => {
      if (!this.window.isDestroyed()) {
        this.window.show();
      }
      this.resolveReady();
    });

    this.window.webContents.on('did-finish-load', () => {
      if (options.splashImage) {
        this.send('set-splash-image', options.splashImage);
      }
    });

    if (isDev()) {
      void this.window.loadFile('src/renderer/progress.html');
    } else {
      void this.window.loadFile(join(__dirname, '../renderer/progress.html'));
    }
  }

  on(event: 'ready', callback: () => void): void {
    if (event === 'ready') {
      this.readyPromise.then(callback);
    }
  }

  setDetail(value: string): void {
    this.send('set-detail', value);
  }

  setCompleted(): void {
    this.send('set-completed');
  }

  addLog(message: string): void {
    this.send('add-log', message);
  }

  close(): void {
    if (!this.window.isDestroyed()) {
      this.window.close();
    }
  }

  private send(channel: string, ...args: string[]): void {
    if (this.window.isDestroyed()) {
      return;
    }
    const contents = this.window.webContents;
    if (!contents.isDestroyed()) {
      contents.send(channel, ...args);
    }
  }
}
