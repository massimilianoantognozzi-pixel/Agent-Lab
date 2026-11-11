import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { agentLabPrivateOrigin } from './agentlab-private-origin.mjs';
import { newRemotePairing } from './workflow-pairing-state.mjs';

const run = promisify(execFile);
const demoFiles = {
  'AGENTS.md': '# Progetto dimostrativo\n\nDati sintetici. Le decisioni e il design approvati sono in docs/. I test di regressione devono verificare il filtro attivo.\n',
  'docs/blueprint.md': '# Elenco turni\n\nLa vista mostra solo turni attivi. Il filtro deve mantenere l’ordine e lasciare intatto l’array di ingresso.\n',
  'docs/design.md': '# Componenti approvati\n\nRiusa activeShifts da src/turni.ts. Conserva la forma dei dati e le etichette della vista.\n',
  'src/turni.ts': 'export type Shift = { name: string; active: boolean };\n\nexport const activeShifts = (items: Shift[]) => items.filter(item => item.active === false);\n',
  'src/labels.json': '{\n  "title": "Turni",\n  "empty": "Nessun turno attivo"\n}\n',
};

const writeInitial = async (file, content) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, { flag: 'wx' }).catch(error => {
    if (error.code !== 'EEXIST') throw error;
  });
};
const atomicJson = async (file, data) => {
  const temporary = file + '.' + randomUUID();
  await fs.writeFile(temporary, JSON.stringify(data, null, 2), { flag: 'wx' });
  try {
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
};

export const prepareWorkflowEnvironment = async (pilot, root, { fixture = false, remote = true } = {}) => {
  const repository = path.join(root, 'repository-example');
  for (const [name, content] of Object.entries(demoFiles)) await writeInitial(path.join(repository, name), content);
  await fs.access(path.join(repository, '.git')).catch(async error => {
    if (error.code !== 'ENOENT') throw error;
    await run('git', ['init', '--initial-branch=main', repository], { windowsHide: true });
  });
  const configuration = path.join(pilot.data, 'managed-workflow.json');
  const example = {
    version: 1,
    projects: [{
      id: 'turni',
      root: repository,
      provider: fixture ? 'openai-codex' : 'your-provider-id',
      model: fixture ? 'gpt-6.1-sol' : 'your-model-id',
      references: [
        { path: 'AGENTS.md', role: 'rules' },
        { path: 'docs/blueprint.md', role: 'blueprint' },
        { path: 'docs/design.md', role: 'design' },
      ],
      context: ['src/turni.ts', 'src/labels.json'],
      editable: ['src/turni.ts', 'src/labels.json'],
      checks: [
        { id: 'syntax', type: 'typescript', file: 'src/turni.ts' },
        { id: 'regression-filter', type: 'typescript-expression', file: 'src/turni.ts', variable: 'activeShifts', expected: 'items.filter(item => item.active === true)' },
        { id: 'labels', type: 'json', file: 'src/labels.json' },
      ],
    }],
  };
  await writeInitial(fixture ? configuration : path.join(pilot.data, 'managed-workflow.example.json'), JSON.stringify(example, null, 2));
  if (fixture) {
    const settingsFile = path.join(pilot.data, 'config.json');
    const settings = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
    const projects = settings.openProjects ?? [];
    if (!projects.some(project => project.baseDir === repository)) {
      settings.openProjects = [...projects.map(project => ({ ...project, active: false })), {
        active: true, baseDir: repository, settings: {
          mainModel: '', agentProfileId: 'default', modelEditFormats: {}, currentMode: 'agent',
        },
      }];
      await atomicJson(settingsFile, settings);
    }
  }
  const savedConfig = await fs.readFile(configuration, 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  });
  const env = { ...pilot.env };
  if (savedConfig) {
    env.AIDER_DESK_WORKFLOW_CONFIG = configuration;
  }
  if (remote) {
    await fs.rm(path.join(pilot.data, 'remote-session.json'), { force: true });
  }
  if (remote && savedConfig) {
    const { projects } = JSON.parse(savedConfig);
    const projectId = process.env.AIDER_DESK_WORKFLOW_REMOTE_PROJECT || projects[0]?.id;
    if (!projects.some(project => project.id === projectId)) throw Error('Progetto remoto assente nella configurazione workflow.');
    const pairing = path.join(pilot.data, 'remote-pairing.json');
    await atomicJson(pairing, await newRemotePairing(pilot.data, projectId));
    env.AIDER_DESK_WORKFLOW_REMOTE_PAIRING = pairing;
    const webOrigin = await agentLabPrivateOrigin();
    if (webOrigin) env.AIDER_DESK_WORKFLOW_WEB_ORIGIN = webOrigin;
  }
  return { ...pilot, env, repository };
};
