import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRemoteDeviceStore } from '../workflow-remote-device';

describe('persistent remote device expiration', () => {
  let directory: string;
  const scope = 'a'.repeat(64);
  const usedCode = 'b'.repeat(64);
  beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agentlab-device-expiry-')); });
  afterEach(async () => {
    vi.restoreAllMocks();
    expect(path.dirname(await fs.realpath(directory))).toBe(await fs.realpath(os.tmpdir()));
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('preserves the expiration through restart and rejects a replay at its deadline', async () => {
    const expiresAt = Date.now() + 100_000;
    const device = { digest: 'c'.repeat(64), generation: 'initial' as const, expiresAt };
    await createRemoteDeviceStore(directory, scope).write({ usedCode, device });
    const restarted = createRemoteDeviceStore(directory, scope);
    expect(await restarted.read()).toEqual({ usedCode, device });
    vi.spyOn(Date, 'now').mockReturnValue(expiresAt);
    expect(await restarted.read()).toEqual({ usedCode, device: undefined });
  });

  it('requires legacy devices to pair again without inventing dates or reusing the consumed QR', async () => {
    const legacy = { version: 1, scope, usedCode, device: { digest: 'c'.repeat(64), generation: 'initial' } };
    const file = path.join(directory, 'remote-device.json');
    const bytes = JSON.stringify(legacy);
    await fs.writeFile(file, bytes);
    expect(await createRemoteDeviceStore(directory, scope).read()).toEqual({ usedCode, device: undefined });
    expect(await fs.readFile(file, 'utf8')).toBe(bytes);
  });

  it('rejects a new credential without an explicit expiry', async () => {
    await expect(createRemoteDeviceStore(directory, scope).write({ device: { digest: 'c'.repeat(64), generation: 'initial' } } as never)).rejects.toThrow();
  });
});
