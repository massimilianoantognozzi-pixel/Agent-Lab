import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgressWindow } from '../progress-window';

const { window, contents } = vi.hoisted(() => ({
  window: {
    isDestroyed: vi.fn(),
    loadFile: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
  },
  contents: {
    isDestroyed: vi.fn(),
    send: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function () {
    return Object.defineProperties(
      Object.assign(new EventEmitter(), window),
      Object.getOwnPropertyDescriptors({
        get webContents() {
          if (window.isDestroyed()) {
            throw new TypeError('Object has been destroyed');
          }
          return Object.assign(new EventEmitter(), contents);
        },
      }),
    );
  }),
}));

vi.mock('@/app', () => ({ isDev: () => false }));

describe('ProgressWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.isDestroyed.mockReturnValue(false);
    contents.isDestroyed.mockReturnValue(false);
    contents.send.mockImplementation(() => {
      if (contents.isDestroyed()) {
        throw new TypeError('Object has been destroyed');
      }
    });
  });

  it('ignores late logs and progress updates after the splash window is destroyed', () => {
    const progress = new ProgressWindow({});
    progress.addLog('starting');
    expect(contents.send).toHaveBeenCalledWith('add-log', 'starting');
    window.isDestroyed.mockReturnValue(true);

    expect(() => progress.addLog('background initialization')).not.toThrow();
    expect(() => progress.setDetail('ready')).not.toThrow();
    expect(() => progress.setCompleted()).not.toThrow();
    progress.close();
    expect(contents.send).toHaveBeenCalledTimes(1);
    expect(window.close).not.toHaveBeenCalled();
  });

  it('ignores late logs when the splash contents are destroyed first', () => {
    const progress = new ProgressWindow({});
    contents.isDestroyed.mockReturnValue(true);

    expect(() => progress.addLog('background initialization')).not.toThrow();
    expect(contents.send).not.toHaveBeenCalled();
  });
});
