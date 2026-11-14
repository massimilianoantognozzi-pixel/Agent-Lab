import { readFileSync, realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { isManagedPilot } from './managed-pilot';

const identifier = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const file = z.string().min(1).max(240);
const branch = z.string().min(1);
const check = z.discriminatedUnion('type', [
  z.strictObject({ id: identifier, type: z.literal('json'), file }),
  z.strictObject({ id: identifier, type: z.literal('browser') }),
  z.strictObject({ id: identifier, type: z.literal('contains'), file, text: z.string().min(1).max(2000) }),
  z.strictObject({ id: identifier, type: z.literal('excludes'), file, text: z.string().min(1).max(2000) }),
  z.strictObject({ id: identifier, type: z.literal('typescript'), file }),
  z.strictObject({
    id: identifier,
    type: z.literal('typescript-expression'),
    file,
    variable: z.string().regex(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/),
    expected: z.string().min(1).max(2000),
  }),
  z.strictObject({
    id: identifier,
    type: z.literal('docker'),
    image: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    args: z.array(z.string().min(1).max(500)).min(1).max(30),
  }),
]);
const project = z.strictObject({
  id: identifier,
  root: z.string().min(1),
  provider: z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/),
  model: z.string().regex(/^[a-zA-Z0-9_.:/-]{1,100}$/),
  references: z
    .array(z.strictObject({ path: file, role: z.enum(['blueprint', 'rules', 'design', 'decision', 'state', 'handoff']) }))
    .min(1)
    .max(24),
  context: z.array(file).max(64),
  editable: z.array(file).min(1).max(64),
  checks: z.array(check).min(1).max(20),
  requiredChecks: z.array(identifier).max(20).optional(),
  workPlan: file.optional(),
  researchAfterFailures: z.number().int().min(1).max(20).optional(),
  evidenceExcludes: z.record(z.string().regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/), z.array(file)).optional(),
  legacyReceipts: z.record(z.string().regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/), z.string().regex(/^[a-f0-9]{64}$/)).optional(),
  branches: z
    .strictObject({ main: branch, development: branch })
    .refine(({ main, development }) => main.toLowerCase() !== development.toLowerCase(), 'Indica due rami distinti.')
    .optional(),
});
const configuration = z.strictObject({ version: z.literal(1), projects: z.array(project).min(1).max(20) });

export type WorkflowProject = z.infer<typeof project> & { optionalInputs?: string[] };
export type WorkflowCheck = z.infer<typeof check>;
export type WorkflowFiles = Record<string, string | null>;

export const requiredWorkflowChecks = (policy: WorkflowProject) => {
  const ids = new Set(policy.requiredChecks ?? []);
  const checks = policy.checks.filter(({ id }) => ids.has(id));
  if (ids.size !== (policy.requiredChecks?.length ?? 0) || checks.length !== ids.size) {
    throw new Error('I controlli obbligatori devono avere ID distinti e dichiarati nella configurazione.');
  }
  return checks;
};

const key = (value: string) => (process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value));
const reserved = /^(?:\.git|\.aider-desk|\.agent-lab|node_modules|\.env(?:\..*)?|\.npmrc|\.netrc|credentials(?:\..*)?|.*\.(?:pem|pfx|key|p12))$/i;
const device = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i;

export const validateWorkflowPath = (value: string): string => {
  const parts = value.split('/');
  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        reserved.test(part) ||
        device.test(part) ||
        [...part].some((character) => character.charCodeAt(0) < 32) ||
        /[\\:*?"<>|]|[. ]$/.test(part),
    )
  ) {
    throw new Error('Percorso fuori dal perimetro del workflow.');
  }
  return value;
};

let cached: { filename: string; projects: WorkflowProject[] } | undefined;

export const listWorkflowProjects = (): WorkflowProject[] => {
  const filename = process.env.AIDER_DESK_WORKFLOW_CONFIG;
  if (!filename) {
    return [];
  }
  if (!path.isAbsolute(filename)) {
    throw new Error('La configurazione workflow deve avere un percorso assoluto.');
  }
  if (cached?.filename === filename) {
    return cached.projects;
  }
  const { projects } = configuration.parse(JSON.parse(readFileSync(filename, 'utf8')));
  const ids = new Set<string>();
  const roots = new Set<string>();
  for (const item of projects) {
    if (!path.isAbsolute(item.root)) {
      throw new Error('La radice del progetto deve avere un percorso assoluto.');
    }
    item.root = realpathSync(item.root);
    const root = key(item.root);
    const relative = path.relative(root, key(realpathSync(filename)));
    if (!relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))) {
      throw new Error('La configurazione del workflow deve risiedere fuori dal repository.');
    }
    if (ids.has(item.id) || roots.has(root)) {
      throw new Error('Progetto workflow duplicato.');
    }
    ids.add(item.id);
    roots.add(root);
    const sources = [...item.references.map((ref) => ref.path), ...(item.workPlan ? [item.workPlan] : [])];
    const allFiles = [...sources, ...item.context, ...item.editable];
    for (const entry of allFiles) {
      validateWorkflowPath(entry);
    }
    for (const paths of Object.values(item.evidenceExcludes ?? {})) {
      paths.forEach(validateWorkflowPath);
    }
    const receipts = Object.values(item.legacyReceipts ?? {});
    if (new Set(receipts).size !== receipts.length) {
      throw new Error('Una ricevuta precedente è associata a più task.');
    }
    const uniqueFiles = [...new Set(allFiles)];
    if (new Set(uniqueFiles.map((value) => value.toLowerCase())).size !== uniqueFiles.length) {
      throw new Error('Percorsi equivalenti nel workflow.');
    }
    const protectedFiles = new Set(sources);
    if (item.editable.some((entry) => protectedFiles.has(entry))) {
      throw new Error('Una fonte approvata non può essere modificata dal workflow.');
    }
    if (new Set(item.checks.map((entry) => entry.id)).size !== item.checks.length) {
      throw new Error('Controllo workflow duplicato.');
    }
    requiredWorkflowChecks(item);
    for (const entry of item.checks) {
      if ('file' in entry && !allFiles.includes(validateWorkflowPath(entry.file))) {
        throw new Error('Un controllo riferisce un file fuori scope.');
      }
    }
  }
  cached = { filename, projects };
  return projects;
};

export const workflowProjectFor = (directory: string): WorkflowProject | undefined => {
  const projects = listWorkflowProjects();
  if (!projects.length) {
    return undefined;
  }
  const direct = projects.find((item) => key(item.root) === key(directory));
  if (direct) {
    return direct;
  }
  try {
    const real = key(realpathSync(directory));
    return projects.find((item) => key(item.root) === real);
  } catch {
    return undefined;
  }
};

export const isGovernedWorkflow = (directory: string): boolean => isManagedPilot(directory) || !!workflowProjectFor(directory);

export const assertWorkflowText = (content: string) => {
  if (content.includes('\0') || /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\b(?:sk-(?:proj-)?|gh[pousr]_)[A-Za-z0-9_-]{24,}/.test(content)) {
    throw new Error('Il perimetro contiene testo binario o un possibile segreto.');
  }
};

export const workflowFileNames = (policy: WorkflowProject) =>
  [
    ...new Set([
      ...policy.references.map((ref) => ref.path),
      ...(policy.workPlan ? [policy.workPlan] : []),
      ...policy.context,
      ...policy.editable,
      ...(policy.optionalInputs ?? []),
    ]),
  ]
    .sort()
    .map(validateWorkflowPath);

export const collectWorkflowFiles = async (policy: WorkflowProject, read: (name: string) => Promise<Buffer | null>): Promise<WorkflowFiles> => {
  const required = new Set([...policy.references.map((ref) => ref.path), ...(policy.workPlan ? [policy.workPlan] : []), ...policy.context]);
  let total = 0;
  const entries: [string, string | null][] = [];
  for (const name of workflowFileNames(policy)) {
    const bytes = await read(name);
    if (bytes === null && required.has(name)) {
      throw new Error('Fonte richiesta mancante: ' + name);
    }
    if (bytes && bytes.length > 150_000) {
      throw new Error('File fuori dai limiti del workflow: ' + name);
    }
    total += bytes?.length ?? 0;
    if (total > 900_000) {
      throw new Error('Riduci il perimetro dei file e delle fonti prima di avviare il task.');
    }
    const content = bytes === null ? null : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (content !== null) {
      assertWorkflowText(content);
    }
    entries.push([name, content]);
  }
  return Object.fromEntries(entries);
};

export const snapshotWorkflowFiles = async (policy: WorkflowProject): Promise<WorkflowFiles> => {
  if (key(await fs.realpath(policy.root)) !== key(policy.root)) {
    throw new Error('Radice del progetto cambiata.');
  }
  return collectWorkflowFiles(policy, async (name) => {
    const parts = name.split('/');
    let target = policy.root;
    for (const [index, segment] of parts.entries()) {
      target = path.join(target, segment);
      const stat = await fs.lstat(target).catch((error) => {
        if (error.code === 'ENOENT') {
          return undefined;
        }
        throw error;
      });
      if (!stat) {
        return null;
      }
      if (stat.isSymbolicLink()) {
        throw new Error('Collegamento non ammesso nel perimetro: ' + name);
      }
      if (index === parts.length - 1) {
        if (!stat.isFile() || stat.nlink !== 1 || stat.size > 150_000) {
          throw new Error('File fuori dai limiti del workflow: ' + name);
        }
        return fs.readFile(target);
      } else if (!stat.isDirectory()) {
        throw new Error('Directory non valida nel perimetro: ' + name);
      }
    }
    return null;
  });
};
