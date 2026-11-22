import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { tool } from 'ai';
import { z } from 'zod';

import { renderProjectDocuments } from './document-runtime';
import { readImageReferences } from './image-files';

import type { ApprovalManager } from './approval-manager';
import type { Task } from '@/task';

import { validateWorkflowPath } from '@/task/workflow-policy';
import { resolveProjectToolPath } from '@/utils/contained-path';
import logger from '@/logger';

const format = z.enum(['pdf', 'docx', 'xlsx']);
const field = z.string().max(4000);
const label = z.string().trim().min(1).max(180);
const coordinate = z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,4}$/);
const cell = z.union([field, z.number(), z.boolean(), z.null(), z.strictObject({ formula: z.string().min(2).max(500), expected: z.number() })]);
const sheet = z.strictObject({
  name: z.string().trim().min(1).max(31),
  columns: z.array(label).min(1).max(48),
  rows: z.array(z.array(cell).min(1).max(48)).min(1).max(2000),
  numberFormats: z.array(z.string().max(80)).max(48).optional(),
  inputCheck: z
    .strictObject({
      cell: coordinate,
      value: z.number(),
      expect: z
        .array(z.strictObject({ cell: coordinate, value: z.number() }))
        .min(1)
        .max(60),
    })
    .optional(),
});
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/);
const requestSchema = z.strictObject({
  outputDirectory: z.string().min(1).max(240).describe('New directory relative to the project, e.g. consegne/preventivo-v1.'),
  formats: z.array(format).min(1).max(3),
  template: slug.optional().describe('Name from document-templates/<name>.json. Omit for the project default.'),
  document: z.strictObject({
    title: label,
    paragraphs: z.array(field).max(120).optional(),
    columns: z.array(label).min(1).max(20).optional(),
    rows: z.array(z.array(field).min(1).max(20)).max(2000).optional(),
    summary: z.array(field).max(100).optional(),
    pageBreakBeforeRows: z.array(z.number().int().min(0)).max(64).optional().describe('Zero-based indices of rows starting on a new page.'),
    tableFromSheet: z.string().min(1).max(31).optional().describe('Name of source sheet for a printed table. Uses real recalculated values.'),
    sheets: z
      .array(sheet)
      .min(1)
      .max(24)
      .optional()
      .describe(
        'Header row 1, data from row 2. Formulas: {formula:"=B2*C2",expected:12}. For each sheet with formulas provide inputCheck with a changed numeric input and affected formula values.',
      ),
  }),
});
type DocumentRequest = z.infer<typeof requestSchema>;
const themeSchema = z.strictObject({
  name: label,
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  organization: label.optional(),
  footer: z.string().trim().max(240).optional(),
  logo: z.string().min(1).max(240).optional(),
});
const receiptSchema = z.object({
  status: z.literal('verified'),
  template: label,
  engines: z.array(z.string().max(512)).min(1).max(3),
  checks: z.array(z.string().max(2000)).min(1).max(500),
  pages: z.number().int().min(0).max(150),
  files: z
    .array(z.enum(['document.pdf', 'document.docx', 'workbook.xlsx']))
    .min(1)
    .max(3),
  previews: z.array(z.string().regex(/^(?:page-\d{3,}|sheet-\d{3,}(?:-page-\d{3,})?)\.png$/)).max(150),
});
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const checkedPath = async (root: string, relative: string) => {
  const name = validateWorkflowPath(relative.replaceAll('\\', '/'));
  const candidate = await resolveProjectToolPath(root, name);
  if (path.relative(candidate, path.join(root, name)) !== '') {
    throw new Error('Scegli un percorso di progetto senza collegamenti simbolici.');
  }
  return candidate;
};
const requireNew = async (file: string) => {
  await fs.lstat(file).then(
    () => {
      throw new Error('La cartella esiste già. Scegli una nuova versione della consegna.');
    },
    (error) => {
      if (!missing(error)) {
        throw error;
      }
    },
  );
};
const projectTheme = async (root: string, template?: string) => {
  const name = 'document-templates/' + (template ?? 'default') + '.json';
  const filename = await checkedPath(root, name);
  const file = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch((error) => {
    if (!template && missing(error)) {
      return undefined;
    }
    throw error;
  });
  if (!file) {
    return {
      theme: themeSchema.parse({
        name: 'Standard Agent-Lab',
        accent: '#28536B',
      }),
      source: 'Agent-Lab',
    };
  }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 16_384) {
      throw new Error('File modello non valido.');
    }
    const bytes = await file.readFile();
    const after = await fs.lstat(await checkedPath(root, name));
    if (stat.ino !== after.ino || stat.dev !== after.dev || after.nlink !== 1 || stat.ctimeMs !== after.ctimeMs || bytes.length !== stat.size) {
      throw new Error('Il modello è cambiato durante la lettura.');
    }
    return {
      theme: themeSchema.parse(JSON.parse(bytes.toString('utf8'))),
      source: name,
      sha256: digest(bytes),
    };
  } finally {
    await file.close();
  }
};

const validateRequest = (request: DocumentRequest) => {
  const { formats, document } = request;
  if (Buffer.byteLength(JSON.stringify(request)) > 2_000_000 || new Set(formats).size !== formats.length) {
    throw new Error('Usa formati distinti e mantieni i dati entro 2 MB.');
  }
  if (formats.includes('xlsx') && !document.sheets?.length) {
    throw new Error('Per Excel occorre almeno un foglio.');
  }
  if (document.tableFromSheet && (!document.sheets?.some((item) => item.name === document.tableFromSheet) || document.columns || document.rows)) {
    throw new Error('Indica il solo foglio sorgente della tabella impaginata.');
  }
  if (formats.includes('xlsx') && formats.length > 1 && (document.columns || document.rows)) {
    throw new Error('Usa tableFromSheet per riportare la stessa tabella negli altri formati.');
  }
};

export const generateProjectDocuments = async (
  directory: string,
  request: DocumentRequest,
  signal: AbortSignal,
  render = renderProjectDocuments,
  onPublished?: (privateOutput: string, destination: string, files: string[], previews: string[]) => Promise<void>,
) => {
  signal.throwIfAborted();
  validateRequest(request);
  const root = await fs.realpath(directory);
  const relative = validateWorkflowPath(request.outputDirectory.replaceAll('\\', '/'));
  const destination = await checkedPath(root, relative);
  await requireNew(destination);
  const selected = await projectTheme(root, request.template);
  const job = await fs.mkdtemp(path.join(os.tmpdir(), 'agentlab-office-'));
  try {
    const input = path.join(job, 'input');
    await fs.mkdir(input);
    const theme = { ...selected.theme };
    let logoSha256: string | undefined;
    if (theme.logo) {
      const [logo] = await readImageReferences(root, [path.posix.join('document-templates', validateWorkflowPath(theme.logo))]);
      if (logo.mimeType !== 'image/png' || logo.bytes.length > 4_000_000) {
        throw new Error('Il logo del modello richiede un PNG entro 4 MB.');
      }
      await fs.writeFile(path.join(input, 'logo.png'), logo.bytes);
      logoSha256 = digest(logo.bytes);
      theme.logo = '/input/logo.png';
    }
    await fs.writeFile(path.join(input, 'request.json'), JSON.stringify({ ...request, theme }));
    const image = await render(job, signal);
    signal.throwIfAborted();
    const output = path.join(job, 'output');
    const receipt = receiptSchema.parse(JSON.parse(await fs.readFile(path.join(output, 'receipt.json'), 'utf8')));
    const expected = request.formats.map((f) => (f === 'xlsx' ? 'workbook.xlsx' : 'document.' + f));
    if (receipt.files.length !== expected.length || expected.some((f) => !receipt.files.some((name) => name === f)) || !receipt.previews.length) {
      throw new Error('File o anteprime della consegna incompleti.');
    }
    const hashes: Record<string, string> = {};
    for (const name of [...receipt.files, ...receipt.previews]) {
      const filename = path.join(output, name);
      const stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.nlink !== 1 || !stat.size || stat.size > 120 * 1024 * 1024) {
        throw new Error('Output non valido: ' + name);
      }
      hashes[name] = digest(await fs.readFile(filename));
    }
    const source = JSON.stringify(request, null, 2) + '\n';
    const report = {
      ...receipt,
      output: relative,
      templateSource: selected.source,
      templateSha256: selected.sha256,
      logoSha256,
      runtime: image,
      hashes,
      sourceSha256: digest(source),
    };
    await fs.writeFile(path.join(output, 'source.json'), source);
    await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify(report, null, 2) + '\n');

    const parent = path.dirname(destination);
    let current = root;
    for (const part of relative.split('/').slice(0, -1)) {
      current = path.join(current, part);
      await checkedPath(root, path.relative(root, current));
      await fs.mkdir(current).catch((error) => {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      });
      if (!(await fs.lstat(current)).isDirectory()) {
        throw new Error('Cartella di consegna non valida.');
      }
    }
    await checkedPath(root, relative);
    const staged = await fs.mkdtemp(path.join(parent, '.documenti-'));
    const identity = await fs.lstat(staged);
    const owned = async () => {
      const file = await fs.lstat(await checkedPath(root, path.relative(root, staged)));
      return file.isDirectory() && file.ino === identity.ino && file.dev === identity.dev;
    };
    try {
      for (const name of [...Object.keys(hashes), 'receipt.json', 'source.json']) {
        if (!(await owned())) {
          throw new Error('Cartella temporanea modificata.');
        }
        await fs.copyFile(path.join(output, name), path.join(staged, name), constants.COPYFILE_EXCL);
      }
      await requireNew(await checkedPath(root, relative));
      if (!(await owned())) {
        throw new Error('Cartella temporanea modificata.');
      }
      signal.throwIfAborted();
      if (process.platform === 'win32') {
        // Windows refuses to replace an existing directory with a directory.
        await fs.rename(staged, destination);
      } else {
        // POSIX rename can replace an unrelated empty directory. Reserve our own first.
        await fs.mkdir(destination);
        const reservation = await fs.lstat(destination);
        try {
          signal.throwIfAborted();
          await fs.rename(staged, destination);
        } catch (error) {
          const current = await fs.lstat(await checkedPath(root, relative));
          if (current.dev === reservation.dev && current.ino === reservation.ino) {
            await fs.rmdir(destination).catch(() => undefined);
          }
          throw error;
        }
      }
    } finally {
      if (await owned().catch(() => false)) {
        await fs.rm(staged, { recursive: true });
      }
    }
    let displayNotice: string | undefined;
    try {
      await onPublished?.(output, destination, [...Object.keys(hashes), 'source.json', 'receipt.json'], receipt.previews);
    } catch (error) {
      logger.warn('Could not complete the local display or attribution of a verified document delivery.', { error });
      displayNotice = 'I file sono verificati nella cartella indicata. La registrazione della consegna nella chat è parziale.';
    }
    return { ...report, displayNotice };
  } finally {
    await fs.rm(job, { recursive: true, force: true });
  }
};

export const readDocumentThumbnails = (output: unknown): string[] => {
  if (!output || typeof output !== 'object' || !('content' in output) || !Array.isArray(output.content)) {
    return [];
  }
  return output.content
    .filter((part) => part?.type === 'image' && part.mimeType === 'image/png' && typeof part.data === 'string' && part.data.length <= 240_000)
    .slice(0, 4)
    .map((part) => part.data);
};

export const createDocumentTools = (task: Task, approval: ApprovalManager, signal: AbortSignal) => ({
  'documents---generate': tool({
    description:
      'Create and verify requested project documents (editable Word DOCX, PDF, Excel XLSX) locally. Use for quotes, reports, lists or spreadsheets. Send all requested formats together. The PDF derives from Word when both are requested. Use tableFromSheet for shared tabular data. Reuse the approved project template in document-templates/. On failure correct the input and retry; on success link the requested files in output and summarize the checks.',
    inputSchema: requestSchema,
    execute: async (input, options) => {
      const [allowed] = await approval.handleToolApproval(
        'documents---generate',
        { outputDirectory: input.outputDirectory, formats: input.formats },
        'documents---generate',
        'Creare e verificare i documenti nella cartella del progetto?',
        input.outputDirectory,
      );
      if (!allowed) {
        throw new Error('Generazione documenti non autorizzata.');
      }
      const previews: { type: 'image'; mimeType: string; data: string }[] = [];
      const operationSignal = options.abortSignal ? AbortSignal.any([signal, options.abortSignal]) : signal;
      const report = await generateProjectDocuments(
        task.getTaskDir(),
        requestSchema.parse(input),
        operationSignal,
        renderProjectDocuments,
        async (output, destination, names, pages) => {
          const { nativeImage } = await import('electron');
          for (const name of names) {
            const thumbnail = pages.slice(0, 4).includes(name);
            if (!task.recordsDesktopWrites && !thumbnail) {
              continue;
            }
            const bytes = await fs.readFile(path.join(output, name));
            if (task.recordsDesktopWrites) {
              await task.recordDesktopWrite(path.join(destination, name), null, bytes);
            }
            if (thumbnail) {
              const png = nativeImage.createFromBuffer(bytes).resize({ width: 360 }).toPNG();
              if (png.length && png.length <= 180_000) {
                previews.push({ type: 'image', mimeType: 'image/png', data: png.toString('base64') });
              }
            }
          }
        },
      );
      const content = [
        {
          type: 'text',
          text: JSON.stringify({
            output: report.output,
            files: report.files,
            pages: report.pages,
            checks: report.checks,
            template: report.template,
            engines: report.engines,
            status: report.status,
            displayNotice: report.displayNotice,
            previews: report.previews,
            receipt: report.output + '/receipt.json',
          }),
        },
        ...previews,
      ];
      return { content };
    },
    toModelOutput: ({ output }) => ({
      type: 'text',
      value: 'text' in output.content[0] ? output.content[0].text : '',
    }),
  }),
});
