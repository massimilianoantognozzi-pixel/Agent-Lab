import { randomBytes } from 'crypto';

type ConnectorAuthorization = { baseDir: string; taskId: string; authorized: () => boolean; onRevoke: (close: () => void) => () => void };

const activeConnectors = new Map<string, ConnectorAuthorization>();

export const registerConnectorAuthorization = (baseDir: string, taskId: string) => {
  const token = randomBytes(32).toString('hex');
  const subscriptions = new Set<() => void>();
  activeConnectors.set(token, {
    baseDir,
    taskId,
    authorized: () => activeConnectors.has(token),
    onRevoke: (close) => {
      subscriptions.add(close);
      return () => {
        subscriptions.delete(close);
      };
    },
  });
  return {
    token,
    revoke: () => {
      activeConnectors.delete(token);
      for (const close of subscriptions) {
        close();
      }
      subscriptions.clear();
    },
  };
};

export const getConnectorAuthorization = (token: unknown): ConnectorAuthorization | undefined =>
  typeof token === 'string' && /^[0-9a-f]{64}$/.test(token) ? activeConnectors.get(token) : undefined;
