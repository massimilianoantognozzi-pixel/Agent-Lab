import { afterEach, describe, expect, it, vi } from 'vitest';

import { McpManager } from '../mcp-manager';
import * as hostExecution from '../tools/host-execution';

const fixture = vi.hoisted(() => ({
  project: false,
  validate: vi.fn(async () => undefined),
}));
vi.mock('@/logger', () => ({
  default: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('../project-mcp-trust', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../project-mcp-trust')>()),
  getProjectMcpAuthority: () => (fixture.project ? { project: '/fixture', revision: 'fixture' } : undefined),
  validateProjectMcpLaunch: fixture.validate,
}));

const wrapped = (serverName: string, name = 'execute_shell_command') => {
  const execute = vi.fn(async () => ({
    content: [{ type: 'text', text: 'fixture response' }],
  }));
  const close = vi.fn();
  const task = {
    addToolMessage: vi.fn(),
    getProjectDir: () => '/fixture',
    getTaskDir: () => '/fixture',
  };
  const tool = new McpManager()['wrapMcpTool'](
    serverName,
    name,
    task as never,
    { minTimeBetweenToolCalls: 0 } as never,
    { execute } as never,
    { handleToolApproval: async () => [true, undefined] } as never,
    { value: 0 },
    {
      serverName,
      serverConfig: {},
      tools: [],
      toolDefinitions: { tools: [] },
      client: { close },
    } as never,
  );
  return { tool, execute, close, task };
};
const options = { toolCallId: 'host-fixture', messages: [], context: {} };

describe('MCP host shell consent', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fixture.project = false;
    fixture.validate.mockReset().mockResolvedValue(undefined);
  });

  it.each(['serena', 'renamed-serena'])('denies the global host shell even after application approval: %s', async (server) => {
    vi.stubEnv('AIDER_DESK_ALLOW_HOST_SHELL', undefined);
    const fixture = wrapped(server);
    expect(await fixture.tool.execute!({ command: 'synthetic command' }, options)).toMatchObject({ isError: true });
    expect(fixture.execute).not.toHaveBeenCalled();
  });

  it('allows an explicitly granted host shell and keeps read-only MCP calls available without that grant', async () => {
    vi.stubEnv('AIDER_DESK_ALLOW_HOST_SHELL', 'true');
    const shell = wrapped('renamed-serena');
    expect(await shell.tool.execute!({ command: 'synthetic command' }, options)).toMatchObject({ content: [{ text: 'fixture response' }] });
    expect(shell.execute).toHaveBeenCalledOnce();
    vi.stubEnv('AIDER_DESK_ALLOW_HOST_SHELL', undefined);
    const read = wrapped('serena', 'read_file');
    await read.tool.execute!({ path: 'fixture.txt' }, options);
    expect(read.execute).toHaveBeenCalledOnce();
  });

  it('revalidates project authority after the host-consent decision', async () => {
    fixture.project = true;
    const validation = vi.spyOn(hostExecution, 'authorizeUnconfinedHostExecution').mockImplementation(async () => {
      fixture.validate.mockRejectedValue(new Error('Configuration changed during consent'));
      return true;
    });
    const shell = wrapped('serena');
    expect(await shell.tool.execute!({ command: 'synthetic command' }, options)).toMatchObject({ isError: true });
    expect(validation).toHaveBeenCalledWith(shell.task);
    expect(shell.close).toHaveBeenCalledOnce();
    expect(shell.execute).not.toHaveBeenCalled();
  });
});
