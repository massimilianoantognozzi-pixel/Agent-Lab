import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateProjectDocuments } from '../project-documents';

vi.unmock('fs');
vi.unmock('path');
vi.mock('@/constants', () => ({ AIDER_DESK_DATA_DIR: '', AIDER_DESK_HOME_DIR: '' }));
vi.mock('@/logger', () => ({ default: { warn: vi.fn() } }));
vi.mock('@/extensions/project-extension-trust', () => ({ getProjectAuthorityRoot: () => '' }));
vi.mock('../document-runtime', () => ({ renderProjectDocuments: vi.fn() }));

const request = { outputDirectory: 'consegne/prova', formats: Array<'pdf'>('pdf'), document: { title: 'Prova' } };
const receipt = {
  status: 'verified',
  template: 'Standard',
  engines: ['fixture'],
  checks: ['fixture'],
  pages: 1,
  files: ['document.pdf'],
  previews: ['page-001.png'],
};
const render = vi.fn(async (job: string) => {
  const output = path.join(job, 'output');
  await fs.mkdir(output);
  await fs.writeFile(path.join(output, 'document.pdf'), 'PDF fixture');
  await fs.writeFile(path.join(output, 'page-001.png'), 'PNG fixture');
  await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipt));
  return 'fixture';
});
let fixture: string;
let root: string;
let abort: AbortController;

describe('consegna documenti del progetto', () => {
  beforeEach(async () => {
    fixture = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'agentlab-test-docs-')));
    root = path.join(fixture, 'repo');
    await fs.mkdir(root);
    abort = new AbortController();
    render.mockClear();
  });
  afterEach(async () => {
    await fs.rm(fixture, { recursive: true, force: true });
  });

  it('usa automaticamente il modello del progetto e salva fonte e impronte', async () => {
    const theme = { name: 'Progetto', accent: '#335544' };
    await fs.mkdir(path.join(root, 'document-templates'));
    await fs.writeFile(path.join(root, 'document-templates/default.json'), JSON.stringify(theme));
    const report = await generateProjectDocuments(root, request, abort.signal, async (job) => {
      expect(JSON.parse(await fs.readFile(path.join(job, 'input/request.json'), 'utf8')).theme).toEqual(theme);
      return render(job);
    });
    expect(report.templateSource).toBe('document-templates/default.json');
    expect(report.hashes['document.pdf']).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(await fs.readFile(path.join(root, request.outputDirectory, 'source.json'), 'utf8'))).toEqual(request);
    await expect(generateProjectDocuments(root, request, abort.signal, render)).rejects.toThrow(/esiste/);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('rifiuta nomi protetti, uscite dal progetto e collegamenti a directory', async () => {
    await fs.symlink(fixture, path.join(root, 'esterno'), 'junction');
    for (const outputDirectory of ['../fuori', '.git/custom', 'esterno/fuori']) {
      await expect(generateProjectDocuments(root, { ...request, outputDirectory }, abort.signal, render)).rejects.toThrow();
    }
    expect(render).not.toHaveBeenCalled();
  });

  it('mantiene la cartella finale assente dopo un errore, un output incompleto o Stop', async () => {
    await expect(
      generateProjectDocuments(root, request, abort.signal, async () => {
        throw new Error('Errore di calcolo');
      }),
    ).rejects.toThrow(/calcolo/);
    await expect(generateProjectDocuments(root, { ...request, formats: ['docx', 'pdf'] }, abort.signal, render)).rejects.toThrow(/incompleti/);
    await expect(
      generateProjectDocuments(root, request, abort.signal, async (job) => {
        await render(job);
        abort.abort();
        return 'fixture';
      }),
    ).rejects.toThrow();
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('non sostituisce un modello richiesto mancante e rifiuta la duplicazione dei dati tabellari', async () => {
    await expect(generateProjectDocuments(root, { ...request, template: 'assente' }, abort.signal, render)).rejects.toThrow();
    const document = { ...request.document, columns: ['Prezzo'], rows: [['5']], sheets: [{ name: 'Dati', columns: ['Prezzo'], rows: [[9]] }] };
    await expect(generateProjectDocuments(root, { ...request, document, formats: ['xlsx', 'pdf'] }, abort.signal, render)).rejects.toThrow(/tableFromSheet/);
    expect(render).not.toHaveBeenCalled();
  });
});
