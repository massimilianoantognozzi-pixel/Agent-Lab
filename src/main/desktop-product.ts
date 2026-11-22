import { getElectronApp } from '@/app';

export const AGENT_LAB_APP_ID = 'io.github.massimilianoantognozzi-pixel.agentlab';
export const AGENT_LAB_PORT = 24364;

export const isLocalAgentLabInstall = (): boolean => {
  if (process.platform !== 'win32' || !process.versions.electron) {
    return false;
  }
  const app = getElectronApp();
  return !!app?.isPackaged && app.getName().toLowerCase() === 'agent-lab';
};
