import { createServer, type Server } from 'node:http';

import { io, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServerController } from '../server-controller';

import type { Router } from 'express';
import type { AddressInfo } from 'node:net';
import type { Store } from '@/store';

import { ConnectorManager } from '@/connector/connector-manager';
import { registerConnectorAuthorization } from '@/connector/connector-auth';
import { EventManager } from '@/events/event-manager';

vi.mock('@/constants', () => ({
  AUTH_USERNAME: undefined,
  AUTH_PASSWORD: undefined,
  MCP_OAUTH_CALLBACK_PATH: '/api/mcp/oauth/callback',
  READONLY_MODE: false,
  SERVER_PORT: 0,
  CORS_ALLOWED_ORIGINS: undefined,
}));
vi.mock('@/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/server/rest-api', () => {
  class EmptyApi {
    registerRoutes() {}
  }
  return {
    AgentApi: EmptyApi,
    CommandsApi: EmptyApi,
    ContextApi: EmptyApi,
    McpApi: EmptyApi,
    ProjectApi: EmptyApi,
    PromptApi: EmptyApi,
    ProvidersApi: EmptyApi,
    SettingsApi: EmptyApi,
    TodoApi: EmptyApi,
    UsageApi: EmptyApi,
    MemoryApi: EmptyApi,
    VoiceApi: EmptyApi,
    TerminalApi: EmptyApi,
    ExtensionsApi: EmptyApi,
    SkillsApi: EmptyApi,
    ReadonlyApi: EmptyApi,
    SystemApi: class {
      registerRoutes(router: Router) {
        router.get('/health', (_req, res) => res.sendStatus(200));
        router.get('/fixture', (_req, res) => res.json({ authorized: true }));
      }
    },
  };
});

describe('local authenticated server boundary', () => {
  let server: Server | undefined;
  let connector: ConnectorManager | undefined;
  const fixtures: Socket[] = [];

  const start = async () => {
    vi.stubEnv('AIDER_DESK_HEADLESS', 'true');
    const settings = {
      server: {
        enabled: false,
        readonly: false,
        basicAuth: {
          enabled: true,
          username: 'fixture',
          password: 'example:local',
        },
        cors: { enabled: false, origins: [] },
      },
    };
    const store = { getSettings: () => settings } as unknown as Store;
    const events = new EventManager();
    const handlers = { writeToTerminal: vi.fn() };
    const project = {
      baseDir: 'fixture-project',
      addConnector: vi.fn(),
      getTask: vi.fn(),
    };
    const projects = {
      getOpenProject: (directory: string) => (directory === project.baseDir ? project : undefined),
      getProject: () => project,
    };
    server = createServer();
    const controller = new ServerController(server, projects as never, handlers as never, store, {} as never);
    connector = new ConnectorManager(server, projects as never, events, store, handlers as never, controller.access);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const authorization = `Basic ${Buffer.from('fixture:example:local').toString('base64')}`;
    const connect = async (auth: Record<string, string>) => {
      const socket = io(baseUrl, {
        auth,
        autoConnect: false,
        reconnection: false,
        timeout: 2000,
      });
      fixtures.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
        socket.connect();
      });
      return socket;
    };
    const browser = async () => {
      const response = await fetch(`${baseUrl}/api/socket-ticket`, {
        method: 'POST',
        headers: { authorization },
      });
      expect(response.status).toBe(200);
      return connect((await response.json()) as { ticket: string });
    };
    return {
      settings,
      events,
      handlers,
      project,
      connect,
      browser,
      controller,
    };
  };

  const disconnectedAfter = async (socket: Socket, operation: () => void) => {
    const disconnected = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
    operation();
    await disconnected;
    expect(socket.connected).toBe(false);
  };

  afterEach(async () => {
    for (const socket of fixtures.splice(0)) {
      socket.disconnect();
    }
    await connector?.close();
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    vi.unstubAllEnvs();
  });

  it('protects REST, admits a valid browser ticket, and rejects a socket without identity', async () => {
    vi.stubEnv('AIDER_DESK_HEADLESS', 'true');
    const settings = {
      server: {
        enabled: false,
        readonly: false,
        basicAuth: {
          enabled: false,
          username: 'fixture',
          password: 'example:local',
        },
        cors: { enabled: false, origins: [] },
      },
    };
    const store = { getSettings: () => settings } as unknown as Store;
    const dependencies = {} as never;
    server = createServer();
    const controller = new ServerController(server, dependencies, dependencies, store, dependencies);
    connector = new ConnectorManager(server, dependencies, { unsubscribe: vi.fn() } as never, store, dependencies, controller.access);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    expect((await fetch(`${baseUrl}/api/health`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/fixture`)).status).toBe(503);
    settings.server.basicAuth.enabled = true;
    expect((await fetch(`${baseUrl}/api/fixture`)).status).toBe(401);

    const authorization = `Basic ${Buffer.from('fixture:example:local').toString('base64')}`;
    const response = await fetch(`${baseUrl}/api/fixture`, {
      headers: { authorization },
    });
    expect(await response.json()).toEqual({ authorized: true });

    const ticketResponse = await fetch(`${baseUrl}/api/socket-ticket`, {
      method: 'POST',
      headers: { authorization },
    });
    expect(ticketResponse.status).toBe(200);
    const { ticket } = (await ticketResponse.json()) as { ticket: string };

    const connect = (auth: Record<string, string>) =>
      new Promise<string>((resolve) => {
        const socket = io(baseUrl, {
          auth,
          autoConnect: false,
          reconnection: false,
          timeout: 2000,
        });
        fixtures.push(socket);
        socket.on('connect', () => resolve('connected'));
        socket.on('connect_error', () => resolve('denied'));
        socket.connect();
      });
    expect(await connect({})).toBe('denied');
    expect(await connect({ ticket })).toBe('connected');
    expect(await connect({ ticket })).toBe('denied');
  });

  it.each([
    ['other-project', 'task'],
    ['fixture-project', 'other-task'],
  ])('denies a connector claiming a different project/task: %s %s', async (baseDir, taskId) => {
    const fixture = await start();
    const identity = registerConnectorAuthorization('fixture-project', 'task');
    try {
      const socket = await fixture.connect({
        connectorToken: identity.token,
      });
      await disconnectedAfter(socket, () =>
        socket.emit('message', {
          action: 'init',
          source: 'aider',
          baseDir,
          taskId,
        }),
      );
      expect(fixture.project.addConnector).not.toHaveBeenCalled();
    } finally {
      identity.revoke();
    }
  });

  it('disconnects a live connector when its process identity is revoked', async () => {
    const fixture = await start();
    const identity = registerConnectorAuthorization('fixture-project', 'task');
    const socket = await fixture.connect({ connectorToken: identity.token });
    await disconnectedAfter(socket, () => identity.revoke());
  });

  it('allows a valid terminal message and rejects the existing browser after authority revocation', async () => {
    const fixture = await start();
    const socket = await fixture.browser();
    const message = {
      action: 'write-to-terminal',
      terminalId: 'fixture-terminal',
      data: 'synthetic input',
    };
    socket.emit('message', message);
    await vi.waitFor(() => expect(fixture.handlers.writeToTerminal).toHaveBeenCalledExactlyOnceWith(message.terminalId, message.data));
    fixture.controller.access.revoke();
    await disconnectedAfter(socket, () => socket.emit('message', message));
    expect(fixture.handlers.writeToTerminal).toHaveBeenCalledOnce();
  });

  it('rejects terminal writes from readonly sessions and invalidates a connected writer on readonly change', async () => {
    const fixture = await start();
    const writer = await fixture.browser();
    fixture.settings.server.readonly = true;
    const viewer = await fixture.browser();
    const message = {
      action: 'write-to-terminal',
      terminalId: 'fixture-terminal',
      data: 'denied fixture',
    };
    await disconnectedAfter(viewer, () => viewer.emit('message', message));
    await disconnectedAfter(writer, () => writer.emit('message', message));
    expect(fixture.handlers.writeToTerminal).not.toHaveBeenCalled();
  });

  it('stops broadcasting to an already subscribed browser after revocation', async () => {
    const fixture = await start();
    const socket = await fixture.browser();
    const received = vi.fn();
    socket.on('event', received);
    const subscribed = vi.spyOn(fixture.events, 'subscribe');
    socket.emit('message', {
      action: 'subscribe-events',
      eventTypes: ['project-started'],
      baseDirs: ['fixture-project'],
    });
    await vi.waitFor(() => expect(subscribed).toHaveBeenCalledOnce());
    fixture.events.sendProjectStarted('fixture-project');
    await vi.waitFor(() => expect(received).toHaveBeenCalledOnce());
    fixture.controller.access.revoke();
    await disconnectedAfter(socket, () => fixture.events.sendProjectStarted('fixture-project'));
    expect(received).toHaveBeenCalledOnce();
  });
});
