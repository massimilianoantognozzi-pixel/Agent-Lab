import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  approveProjectMcpConfig,
  authorizeProjectMcpProcess,
  captureProjectMcpConfig,
  getApprovedProjectMcpConfig,
  validateProjectMcpLaunch,
} from '../project-mcp-trust';
import { McpManager } from '../mcp-manager';
import * as projectTrust from '../project-mcp-trust';

const mockLaunch = (manager: McpManager) =>
  vi.spyOn(manager as unknown as { createMcpConnector: (...args: unknown[]) => Promise<unknown> }, 'createMcpConnector');

const fixture = vi.hoisted(() => ({
  authority: '',
  workspace: 'reviewed-source',
  desktop: false,
  dialog: vi.fn(),
}));
vi.mock('@/app', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app')>()),
  isElectron: () => fixture.desktop,
}));
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => undefined },
  dialog: { showMessageBox: fixture.dialog },
}));
vi.mock('@/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/constants')>()),
  AIDER_DESK_DIR: '.aider-desk',
  AIDER_DESK_MCP_SERVERS_FILE: 'mcp-servers.json',
}));
vi.mock('@/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/task/goal-verification', () => ({
  goalWorktreeRevision: async () => fixture.workspace,
}));
vi.mock('@/extensions/project-extension-trust', () => ({
  getProjectAuthorityRoot: () => fixture.authority,
}));

describe('project MCP approval', () => {
  let root: string;
  let project: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentlab-mcp-approval-'));
    fixture.authority = path.join(root, 'authority');
    fixture.workspace = 'reviewed-source';
    fixture.desktop = false;
    fixture.dialog.mockReset();
    vi.stubEnv('AIDER_DESK_ALLOW_PROJECT_MCP', undefined);
    project = path.join(root, 'project');
    await fs.mkdir(path.join(project, '.aider-desk'), { recursive: true });
    await fs.writeFile(
      path.join(project, '.aider-desk', 'mcp-servers.json'),
      JSON.stringify({
        mcpServers: { fixture: { command: 'node', args: ['server.js'] } },
      }),
    );
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(root, { force: true, recursive: true });
  });

  it('binds a locally executable MCP configuration to the reviewed source revision', async () => {
    expect(await getApprovedProjectMcpConfig(project)).toEqual({});
    await approveProjectMcpConfig(await captureProjectMcpConfig(project));
    const config = (await getApprovedProjectMcpConfig(project)).fixture;
    expect(config.command).toBe('node');
    await expect(validateProjectMcpLaunch(config, project, project)).resolves.toBeUndefined();

    fixture.workspace = 'later-source';
    expect(await getApprovedProjectMcpConfig(project)).toEqual({});
    await expect(validateProjectMcpLaunch(config, project, project)).rejects.toThrow('needs review');
  });

  const approved = async (project: string) => {
    await approveProjectMcpConfig(await captureProjectMcpConfig(project));
    return (await getApprovedProjectMcpConfig(project)).fixture;
  };

  it('requires explicit process consent even when an ignored script or dependency changes outside the revision', async () => {
    const config = await approved(project);
    const manager = new McpManager();
    const launch = mockLaunch(manager).mockResolvedValue({ client: { close: vi.fn() } });
    for (const relative of ['.aider-desk/server.js', 'ignored-helper.js', 'node_modules/fixture/index.js']) {
      const file = path.join(project, relative);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, 'changed executable fixture');
      await expect(manager['initMcpConnector'](project, project, 'fixture', config)).rejects.toThrow('process launch denied');
    }
    expect(launch).not.toHaveBeenCalled();
    vi.stubEnv('AIDER_DESK_ALLOW_PROJECT_MCP', 'true');
    await expect(manager['initMcpConnector'](project, project, 'fixture', config)).resolves.toBeDefined();
    expect(launch).toHaveBeenCalledOnce();
  });

  it('defaults native consent to cancel and asks again for each new process', async () => {
    fixture.desktop = true;
    const config = await approved(project);
    const manager = new McpManager();
    const launch = mockLaunch(manager).mockResolvedValue({ client: { close: vi.fn() } });
    fixture.dialog.mockResolvedValueOnce({ response: 0 });
    await expect(manager['initMcpConnector'](project, project, 'fixture', config)).rejects.toThrow('process launch denied');
    expect(launch).not.toHaveBeenCalled();
    fixture.dialog.mockResolvedValue({ response: 1 });
    await manager['initMcpConnector'](project, project, 'fixture', config);
    await manager['initMcpConnector'](project, project, 'fixture', config);
    expect(fixture.dialog).toHaveBeenCalledTimes(3);
    expect(fixture.dialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultId: 0,
        cancelId: 0,
        detail: expect.stringContaining('dipendenze modificabili'),
      }),
    );
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('revalidates the configuration after the consent dialog', async () => {
    fixture.desktop = true;
    const config = await approved(project);
    const manager = new McpManager();
    const launch = mockLaunch(manager);
    fixture.dialog.mockImplementation(async () => {
      fixture.workspace = 'changed-during-consent';
      return { response: 1 };
    });
    await expect(manager['initMcpConnector'](project, project, 'fixture', config)).rejects.toThrow('needs review');
    expect(launch).not.toHaveBeenCalled();
  });

  it('recovers from a denied pooled initialization and asks again before a fresh process', async () => {
    fixture.desktop = true;
    const config = await approved(project);
    const manager = new McpManager();
    const close = vi.fn();
    const launch = mockLaunch(manager).mockImplementation(async () => ({
      serverName: 'fixture',
      tools: [],
      toolDefinitions: { tools: [] },
      client: { close },
      serverConfig: config,
    }));
    vi.spyOn(manager as unknown as { saveToolsCache: () => Promise<void> }, 'saveToolsCache').mockResolvedValue(undefined);
    fixture.dialog.mockResolvedValueOnce({ response: 0 }).mockResolvedValue({ response: 1 });
    expect(await manager['initMcpConnectors']({ fixture: config }, project, project)).toEqual([]);
    const started = await manager['initMcpConnectors']({ fixture: config }, project, project);
    expect(started).toHaveLength(1);
    expect(fixture.dialog).toHaveBeenCalledTimes(2);
    expect(await manager['initMcpConnectors']({ fixture: config }, project, project)).toEqual(started);
    expect(fixture.dialog).toHaveBeenCalledTimes(2);
    await started[0].revoke!();
    expect(started[0].revoked).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect(await manager['initMcpConnectors']({ fixture: config }, project, project)).toHaveLength(1);
    expect(fixture.dialog).toHaveBeenCalledTimes(3);
    expect(launch).toHaveBeenCalledTimes(2);
    await manager.close();
  });

  it('revokes an already wrapped tool before its sensitive sink', async () => {
    const config = await approved(project);
    const execute = vi.fn(async () => ({
      content: [{ type: 'text', text: 'legitimate fixture' }],
    }));
    const close = vi.fn();
    const task = {
      addToolMessage: vi.fn(),
      getProjectDir: () => project,
      getTaskDir: () => project,
    };
    const manager = new McpManager();
    const tool = manager['wrapMcpTool'](
      'fixture',
      'test',
      task as never,
      { minTimeBetweenToolCalls: 0 } as never,
      { execute } as never,
      { handleToolApproval: async () => [true, undefined] } as never,
      { value: 0 },
      {
        serverName: 'fixture',
        serverConfig: { ...config },
        approvalConfig: config,
        client: { close },
        tools: [],
        toolDefinitions: { tools: [] },
      } as never,
    );
    const options = { toolCallId: 'fixture', messages: [], context: {} };
    expect(await tool.execute!({}, options)).toMatchObject({
      content: [{ text: 'legitimate fixture' }],
    });
    await fs.writeFile(path.join(project, '.aider-desk', 'mcp-servers.json'), JSON.stringify({ mcpServers: {} }));
    expect(await tool.execute!({}, options)).toMatchObject({ isError: true });
    expect(execute).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not add a project-process grant to global or remote MCP definitions', async () => {
    expect(await authorizeProjectMcpProcess({ command: 'node' }, { command: 'node' }, 'global')).toBe(true);
    expect(await authorizeProjectMcpProcess({ url: 'https://example.invalid' }, { url: 'https://example.invalid' }, 'remote')).toBe(true);
    expect(fixture.dialog).not.toHaveBeenCalled();
  });

  it('does not call a tool revoked concurrently with its asynchronous validation', async () => {
    const config = await approved(project);
    const execute = vi.fn();
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const validation = vi.spyOn(projectTrust, 'validateProjectMcpLaunch').mockImplementationOnce(() => waiting);
    const connector = {
      revoked: false,
      serverName: 'fixture',
      serverConfig: config,
      approvalConfig: config,
      client: { close: vi.fn() },
      tools: [],
      toolDefinitions: { tools: [] },
    };
    const task = { addToolMessage: vi.fn(), getProjectDir: () => project, getTaskDir: () => project };
    const tool = new McpManager()['wrapMcpTool'](
      'fixture',
      'test',
      task as never,
      { minTimeBetweenToolCalls: 0 } as never,
      { execute } as never,
      { handleToolApproval: async () => [true, undefined] } as never,
      { value: 0 },
      connector as never,
    );
    try {
      const result = tool.execute!({}, { toolCallId: 'concurrent-fixture', messages: [], context: {} });
      await vi.waitFor(() => expect(validation).toHaveBeenCalledOnce());
      connector.revoked = true;
      finish();
      expect(await result).toMatchObject({ isError: true });
      expect(execute).not.toHaveBeenCalled();
    } finally {
      finish();
      validation.mockRestore();
    }
  });
});
