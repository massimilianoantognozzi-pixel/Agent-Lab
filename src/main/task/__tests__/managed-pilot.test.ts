import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertManagedPilotDone, isManagedPilot, managedWorkflowStatePath, runManagedPilot, type WorkflowPhase } from '../managed-pilot';

import * as atomicWrite from '@/utils/atomic-write';

const plan = {
  outcome: 'Attivare ricerca, filtro e dettaglio.',
  decisions: ['Riusa i componenti e i testi approvati.'],
  steps: ['Aggiorna view.json.'],
  acceptance: ['I tre controlli sono attivi.'],
  questions: [],
};
const baseline = {
  title: 'Archivio campione',
  table: 'RecordsTable',
  filters: 'RecordsFilter',
  modal: 'RecordDialog',
  enabled: { search: false, status: false, details: false },
  labels: {
    search: 'Cerca',
    all: 'Tutti',
    empty: 'Nessun risultato',
    details: 'Dettagli',
    close: 'Chiudi',
  },
};
const candidate = {
  ...baseline,
  enabled: { search: true, status: true, details: true },
};
const approvedReview = { verdict: 'pass', findings: [] };
type Generate = (phase: WorkflowPhase, instructions: string, input: string) => Promise<string | undefined>;

describe('managed workflow pilot', () => {
  let root: string;
  let projectDir: string;
  let statePath: string;
  let target: string;

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agent-lab-managed-')));
    projectDir = path.join(root, 'workspace');
    statePath = managedWorkflowStatePath(path.join(root, 'profile'), projectDir, 'task-1');
    target = path.join(projectDir, 'view.json');
    await fs.mkdir(projectDir);
    await Promise.all([
      fs.writeFile(target, JSON.stringify(baseline)),
      fs.writeFile(path.join(projectDir, 'AGENTS.md'), 'Regole correnti'),
      fs.writeFile(path.join(projectDir, 'DESIGN.md'), 'Cerca'),
      fs.writeFile(path.join(projectDir, 'index.html'), '<main>Componenti approvati</main>'),
      fs.writeFile(path.join(projectDir, 'HISTORY.md'), 'Trova era la vecchia etichetta'),
    ]);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(root, { recursive: true, force: true });
  });

  const run = (
    prompt: string,
    generate = vi.fn<Generate>(async (phase) => JSON.stringify(phase === 'plan' ? plan : phase === 'review' ? approvedReview : candidate)),
    providerModel = 'openai-codex/gpt-6.1-sol',
    verifyBrowser = vi.fn(async () => {}),
  ) => runManagedPilot({ projectDir, statePath, prompt, providerModel, generate, verifyBrowser });

  const preparePlan = async () => {
    const result = await run('Attiva i tre comportamenti.');
    const approval = result.message.match(/\/workflow approve [0-9a-f]{64}/)?.[0];
    expect(approval).toBeDefined();
    return approval!;
  };
  const view = async () => JSON.parse(await fs.readFile(target, 'utf8'));

  it('loads only approved files, persists the plan and never implements without the exact approval', async () => {
    const generate = vi.fn<Generate>(async () => JSON.stringify(plan));
    const result = await run('Dalla voce: attiva i filtri e il dettaglio.', generate);
    expect(result.phase).toBe('plan');
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][2]).toContain('DESIGN.md');
    expect(generate.mock.calls[0][2]).not.toContain('Trova');
    expect((await run('/workflow status')).message).toBe(result.message);
    await expect(run('/workflow approve ' + 'a'.repeat(64))).rejects.toThrow('versione corrente');
    await expect(run('/workflow resume')).rejects.toThrow('versione corrente');
    await expect(assertManagedPilotDone(projectDir, statePath)).rejects.toThrow('chiusura');
    expect(await view()).toEqual(baseline);
  });

  it('blocks approval when the plan has open questions or an approved source changed', async () => {
    const generate = vi.fn(async () => JSON.stringify({ ...plan, questions: ['Quale testo?'] }));
    const draft = await run('Una richiesta ambigua', generate);
    expect(draft.message).toContain('Domande da risolvere');
    const revision = draft.message.match(/Versione: ([a-f0-9]{64})/)?.[1];
    await expect(run('/workflow approve ' + revision)).rejects.toThrow('domande aperte');
    const approval = await preparePlan();
    await fs.writeFile(path.join(projectDir, 'DESIGN.md'), 'Una fonte diversa');
    await expect(run(approval)).rejects.toThrow('fonti sono cambiate');
    expect(await view()).toEqual(baseline);
  });

  it('withholds the edit and closure when the review verdict is absent', async () => {
    const approval = await preparePlan();
    const generate = vi.fn(async (phase: WorkflowPhase) => (phase === 'review' ? 'Fatto' : JSON.stringify(candidate)));
    expect((await run(approval, generate)).phase).toBe('waiting');
    expect(generate.mock.calls.map(([phase]) => phase)).toEqual(['implement', 'review', 'debug', 'review', 'debug', 'review']);
    expect(await view()).toEqual(baseline);
    await expect(assertManagedPilotDone(projectDir, statePath)).rejects.toThrow('chiusura');
  });

  it('does not ask the reviewer to bless a failed deterministic check', async () => {
    const approval = await preparePlan();
    const generate = vi.fn(async () =>
      JSON.stringify({
        ...candidate,
        labels: { ...candidate.labels, search: 'Trova' },
      }),
    );
    const result = await run(approval, generate);
    expect(result.message).toContain('etichette');
    expect(generate).toHaveBeenCalledTimes(3);
    expect(await view()).toEqual(baseline);
  });

  it('withholds review, writing and closure if the browser proof fails', async () => {
    const approval = await preparePlan();
    const generate = vi.fn<Generate>(async () => JSON.stringify(candidate));
    const verify = vi.fn(async () => {
      throw new Error('Browser failure');
    });
    await expect(run(approval, generate, 'openai-codex/gpt-6.1-sol', verify)).rejects.toThrow('Browser failure');
    expect(generate.mock.calls.map(([phase]) => phase)).toEqual(['implement']);
    expect(await view()).toEqual(baseline);
    await expect(assertManagedPilotDone(projectDir, statePath)).rejects.toThrow('chiusura');
  });

  it('delivers only the reviewed change and invalidates a later edit', async () => {
    const approval = await preparePlan();
    expect((await run(approval)).phase).toBe('done');
    expect(await view()).toEqual(candidate);
    await expect(assertManagedPilotDone(projectDir, statePath)).resolves.toBeUndefined();
    await fs.writeFile(target, JSON.stringify({ ...candidate, title: 'Cambiato fuori dal flusso' }));
    await expect(assertManagedPilotDone(projectDir, statePath)).rejects.toThrow('chiusura');
    expect((await run('/workflow status')).message).toContain('cambiati');
  });

  it('allows a new plan after invalidating a pending delivery without overwriting the file', async () => {
    const approval = await preparePlan();
    const generate = vi.fn(async (phase: WorkflowPhase) => {
      if (phase !== 'review') {
        return JSON.stringify(candidate);
      }
      await fs.writeFile(path.join(projectDir, 'DESIGN.md'), 'Modificato durante la revisione');
      return JSON.stringify(approvedReview);
    });
    await expect(run(approval, generate)).rejects.toThrow('Fonti o proposta cambiate');
    expect((await run('/workflow status')).message).toContain('/workflow discard');
    await expect(run('/workflow resume')).rejects.toThrow('Fonti o proposta cambiate');
    await run('/workflow discard');
    expect(await view()).toEqual(baseline);
    await expect(preparePlan()).resolves.toMatch(/^\/workflow approve /);
  });

  it('resumes a reviewed pending delivery without asking the model to repeat it', async () => {
    const approval = await preparePlan();
    const originalWrite = atomicWrite.atomicWriteJsonFile;
    const writer = vi.spyOn(atomicWrite, 'atomicWriteJsonFile').mockImplementation(async (file, value) => {
      if (file === target) {
        throw new Error('Interrupted before replace');
      }
      return originalWrite(file, value);
    });
    try {
      await expect(run(approval)).rejects.toThrow('Interrupted before replace');
      expect(await view()).toEqual(baseline);
    } finally {
      writer.mockRestore();
    }
    const generate = vi.fn<Generate>();
    expect((await run('/workflow resume', generate)).phase).toBe('done');
    expect(generate).not.toHaveBeenCalled();
    expect(await view()).toEqual(candidate);
  });

  it('requires the exact provider and limits opt-in to the configured workspace', async () => {
    vi.stubEnv('AIDER_DESK_WORKFLOW_PILOT_DIR', projectDir);
    expect(isManagedPilot(projectDir)).toBe(true);
    expect(isManagedPilot(root)).toBe(false);
    await expect(run('Richiesta', undefined, 'other/gpt-6.1-sol')).rejects.toThrow('OpenAI Codex');
  });
});
