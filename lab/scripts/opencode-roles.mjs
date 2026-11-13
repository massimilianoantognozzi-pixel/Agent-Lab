import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { atomicProfileWrite } from './configure-general-gui.mjs';
import { homeDir, isKnowledgeFileAllowed } from './prepare.mjs';

const roles = Object.values(JSON.parse(fs.readFileSync(new URL('../../src/main/task/workflow-roles.json', import.meta.url), 'utf8'))).filter((role) => role.id);
const catalog = JSON.parse(fs.readFileSync(new URL('../../src/main/task/workflow-shadcn.json', import.meta.url), 'utf8'));

function prepareShadcnCatalog(profileHome) {
  const directory = path.join(profileHome, catalog.directory);
  fs.mkdirSync(directory, { recursive: true });
  const components = path.join(directory, 'components.json');
  if (!fs.existsSync(components)) atomicProfileWrite(components, `${JSON.stringify(catalog.config, null, 2)}\n`);

  const file = path.join(profileHome, 'mcp-servers.json');
  const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { mcpServers: {} };
  if (config.mcpServers?.[catalog.server]) return;
  const servers = config.mcpServers ?? config;
  servers[catalog.server] ??= {
    command: 'npx',
    args: ['--yes', catalog.package, 'mcp', '--cwd', directory],
    env: { npm_config_cache: path.join(directory, 'npm-cache') },
  };
  atomicProfileWrite(file, `${JSON.stringify(config.mcpServers ? config : { mcpServers: servers }, null, 2)}\n`);
}

export function prepareOpenCodeRoles(profileHome, baseProfileFile) {
  if (!fs.existsSync(baseProfileFile)) return;
  const base = JSON.parse(fs.readFileSync(baseProfileFile, 'utf8'));
  if (!base.provider || !base.model) return;
  prepareShadcnCatalog(profileHome);

  const localCatalog = path.join(homeDir, 'skills');
  const source = fs.existsSync(localCatalog) ? localCatalog : path.join(os.homedir(), '.config', 'opencode', 'skills');
  const target = path.join(profileHome, 'skills');
  if (fs.existsSync(source) && path.resolve(source) !== path.resolve(target)) {
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const folder = path.join(source, entry.name);
      if (!entry.isDirectory() || !fs.existsSync(path.join(folder, 'SKILL.md'))) continue;
      fs.cpSync(folder, path.join(target, entry.name), {
        recursive: true,
        force: false,
        filter: (file) => isKnowledgeFileAllowed(path.basename(file)) && !fs.lstatSync(file).isSymbolicLink(),
      });
    }
  }

  const roleFiles = roles.map((role) => ({ ...role, config: path.join(profileHome, 'agents', role.id, 'config.json') }));
  for (const role of roleFiles) {
    const directory = path.join(path.dirname(role.config), 'rules');
    fs.mkdirSync(directory, { recursive: true });
    const rule = path.join(directory, 'workflow-role.md');
    const instructions = `# ${role.name}\n\n${role.instructions}\n\nAttiva con Skills le guide pertinenti allo stack e al compito. Rispetta il perimetro, le autorizzazioni e le fonti approvate dal progetto.\n`;
    if (!fs.existsSync(rule) || fs.readFileSync(rule, 'utf8') !== instructions) atomicProfileWrite(rule, instructions);
  }
  const missing = roleFiles.filter(({ config }) => !fs.existsSync(config));
  if (!missing.length) return;

  const addedIds = Array.isArray(base.enabledSubagentIds)
    ? roleFiles.map(({ id }) => id).filter((id) => !base.enabledSubagentIds.includes(id))
    : [];
  if (!base.useSubagents || addedIds.length) {
    base.useSubagents = true;
    if (addedIds.length) base.enabledSubagentIds.push(...addedIds);
    atomicProfileWrite(baseProfileFile, `${JSON.stringify(base, null, 2)}\n`);
  }

  for (const role of missing) {
    const changeApproval = role.canEdit ? 'ask' : 'never';
    const isDesigner = role.id === 'opencode-designer';
    atomicProfileWrite(role.config, `${JSON.stringify({
      id: role.id,
      name: role.name,
      provider: base.provider,
      model: base.model,
      usePowerTools: true,
      useAiderTools: false,
      useTodoTools: false,
      useSubagents: false,
      useTaskTools: false,
      useMemoryTools: false,
      useSkillsTools: true,
      useExtensionTools: false,
      enabledServers: isDesigner ? [catalog.server] : [],
      toolApprovals: {
        'skills---activate_skill': 'always',
        'power---file_read': 'always',
        'power---glob': 'always',
        'power---grep': 'always',
        'power---file_edit': changeApproval,
        'power---file_write': changeApproval,
        'power---bash': changeApproval,
        ...(isDesigner && { [`${catalog.server}---get_add_command_for_items`]: 'never' }),
      },
      subagent: {
        enabled: true,
        systemPrompt: '',
        invocationMode: 'on-demand',
        color: role.color,
        description: role.description,
      },
    }, null, 2)}\n`);
  }
}
