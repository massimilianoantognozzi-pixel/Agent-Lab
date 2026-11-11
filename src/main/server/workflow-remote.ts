import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

import { nativeImage } from 'electron';
import { z } from 'zod';
import { AutonomyMode, DEFAULT_AUTONOMY_MODE } from '@common/types';

import { renderRemotePairingCard } from '../../../lab/scripts/workflow-pairing-card.mjs';

import { workflowRemotePage } from './workflow-remote-page';
import { createRemoteDeviceStore, type RemoteDeviceStore } from './workflow-remote-device';
import { createRemotePairingDialog } from './workflow-remote-pairing-dialog';

import type { EventsHandler } from '@/events-handler';
import type { RemoteTaskSettings } from '@/task/workflow-remote-history';

import { RESOURCES_DIR } from '@/constants';
import { atomicWriteJsonFile } from '@/utils/atomic-write';
import { listWorkflowProjects } from '@/task/workflow-policy';
import { remoteReasoningOptions, remoteTaskLabel } from '@/task/workflow-remote-history';

const ttl = 30 * 60_000;
const tokenDigest = (value: string) => createHash('sha256').update(value).digest();
const pairingSchema = z.strictObject({
  project: z.string(),
  code: z.string().regex(/^[a-f0-9]{32}$/),
  expiresAt: z.number(),
  generation: z.union([z.literal('initial'), z.uuid()]).optional(),
});
const taskId = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const taskSettings = { autonomy: z.enum(AutonomyMode).optional(), reasoning: z.enum(remoteReasoningOptions).optional() };
const action = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('create'), ...taskSettings }),
  z.strictObject({ action: z.literal('device-ready') }),
  z.strictObject({ action: z.literal('settings'), id: taskId, ...taskSettings }),
  z.strictObject({ action: z.literal('patch'), id: taskId, revision }),
  z.strictObject({
    action: z.literal('run'),
    id: taskId,
    prompt: z
      .string()
      .trim()
      .max(1500)
      .regex(/^\/workflow (bug|change|feature)\s+\S/),
  }),
  z.strictObject({ action: z.literal('resume'), id: taskId }),
  z.strictObject({ action: z.literal('approve'), id: taskId, revision }),
  z.strictObject({ action: z.literal('stop'), id: taskId }),
]);
type Pairing = z.infer<typeof pairingSchema>;
type Workflows = {
  info: () => { autonomyLocked: boolean; model: string };
  list: () => Promise<{ id: string; name: string; state?: string }[]>;
  create: (settings: RemoteTaskSettings) => Promise<string>;
  settings: (id: string, settings: RemoteTaskSettings) => Promise<void>;
  patch: (id: string, revision: string) => Promise<string>;
  read: (id: string) => Promise<unknown>;
  run: (id: string, prompt: string) => Promise<void>;
  stop: (id: string) => Promise<void>;
};

const json = (response: ServerResponse, status: number, value: unknown) =>
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(value));

const body = async (request: IncomingMessage): Promise<unknown> => {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new Error('Formato non valido.');
  }
  const parts: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 8192) {
      throw new Error('Richiesta troppo grande.');
    }
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
};

const offlinePage =
  '<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent-Lab remoto</title><h1>Agent-Lab non raggiungibile</h1><p>Controlla Tailscale sul telefono e che Agent-Lab sia aperto sul PC. Poi riapri l’app.</p></html>';
const serviceWorker = [
  'self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));',
  'self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));',
  'self.addEventListener("fetch", event => { const url = new URL(event.request.url);',
  'if (event.request.mode !== "navigate" || url.origin !== self.location.origin || url.pathname !== "/") return;',
  'event.respondWith(fetch(event.request).catch(() => new Response(' +
    JSON.stringify(offlinePage) +
    ', {status:503,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}})));',
  '});',
].join('\n');

const iconSizes = [192, 512] as const;
const remoteManifest = {
  id: '/',
  name: 'Agent-Lab remoto',
  short_name: 'Agent-Lab',
  lang: 'it',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: '#000000',
  background_color: '#000000',
  icons: iconSizes.map((size) => ({ src: '/icon-' + size + '.png', sizes: size + 'x' + size, type: 'image/png', purpose: 'any' })),
};

type DeviceConfig = {
  store: RemoteDeviceStore;
  loadPairing: () => Promise<Pairing>;
  webOrigin?: string;
  onDeviceReady?: (pairingDigest: string) => void;
  isPairingCancelled?: (pairingDigest: string) => boolean;
};

const cookieName = '__Host-agentlab-device';
const deviceCookie = (token: string, maxAge = 31_536_000) => cookieName + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + maxAge;

const readDeviceCookie = (header: string | undefined): string | undefined => {
  const values =
    header
      ?.split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith(cookieName + '=')) ?? [];
  if (values.length !== 1) {
    return undefined;
  }
  const token = values[0].slice(cookieName.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
};

const sameBrowserOrigin = (request: IncomingMessage, webOrigin?: string): boolean => {
  const origin = request.headers.origin;
  return !!origin && (origin === webOrigin || origin === 'http://127.0.0.1:' + request.socket.localPort);
};

export const createWorkflowRemote = (pairing: Pairing, workflows: Workflows, icons = new Map<string, Buffer>(), deviceConfig?: DeviceConfig) => {
  let credential = { digest: tokenDigest(pairing.code), attempts: 0, consumed: false };
  let transition = Promise.resolve();
  const serialize = (operation: () => Promise<void>) => {
    const next = transition.then(operation);
    transition = next.catch(() => undefined);
    return next;
  };
  let session: { digest: Buffer; expiresAt: number; generation?: string } | undefined;
  const nonce = randomBytes(18).toString('base64');
  const page = workflowRemotePage(nonce);
  const active = new Set<string>();
  const failures = new Set<string>();

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (request.method === 'GET' && request.url === '/remote-sw.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }).end(serviceWorker);
      return;
    }
    if (request.method === 'GET' && request.url === '/manifest.webmanifest') {
      response.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(remoteManifest));
      return;
    }
    const icon = request.method === 'GET' && request.url ? icons.get(request.url) : undefined;
    if (icon) {
      response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }).end(icon);
      return;
    }
    if (request.method === 'GET' && request.url === '/') {
      response
        .writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Security-Policy':
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-" +
            nonce +
            "'; connect-src 'self'; manifest-src 'self'; img-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        })
        .end(page);
      return;
    }
    if (request.method === 'POST' && request.url === '/api/pair') {
      const input = z.strictObject({ code: z.string().max(80), client: z.literal('web').optional() }).parse(await body(request));
      if (input.client && (!deviceConfig || !sameBrowserOrigin(request, deviceConfig.webOrigin))) {
        json(response, 403, { error: 'Origine di associazione non autorizzata.' });
        return;
      }
      await serialize(async () => {
        const generation = await deviceConfig?.store.generation();
        const next = deviceConfig ? await deviceConfig.loadPairing() : pairing;
        if (next.project !== pairing.project) {
          throw new Error('Progetto di associazione cambiato.');
        }
        const digest = tokenDigest(next.code);
        if (!timingSafeEqual(digest, credential.digest)) {
          credential = { digest, attempts: 0, consumed: false };
        }
        if (deviceConfig && next.generation !== generation) {
          json(response, 403, { error: 'Genera un nuovo QR dal PC.' });
          return;
        }
        const ledger = deviceConfig ? await deviceConfig.store.read() : {};
        const usedCode = digest.toString('hex');
        if (
          credential.consumed ||
          ledger.usedCode === usedCode ||
          Date.now() >= next.expiresAt ||
          credential.attempts >= 6 ||
          deviceConfig?.isPairingCancelled?.(usedCode)
        ) {
          json(response, 403, { error: 'Associazione scaduta o già usata. Genera un nuovo QR dal PC.' });
          return;
        }
        credential.attempts++;
        if (!timingSafeEqual(tokenDigest(input.code.trim().toLowerCase()), digest)) {
          json(response, 403, { error: 'Codice di associazione non valido.' });
          return;
        }
        const token = randomBytes(32).toString('base64url');
        const tokenHash = tokenDigest(token);
        if (deviceConfig) {
          if (generation !== (await deviceConfig.store.generation()) || deviceConfig.isPairingCancelled?.(usedCode)) {
            json(response, 403, { error: 'Associazione revocata. Genera un nuovo QR dal PC.' });
            return;
          }
          const device = input.client && generation ? { digest: tokenHash.toString('hex'), generation } : undefined;
          await deviceConfig.store.write({ usedCode, device });
        }
        credential.consumed = true;
        if (input.client) {
          session = undefined;
          response.setHeader('Set-Cookie', deviceCookie(token));
          json(response, 200, { project: pairing.project });
        } else {
          session = { digest: tokenHash, expiresAt: Date.now() + ttl, generation };
          json(response, 200, { token, project: pairing.project });
        }
      });
      return;
    }
    const authorization = request.headers.authorization;
    const browserToken = authorization === undefined ? readDeviceCookie(request.headers.cookie) : undefined;
    if (browserToken && request.method === 'POST' && !sameBrowserOrigin(request, deviceConfig?.webOrigin)) {
      json(response, 403, { error: 'Origine della richiesta non autorizzata.' });
      return;
    }
    const authorizedSession = session;
    const isAuthorized = async () => {
      if (browserToken && deviceConfig) {
        const device = (await deviceConfig.store.read()).device;
        return Boolean(device && timingSafeEqual(Buffer.from(device.digest, 'hex'), tokenDigest(browserToken)));
      }
      return Boolean(
        authorizedSession &&
        session === authorizedSession &&
        authorizedSession.expiresAt > Date.now() &&
        authorizedSession.generation === (await deviceConfig?.store.generation()) &&
        authorization?.startsWith('Bearer ') &&
        timingSafeEqual(authorizedSession.digest, tokenDigest(authorization.slice(7))),
      );
    };
    const stillAuthorized = async () => {
      if (await isAuthorized()) {
        return true;
      }
      json(response, 401, { error: 'Associa questo dispositivo per continuare.' });
      return false;
    };
    if (!(await stillAuthorized())) {
      return;
    }
    if (request.method === 'POST' && request.url === '/api/revoke') {
      await serialize(async () => {
        if (!(await stillAuthorized())) {
          return;
        }
        if (browserToken && deviceConfig) {
          const { usedCode } = await deviceConfig.store.read();
          await deviceConfig.store.write({ usedCode });
          response.setHeader('Set-Cookie', deviceCookie('', 0));
        } else {
          session = undefined;
        }
        json(response, 200, { revoked: true });
      });
      return;
    }
    if (request.method === 'GET' && request.url === '/api/tasks') {
      const tasks = await workflows.list();
      if (await stillAuthorized()) {
        json(response, 200, { project: pairing.project, tasks, ...workflows.info(), defaultAutonomy: DEFAULT_AUTONOMY_MODE });
      }
      return;
    }
    const selected = /^\/api\/tasks\/([a-zA-Z0-9-]{1,80})$/.exec(request.url ?? '');
    if (request.method === 'GET' && selected) {
      const id = selected[1];
      const tasks = await workflows.list();
      if (!(await stillAuthorized())) {
        return;
      }
      if (!tasks.some((task) => task.id === id)) {
        json(response, 404, { error: 'Task fuori dal progetto associato.' });
        return;
      }
      const task = await workflows.read(id);
      if (await stillAuthorized()) {
        json(response, 200, { task, failed: failures.has(id) });
      }
      return;
    }
    if (request.method === 'POST' && request.url === '/api/action') {
      const value = action.parse(await body(request));
      if (!(await stillAuthorized())) {
        return;
      }
      if (value.action === 'device-ready') {
        const ready = browserToken && deviceConfig ? await deviceConfig.store.read() : undefined;
        if (!browserToken || !ready?.device || !ready.usedCode || !timingSafeEqual(Buffer.from(ready.device.digest, 'hex'), tokenDigest(browserToken))) {
          json(response, 403, { error: 'Dispositivo associato non riconosciuto.' });
          return;
        }
        const digest = ready.usedCode;
        response.once('finish', () => deviceConfig?.onDeviceReady?.(digest));
        json(response, 200, { ready: true });
        return;
      }
      if (value.action === 'create') {
        const id = await workflows.create({ autonomy: value.autonomy, reasoning: value.reasoning });
        if (await stillAuthorized()) {
          json(response, 200, { id });
        }
        return;
      }
      const tasks = await workflows.list();
      if (!(await stillAuthorized())) {
        return;
      }
      if (!tasks.some((task) => task.id === value.id)) {
        json(response, 404, { error: 'Task fuori dal progetto associato.' });
        return;
      }
      if (value.action === 'patch') {
        if (active.has(value.id)) {
          json(response, 409, { error: 'Task già in esecuzione.' });
          return;
        }
        const patch = await workflows.patch(value.id, value.revision);
        if (await stillAuthorized()) {
          json(response, 200, { patch });
        }
        return;
      }
      if (value.action === 'stop') {
        await workflows.stop(value.id);
        json(response, 200, { stopped: true });
        return;
      }
      if (active.has(value.id)) {
        json(response, 409, { error: 'Task già in esecuzione.' });
        return;
      }
      if (value.action === 'settings') {
        if (!value.autonomy && !value.reasoning) {
          json(response, 400, { error: 'Scegli un’impostazione da aggiornare.' });
          return;
        }
        active.add(value.id);
        try {
          await workflows.settings(value.id, { autonomy: value.autonomy, reasoning: value.reasoning });
          if (await stillAuthorized()) {
            json(response, 200, { saved: true });
          }
        } finally {
          active.delete(value.id);
        }
        return;
      }
      active.add(value.id);
      failures.delete(value.id);
      const prompt = value.action === 'approve' ? '/workflow approve ' + value.revision : value.action === 'resume' ? '/workflow resume' : value.prompt;
      void workflows
        .run(value.id, prompt)
        .catch(() => {
          failures.add(value.id);
        })
        .finally(() => {
          active.delete(value.id);
        });
      json(response, 202, { accepted: true });
      return;
    }
    json(response, 404, { error: 'Pagina non disponibile.' });
  };

  return createServer({ requestTimeout: 10_000, headersTimeout: 10_000, maxHeaderSize: 4096 }, (request, response) => {
    void handle(request, response).catch(() => {
      if (!response.headersSent) {
        json(response, 400, { error: 'Operazione rifiutata o dati non validi.' });
      }
    });
  });
};

export const startWorkflowRemote = async (events: EventsHandler) => {
  const file = process.env.AIDER_DESK_WORKFLOW_REMOTE_PAIRING;
  if (!file) {
    return undefined;
  }
  if (!path.isAbsolute(file)) {
    throw new Error('Il file di associazione deve essere assoluto.');
  }
  const loadPairing = async () => {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 8192) {
      throw new Error('File di associazione non valido.');
    }
    return pairingSchema.parse(JSON.parse(await fs.readFile(file, 'utf8')));
  };
  const pairing = await loadPairing();
  const project = listWorkflowProjects().find((item) => item.id === pairing.project);
  if (!project) {
    throw new Error('Associazione remota scaduta o priva di progetto.');
  }
  const relative = path.relative(project.root, await fs.realpath(file));
  if (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep)) {
    throw new Error('Il file di associazione deve rimanere fuori dal progetto.');
  }
  const configuredPort = process.env.AIDER_DESK_WORKFLOW_REMOTE_PORT;
  const port = configuredPort ? Number(configuredPort) : 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Porta remota non valida.');
  }
  const logo = nativeImage.createFromPath(path.join(RESOURCES_DIR, 'icon.png'));
  if (logo.isEmpty()) {
    throw new Error('Icona Agent-Lab non disponibile.');
  }
  const icons = new Map(iconSizes.map((size) => ['/icon-' + size + '.png', logo.resize({ width: size, height: size }).toPNG()]));
  const directory = path.dirname(file);
  const webOrigin = process.env.AIDER_DESK_WORKFLOW_WEB_ORIGIN;
  const store = createRemoteDeviceStore(directory, tokenDigest(JSON.stringify([project.id, project.root])).toString('hex'));
  const pairingDialog = webOrigin
    ? createRemotePairingDialog(directory, async () => {
        const fresh = {
          project: project.id,
          generation: await store.generation(),
          code: randomBytes(16).toString('hex'),
          expiresAt: Date.now() + 20 * 60_000,
        };
        const html = renderRemotePairingCard({ origin: webOrigin, code: fresh.code, expiresAt: fresh.expiresAt });
        await atomicWriteJsonFile(file, fresh);
        return { html, digest: tokenDigest(fresh.code).toString('hex') };
      })
    : undefined;
  const server = createWorkflowRemote(
    pairing,
    {
      info: () => ({
        autonomyLocked: events.getProjectSettings(project.root).autonomyModeLocked ?? false,
        model: project.model,
      }),
      list: async () =>
        (await events.getTasks(project.root))
          .filter((task) => !task.archived && (task.createdAt || task.name))
          .map((task) => ({
            id: task.id,
            name: remoteTaskLabel(task.name),
            state: task.state === 'DONE' ? undefined : task.state,
          })),
      create: async (settings) => events.createRemoteWorkflowTask(project.root, settings),
      settings: async (id, settings) => events.updateRemoteWorkflowTask(project.root, id, settings),
      patch: async (id, revision) => events.readRemoteWorkflowPatch(project.root, id, revision),
      read: async (id) => events.readRemoteWorkflowTask(project.root, id),
      run: async (id, prompt) => events.runRemoteWorkflowTask(project.root, id, prompt),
      stop: async (id) => events.interruptRemoteWorkflowTask(project.root, id),
    },
    icons,
    {
      loadPairing,
      store,
      webOrigin,
      onDeviceReady: pairingDialog?.confirm,
      isPairingCancelled: pairingDialog?.isCancelled,
    },
  );
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Indirizzo remoto non disponibile.');
  }
  try {
    await atomicWriteJsonFile(path.join(path.dirname(file), 'remote-session.json'), {
      url: 'http://127.0.0.1:' + address.port + '/',
      expiresAt: pairing.expiresAt,
      webOrigin,
    });
    return { server, pairingDialog };
  } catch (error) {
    server.close();
    server.closeAllConnections();
    throw error;
  }
};
