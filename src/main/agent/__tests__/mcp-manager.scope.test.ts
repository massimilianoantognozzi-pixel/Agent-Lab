import { describe, it, expect } from 'vitest';

import { McpConfigManager } from '../mcp-config-manager';
import { McpManager } from '../mcp-manager';

import type { McpServerConfig } from '@common/types';
import type { EventManager } from '@/events';
import type { Store } from '@/store';

describe('Managed shadcn catalog scope', () => {
  it('only resolves the reserved catalog name from the global profile', () => {
    const manager = new McpConfigManager({} as EventManager, {} as Store);
    const global = { command: 'npx', args: ['shadcn@4.23.0', 'mcp'] };
    const project = { command: 'node', args: ['project-server.js'] };
    const projectServers = new Map([['/project', { 'shadcn-catalog': project, 'project-tool': project }]]);
    Object.assign(manager, { projectServers });
    expect(manager.getMergedServers('/project')).toEqual({ 'project-tool': project });
    expect(manager.resolveServer('shadcn-catalog', '/project', project)).toBeUndefined();
    Object.assign(manager, { globalServers: { 'shadcn-catalog': global } });
    expect(manager.getMergedServers('/project')).toEqual({ 'shadcn-catalog': global, 'project-tool': project });
    expect(manager.resolveServer('shadcn-catalog', '/project', project)).toBe(global);
    expect(manager.resolveServer('project-tool', '/project', project)).toBe(project);
  });
});

describe('McpManager - scope calculation', () => {
  it('should calculate scope without interpolation', () => {
    const manager = new McpManager();
    const config: McpServerConfig = {
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem', '/path'],
    };

    // Access private method via any for testing
    const scope = (manager as any).calculateServerScope(config, '/project', '/project/worktree', 'test-server');
    expect(scope).toBe('/project/worktree');
  });

  it('should calculate scope with taskDir when no projectDir', () => {
    const manager = new McpManager();
    const config: McpServerConfig = {
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem', '/path'],
    };

    const scope = (manager as any).calculateServerScope(config, null, '/project/worktree', 'test-server');
    expect(scope).toBe('/project/worktree');
  });

  it('should calculate scope with projectDir when no taskDir', () => {
    const manager = new McpManager();
    const config: McpServerConfig = {
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem', '/path'],
    };

    const scope = (manager as any).calculateServerScope(config, '/project', null, 'test-server');
    expect(scope).toBe('/project');
  });

  it('should calculate global scope when no interpolation and no dirs', () => {
    const manager = new McpManager();
    const config: McpServerConfig = {
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem', '/path'],
    };

    const scope = (manager as any).calculateServerScope(config, null, null, 'test-server');
    expect(scope).toBe('global');
  });

  it('should calculate global scope for a remote server without interpolation', () => {
    const manager = new McpManager();
    const config: McpServerConfig = {
      url: 'http://localhost:8080/sse',
    };

    const scope = (manager as any).calculateServerScope(config, '/project', '/project/worktree', 'test-server');
    expect(scope).toBe('global');
  });

  it('should calculate scope with projectDir interpolation only', () => {
    const manager = new McpManager();
    const config: McpServerConfig = {
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem', '${projectDir}/data'],
    };

    const scope = (manager as any).calculateServerScope(config, '/project', '/project/worktree', 'test-server');
    expect(scope).toBe('/project');
  });

  it('should calculate global scope with projectDir interpolation but no projectDir', () => {
    const manager = new McpManager();
    const config: McpServerConfig = {
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem', '${projectDir}/data'],
    };

    const scope = (manager as any).calculateServerScope(config, null, '/project/worktree', 'test-server');
    expect(scope).toBe('global');
  });

  it('should calculate scope with both projectDir and taskDir interpolation', () => {
    const manager = new McpManager();
    const config: McpServerConfig = {
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem', '${projectDir}/${taskDir}'],
    };

    const scope = (manager as any).calculateServerScope(config, '/project', '/project/worktree', 'test-server');
    expect(scope).toBe('/project:/project/worktree');
  });

  it('should calculate global scope with both interpolations but no projectDir', () => {
    const manager = new McpManager();
    const config: McpServerConfig = {
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem', '${projectDir}/${taskDir}'],
    };

    const scope = (manager as any).calculateServerScope(config, null, '/project/worktree', 'test-server');
    expect(scope).toBe('global');
  });

  it('should detect interpolation in env vars', () => {
    const manager = new McpManager();
    const config: McpServerConfig = {
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem', '/path'],
      env: {
        PROJECT_PATH: '${projectDir}',
      },
    };

    const scope = (manager as any).calculateServerScope(config, '/project', '/project/worktree', 'test-server');
    expect(scope).toBe('/project');
  });

  it('should detect interpolation in URL', () => {
    const manager = new McpManager();
    const config: McpServerConfig = {
      url: 'http://localhost:8080/${projectDir}',
    };

    const scope = (manager as any).calculateServerScope(config, '/project', '/project/worktree', 'test-server');
    expect(scope).toBe('/project');
  });

  it('should detect interpolation in headers', () => {
    const manager = new McpManager();
    const config: McpServerConfig = {
      url: 'http://localhost:8080',
      headers: {
        'X-Project-Dir': '${projectDir}',
      },
    };

    const scope = (manager as any).calculateServerScope(config, '/project', '/project/worktree', 'test-server');
    expect(scope).toBe('/project');
  });
});
