import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { McpServerConfig } from '@common/types';

import { AIDER_DESK_DIR, AIDER_DESK_MCP_SERVERS_FILE } from '@/constants';
import { isElectron } from '@/app';
import { getProjectAuthorityRoot } from '@/extensions/project-extension-trust';
import { goalWorktreeRevision } from '@/task/goal-verification';
import { atomicWriteJsonFile } from '@/utils/atomic-write';

const digest = (input: string) => createHash('sha256').update(input).digest('hex');
const receiptPath = (project: string) => path.join(getProjectAuthorityRoot(), 'approved-project-mcp', `${digest(project)}.json`);

type ProjectMcpAuthority = {
  project: string;
  revision: string;
  sourceRevision?: string;
};
const approvals = new WeakMap<McpServerConfig, ProjectMcpAuthority>();
export const getProjectMcpAuthority = (configuration: McpServerConfig): ProjectMcpAuthority | undefined => approvals.get(configuration);

// A checkout revision does not cover ignored scripts, installed dependencies or
// dynamically loaded code. Approving its configuration must not silently grant
// every future process the authority of the desktop account.
export const authorizeProjectMcpProcess = async (configuration: McpServerConfig, launch: McpServerConfig, serverName: string): Promise<boolean> => {
  const authority = getProjectMcpAuthority(configuration);
  if (!authority || !launch.command) {
    return true;
  }
  if (!isElectron() || process.env.AIDER_DESK_HEADLESS === 'true') {
    return process.env.AIDER_DESK_ALLOW_PROJECT_MCP === 'true';
  }
  const { BrowserWindow, dialog } = await import('electron');
  const options = {
    type: 'warning' as const,
    title: 'Agent-Lab',
    message: `Avviare il server MCP di progetto ${serverName}?`,
    detail: `${authority.project}\n\n${launch.command} ${JSON.stringify(launch.args ?? [])}\n\nIl processo può eseguire script, import e dipendenze modificabili, anche ignorati da Git. Usa i permessi del tuo account e può accedere fuori dal progetto. Il consenso vale per questo avvio; un nuovo processo richiederà una nuova conferma.`,
    buttons: ['Annulla', 'Consenti questo avvio'],
    defaultId: 0,
    cancelId: 0,
  };
  const owner = BrowserWindow.getFocusedWindow();
  const result = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options);
  return result.response === 1;
};

export const captureProjectMcpConfig = async (projectDir: string) => {
  const project = await fs.realpath(projectDir);
  const file = path.join(project, AIDER_DESK_DIR, AIDER_DESK_MCP_SERVERS_FILE);
  const stat = await fs.lstat(file);
  if (!stat.isFile() || path.relative(file, await fs.realpath(file)) || stat.size > 2 * 1024 * 1024) {
    throw new Error('Project MCP configuration must be a regular file inside the project.');
  }
  const text = await fs.readFile(file, 'utf8');
  const config = JSON.parse(text) as {
    mcpServers?: Record<string, McpServerConfig>;
  };
  if (!config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) {
    throw new Error('Invalid project MCP configuration.');
  }
  const usesLocalCommands = Object.values(config.mcpServers).some((server) => Boolean(server?.command));
  const sourceRevision = usesLocalCommands ? await goalWorktreeRevision(project) : undefined;
  if (usesLocalCommands && !sourceRevision) {
    throw new Error('Local MCP commands require a verifiable project revision.');
  }
  return {
    project,
    revision: digest(text),
    sourceRevision,
    servers: config.mcpServers,
  };
};

export const approveProjectMcpConfig = async ({ project, revision, sourceRevision }: Awaited<ReturnType<typeof captureProjectMcpConfig>>): Promise<void> => {
  await atomicWriteJsonFile(receiptPath(project), {
    project,
    revision,
    sourceRevision,
  });
};

export const getApprovedProjectMcpConfig = async (projectDir: string): Promise<Record<string, McpServerConfig>> => {
  try {
    const config = await captureProjectMcpConfig(projectDir);
    const receipt = JSON.parse(await fs.readFile(receiptPath(config.project), 'utf8')) as Partial<ProjectMcpAuthority>;
    if (receipt.project !== config.project || receipt.revision !== config.revision || receipt.sourceRevision !== config.sourceRevision) {
      return {};
    }
    for (const server of Object.values(config.servers)) {
      if (server && typeof server === 'object') {
        approvals.set(server, {
          project: config.project,
          revision: config.revision,
          sourceRevision: config.sourceRevision,
        });
      }
    }
    return config.servers;
  } catch {
    return {};
  }
};

export const validateProjectMcpLaunch = async (configuration: McpServerConfig, projectDir: string | null, taskDir: string | null): Promise<void> => {
  const authority = getProjectMcpAuthority(configuration);
  if (!authority) {
    return;
  }
  if (!projectDir || path.relative(authority.project, await fs.realpath(projectDir))) {
    throw new Error('Project MCP configuration is authorized only in its own project.');
  }
  const current = await captureProjectMcpConfig(projectDir);
  if (current.revision !== authority.revision || current.sourceRevision !== authority.sourceRevision) {
    throw new Error('Project MCP configuration or code changed and needs review.');
  }
  if (configuration.command && taskDir && (await goalWorktreeRevision(taskDir)) !== authority.sourceRevision) {
    throw new Error('The task worktree does not match the reviewed project MCP code.');
  }
};
