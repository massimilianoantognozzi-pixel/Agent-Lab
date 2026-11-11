import path from 'node:path';
import { resolveConfig } from 'electron-vite';
import { build } from 'vite';
import { repoRoot } from './prepare.mjs';
const loaded = await resolveConfig({configFile:path.join(repoRoot,'electron.vite.config.ts'),root:repoRoot},'build','production');
if(!loaded?.config.main)throw new Error('Configurazione main non disponibile.');
await build(loaded.config.main);
