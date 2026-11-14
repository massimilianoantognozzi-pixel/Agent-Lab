import * as fs from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { atomicWriteJsonFile } from '../atomic-write';

vi.mock('fs', () => ({ promises: { mkdir: vi.fn(), writeFile: vi.fn(), rename: vi.fn(), unlink: vi.fn() } }));

describe('atomic JSON replacement', () => {
  beforeEach(() => {
    vi.mocked(fs.promises.mkdir).mockReset().mockResolvedValue(undefined);
    vi.mocked(fs.promises.writeFile).mockReset().mockResolvedValue(undefined);
    vi.mocked(fs.promises.rename).mockReset().mockResolvedValue(undefined);
    vi.mocked(fs.promises.unlink).mockReset().mockResolvedValue(undefined);
  });

  it.skipIf(process.platform !== 'win32')('retries a transient sharing violation without rewriting the prepared receipt', async () => {
    vi.mocked(fs.promises.rename).mockRejectedValueOnce(Object.assign(new Error('file in use'), { code: 'EPERM' }));
    await expect(atomicWriteJsonFile('/fixture/root-turn.json', { state: 'success' })).resolves.toBeUndefined();
    expect(fs.promises.writeFile).toHaveBeenCalledTimes(1);
    expect(fs.promises.rename).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fs.promises.rename).mock.calls[1]).toEqual(vi.mocked(fs.promises.rename).mock.calls[0]);
  });

  it('propagates a permanent rename failure and keeps the prepared JSON for recovery', async () => {
    vi.mocked(fs.promises.rename).mockRejectedValueOnce(Object.assign(new Error('different device'), { code: 'EXDEV' }));
    await expect(atomicWriteJsonFile('/fixture/root-turn.json', {})).rejects.toThrow('different device');
    expect(fs.promises.rename).toHaveBeenCalledTimes(1);
    expect(fs.promises.unlink).not.toHaveBeenCalled();
  });
});
