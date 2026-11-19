import { Server } from 'http';
import path from 'path';

import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';

import {
  AgentApi,
  CommandsApi,
  ContextApi,
  McpApi,
  ProjectApi,
  PromptApi,
  ProvidersApi,
  SettingsApi,
  SystemApi,
  TodoApi,
  UsageApi,
  MemoryApi,
  VoiceApi,
  TerminalApi,
  ExtensionsApi,
  SkillsApi,
  ReadonlyApi,
} from '@/server/rest-api';
import { MCP_OAUTH_CALLBACK_PATH, READONLY_MODE, SERVER_PORT } from '@/constants';
import logger from '@/logger';
import { ProjectManager } from '@/project';
import { EventsHandler } from '@/events-handler';
import { Store } from '@/store';
import { isDev, isElectron } from '@/app';
import { PythonDependenciesInstaller } from '@/python-dependencies-installer';
import { createCorsOriginValidator } from '@/server/cors';
import { type BrowserSession, ServerAccess } from '@/server/server-access';

const REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class ServerController {
  private readonly app = express();
  readonly access: ServerAccess;
  private isStarted = false;
  private readonlyReady = !READONLY_MODE;

  private get isReadonlyMode(): boolean {
    return READONLY_MODE || this.store.getSettings().server.readonly === true;
  }

  constructor(
    private readonly server: Server,
    private readonly projectManager: ProjectManager,
    private readonly eventsHandler: EventsHandler,
    private readonly store: Store,
    private readonly pythonInstaller: PythonDependenciesInstaller,
  ) {
    this.access = new ServerAccess(store, () => this.store.getSettings().server.enabled);
    this.init();
  }

  private serverGuardMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Always allow health check and OAuth callback regardless of server.enabled setting
    if ((req.method === 'GET' || req.method === 'HEAD') && (req.path === '/api/health' || req.path === MCP_OAUTH_CALLBACK_PATH)) {
      next();
      return;
    }
    // In headless mode, always allow requests regardless of server.enabled setting
    if (this.access.enabled) {
      next();
    } else {
      res.status(503).json({
        error: 'Server is not started. Enable the server in your AiderDesk -> Settings -> Server.',
      });
    }
  }

  private timeoutMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Skip timeout for SSE responses (Accept: text/event-stream)
    if (req.accepts('text/event-stream')) {
      next();
      return;
    }

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      res.status(504).json({ error: 'Request timeout' });
    });
    res.setTimeout(REQUEST_TIMEOUT_MS, () => {
      res.status(504).json({ error: 'Response timeout' });
    });
    next();
  }

  private basicAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
    if ((req.method === 'GET' || req.method === 'HEAD') && (req.path === '/api/health' || req.path === MCP_OAUTH_CALLBACK_PATH)) {
      next();
      return;
    }

    if (!this.access.hasCredentials) {
      res.status(503).json({ error: 'Configure server authentication before accessing the web interface.' });
      return;
    }
    const session = this.access.authorize(req.headers);
    if (!session) {
      res.setHeader('WWW-Authenticate', 'Basic realm="AiderDesk", charset="UTF-8"');
      res.status(401).send('Authentication required');
      return;
    }
    res.locals.browserSession = session;
    next();
  }

  private setupApiRoutes(): void {
    const readonlyRouter = express.Router();
    new ReadonlyApi(this.projectManager, this.eventsHandler, this.store, () => this.readonlyReady).registerRoutes(readonlyRouter);
    this.app.use('/api/readonly', readonlyRouter);

    this.app.use('/api', (req, res, next) => {
      if (req.path === '/health' || req.path === '/mcp/oauth/callback' || req.path === '/readonly' || req.path.startsWith('/readonly/')) {
        next();
        return;
      }
      if (this.isReadonlyMode) {
        res.status(403).json({
          error: 'This action is unavailable in readonly mode.',
          code: 'READ_ONLY_MODE',
        });
        return;
      }
      next();
    });

    // Create API router
    const apiRouter = express.Router();

    // Register all API modules
    new ContextApi(this.projectManager, this.eventsHandler).registerRoutes(apiRouter);
    new PromptApi(this.eventsHandler).registerRoutes(apiRouter);
    new SettingsApi(this.eventsHandler).registerRoutes(apiRouter);
    new ProjectApi(this.eventsHandler).registerRoutes(apiRouter);
    new CommandsApi(this.eventsHandler).registerRoutes(apiRouter);
    new UsageApi(this.eventsHandler).registerRoutes(apiRouter);
    new SystemApi(this.eventsHandler, this.pythonInstaller).registerRoutes(apiRouter);
    new TodoApi(this.eventsHandler).registerRoutes(apiRouter);
    new McpApi(this.eventsHandler).registerRoutes(apiRouter);
    new ProvidersApi(this.eventsHandler).registerRoutes(apiRouter);
    new AgentApi(this.eventsHandler).registerRoutes(apiRouter);
    new MemoryApi(this.eventsHandler).registerRoutes(apiRouter);
    new VoiceApi(this.eventsHandler).registerRoutes(apiRouter);
    new TerminalApi(this.eventsHandler).registerRoutes(apiRouter);
    new ExtensionsApi(this.eventsHandler).registerRoutes(apiRouter);
    new SkillsApi(this.eventsHandler).registerRoutes(apiRouter);

    // Mount the API router globally under /api
    this.app.use('/api', apiRouter);
  }

  private setupCors(): void {
    this.app.use(cors({ origin: createCorsOriginValidator(this.store), credentials: true }));
  }

  private init() {
    this.setupCors();

    // Add server guard middleware as the first middleware
    this.app.use(this.serverGuardMiddleware.bind(this));

    // Set timeout for all requests
    this.app.use(this.timeoutMiddleware.bind(this));

    // Add Basic Auth
    this.app.use(this.basicAuthMiddleware.bind(this));
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use((_req, res, next) => {
      const session = res.locals.browserSession as BrowserSession | undefined;
      if (session && !session.authorized()) {
        res.sendStatus(401);
        return;
      }
      next();
    });

    this.app.post('/api/socket-ticket', (req, res) => {
      const session = res.locals.browserSession as BrowserSession;
      const ticket = this.access.issueSocketTicket(req.headers, session);
      res.setHeader('Cache-Control', 'no-store');
      if (!ticket) {
        res.sendStatus(403);
        return;
      }
      res.json({ ticket });
    });
    this.setupApiRoutes();

    // Serve static renderer files in production (for browser access)
    if (!isElectron() || !isDev()) {
      logger.info(`Serving static renderer files on port ${SERVER_PORT}...`, {
        dirname: __dirname,
      });
      const rendererDir = process.env.AIDER_DESK_RENDERER_DIR
        ? path.isAbsolute(process.env.AIDER_DESK_RENDERER_DIR)
          ? process.env.AIDER_DESK_RENDERER_DIR
          : path.join(__dirname, process.env.AIDER_DESK_RENDERER_DIR)
        : path.join(__dirname, '../renderer');

      this.app.use(express.static(rendererDir));
      // Handle SPA routing: serve index.html for non-API routes
      this.app.get('*', (req, res) => {
        if (this.isReadonlyMode && req.path !== '/') {
          res.redirect('/#/readonly');
          return;
        }
        res.sendFile(path.join(rendererDir, 'index.html'));
      });
    }

    logger.debug(`REST API routes registered on port ${SERVER_PORT}`);
    this.server.on('request', this.app);

    this.isStarted = this.store.getSettings().server.enabled;
  }

  setReadonlyReady(): void {
    this.readonlyReady = true;
  }

  async close() {
    this.access.revoke();
    // No need to stop server anymore - it's always attached
    this.server.off('request', this.app);
  }

  async startServer() {
    if (this.isStarted && this.store.getSettings().server.enabled && this.access.hasCredentials) {
      logger.info('Server already started');
      return false;
    }

    this.isStarted = true;
    logger.info('Starting server...');
    return true;
  }

  async stopServer() {
    if (!this.isStarted && !this.store.getSettings().server.enabled) {
      logger.info('Server already stopped');
      return false;
    }

    this.isStarted = false;
    this.access.revoke();
    logger.info('Server stopped');
    return true;
  }
}
