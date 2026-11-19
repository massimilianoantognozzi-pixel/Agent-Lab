import { describe, expect, it, vi } from 'vitest';

import { TerminalManager } from '../terminal-manager';

import logger from '@/logger';

vi.mock('@/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@homebridge/node-pty-prebuilt-multiarch', () => ({}));

describe('terminal input privacy', () => {
  it('delivers input to the terminal without retaining it in diagnostic logs', () => {
    const write = vi.fn();
    const manager = new TerminalManager({} as never);
    manager['terminals'].set('fixture', { ptyProcess: { write } } as never);
    const input = 'synthetic-sensitive-input';
    expect(manager.writeToTerminal('fixture', input)).toBe(true);
    expect(write).toHaveBeenCalledExactlyOnceWith(input);
    expect(logger.debug).toHaveBeenCalledExactlyOnceWith('Writing to terminal:', { terminalId: 'fixture' });
    expect(JSON.stringify(vi.mocked(logger.debug).mock.calls)).not.toContain(input);
  });
});
