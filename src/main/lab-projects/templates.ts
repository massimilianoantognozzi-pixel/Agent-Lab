import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import path from 'node:path';

import { projectControl, projectRoot, type ProjectState, type WebStack } from './policy';
import { writeProjectFile } from './files';

const rootPackage = (stack: WebStack, title: string): object => ({
  name:
    title
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 60) || 'progetto-web',
  private: true,
  version: '1.0.0',
  type: 'module',
  scripts:
    stack === 'react-vite'
      ? { dev: 'vite', build: 'tsc --noEmit && vite build', preview: 'vite preview' }
      : { dev: 'astro dev', build: 'astro check && astro build', preview: 'astro preview' },
  dependencies: stack === 'react-vite' ? { react: '19.2.8', 'react-dom': '19.2.8' } : { astro: '7.4.2' },
  devDependencies:
    stack === 'react-vite'
      ? { vite: '7.3.7', typescript: '5.9.3', '@vitejs/plugin-react': '5.2.0', '@types/react': '19.2.18', '@types/react-dom': '19.2.4' }
      : { typescript: '5.9.3', '@astrojs/check': '0.9.12' },
});

export const prepareWebProject = async (directory: string, stack: WebStack, title: string): Promise<ProjectState> => {
  const root = projectRoot(directory);
  const control = projectControl(root);
  const stateFile = path.join(control, 'project.json');
  if (syncFs.existsSync(stateFile)) {
    const state = JSON.parse(await fs.readFile(stateFile, 'utf8')) as ProjectState;
    if (state.root !== root || state.stack !== stack) {
      throw new Error('Il progetto e gia registrato con un altro tipo.');
    }
    return state;
  }
  if (!['vanilla', 'react-vite', 'astro'].includes(stack)) {
    throw new Error('Stack non supportato.');
  }
  if (syncFs.existsSync(path.join(root, 'package.json'))) {
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    const deps = { ...manifest.dependencies, ...manifest.devDependencies };
    if (stack === 'vanilla' || (stack === 'react-vite' && !deps.vite) || (stack === 'astro' && !deps.astro)) {
      throw new Error('Stack non coerente con il manifest esistente.');
    }
  }
  await fs.mkdir(control, { recursive: true });
  const state: ProjectState = { version: 1, root, stack, title, createdAt: new Date().toISOString() };
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2), { flag: 'wx' });
  const files: Record<string, string> = {};
  if (stack === 'vanilla') {
    files['index.html'] =
      '<!doctype html>\n<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Progetto web</title><link rel="stylesheet" href="styles.css"><script defer src="app.js"></script></head><body><main><h1>AGENTLAB_TODO</h1></main></body></html>\n';
    files['styles.css'] = '/* Stili del progetto */\n';
    files['app.js'] = '// Comportamenti del progetto\n';
  } else if (stack === 'react-vite') {
    files['package.json'] = JSON.stringify(rootPackage(stack, title), null, 2);
    files['index.html'] =
      '<!doctype html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Progetto web</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n';
    files['vite.config.ts'] =
      "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({plugins:[react()],base:'./'});\n";
    files['tsconfig.json'] = JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          allowImportingTsExtensions: true,
        },
        include: ['src'],
      },
      null,
      2,
    );
    files['src/main.tsx'] =
      "import { createRoot } from 'react-dom/client';\nimport App from './App';\nimport './styles.css';\ncreateRoot(document.getElementById('root')!).render(<App />);\n";
    files['src/App.tsx'] = 'export default function App(){return <main><h1>AGENTLAB_TODO</h1></main>;}\n';
    files['src/styles.css'] = '/* Stili del progetto */\n';
  } else {
    files['package.json'] = JSON.stringify(rootPackage(stack, title), null, 2);
    files['astro.config.mjs'] = "import { defineConfig } from 'astro/config';\nexport default defineConfig({output:'static'});\n";
    files['tsconfig.json'] = JSON.stringify({ extends: 'astro/tsconfigs/strict', include: ['.astro/types.d.ts', '**/*'], exclude: ['dist'] }, null, 2);
    files['src/pages/index.astro'] =
      '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Progetto web</title></head><body><main><h1>AGENTLAB_TODO</h1></main></body></html>\n';
  }
  files['README.md'] = `# ${title}\n\nProgetto web creato con Agent-Lab. Stack: ${stack}.\n`;
  for (const [file, content] of Object.entries(files)) {
    if (!syncFs.existsSync(path.join(root, file))) {
      await writeProjectFile(root, file, content, undefined, true);
    }
  }
  if (!syncFs.existsSync(path.join(root, '.gitignore'))) {
    await fs.writeFile(path.join(root, '.gitignore'), 'node_modules/\ndist/\n.astro/\n.agent-lab/\n.aider.input.history\n.env*\n', { flag: 'wx' });
  }
  return state;
};
