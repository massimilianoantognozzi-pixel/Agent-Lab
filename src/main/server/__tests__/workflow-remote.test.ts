import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createWorkflowRemote } from '../workflow-remote';
import { createRemoteDeviceStore } from '../workflow-remote-device';

import type { AddressInfo } from 'node:net';

describe('workflow remote', () => {
  it('pairs once, scopes task access, transmits the exact approval and revokes', async () => {
    const code = 'a'.repeat(32);
    const run = vi.fn(async () => undefined);
    const stop = vi.fn(async () => undefined);
    const create = vi.fn(async () => 'task-1');
    const settings = vi.fn(async () => undefined);
    const patch = vi.fn(async () => 'diff --git a/src/turni.ts b/src/turni.ts');
    const server = createWorkflowRemote(
      { project: 'demo', code, expiresAt: Date.now() + 60_000 },
      {
        info: () => ({ autonomyLocked: false, model: 'gpt-6.1-sol' }),
        list: async () => [{ id: 'task-1', name: 'Task demo', state: 'TODO' }],
        create,
        settings,
        patch,
        read: async () => ({ state: 'TODO' }),
        run,
        stop,
      },
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    let token = '';
    const request = (url: string, value?: Record<string, string>) =>
      fetch(base + url, {
        method: value ? 'POST' : 'GET',
        headers: { ...(token && { Authorization: 'Bearer ' + token }), ...(value && { 'Content-Type': 'application/json' }) },
        ...(value && { body: JSON.stringify(value) }),
      });
    try {
      expect((await request('/api/tasks')).status).toBe(401);
      expect((await request('/api/action', { action: 'settings', id: 'task-1', autonomy: 'manual' })).status).toBe(401);
      expect((await request('/api/pair', { code: 'f'.repeat(32) })).status).toBe(403);
      token = (await (await request('/api/pair', { code })).json()).token;
      expect(token).toBeTruthy();
      expect((await request('/api/pair', { code })).status).toBe(403);
      expect((await request('/api/tasks/outside')).status).toBe(404);
      expect(await (await request('/api/tasks')).json()).toMatchObject({ autonomyLocked: false, model: 'gpt-6.1-sol', defaultAutonomy: 'guided' });
      expect((await request('/api/action', { action: 'create', autonomy: 'guided', reasoning: 'high' })).status).toBe(200);
      expect(create).toHaveBeenCalledWith({ autonomy: 'guided', reasoning: 'high' });
      expect((await request('/api/action', { action: 'settings', id: 'outside', autonomy: 'manual' })).status).toBe(404);
      expect((await request('/api/action', { action: 'settings', id: 'task-1', autonomy: 'manual', access: 'full' })).status).toBe(400);
      expect(settings).not.toHaveBeenCalled();
      expect((await request('/api/action', { action: 'settings', id: 'task-1', autonomy: 'manual', reasoning: 'xhigh' })).status).toBe(200);
      expect(settings).toHaveBeenCalledWith('task-1', { autonomy: 'manual', reasoning: 'xhigh' });
      expect((await request('/api/action', { action: 'patch', id: 'outside', revision: 'b'.repeat(64) })).status).toBe(404);
      expect(await (await request('/api/action', { action: 'patch', id: 'task-1', revision: 'b'.repeat(64) })).json()).toEqual({
        patch: 'diff --git a/src/turni.ts b/src/turni.ts',
      });
      expect(patch).toHaveBeenCalledWith('task-1', 'b'.repeat(64));
      expect((await request('/api/action', { action: 'approve', id: 'outside', revision: 'b'.repeat(64) })).status).toBe(404);
      expect((await request('/api/action', { action: 'approve', id: 'task-1', revision: 'b'.repeat(64) })).status).toBe(202);
      expect(run).toHaveBeenCalledWith('task-1', '/workflow approve ' + 'b'.repeat(64));
      expect((await request('/api/action', { action: 'stop', id: 'task-1' })).status).toBe(200);
      expect(stop).toHaveBeenCalledWith('task-1');
      expect((await request('/api/revoke', {})).status).toBe(200);
      expect((await request('/api/tasks')).status).toBe(401);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('restores a web device from disk and supports QR rotation and revocation from the PC', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agentlab-device-'));
    const scope = 'f'.repeat(64);
    const originalCode = 'a'.repeat(32);
    const webOrigin = 'https://agent-lab.example.ts.net';
    const deviceReady = vi.fn();
    let pairing = { project: 'demo', code: originalCode, expiresAt: Date.now() + 60_000, generation: 'initial' };
    const workflows = {
      info: () => ({ autonomyLocked: false, model: 'gpt-6.1-sol' }),
      list: async () => [{ id: 'one', name: 'Task demo' }],
      create: async () => 'one',
      settings: async () => undefined,
      patch: async () => '',
      read: async () => ({}),
      run: async () => undefined,
      stop: async () => undefined,
    };
    let server: ReturnType<typeof createWorkflowRemote> | undefined;
    let url = '';
    let cookie = '';
    const close = async () => {
      const active = server;
      server = undefined;
      if (active) {
        active.closeAllConnections();
        await new Promise<void>((resolve) => active.close(() => resolve()));
      }
    };
    const start = async () => {
      const active = createWorkflowRemote(pairing, workflows, new Map(), {
        store: createRemoteDeviceStore(directory, scope),
        loadPairing: async () => pairing,
        webOrigin,
        onDeviceReady: deviceReady,
      });
      server = active;
      await new Promise<void>((resolve) => active.listen(0, '127.0.0.1', resolve));
      url = 'http://127.0.0.1:' + (active.address() as AddressInfo).port;
    };
    const send = (route: string, input?: Record<string, string>, origin = webOrigin) =>
      fetch(url + route, {
        method: input ? 'POST' : 'GET',
        headers: { Origin: origin, ...(cookie && { Cookie: cookie }), ...(input && { 'Content-Type': 'application/json' }) },
        ...(input && { body: JSON.stringify(input) }),
      });

    try {
      await start();
      expect((await send('/api/action', { action: 'device-ready' })).status).toBe(401);
      expect((await send('/api/pair', { code: originalCode, client: 'web' }, 'https://wrong.example')).status).toBe(403);
      const association = await send('/api/pair', { code: originalCode, client: 'web' });
      expect(await association.json()).toEqual({ project: 'demo' });
      const setCookie = association.headers.get('set-cookie')!;
      expect(setCookie).toContain('HttpOnly; Secure; SameSite=Strict');
      expect(deviceReady).not.toHaveBeenCalled();
      cookie = setCookie.split(';')[0];
      const stored = await fs.readFile(path.join(directory, 'remote-device.json'), 'utf8');
      expect(stored).not.toContain(cookie.split('=')[1]);
      expect(stored).not.toContain(originalCode);
      await close();
      await start();
      expect((await send('/api/tasks')).status).toBe(200);
      expect(deviceReady).not.toHaveBeenCalled();
      expect((await send('/api/action', { action: 'device-ready' }, 'https://wrong.example')).status).toBe(403);
      expect(deviceReady).not.toHaveBeenCalled();
      expect(await (await send('/api/action', { action: 'device-ready' })).json()).toEqual({ ready: true });
      await vi.waitFor(() => expect(deviceReady).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/)));
      expect((await send('/api/pair', { code: originalCode, client: 'web' })).status).toBe(403);
      expect((await send('/api/revoke', {}, 'https://wrong.example')).status).toBe(403);
      pairing = { ...pairing, code: 'b'.repeat(32) };
      expect((await send('/api/tasks')).status).toBe(200);
      const generation = randomUUID();
      await fs.writeFile(path.join(directory, 'remote-device-revocation.json'), JSON.stringify({ generation }));
      expect((await send('/api/tasks')).status).toBe(401);
      expect((await send('/api/pair', { code: pairing.code, client: 'web' })).status).toBe(403);
      pairing = { ...pairing, generation };
      const second = await send('/api/pair', { code: pairing.code, client: 'web' });
      expect(second.status).toBe(200);
      cookie = second.headers.get('set-cookie')!.split(';')[0];
      expect((await send('/api/tasks')).status).toBe(200);
      const revoked = await send('/api/revoke', {});
      expect(revoked.status).toBe(200);
      expect(revoked.headers.get('set-cookie')).toContain('Max-Age=0');
      await close();
      await start();
      expect((await send('/api/tasks')).status).toBe(401);
    } finally {
      await close();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
