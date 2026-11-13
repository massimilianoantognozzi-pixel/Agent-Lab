import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./start-project-workspace.mjs', import.meta.url));
const desktop = path.resolve(path.dirname(script), '../../..');
const checkout = (name, marker) => {
  const directory = path.join(desktop, name);
  return fs.existsSync(path.join(directory, marker)) ? fs.realpathSync(directory) : '';
};

export const projectStartupEnvironment = () => ({
  AIDER_DESK_PROJECT_STARTUP_SCRIPT: script,
  AIDER_DESK_AGENTLAB_STARTUP_SCRIPT: fileURLToPath(new URL('./start-agentlab-private.mjs', import.meta.url)),
  AIDER_DESK_PROJECT_STARTUP_NODE: process.execPath,
  AIDER_DESK_EDILAS_ROOT: checkout('Edilas', path.join('scripts', 'start-local.mjs')),
  AIDER_DESK_QUANTOMISPESA_ROOT: checkout('QuantoMiSPESA', 'QUANTOMISPESA_README.md'),
  AIDER_DESK_VIASALUS_ROOT: checkout('ViaSalus', path.join('supabase', 'config.toml')),
  AIDER_DESK_CODEX_SOL_HIGH: 'true',
});
