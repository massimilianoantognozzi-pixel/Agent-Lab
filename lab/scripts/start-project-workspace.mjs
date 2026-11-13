import { execFile } from 'node:child_process';
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const docker = async (...args) => (await run('docker', args, { timeout: 30_000, windowsHide: true })).stdout.trim();
const projectRootLabel = 'com.agentlab.project.root';
const composeRootLabel = 'com.docker.compose.project.working_dir';
const oneOffLabel = 'com.docker.compose.oneoff';
const servicesDocument = 'docs/agentlab-services.json';
const viaSalusHandoff = 'docs/supporto_codex/handoff/VIASALUS_CONTEXT_HANDOFF_CORRENTE.md';
const viaSalusDatabase = 'supabase_db_ViaSalus';
const labelPath = async (value) => {
  if (typeof value !== 'string' || !path.isAbsolute(value)) return undefined;
  return realpath(value).catch(() => undefined);
};

async function readProjectFile(root, name) {
  const filename = path.join(root, name);
  if (path.relative(filename, await realpath(filename))) {
    throw new Error('Un documento di ripresa punta fuori dal percorso previsto.');
  }
  return readFile(filename, 'utf8');
}

async function readLocalDocuments(root, viaSalus) {
  const folders = ['.', 'docs', 'docs/handoff', 'docs/blueprints'];
  const documents = new Set();
  for (const folder of folders) {
    const directory = path.resolve(root, folder);
    const canonical = await realpath(directory).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (!canonical || path.relative(directory, canonical)) continue;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (path.posix.join(folder, entry.name) === servicesDocument) {
        documents.add(servicesDocument);
        continue;
      }
      if (!/\.(md|json)$/i.test(entry.name)) continue;
      if (folder === 'docs/blueprints' || /agents|readme|blueprint|handoff|piano|ripresa|current_state|task_queue|work.plan|roadmap/i.test(entry.name)) {
        documents.add(path.posix.join(folder, entry.name));
      }
    }
  }
  if (viaSalus) documents.add(viaSalusHandoff);
  const sources = new Map();
  for (const name of documents) {
    sources.set(name, await readProjectFile(root, name));
  }
  return sources;
}

const configuredContainers = (documents) => {
  const content = documents.get(servicesDocument);
  if (content == null) return undefined;
  const { containers } = JSON.parse(content);
  if (!Array.isArray(containers) || containers.some((name) => typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name))) {
    throw new Error('Il documento dei servizi deve elencare nomi di container validi.');
  }
  return new Set(containers);
};

async function viaSalusContainer(root, documents, requested) {
  if (!documents.has(viaSalusHandoff)) await readProjectFile(root, viaSalusHandoff);
  if (requested && [...requested].some((name) => name !== viaSalusDatabase)) {
    throw new Error('I documenti ViaSalus indicano un container diverso dal database locale previsto.');
  }
  const config = await readProjectFile(root, 'supabase/config.toml');
  const databaseConfig = config.split(/^\[db\]\s*$/m)[1]?.split(/\r?\n\[/)[0] ?? '';
  const port = /^port\s*=\s*(\d+)\s*$/m.exec(databaseConfig)?.[1];
  const format = '[{{json .Id}},{{json .Name}},{{json .Config.Labels}},{{json .Mounts}},{{json .HostConfig.PortBindings}},{{json .State}}]';
  const [id, actualName, labels, mounts, ports, state] = JSON.parse(await docker('container', 'inspect', '--format', format, viaSalusDatabase));
  const owner = await labelPath(labels?.['com.supabase.cli.workdir']);
  const bindings = Object.values(ports ?? {}).flat().filter(Boolean);
  if (
    !/^project_id\s*=\s*"ViaSalus"\s*$/m.test(config) ||
    actualName !== '/' + viaSalusDatabase || labels?.['com.supabase.cli.project'] !== 'ViaSalus' || !owner || path.relative(root, owner) ||
    !mounts.some(({ Type, Destination }) => Type === 'volume' && Destination === '/var/lib/postgresql/data') ||
    !port || !ports?.['5432/tcp']?.length ||
    !ports['5432/tcp'].every(({ HostPort }) => HostPort === port) ||
    !bindings.every(({ HostIp }) => HostIp === '127.0.0.1' || HostIp === '::1')
  ) {
    throw new Error('Il container ViaSalus non corrisponde al database locale registrato per questo checkout.');
  }
  return { id, state };
}

async function quantoMiSpesaContainer(root) {
  const checkout = await labelPath(process.env.AIDER_DESK_QUANTOMISPESA_ROOT);
  if (!checkout || path.relative(root, checkout)) return undefined;
  const id = await docker('ps', '-aq', '--filter', 'name=^/quantomispesa-postgres$');
  if (!id) return undefined;
  const format = '{{.Config.Image}} {{range .Config.Env}}{{if eq . "POSTGRES_DB=quantomispesa"}}{{.}}{{end}}{{end}}';
  if ((await docker('container', 'inspect', '--format', format, id)) !== 'postgres:15 POSTGRES_DB=quantomispesa') {
    throw new Error('Il container quantomispesa-postgres ha una configurazione diversa da quella del progetto.');
  }
  return id;
}

async function startProject() {
  const root = await realpath(process.cwd());
  const viaSalusRoot = await labelPath(process.env.AIDER_DESK_VIASALUS_ROOT);
  const viaSalus = viaSalusRoot && !path.relative(root, viaSalusRoot);
  let documents;
  if (process.argv[2] === '--read-documents') {
    process.stdin.setEncoding('utf8');
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    documents = new Map(Object.entries(JSON.parse(input)));
  } else {
    documents = await readLocalDocuments(root, viaSalus);
  }
  const requested = configuredContainers(documents);
  if (viaSalus) {
    if (requested?.size !== 0) await startContainers([await viaSalusContainer(root, documents, requested)]);
    return;
  }
  const edilas = await labelPath(process.env.AIDER_DESK_EDILAS_ROOT);
  if (edilas && !path.relative(root, edilas)) {
    const script = fileURLToPath(new URL('./start-edilas-workspace.mjs', import.meta.url));
    await run(process.execPath, [script], { cwd: root, timeout: 405_000, windowsHide: true });
    return;
  }

  const lists = await Promise.all([projectRootLabel, composeRootLabel].map((label) => docker('ps', '-aq', '--filter', 'label=' + label)));
  const ids = [...new Set(lists.flatMap((list) => list.split(/\s+/).filter(Boolean)))];
  const quantoMiSpesa = await quantoMiSpesaContainer(root);
  if (quantoMiSpesa && !ids.includes(quantoMiSpesa)) ids.push(quantoMiSpesa);
  const selected = [];
  for (const id of ids) {
    const [labels, state, name] = JSON.parse(await docker('container', 'inspect', '--format', '[{{json .Config.Labels}},{{json .State}},{{json .Name}}]', id));
    if (String(labels?.[oneOffLabel]).toLowerCase() === 'true') continue;
    const owner = await labelPath(labels?.[projectRootLabel] ?? labels?.[composeRootLabel]);
    if (id === quantoMiSpesa || (owner && !path.relative(root, owner))) selected.push({ id, state, name: name.slice(1) });
  }
  if (requested && [...requested].some((name) => !selected.some((container) => container.name === name))) {
    throw new Error('I documenti indicano un container assente o non associato al checkout.');
  }
  await startContainers(requested ? selected.filter(({ name }) => requested.has(name)) : selected);
}

async function startContainers(selected) {
  if (!selected.length) return;

  const stopped = selected.filter(({ state }) => !state.Running).map(({ id }) => id);
  if (stopped.length) await docker('start', ...stopped);
  const paused = selected.filter(({ state }) => state.Paused).map(({ id }) => id);
  if (paused.length) await docker('unpause', ...paused);
  const deadline = Date.now() + 60_000;
  do {
    const states = (await docker('container', 'inspect', '--format', '{{json .State}}', ...selected.map(({ id }) => id)))
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    if (states.every((state) => state.Running && !state.Paused && (!state.Health || state.Health.Status === 'healthy'))) return;
    await setTimeout(1000);
  } while (Date.now() < deadline);
  throw new Error('I container del progetto non sono pronti.');
}

try {
  await startProject();
} catch (error) {
  console.error(error instanceof Error && !('cmd' in error) ? error.message : 'Avvio dei container del progetto non riuscito.');
  process.exitCode = 1;
}
