import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import AdmZip from 'adm-zip';

import { controlRoot, digest, labScriptsRoot, manifestDigest, projectControl, readProjectState, safeProjectPath, sourceFiles, sourceManifest } from './policy';
import { writeProjectFile } from './files';
import { runContainer, NODE_IMAGE, stopOwnedJobs, type ContainerMount } from './containers';
import { checkSecrets } from './secrets';

const BROWSER_IMAGE = 'mcr.microsoft.com/playwright@sha256:9bd26ad900bb5e0f4dee75839e957a89ae89c2b7ab1e76050e559790e946b948';
const allowedPackages: Record<string, string> = {
  react: '19.2.8',
  'react-dom': '19.2.8',
  vite: '7.3.7',
  typescript: '5.9.3',
  '@vitejs/plugin-react': '5.2.0',
  '@types/react': '19.2.18',
  '@types/react-dom': '19.2.4',
  astro: '7.4.2',
  '@astrojs/check': '0.9.12',
};
export type CheckProof = {
  id: string;
  pass: boolean;
  status: 'PASS' | 'FAIL' | 'ERROR' | 'STALE';
  sourceDigest: string;
  createdAt: string;
  stack: string;
  errors: string[];
  warnings: string[];
  job: string;
  publicRoot: string;
  checkerDigest: string;
  criteriaDigest: string;
  web?: { screenshots: string[]; checkedPages: string[] };
};
type Acceptance = { type: 'visible' | 'text' | 'fill' | 'click' | 'press' | 'viewport'; selector?: string; value?: string; width?: number };
const previews = new Map<string, { url: string; update: (root: string) => void; close: () => Promise<void> }>();

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: unknown;
  overrides?: unknown;
  resolutions?: unknown;
};
type LockManifest = { lockfileVersion: number; packages: Record<string, PackageManifest & { link?: boolean; resolved?: string; integrity?: string }> };
type WebReport = { pass: boolean; errors: string[]; screenshots?: string[]; checkedPages?: string[] };
const checkedJson = async <T>(file: string): Promise<T> => JSON.parse(await fs.readFile(file, 'utf8')) as T;
const ensure = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
const mount = (source: string, target: string, readonly = false): ContainerMount => ({ source, target, readonly });
const checkerRoot = (): string => path.join(path.dirname(controlRoot()), 'web-checker');
const criteriaDigest = async (directory: string): Promise<string> => {
  const read = (name: string, fallback: string) =>
    fs.readFile(path.join(projectControl(directory), name), 'utf8').catch((error) => {
      if (error.code === 'ENOENT') {
        return fallback;
      }
      throw error;
    });
  return digest((await read('plan.txt', '')) + '\n' + (await read('acceptance.json', '[]')));
};

const validatePackage = (value: PackageManifest): object => {
  if (value.workspaces || value.overrides || value.resolutions) {
    throw new Error('Manifest avanzato: occorre una verifica delle dipendenze prima dell' + "'" + 'esecuzione.');
  }
  for (const [name, version] of Object.entries({ ...value.dependencies, ...value.devDependencies })) {
    if (allowedPackages[name] !== version) {
      throw new Error(`BLOCKED: versione di dipendenza da verificare: ${name}. Nessuna installazione eseguita.`);
    }
  }
  return {
    name: 'agentlab-dependencies',
    private: true,
    version: '1.0.0',
    type: 'module',
    dependencies: value.dependencies ?? {},
    devDependencies: value.devDependencies ?? {},
  };
};
const validateLock = (lock: LockManifest): void => {
  ensure(lock.lockfileVersion === 3 && lock.packages && typeof lock.packages === 'object', 'Lockfile non supportato.');
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === '') {
      continue;
    }
    ensure(key.startsWith('node_modules/') && !key.split('/').includes('..'), 'Percorso dipendenza non valido.');
    if (entry.link) {
      throw new Error('Dipendenze collegate fuori dal registry non autorizzate.');
    }
    ensure(typeof entry.resolved === 'string', 'Tarball non dichiarato nel lockfile.');
    if (entry.resolved) {
      const url = new URL(entry.resolved);
      ensure(
        url.protocol === 'https:' && url.hostname === 'registry.npmjs.org' && !url.username && !url.password && !url.port,
        'Tarball dipendenza fuori registry autorizzato.',
      );
      ensure(typeof entry.integrity === 'string' && /^sha(?:256|384|512)-/.test(entry.integrity), 'Integrita della dipendenza non dichiarata.');
    }
  }
};
const copySources = async (directory: string, destination: string): Promise<Record<string, string>> => {
  const manifest: Record<string, string> = {};
  for (const file of sourceFiles(directory)) {
    const bytes = await fs.readFile(safeProjectPath(directory, file));
    if (
      /\.(?:html?|css|[cm]?js|jsx|tsx?|json|md|svg|astro|txt)$/i.test(file) &&
      /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,})\b|["']?(?:api[_-]?key|client[_-]?secret|password|access[_-]?token)["']?\s*[:=]\s*["'][^"'\r\n]{12,}["']/i.test(
        bytes.toString('utf8'),
      )
    ) {
      throw new Error('Possibile segreto in ' + file + ': copia e consegna bloccate. Nessun valore riportato.');
    }
    if (bytes.length > 30000000) {
      throw new Error('Asset oltre 30MB: ottimizzare prima della verifica.');
    }
    const target = path.join(destination, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
    manifest[file] = digest(bytes);
  }
  return manifest;
};
const outputFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  const walk = async (folder: string) => {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['node_modules', 'package.json', 'package-lock.json'].includes(entry.name)) {
        continue;
      }
      const file = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error('Link nell' + "'" + 'output: consegna bloccata.');
      }
      if (entry.isDirectory()) {
        await walk(file);
      } else if (entry.isFile() && /\.(?:html?|css|js|mjs|json|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|pdf|txt|md)$/i.test(entry.name)) {
        files.push(file);
      }
    }
  };
  await walk(root);
  return files;
};

export const latestProof = async (directory: string): Promise<CheckProof> => {
  const proof = (await checkedJson(path.join(projectControl(directory), 'latest-proof.json'))) as CheckProof;
  ensure(/^[a-f0-9-]{36}$/.test(proof.id) && proof.job === path.join(controlRoot(), 'jobs', proof.id), 'Prova di controllo non valida.');
  return proof;
};

export const runProjectChecks = async (directory: string, signal?: AbortSignal): Promise<CheckProof> => {
  const state = readProjectState(directory);
  const id = randomUUID();
  const job = path.join(controlRoot(), 'jobs', id);
  const work = path.join(job, 'workspace');
  const deps = path.join(job, 'dependencies');
  const out = path.join(job, 'out');
  const config = path.join(job, 'config');
  for (const folder of [job, work, deps, out, config]) {
    await fs.mkdir(folder, { recursive: true });
  }
  const proof: CheckProof = {
    id,
    pass: false,
    status: 'ERROR',
    sourceDigest: '',
    createdAt: new Date().toISOString(),
    stack: state.stack,
    errors: [],
    warnings: [],
    job,
    publicRoot: work,
    checkerDigest: '',
    criteriaDigest: await criteriaDigest(directory),
  };
  const run = async (
    stage: string,
    command: string[],
    mounts: ContainerMount[],
    cwd = '/workspace',
    network: 'none' | 'bridge' = 'none',
    image = NODE_IMAGE,
    environment?: Record<string, string>,
    seccomp?: string,
  ) => {
    signal?.throwIfAborted();
    const result = await runContainer({
      image,
      command,
      mounts,
      cwd,
      network,
      environment,
      seccomp,
      signal,
      seconds: 180,
      logFile: path.join(job, stage + '.log'),
    });
    if (!result.cleanupConfirmed) {
      throw new Error(`Chiusura del job ${stage} non confermata.`);
    }
    if (result.code !== 0) {
      throw new Error(`${stage}: uscita ${result.code}\n${result.output.slice(-9000)}`);
    }
    return result;
  };
  try {
    if (state.stack !== 'vanilla') {
      const packageFile = safeProjectPath(directory, 'package.json');
      const original = await checkedJson<PackageManifest>(packageFile);
      const minimal = validatePackage(original);
      await fs.writeFile(path.join(deps, 'package.json'), JSON.stringify(minimal));
      const npmCache = path.join(controlRoot(), 'npm-cache');
      await fs.mkdir(npmCache, { recursive: true });
      const npmMounts = [mount(deps, '/deps'), mount(npmCache, '/npm-cache')];
      const npmEnv = {
        NPM_CONFIG_CACHE: '/npm-cache',
        NPM_CONFIG_USERCONFIG: '/dev/null',
        NPM_CONFIG_GLOBALCONFIG: '/tmp/agentlab-global.npmrc',
        NPM_CONFIG_UPDATE_NOTIFIER: 'false',
      };
      const lockCache = path.join(projectControl(directory), 'dependencies-' + digest(JSON.stringify(minimal)) + '.json');
      const projectLock = path.join(directory, 'package-lock.json');
      if (syncFs.existsSync(projectLock)) {
        const lock = await checkedJson<LockManifest>(projectLock);
        validateLock(lock);
        const canonical = (value: object) => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
        for (const section of ['dependencies', 'devDependencies'] as const) {
          ensure(canonical(lock.packages['']?.[section] ?? {}) === canonical(original[section] ?? {}), 'Lockfile non coerente: aggiornamento da autorizzare.');
        }
        await fs.copyFile(projectLock, path.join(deps, 'package-lock.json'));
      } else if (syncFs.existsSync(lockCache)) {
        await fs.copyFile(lockCache, path.join(deps, 'package-lock.json'));
      } else {
        await run(
          'dependency-plan',
          [
            '/usr/local/bin/npm',
            'install',
            '--package-lock-only',
            '--ignore-scripts',
            '--bin-links=false',
            '--no-audit',
            '--no-fund',
            '--registry=https://registry.npmjs.org',
          ],
          npmMounts,
          '/deps',
          'bridge',
          NODE_IMAGE,
          npmEnv,
        );
        validateLock(await checkedJson(path.join(deps, 'package-lock.json')));
        await fs.copyFile(path.join(deps, 'package-lock.json'), lockCache);
      }
      validateLock(await checkedJson(path.join(deps, 'package-lock.json')));
      await run(
        'dependencies',
        ['/usr/local/bin/npm', 'ci', '--ignore-scripts', '--bin-links=false', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'],
        npmMounts,
        '/deps',
        'bridge',
        NODE_IMAGE,
        npmEnv,
      );
      const audit = await run(
        'dependency-audit',
        ['/usr/local/bin/npm', 'audit', '--audit-level=high', '--registry=https://registry.npmjs.org'],
        npmMounts,
        '/deps',
        'bridge',
        NODE_IMAGE,
        npmEnv,
      );
      if (!/found 0 vulnerabilities/.test(audit.output)) {
        proof.warnings.push('Audit dipendenze: segnalazioni sotto la soglia alta. Vedere dependency-audit.log.');
      }
      const lock = await fs.readFile(path.join(deps, 'package-lock.json'), 'utf8');
      const targetLock = path.join(directory, 'package-lock.json');
      if (!syncFs.existsSync(targetLock)) {
        await writeProjectFile(directory, 'package-lock.json', lock, signal, true);
      }
    }
    const manifest = await copySources(directory, work);
    proof.sourceDigest = manifestDigest(manifest);
    await fs.writeFile(path.join(job, 'source-manifest.json'), JSON.stringify(manifest));
    await checkSecrets(work, job, signal);
    const executionMounts = [mount(work, '/workspace')];
    if (state.stack !== 'vanilla') {
      executionMounts.push(mount(path.join(deps, 'node_modules'), '/workspace/node_modules'));
    }
    if (state.stack === 'vanilla') {
      for (const file of Object.keys(manifest).filter((file) => /\.(?:js|mjs|cjs)$/i.test(file))) {
        await run('syntax-' + digest(file).slice(0, 12), ['/usr/local/bin/node', '--check', '/workspace/' + file], executionMounts);
      }
    } else if (state.stack === 'react-vite') {
      await run('types', ['/usr/local/bin/node', '/workspace/node_modules/typescript/bin/tsc', '--noEmit'], executionMounts);
      await run('build', ['/usr/local/bin/node', '/workspace/node_modules/vite/bin/vite.js', 'build'], executionMounts);
      proof.publicRoot = path.join(work, 'dist');
    } else {
      await run('types', ['/usr/local/bin/node', '/workspace/node_modules/astro/bin/astro.mjs', 'check'], executionMounts);
      await run('build', ['/usr/local/bin/node', '/workspace/node_modules/astro/bin/astro.mjs', 'build'], executionMounts);
      proof.publicRoot = path.join(work, 'dist');
    }
    for (const [file, hash] of Object.entries(manifest)) {
      ensure(digest(await fs.readFile(path.join(work, file))) === hash, 'Il build ha modificato il sorgente ' + file + ': verifica bloccata.');
    }
    const outputManifest: Record<string, string> = {};
    for (const file of await outputFiles(proof.publicRoot)) {
      outputManifest[path.relative(proof.publicRoot, file)] = digest(await fs.readFile(file));
    }
    await fs.writeFile(path.join(job, 'output-manifest.json'), JSON.stringify(outputManifest));
    const acceptanceFile = path.join(projectControl(directory), 'acceptance.json');
    const acceptance: Acceptance[] = syncFs.existsSync(acceptanceFile) ? await checkedJson(acceptanceFile) : [];
    await fs.writeFile(path.join(config, 'input.json'), JSON.stringify({ publicRoot: '/workspace', spa: state.stack === 'react-vite', acceptance }));
    const scriptsCopy = path.join(checkerRoot(), 'scripts');
    await fs.mkdir(scriptsCopy, { recursive: true });
    for (const file of ['web-checker.mjs', 'public-web-server.mjs']) {
      await fs.copyFile(path.join(labScriptsRoot(), file), path.join(scriptsCopy, file));
    }
    proof.checkerDigest = digest(
      (await fs.readFile(path.join(scriptsCopy, 'web-checker.mjs'))).toString() +
        (await fs.readFile(path.join(scriptsCopy, 'public-web-server.mjs'))).toString(),
    );
    ensure(
      digest(await fs.readFile(path.join(checkerRoot(), 'browser-seccomp.json'))) === '908338e22e0ac4035e0bc49da7252be3abe70699dcb776895c383e8bf40b6d07',
      'Profilo di isolamento browser non integro.',
    );
    await run(
      'web',
      ['/usr/bin/node', '/tool/scripts/web-checker.mjs', '/job/input.json'],
      [mount(proof.publicRoot, '/workspace', true), mount(config, '/job', true), mount(out, '/out'), mount(checkerRoot(), '/tool', true)],
      '/workspace',
      'none',
      BROWSER_IMAGE,
      { AGENTLAB_CONTAINER_CHECKER: '1', PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright' },
      path.join(checkerRoot(), 'browser-seccomp.json'),
    );
    const web = await checkedJson<WebReport>(path.join(out, 'web-report.json'));
    proof.web = { screenshots: (web.screenshots ?? []).map((file: string) => path.join(out, path.basename(file))), checkedPages: web.checkedPages ?? [] };
    if (!web.pass) {
      proof.errors.push(...web.errors);
    }
    if (manifestDigest(sourceManifest(directory)) !== proof.sourceDigest || (await criteriaDigest(directory)) !== proof.criteriaDigest) {
      proof.status = 'STALE';
      proof.errors.push('Il progetto e cambiato durante i controlli: ripetere sulla nuova versione.');
    } else {
      proof.pass = proof.errors.length === 0;
      proof.status = proof.pass ? 'PASS' : 'FAIL';
    }
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    proof.errors.push(error instanceof Error ? error.message : String(error));
    proof.status = 'FAIL';
    const webFile = path.join(out, 'web-report.json');
    if (syncFs.existsSync(webFile)) {
      const web = await checkedJson<WebReport>(webFile);
      proof.errors.push(...(web.errors ?? []));
      proof.web = { screenshots: (web.screenshots ?? []).map((file: string) => path.join(out, path.basename(file))), checkedPages: web.checkedPages ?? [] };
    }
  }
  await fs.writeFile(path.join(job, 'proof.json'), JSON.stringify(proof, null, 2));
  await fs.writeFile(path.join(projectControl(directory), 'latest-proof.json'), JSON.stringify(proof, null, 2));
  return proof;
};

export const requireCurrentProof = async (directory: string): Promise<CheckProof> => {
  const proof = await latestProof(directory);
  ensure(
    proof.pass && proof.sourceDigest === manifestDigest(sourceManifest(directory)),
    'Controlli mancanti, falliti o riferiti a file precedenti: rieseguire project_check.',
  );
  const output = (await checkedJson(path.join(proof.job, 'output-manifest.json'))) as Record<string, string>;
  ensure(proof.criteriaDigest === (await criteriaDigest(directory)), 'Piano o prove modificati: il PASS precedente non e piu valido.');
  const current: Record<string, string> = {};
  for (const file of await outputFiles(proof.publicRoot)) {
    current[path.relative(proof.publicRoot, file)] = digest(await fs.readFile(file));
  }
  ensure(manifestDigest(current) === manifestDigest(output), 'La copia pubblica verificata e cambiata: ripetere i controlli.');
  return proof;
};
export const previewProject = async (directory: string): Promise<{ url: string; proofId: string }> => {
  const proof = await requireCurrentProof(directory);
  const key = projectControl(directory);
  if (previews.has(key)) {
    previews.get(key)!.update(proof.publicRoot);
  } else {
    const module = await import(pathToFileURL(path.join(labScriptsRoot(), 'public-web-server.mjs')).href);
    previews.set(key, await module.startPublicServer(proof.publicRoot, { spa: proof.stack === 'react-vite' }));
  }
  return { url: previews.get(key)!.url, proofId: proof.id };
};
export const exportProject = async (directory: string): Promise<{ file: string; sha256: string; proofId: string }> => {
  const proof = await requireCurrentProof(directory);
  const state = readProjectState(directory);
  const name =
    state.title
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .slice(0, 55) || 'progetto';
  const target = path.join(path.dirname(path.dirname(process.env.AIDER_DESK_HOME_DIR!)), '..', 'Consegne', name);
  await fs.mkdir(target, { recursive: true });
  const zip = new AdmZip();
  const snapshot = (await checkedJson(path.join(proof.job, 'source-manifest.json'))) as Record<string, string>;
  ensure(manifestDigest(snapshot) === proof.sourceDigest, 'Manifest della prova non integro.');
  for (const [file, hash] of Object.entries(snapshot)) {
    const bytes = await fs.readFile(path.join(proof.job, 'workspace', file));
    ensure(digest(bytes) === hash, 'Copia verificata non integra: ' + file);
    zip.addFile('sorgenti/' + file, bytes);
  }
  for (const file of await outputFiles(proof.publicRoot)) {
    zip.addFile('sito-pronto/' + path.relative(proof.publicRoot, file).split(path.sep).join('/'), await fs.readFile(file));
  }
  if (state.stack !== 'vanilla') {
    for (const name of ['react', 'react-dom', 'vite', 'astro']) {
      const folder = path.join(proof.job, 'dependencies', 'node_modules', name);
      if (!syncFs.existsSync(folder)) {
        continue;
      }
      let added = false;
      for (const license of ['LICENSE', 'LICENSE.md', 'license']) {
        const file = path.join(folder, license);
        if (!syncFs.existsSync(file)) {
          continue;
        }
        const stat = await fs.lstat(file);
        const relative = path.relative(await fs.realpath(folder), await fs.realpath(file));
        ensure(
          stat.isFile() && !stat.isSymbolicLink() && stat.size < 100000 && !relative.startsWith('..') && !path.isAbsolute(relative),
          'Licenza dipendenza non verificabile.',
        );
        zip.addFile('licenze/' + name + '.txt', await fs.readFile(file));
        added = true;
        break;
      }
      ensure(added, 'Licenza richiesta nella consegna: ' + name);
    }
  }
  zip.addFile(
    'LEGGIMI-CONSEGNA.txt',
    Buffer.from(
      'La cartella sito-pronto contiene i file per un hosting statico. Mantieni i percorsi relativi.\nPer vedere il sito usa l anteprima locale dell agente; aprire direttamente index.html puo non funzionare con gli script a moduli.\nLa cartella sorgenti contiene il progetto modificabile. Conserva il lockfile e le licenze incluse.\nPrima di pubblicare verifica testi, contatti, diritti delle risorse e funzionamento rispetto al brief del cliente. Nessuna pubblicazione e stata eseguita.\n',
    ),
  );
  zip.addFile(
    'CONTROLLI.txt',
    Buffer.from(
      `Progetto: ${state.title}\nStack: ${state.stack}\nProva: ${proof.id}\nSorgenti SHA: ${proof.sourceDigest}\nControlli tecnici superati il ${proof.createdAt}.\nVerifica finale dei contenuti e autorizzazione di pubblicazione restano del titolare.\n`,
    ),
  );
  const file = path.join(target, 'consegna-' + proof.id + '.zip');
  const bytes = zip.toBuffer();
  await fs.writeFile(file, bytes, { flag: 'wx' });
  return { file, sha256: digest(bytes), proofId: proof.id };
};
export const stopProjectServices = async (): Promise<void> => {
  await stopOwnedJobs();
  await Promise.all([...previews.values()].map((server) => server.close()));
  previews.clear();
};
