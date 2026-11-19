import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Store } from '@/store';

import { getConnectorAuthorization, registerConnectorAuthorization } from '@/connector/connector-auth';
import { invalidateServerSessions, ServerAccess } from '@/server/server-access';

vi.mock('@/constants', () => ({ AUTH_USERNAME: undefined, AUTH_PASSWORD: undefined, READONLY_MODE: false, CORS_ALLOWED_ORIGINS: undefined }));

const makeAccess = (authenticated = true) => {
  const server = {
    readonly: false,
    basicAuth: { enabled: authenticated, username: 'fixture', password: 'local:test' },
    cors: { enabled: false, origins: [] },
  };
  const store = { getSettings: () => ({ server }) } as unknown as Store;
  const access = new ServerAccess(store, () => true);
  const headers = { host: 'localhost:24337', origin: 'http://localhost:24337', authorization: `Basic ${Buffer.from('fixture:local:test').toString('base64')}` };
  return { access, server, store, headers };
};

describe('authenticated Agent-Lab web sessions', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('requires a complete credential even in headless mode', () => {
    vi.stubEnv('AIDER_DESK_HEADLESS', 'true');
    const { access, headers } = makeAccess(false);
    expect(access.enabled).toBe(true);
    expect(access.authorize(headers)).toBeUndefined();
  });

  it('exchanges browser authentication for one short-lived ticket limited to its host', () => {
    vi.useFakeTimers();
    const { access, headers } = makeAccess();
    const session = access.authorize(headers)!;
    expect(session.role).toBe('browser');
    expect(access.authorize({ ...headers, authorization: undefined })).toBeUndefined();
    expect(access.authorize({ ...headers, origin: 'https://fixture.invalid' })).toBeUndefined();

    const ticket = access.issueSocketTicket(headers, session);
    expect(ticket).toEqual(expect.any(String));
    expect(access.takeSocketTicket(ticket, { host: 'elsewhere.invalid' })).toBeUndefined();
    expect(access.takeSocketTicket(ticket, headers)?.role).toBe('browser');
    expect(access.takeSocketTicket(ticket, headers)).toBeUndefined();

    const expired = access.issueSocketTicket(headers, session);
    vi.advanceTimersByTime(31_000);
    expect(access.takeSocketTicket(expired, headers)).toBeUndefined();
  });

  it('revokes previously issued sessions when server authority changes', () => {
    const { access, headers, server, store } = makeAccess();
    const browser = access.authorize(headers)!;
    const ticket = access.issueSocketTicket(headers, browser);
    server.readonly = true;
    invalidateServerSessions(store);
    const viewer = access.authorize(headers)!;

    expect(viewer.role).toBe('readonly');
    expect(browser.authorized()).toBe(false);
    expect(access.takeSocketTicket(ticket, headers)).toBeUndefined();
    server.readonly = false;
    invalidateServerSessions(store);
    expect(browser.authorized()).toBe(false);
    expect(viewer.authorized()).toBe(false);
  });

  it('assigns each Python connector its own revocable project and task identity', () => {
    const first = registerConnectorAuthorization('C:/work/one', 'task-one');
    const second = registerConnectorAuthorization('C:/work/two', 'task-two');
    const authorized = getConnectorAuthorization(first.token)!;
    try {
      expect(first.token).not.toBe(second.token);
      expect(authorized).toMatchObject({ baseDir: 'C:/work/one', taskId: 'task-one' });
      expect(authorized.authorized()).toBe(true);
      first.revoke();
      expect(authorized.authorized()).toBe(false);
      expect(getConnectorAuthorization(first.token)).toBeUndefined();
      expect(getConnectorAuthorization(second.token)?.authorized()).toBe(true);
    } finally {
      first.revoke();
      second.revoke();
    }
  });
});
