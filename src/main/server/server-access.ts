import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { IncomingHttpHeaders } from 'node:http';
import type { Store } from '@/store';

import { AUTH_PASSWORD, AUTH_USERNAME, READONLY_MODE } from '@/constants';
import { createCorsOriginValidator } from '@/server/cors';

type BrowserRole = 'browser' | 'readonly';

export type BrowserSession = {
  role: BrowserRole;
  authorized: () => boolean;
};

type SocketTicket = { expires: number; host: string; session: BrowserSession };

const TICKET_LIFETIME = 30_000;
const MAX_PENDING_TICKETS = 128;

const fingerprint = (value: string) => createHash('sha256').update(value).digest();
const settingsEpochs = new WeakMap<Store, number>();
export const invalidateServerSessions = (store: Store): void => {
  settingsEpochs.set(store, (settingsEpochs.get(store) ?? 0) + 1);
};

export const getServerCredentials = (store: Store): [string, string] | undefined => {
  if (AUTH_USERNAME !== undefined || AUTH_PASSWORD !== undefined) {
    return AUTH_USERNAME && AUTH_PASSWORD && !AUTH_USERNAME.includes(':') ? [AUTH_USERNAME, AUTH_PASSWORD] : undefined;
  }
  const { enabled, username, password } = store.getSettings().server.basicAuth;
  return enabled && username && password && !username.includes(':') ? [username, password] : undefined;
};

export class ServerAccess {
  private readonly socketTickets = new Map<string, SocketTicket>();

  constructor(
    private readonly store: Store,
    private readonly desktopServerStarted: () => boolean,
  ) {}

  private browserOriginAllowed({ host, origin, 'sec-fetch-site': fetchSite }: IncomingHttpHeaders): boolean {
    if (!host) {
      return false;
    }
    if (!origin) {
      return fetchSite !== 'cross-site';
    }
    try {
      const url = new URL(origin);
      if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) {
        return false;
      }
      if (url.host.toLowerCase() === host.toLowerCase() && fetchSite !== 'cross-site') {
        return true;
      }
      let allowed = false;
      createCorsOriginValidator(this.store)(origin, (error, result) => {
        allowed = !error && result === true;
      });
      return allowed;
    } catch {
      return false;
    }
  }

  get enabled(): boolean {
    return process.env.AIDER_DESK_HEADLESS === 'true' || this.desktopServerStarted();
  }

  get readonly(): boolean {
    return READONLY_MODE || this.store.getSettings().server.readonly === true;
  }

  private get credentials(): [string, string] | undefined {
    return getServerCredentials(this.store);
  }

  get hasCredentials(): boolean {
    return Boolean(this.credentials);
  }

  canConfigureCredentials(username: string, password: string): boolean {
    if (AUTH_USERNAME !== undefined || AUTH_PASSWORD !== undefined) {
      return this.hasCredentials;
    }
    return Boolean(username && password && !username.includes(':'));
  }

  authorize(headers: IncomingHttpHeaders): BrowserSession | undefined {
    const secret = this.credentials;
    const authorization = headers.authorization?.match(/^Basic ([a-z0-9+/]+={0,2})$/i)?.[1];
    if (!this.enabled || !secret || !authorization || !this.browserOriginAllowed(headers)) {
      return undefined;
    }
    const supplied = Buffer.from(authorization, 'base64').toString('utf8');
    if (!timingSafeEqual(fingerprint(supplied), fingerprint(secret.join(':')))) {
      return undefined;
    }
    const role: BrowserRole = this.readonly ? 'readonly' : 'browser';
    const credentialHash = fingerprint(JSON.stringify(secret));
    const epoch = this.epoch;
    const settingsEpoch = settingsEpochs.get(this.store) ?? 0;
    return {
      role,
      authorized: () => {
        const current = this.credentials;
        return (
          this.enabled &&
          this.epoch === epoch &&
          (settingsEpochs.get(this.store) ?? 0) === settingsEpoch &&
          this.readonly === (role === 'readonly') &&
          Boolean(current && timingSafeEqual(credentialHash, fingerprint(JSON.stringify(current))))
        );
      },
    };
  }

  private epoch = 0;

  revoke(): void {
    this.epoch++;
    this.socketTickets.clear();
  }

  issueSocketTicket(headers: IncomingHttpHeaders, session: BrowserSession): string | undefined {
    if (!headers.host || !session.authorized() || !this.browserOriginAllowed(headers)) {
      return undefined;
    }
    const now = Date.now();
    for (const [id, ticket] of this.socketTickets) {
      if (ticket.expires <= now || !ticket.session.authorized()) {
        this.socketTickets.delete(id);
      }
    }
    if (this.socketTickets.size >= MAX_PENDING_TICKETS) {
      return undefined;
    }
    const id = randomBytes(32).toString('hex');
    this.socketTickets.set(id, { expires: now + TICKET_LIFETIME, host: headers.host.toLowerCase(), session });
    return id;
  }

  takeSocketTicket(id: unknown, headers: IncomingHttpHeaders): BrowserSession | undefined {
    if (typeof id !== 'string' || !/^[0-9a-f]{64}$/.test(id) || !this.browserOriginAllowed(headers)) {
      return undefined;
    }
    const ticket = this.socketTickets.get(id);
    if (!ticket || ticket.host !== headers.host?.toLowerCase() || ticket.expires <= Date.now() || !ticket.session.authorized()) {
      return undefined;
    }
    this.socketTickets.delete(id);
    return ticket.session;
  }
}
