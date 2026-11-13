import fs from 'node:fs/promises';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import catalog from './workflow-shadcn.json';
import { assertWorkflowText } from './workflow-policy';

import { AIDER_DESK_HOME_DIR } from '@/constants';

export const readShadcnReferences = async (items: readonly string[], signal: AbortSignal): Promise<string[] | null> => {
  const directory = path.join(AIDER_DESK_HOME_DIR, catalog.directory);
  const client = new Client({ name: 'agent-lab-designer', version: '1.0.0' });
  try {
    if (path.relative(directory, await fs.realpath(directory))) {
      return null;
    }
    const config = JSON.parse(await fs.readFile(path.join(directory, 'components.json'), 'utf8'));
    if (JSON.stringify(config) !== JSON.stringify(catalog.config)) {
      return null;
    }
    await client.connect(
      new StdioClientTransport({
        command: 'npx',
        args: ['--yes', catalog.package, 'mcp', '--cwd', directory],
        cwd: directory,
        env: { npm_config_cache: path.join(directory, 'npm-cache') },
        stderr: 'ignore',
      }),
      { timeout: 35_000, signal },
    );
    const references: string[] = [];
    for (const item of items) {
      if (!catalog.components.includes(item)) {
        continue;
      }
      const result = await client.callTool({ name: 'search_items_in_registries', arguments: { registries: ['@shadcn'], query: item, limit: 3 } }, undefined, {
        timeout: 10_000,
        signal,
      });
      if (result.isError || !Array.isArray(result.content)) {
        continue;
      }
      for (const entry of result.content) {
        if (entry.type !== 'text') {
          continue;
        }
        const text = String(entry.text).slice(0, 2_000);
        assertWorkflowText(text);
        references.push(text);
      }
    }
    return references.length ? references : null;
  } catch {
    signal.throwIfAborted();
    return null;
  } finally {
    await client.close();
  }
};
