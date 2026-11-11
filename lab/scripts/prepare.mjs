import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const labRoot = path.join(repoRoot, 'lab');
export const profileRoot = path.join(labRoot, 'profile');
export const homeDir = path.join(profileRoot, 'home');
export const dataDir = path.join(profileRoot, 'data');
export const serenaDir = path.join(profileRoot, 'serena');
export const workspaceRoot = path.join(labRoot, 'workspaces');
export const sampleDir = path.join(workspaceRoot, 'sample-python');
const sourceHome = os.homedir();
const sourceOpenCode = path.join(sourceHome, '.config', 'opencode');
const excluded = new Set(['node_modules', '.git', '__pycache__', '.cache', 'dist']);

const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inside = (root, target) => {
  const relative = path.relative(root, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
};
const writeInitial = (file, value) => {
  if (!inside(labRoot, path.resolve(file))) throw new Error('Write outside lab refused');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
};

export function prepare() {
  for (const dir of [homeDir, dataDir, serenaDir, workspaceRoot, sampleDir, path.join(labRoot, 'work')]) fs.mkdirSync(dir, { recursive: true });
  const manifestFile=path.join(profileRoot,'knowledge-manifest.json');
  const previousSnapshot=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):null;
  const provenance = previousSnapshot?.files??[];
  const copyKnowledge = (source, destination) => {
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) throw new Error(`Linked knowledge source refused: ${source}`);
    const name = path.basename(source);
    if (excluded.has(name) || /^\.env(?:\.|$)|^(?:auth|service)\.json$|\.(?:pem|key|pfx|p12|exe|dll|node|pkl)$/i.test(name)) return;
    if (stat.isDirectory()) {
      fs.mkdirSync(destination, { recursive: true });
      for (const item of fs.readdirSync(source)) copyKnowledge(path.join(source, item), path.join(destination, item));
    } else if (stat.isFile()) {
      if (!inside(homeDir, destination)) throw new Error('Knowledge destination outside profile');
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const hash = digest(source);
      if (fs.existsSync(destination) && digest(destination) !== hash) throw new Error(`Snapshot differs; refusing overwrite: ${destination}`);
      if (!fs.existsSync(destination)) fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
      provenance.push({ source, destination: path.relative(labRoot, destination), sha256: hash });
    }
  };
  if(!previousSnapshot){
    copyKnowledge(path.join(sourceOpenCode, 'AGENTS.md'), path.join(homeDir, 'rules', '00-owner.md'));
    copyKnowledge(path.join(sourceOpenCode, 'skills'), path.join(homeDir, 'skills'));
  }
  writeInitial(path.join(homeDir, 'rules', '01-lab.md'), '# Agent Lab\n\nCheckpoint iniziale senza inferenze. Usa soltanto il progetto sintetico attivo.\nLe letture esterne e le operazioni mutative degli strumenti sono disabilitate.\nAGENTS, skill e Serena sono oggetto di verifica, non una certificazione completa PatchFox.\n');
  writeInitial(path.join(dataDir, 'config.json'), {
    settingsVersion: 22,
    providers: [], openProjects: [], recentProjects: [],
    settings: {
      onboardingFinished: true, startupMode: 'empty', language: 'en',
      telemetryEnabled: false, telemetryInformed: true, aiderDeskAutoUpdate: false,
      windowTitleTemplate: 'Agent Lab - {project}',
      memory: { enabled: false },
      aider: { options: '', environmentVariables: '', addRuleFiles: true, autoCommits: false, watchFiles: false, confirmBeforeEdit: true },
      taskSettings: { smartTaskState: false, autoGenerateTaskName: false, renameBranchOnNameGeneration: false, defaultWorkingMode: 'local', defaultProjectMode: 'agent', worktreeSymlinkFolders: [], worktreePostCreateCommand: '' },
      extensions: { repositories: [], disabled: [] },
      server: { enabled: false, readonly: false, readonlyExtensionUi: true, basicAuth: { enabled: false, username: '', password: '' }, cors: { enabled: false, origins: [] } },
    },
  });
  writeInitial(path.join(homeDir, 'agents', 'lab-checkpoint', 'config.json'), {
    id: 'default', name: 'Laboratorio - checkpoint iniziale', provider: 'lab-disabled', model: 'lab-disabled',
    maxIterations: 0, minTimeBetweenToolCalls: 0, includeContextFiles: false, includeRepoMap: false,
    usePowerTools: true, useAiderTools: false, useTodoTools: false, useSubagents: false, useTaskTools: false,
    useMemoryTools: false, useSkillsTools: true, useExtensionTools: false, useAgentMemoryScope: false,
    enabledServers: ['serena'], toolApprovals: { 'power---file_read': 'ask', 'power---file_edit': 'never', 'power---file_write': 'never', 'power---bash': 'never', 'power---fetch': 'never' },
    toolSettings: {}, customInstructions: 'Rispondi in italiano. Checkpoint iniziale: nessuna inferenza reale e soltanto letture autorizzate.', ruleFiles: [],
  });
  const serenaExe = path.join(sourceHome, '.local', 'bin', 'serena.exe');
  if (!fs.existsSync(serenaExe)) throw new Error('Existing Serena launcher not found; no installer executed');
  writeInitial(path.join(serenaDir, 'serena_config.yml'), 'language_backend: LSP\nagent_interface: tools\ngui_log_window: false\nweb_dashboard: false\nweb_dashboard_open_on_launch: false\ntrace_lsp_communication: false\nlog_level: 20\ntool_timeout: 120\nprojects: []\ntrusted_project_path_patterns: []\nexcluded_tools:\n  - execute_shell_command\nproject_serena_folder_location: "$projectDir/.serena"\n');
  writeInitial(path.join(homeDir, 'mcp-servers.json'), { mcpServers: { serena: { command: serenaExe, args: ['start-mcp-server', '--context=ide', '--agent-interface=tools', '--project', sampleDir], env: { SERENA_HOME: serenaDir } } } });
  writeInitial(path.join(profileRoot, 'gitconfig'), '[init]\n\tdefaultBranch = lab-main\n');
  writeInitial(path.join(sampleDir, 'AGENTS.md'), '# Progetto sintetico Agent Lab\n\nIdentificatore di verifica: LAB_WORKSPACE_ONLY.\nUsa solo questa cartella; nessun dato reale o credenziale.\n');
  writeInitial(path.join(sampleDir, 'README.md'), '# Campione di verifica\n\nFile sintetici per letture simboliche e ripresa delle sessioni.\n');
  writeInitial(path.join(sampleDir, '.gitignore'), '.serena/\n.agent-lab/\n__pycache__/\n');
  writeInitial(path.join(sampleDir, 'calculator.py'), 'def calculate_subtotal(items):\n    """Return the subtotal for synthetic quantity/price pairs."""\n    return sum(quantity * price for quantity, price in items)\n');
  if (!fs.existsSync(path.join(sampleDir, '.git'))) {
    const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: path.join(profileRoot, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1' };
    execFileSync('git', ['init', '--initial-branch=lab-main'], { cwd: sampleDir, env: gitEnv, windowsHide: true, stdio: 'pipe' });
    execFileSync('git', ['add', '--', 'AGENTS.md', 'README.md', '.gitignore', 'calculator.py'], { cwd: sampleDir, env: gitEnv, windowsHide: true });
    execFileSync('git', ['-c', 'user.name=Agent Lab Fixture', '-c', 'user.email=fixture@agent-lab.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Synthetic laboratory fixture'], { cwd: sampleDir, env: gitEnv, windowsHide: true, stdio: 'pipe' });
  }
  const skills = fs.readdirSync(path.join(homeDir, 'skills')).filter((name) => fs.existsSync(path.join(homeDir, 'skills', name, 'SKILL.md')));
  const report = { createdAt: new Date().toISOString(), source: 'OpenCode knowledge snapshot; no credentials or service database copied', skills, files: provenance };
  if(!previousSnapshot)fs.writeFileSync(manifestFile, `${JSON.stringify(report, null, 2)}\n`,{flag:'wx'});
  return { repoRoot, homeDir, dataDir, serenaDir, sampleDir, skills: skills.length, copiedFiles: provenance.length };
}

export function laboratoryEnvironment() {
  const allowedNames = ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'windir', 'ComSpec', 'COMSPEC', 'PATH', 'Path', 'PATHEXT', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMDATA', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'CommonProgramFiles', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS', 'COMPUTERNAME', 'USERNAME', 'USERDOMAIN'];
  const env = Object.fromEntries(allowedNames.filter((name) => process.env[name] !== undefined).map((name) => [name, process.env[name]]));
  const tempDir = path.join(labRoot, 'work', 'temp');
  fs.mkdirSync(tempDir, { recursive: true });
  return {
    ...env, TEMP: tempDir, TMP: tempDir, NODE_ENV: 'production',
    AIDER_DESK_LAB_MODE: 'true', AIDER_DESK_LAB_WORKSPACE_ROOT: workspaceRoot,
    AIDER_DESK_DATA_DIR: dataDir, AIDER_DESK_HOME_DIR: homeDir, AIDER_DESK_DIR: '.agent-lab', AIDER_DESK_PORT: '24338',
    SERENA_HOME: serenaDir, POSTHOG_PUBLIC_API_KEY: '', OTEL_SDK_DISABLED: 'true',
    HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', TOKENIZERS_PARALLELISM: 'false',
    GIT_CONFIG_GLOBAL: path.join(profileRoot, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: workspaceRoot,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(prepare(), null, 2));
