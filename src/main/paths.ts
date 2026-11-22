import path from 'path';
import { mkdirSync } from 'node:fs';

import { getElectronApp, isDev, isElectron } from '@/app';
import { isLocalAgentLabInstall } from '@/desktop-product';

// The installed fork owns its project state. Explicit launcher settings still select their own profile.
if (isLocalAgentLabInstall()) {
  process.env.AIDER_DESK_DIR ||= '.agent-lab';
}

if (process.env.AIDER_DESK_DATA_DIR) {
  const app = getElectronApp();
  if (app) {
    app.setPath('userData', process.env.AIDER_DESK_DATA_DIR);
  }
} else if (isLocalAgentLabInstall() && !process.argv.some((arg) => arg === '--user-data-dir' || arg.startsWith('--user-data-dir='))) {
  const app = getElectronApp()!;
  const roaming = process.env.APPDATA;
  const profile = path.join(roaming && path.isAbsolute(roaming) ? roaming : app.getPath('appData'), 'Agent-Lab');
  mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
} else if (isDev()) {
  const app = getElectronApp();
  if (app) {
    app.setPath('userData', `${app.getPath('userData')}-dev`);
  }
}

export const getDataDir = (): string => {
  if (process.env.AIDER_DESK_DATA_DIR) {
    return process.env.AIDER_DESK_DATA_DIR;
  }

  if (isElectron()) {
    return getElectronApp()!.getPath('userData');
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const envPaths = require('env-paths').default;
  return envPaths(isDev() ? 'aider-desk-dev' : 'aider-desk').data;
};

export const getResourceDir = (): string => {
  if (process.env.AIDER_DESK_RESOURCES_DIR) {
    return process.env.AIDER_DESK_RESOURCES_DIR;
  }

  if (isElectron()) {
    return isDev() ? path.join(__dirname, '..', '..', 'resources') : process.resourcesPath;
  }
  return path.join(__dirname, '..', 'resources');
};
