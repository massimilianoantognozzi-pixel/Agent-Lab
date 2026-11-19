import { randomBytes } from 'node:crypto';

let ownedRunnerCredentials: { username: string; password: string } | undefined;

export const createOwnedRunnerAuth = (): Record<string, string> => {
  if (process.env.AIDER_DESK_USERNAME !== undefined || process.env.AIDER_DESK_PASSWORD !== undefined) {
    if (!process.env.AIDER_DESK_USERNAME || !process.env.AIDER_DESK_PASSWORD) {
      throw new Error('Set both AIDER_DESK_USERNAME and AIDER_DESK_PASSWORD.');
    }
    return {};
  }
  ownedRunnerCredentials = { username: 'local-runner', password: randomBytes(32).toString('hex') };
  return { AIDER_DESK_USERNAME: ownedRunnerCredentials.username, AIDER_DESK_PASSWORD: ownedRunnerCredentials.password, AIDER_DESK_SERVER_HOST: '127.0.0.1' };
};

export const getApiAuthHeaders = (): Record<string, string> => {
  const username = process.env.AIDER_DESK_USERNAME ?? ownedRunnerCredentials?.username;
  const password = process.env.AIDER_DESK_PASSWORD ?? ownedRunnerCredentials?.password;
  if (!username || !password) {
    return {};
  }
  return { Authorization: `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}` };
};
