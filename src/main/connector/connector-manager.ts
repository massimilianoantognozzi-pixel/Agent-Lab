import { Server as HttpServer } from 'http';

import { ModelsData, QuestionData, TokensInfoData } from '@common/types';
import { Server, Socket } from 'socket.io';

import type { BrowserSession, ServerAccess } from '@/server/server-access';

import logger from '@/logger';
import {
  isAddFileMessage,
  isAskQuestionMessage,
  isDropFileMessage,
  isInitMessage,
  isPromptFinishedMessage,
  isResponseMessage,
  isSetModelsMessage,
  isTokensInfoMessage,
  isUpdateAutocompletionMessage,
  isUpdateContextFilesMessage,
  isUpdateRepoMapMessage,
  isUseCommandOutputMessage,
  LogMessage,
  Message,
  isAddMessageMessage,
  isSubscribeEventsMessage,
  isUnsubscribeEventsMessage,
  isWriteToTerminalMessage,
  isReadonlySubscribeEventsMessage,
  isReadonlyUnsubscribeEventsMessage,
} from '@/messages';
import { Connector } from '@/connector/connector';
import { ProjectManager } from '@/project';
import { EventManager } from '@/events';
import { EventsHandler } from '@/events-handler';
import { Store } from '@/store';
import { createCorsOriginValidator } from '@/server/cors';
import { getConnectorAuthorization } from '@/connector/connector-auth';

export const READONLY_EVENT_TYPES = [
  'task-created',
  'task-updated',
  'task-started',
  'task-completed',
  'task-cancelled',
  'task-deleted',
  'user-message',
  'response-chunk',
  'response-completed',
  'tool',
  'tool-input-chunk',
  'log',
  'command-output',
  'clear-task',
  'message-removed',
  'extension-ui-refresh',
  'extensions-updated',
] as const;

const readonlyEventTypes = new Set<string>(READONLY_EVENT_TYPES);

export class ConnectorManager {
  private io: Server | null = null;
  private connectors: Connector[] = [];

  constructor(
    httpServer: HttpServer,
    private readonly projectManager: ProjectManager,
    private readonly eventManager: EventManager,
    private readonly store: Store,
    private readonly eventsHandler: EventsHandler,
    private readonly access: ServerAccess,
  ) {
    this.init(httpServer);
  }

  public init(httpServer: HttpServer): void {
    this.io = new Server(httpServer, {
      cors: {
        origin: createCorsOriginValidator(this.store),
        methods: ['GET', 'POST'],
      },
      pingTimeout: 600_000, // 10 minutes
      maxHttpBufferSize: 1e8, // Increase payload size to 100 MB
    });

    this.io.use((socket, next) => {
      const connector = getConnectorAuthorization(socket.handshake.auth.connectorToken);
      if (connector?.authorized()) {
        socket.data.connectorAuthorization = connector;
        next();
        return;
      }
      const browser = this.access.takeSocketTicket(socket.handshake.auth.ticket, socket.handshake.headers);
      if (browser) {
        socket.data.browserSession = browser;
        next();
        return;
      }
      next(new Error('Unauthorized Socket.IO client'));
    });

    // Log when Socket.IO server is ready to accept connections
    // The 'connection' event fires after the namespace handshake is complete
    this.io.engine.on('connection_error', (err) => {
      logger.warn('Socket.IO engine connection error', { error: err.message });
    });

    this.io.on('connection', (socket) => {
      const authorization = socket.data.connectorAuthorization as ReturnType<typeof getConnectorAuthorization>;
      if (authorization && !authorization.authorized()) {
        socket.disconnect(true);
        return;
      }
      const unsubscribeRevocation = authorization?.onRevoke(() => socket.disconnect(true));
      logger.info('Socket.IO client connected', {
        socketId: socket.id,
        handshake: {
          time: socket.handshake.time,
          address: socket.handshake.address,
        },
      });

      socket.on('message', (message) => this.processMessage(socket, message));
      socket.on('log', (message) => {
        const connector = socket.data.connectorAuthorization as ReturnType<typeof getConnectorAuthorization>;
        if (!connector?.authorized() || !this.findConnectorBySocket(socket)) {
          socket.disconnect(true);
          return;
        }
        this.processLogMessage(socket, message);
      });

      socket.on('disconnect', (reason) => {
        unsubscribeRevocation?.();
        const connector = this.findConnectorBySocket(socket);
        logger.info('Socket.IO client disconnected', {
          baseDir: connector?.baseDir,
          reason,
          socketId: socket.id,
        });
        this.eventManager.unsubscribe(socket);
        if (connector) {
          this.removeConnector(socket);
        }
      });
    });

    logger.info('Socket.IO server initialized');
  }

  public async close() {
    logger.info('Closing Socket.IO server');
    this.connectors.forEach((connector) => connector.socket.disconnect());
    await this.io?.close();
  }

  private processBrowserMessage(socket: Socket, message: Message, session: BrowserSession): void {
    if (!session.authorized()) {
      socket.disconnect(true);
      return;
    }
    if (session.role === 'readonly') {
      if (isReadonlySubscribeEventsMessage(message)) {
        const project = this.projectManager.getOpenProject(message.projectDir);
        const validEventTypes = message.eventTypes.every((eventType) => readonlyEventTypes.has(eventType));
        if (project?.baseDir === message.projectDir && validEventTypes) {
          this.eventManager.subscribe(socket, {
            eventTypes: message.eventTypes,
            baseDirs: [message.projectDir],
            readonly: true,
            authorized: session.authorized,
          });
          return;
        }
      } else if (isReadonlyUnsubscribeEventsMessage(message)) {
        this.eventManager.unsubscribe(socket);
        return;
      }
    } else if (isSubscribeEventsMessage(message)) {
      this.eventManager.subscribe(socket, { eventTypes: message.eventTypes, baseDirs: message.baseDirs, authorized: session.authorized });
      return;
    } else if (isUnsubscribeEventsMessage(message)) {
      this.eventManager.unsubscribe(socket);
      return;
    } else if (isWriteToTerminalMessage(message)) {
      this.eventsHandler.writeToTerminal(message.terminalId, message.data);
      return;
    }
    socket.disconnect(true);
  }

  private processMessage = (socket: Socket, message: Message) => {
    try {
      const browser = socket.data.browserSession as BrowserSession | undefined;
      if (browser) {
        this.processBrowserMessage(socket, message, browser);
        return;
      }
      const authorization = socket.data.connectorAuthorization as ReturnType<typeof getConnectorAuthorization>;
      if (!authorization?.authorized()) {
        socket.disconnect(true);
        return;
      }

      logger.debug('Message:', {
        message: JSON.stringify(message).slice(0, 1000),
      });

      if (isInitMessage(message)) {
        if (message.source !== 'aider' || message.baseDir !== authorization.baseDir || message.taskId !== authorization.taskId) {
          socket.disconnect(true);
          return;
        }
        if (this.findConnectorBySocket(socket)) {
          return;
        }
        logger.info('Initializing connector for base directory:', {
          baseDir: message.baseDir,
          taskId: message.taskId,
          listenTo: message.listenTo,
        });

        // Check if there's an existing connector with the same baseDir and taskId
        // This can happen on reconnection when the old connector wasn't properly cleaned up
        const existingConnector = this.connectors.find((c) => c.baseDir === message.baseDir && c.taskId === message.taskId);
        if (existingConnector) {
          logger.info('Removing existing connector before creating new one', {
            baseDir: message.baseDir,
            taskId: message.taskId,
          });
          existingConnector.socket.disconnect(true);
        }

        const connector = new Connector(socket, message.baseDir, message.taskId, message.source, message.listenTo, message.inputHistoryFile);
        this.connectors.push(connector);

        const project = this.projectManager.getProject(message.baseDir);
        void project.addConnector(connector);

        message.contextFiles?.forEach((file) => project.getTask(connector.taskId)?.addFiles(file));
        logger.info('Socket.IO registered project for base directory:', {
          baseDir: message.baseDir,
          taskId: message.taskId,
        });
      } else if (isResponseMessage(message)) {
        const connector = this.findConnectorBySocket(socket);
        if (!connector) {
          return;
        }
        void this.projectManager.getProject(connector.baseDir).getTask(connector.taskId)?.processResponseMessage(message);
      } else if (isAddFileMessage(message)) {
        const connector = this.findConnectorBySocket(socket);
        if (!connector) {
          return;
        }
        logger.info('Adding file in project', { baseDir: connector.baseDir });
        const project = this.projectManager.getProject(connector.baseDir);
        if (connector.taskId) {
          project.getTask(connector.taskId)?.addFiles({
            path: message.path,
            readOnly: message.readOnly,
          });
        } else {
          project.forEachTask((task) =>
            task.addFiles({
              path: message.path,
              readOnly: message.readOnly,
            }),
          );
          project.getInternalTask()?.addFiles({
            path: message.path,
            readOnly: message.readOnly,
          });
        }
      } else if (isDropFileMessage(message)) {
        const connector = this.findConnectorBySocket(socket);
        if (!connector) {
          return;
        }
        logger.info('Dropping file in project', { baseDir: connector.baseDir });
        const project = this.projectManager.getProject(connector.baseDir);
        if (connector.taskId) {
          project.getTask(connector.taskId)?.dropFile(message.path);
        } else {
          project.forEachTask((task) => task.dropFile(message.path));
          project.getInternalTask()?.dropFile(message.path);
        }
      } else if (isUpdateAutocompletionMessage(message)) {
        const connector = this.findConnectorBySocket(socket);
        if (!connector) {
          return;
        }

        logger.debug('Updating autocompletion', { baseDir: connector.baseDir });
        if (connector.taskId) {
          const project = this.projectManager.getProject(connector.baseDir);
          const task = project.getTask(connector.taskId);
          if (task) {
            void task.updateAutocompletionData(message.words);
          }
        } else {
          // Handle the case where taskId is not available, e.g., log an error or apply to all tasks
          logger.warn('Received update-autocompletion message from a connector without a taskId.');
        }
      } else if (isAskQuestionMessage(message)) {
        const connector = this.findConnectorBySocket(socket);
        if (!connector) {
          return;
        }
        if (!connector.taskId) {
          logger.error('Connector taskId is undefined, cannot ask question', { baseDir: connector.baseDir });
          return;
        }
        const questionData: QuestionData = {
          baseDir: connector.baseDir,
          taskId: connector.taskId,
          text: message.question,
          subject: message.subject,
          defaultAnswer: message.defaultAnswer,
          isGroupQuestion: message.isGroupQuestion,
        };
        void this.projectManager.getProject(connector.baseDir).getTask(connector.taskId)?.askQuestion(questionData, false);
      } else if (isSetModelsMessage(message)) {
        const connector = this.findConnectorBySocket(socket);
        if (!connector) {
          return;
        }
        const modelsData: ModelsData = {
          baseDir: connector.baseDir,
          taskId: connector.taskId!,
          ...message,
        };

        this.projectManager.getProject(connector.baseDir).getTask(connector.taskId)?.updateAiderModels(modelsData);
      } else if (isUpdateContextFilesMessage(message)) {
        const connector = this.findConnectorBySocket(socket);
        if (!connector) {
          return;
        }
        this.projectManager.getProject(connector.baseDir).getTask(connector.taskId)?.updateContextFiles(message.files);
      } else if (isUseCommandOutputMessage(message)) {
        logger.info('Use command output', { ...message });

        const connector = this.findConnectorBySocket(socket);
        if (!connector) {
          return;
        }
        const project = this.projectManager.getProject(connector.baseDir);
        if (message.finished) {
          project.getTask(connector.taskId)?.closeCommandOutput(message.addToContext);
        } else {
          project.getTask(connector.taskId)?.openCommandOutput(message.command);
        }
      } else if (isTokensInfoMessage(message)) {
        const connector = this.findConnectorBySocket(socket);
        if (!connector) {
          return;
        }

        const data: TokensInfoData = {
          baseDir: connector.baseDir,
          taskId: connector.taskId!,
          ...message.info,
        };
        this.projectManager.getProject(connector.baseDir).getTask(connector.taskId)?.updateTokensInfo(data);
      } else if (isPromptFinishedMessage(message)) {
        const connector = this.findConnectorBySocket(socket);
        if (!connector) {
          return;
        }
        logger.info('Prompt finished', {
          baseDir: connector.baseDir,
          promptId: message.promptId,
        });
        this.projectManager.getProject(connector.baseDir).getTask(connector.taskId)?.promptFinished(message.promptId);
      } else if (isUpdateRepoMapMessage(message)) {
        const connector = this.findConnectorBySocket(socket);
        if (!connector) {
          return;
        }
        logger.debug('Updating repo map', { baseDir: connector.baseDir });
        this.projectManager.getProject(connector.baseDir).getTask(connector.taskId)?.updateRepoMapFromConnector(message.repoMap);
      } else if (isAddMessageMessage(message)) {
        const connector = this.findConnectorBySocket(socket);
        if (!connector) {
          return;
        }
        void this.projectManager
          .getProject(connector.baseDir)
          .getTask(connector.taskId)
          ?.addRoleContextMessage(message.role, message.content, message.usageReport);
      } else {
        logger.warn('Unknown message type: ', message);
      }
    } catch (error) {
      logger.error('Socket.IO message parsing error:', { error });
    }
  };

  private processLogMessage = (socket: Socket, message: LogMessage) => {
    logger.debug('Received log message from connector', { message });
    const connector = this.findConnectorBySocket(socket);
    if (!connector) {
      return;
    }

    const project = this.projectManager.getProject(connector.baseDir);
    project.getTask(connector.taskId)?.addLogMessage(message.level, message.message, message.finished, message.promptContext);
  };

  private removeConnector = (socket: Socket) => {
    const connector = this.findConnectorBySocket(socket);
    if (!connector) {
      return;
    }

    const project = this.projectManager.getProject(connector.baseDir);
    project.removeConnector(connector);

    this.connectors = this.connectors.filter((c) => c !== connector);
  };

  private findConnectorBySocket = (socket: Socket): Connector | undefined => {
    const connector = this.connectors.find((c) => c.socket === socket);
    if (!connector) {
      logger.warn('Connector not found');
    }
    return connector;
  };
}
