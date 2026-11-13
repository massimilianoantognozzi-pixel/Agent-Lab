import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertRepositoryWorkflowDone, readRemoteRepositoryPatch, readRepositoryWorkflow, runRepositoryWorkflow } from '../repository-workflow';
import { listWorkflowProjects, validateWorkflowPath, workflowProjectFor, type WorkflowProject } from '../workflow-policy';

import type { WorkflowStage } from '../workflow-skills';

vi.unmock('fs');
vi.unmock('path');

const assertDockerImage = (image: string) => expect(image).toMatch(/^sha256:[0-9a-f]{64}$/);
const original = 'export const filter = (items: number[]) => items.filter(item => item < 0);\n';
const fixed = 'export const filter = (items: number[]) => items.filter(item => item > 0);\n';
const plan = {
  outcome: 'Mostra solo valori positivi.',
  delta: 'Rovescia il confronto.',
  files: ['src/filter.ts'],
  reuse: ['Riusa filter.'],
  steps: ['Correggi il confronto.'],
  criteria: [{ scenario: 'La funzione usa il filtro positivo.', check: 'regression' }],
  reproduction: 'regression',
  questions: [],
  surface: 'none',
};
type Generate = (stage: WorkflowStage, instructions: string, input: string) => Promise<string | undefined>;
const lesson = { context: 'Filtro', symptom: 'Segno invertito', cause: 'Confronto errato', rule: 'Verifica il segno nel filtro', destination: 'Test' };

describe('repository workflow', () => {
  let tmp: string;
  let policy: WorkflowProject;
  let statePath: string;
  const source = () => path.join(policy.root, 'src/filter.ts');

  beforeEach(async () => {
    tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agentlab-workflow-')));
    policy = {
      id: 'demo',
      provider: 'openai-codex',
      model: 'gpt-6.1-sol',
      root: path.join(tmp, 'repo'),
      references: [
        { path: 'AGENTS.md', role: 'rules' },
        { path: 'DESIGN.md', role: 'design' },
      ],
      context: ['src/filter.ts'],
      editable: ['src/filter.ts', 'src/notes.md'],
      checks: [
        { id: 'syntax', type: 'typescript', file: 'src/filter.ts' },
        { id: 'regression', type: 'typescript-expression', file: 'src/filter.ts', variable: 'filter', expected: 'items.filter(item => item > 0)' },
      ],
    };
    statePath = path.join(tmp, 'data', 'task.json');
    await fs.mkdir(path.dirname(source()), { recursive: true });
    await fs.writeFile(path.join(policy.root, 'AGENTS.md'), 'Usa le fonti correnti.');
    await fs.writeFile(path.join(policy.root, 'DESIGN.md'), 'Riusa filter e la forma dei dati.');
    await fs.writeFile(source(), original);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  const response = (stage: WorkflowStage) =>
    JSON.stringify(
      stage === 'plan'
        ? plan
        : stage === 'review'
          ? { verdict: 'pass', findings: [] }
          : stage === 'learn'
            ? lesson
            : { changes: [{ path: 'src/filter.ts', content: fixed }] },
    );
  const run = (prompt: string, generate = vi.fn<Generate>(async (stage) => response(stage))) => runRepositoryWorkflow({ policy, statePath, prompt, generate });
  const git = (...args: string[]) => execFileSync('git', args, { cwd: policy.root, encoding: 'utf8', windowsHide: true }).trim();
  const useTwoBranches = () => {
    git('init', '-b', 'main');
    git('config', 'user.name', 'Agent-Lab Test');
    git('config', 'user.email', 'test@example.invalid');
    git('add', '.');
    git('commit', '-m', 'Base pilota');
    git('branch', 'dev');
    policy.branches = { main: 'main', development: 'dev' };
    return git('rev-parse', 'main');
  };
  const approve = async (kind: 'bug' | 'change' | 'feature' = 'bug') => {
    const result = await run('/workflow ' + kind + ' Correggi il filtro.');
    const match = result.message.match(/\/workflow approve [0-9a-f]{64}/);
    expect(match).not.toBeNull();
    return match![0];
  };

  it('delivers a staged patch only after the old bug fails and the candidate passes', async () => {
    const command = await approve();
    await expect(run('/workflow resume')).rejects.toThrow('versione esatta');
    const generate = vi.fn<Generate>(async (stage, _instructions, input) => {
      if (stage === 'review') {
        expect(JSON.parse(input)).toMatchObject({
          baselineChecks: expect.arrayContaining([{ id: 'regression', passed: false, detail: expect.any(String) }]),
          checks: expect.arrayContaining([{ id: 'regression', passed: true, detail: expect.any(String) }]),
          checkDefinitions: expect.arrayContaining([expect.objectContaining({ id: 'regression', type: 'typescript-expression', file: 'src/filter.ts' })]),
        });
      }
      return response(stage);
    });
    expect((await run(command, generate)).phase).toBe('done');
    expect(generate.mock.calls.map(([stage]) => stage)).toEqual(['implement', 'review']);
    expect(await fs.readFile(source(), 'utf8')).toBe(original);
    await expect(assertRepositoryWorkflowDone(policy, statePath)).resolves.toBeUndefined();
    await expect(readRemoteRepositoryPatch(policy, statePath, command.slice('/workflow approve '.length))).resolves.toContain('item > 0');
    await expect(readRemoteRepositoryPatch(policy, statePath, '0'.repeat(64))).rejects.toThrow('La chiusura richiede');
    const state = await readRepositoryWorkflow(statePath);
    expect(state).toMatchObject({
      phase: 'done',
      files: ['src/filter.ts'],
      checks: [
        { id: 'syntax', passed: true },
        { id: 'regression', passed: true },
      ],
    });
    const learned = await run('/workflow learn');
    await run(learned.message.match(/\/workflow remember [0-9a-f]{64}/)![0]);
    await expect(assertRepositoryWorkflowDone(policy, statePath)).resolves.toBeUndefined();
    const next = vi.fn<Generate>(async (stage) => response(stage));
    await run('/workflow change Aggiorna il filtro.', next);
    expect(next.mock.calls[0][2]).toContain(lesson.rule);
  });

  it('integrates successive verified tasks on the same development branch', async () => {
    const base = useTwoBranches();
    const first = await approve();
    expect((await run(first)).phase).toBe('done');
    const commit = git('rev-parse', 'dev');
    expect(commit).not.toBe(base);
    expect(git('show', 'dev:src/filter.ts')).toBe(fixed.trim());
    expect(git('rev-parse', 'main')).toBe(base);
    expect(git('status', '--porcelain')).toBe('');
    await expect(readRepositoryWorkflow(statePath, policy)).resolves.toMatchObject({ phase: 'done', commit });

    const previousState = statePath;
    statePath = path.join(path.dirname(statePath), 'next.json');
    const next = vi.fn<Generate>(async (stage, _instructions, input) => {
      if (stage === 'plan') {
        expect(JSON.parse(input).files['src/filter.ts']).toBe(fixed);
        return JSON.stringify({ ...plan, files: ['src/notes.md'] });
      }
      if (stage === 'implement') {
        return JSON.stringify({ changes: [{ path: 'src/notes.md', content: 'Il filtro conserva i valori positivi.\n' }] });
      }
      return response(stage);
    });
    const planned = await run('/workflow change Documenta il filtro.', next);
    const second = planned.message.match(/\/workflow approve [0-9a-f]{64}/)![0];
    expect((await run(second, next)).phase).toBe('done');
    expect(git('rev-parse', 'dev^')).toBe(commit);
    expect(git('show', 'dev:src/notes.md')).toContain('valori positivi');
    expect(git('for-each-ref', '--format=%(refname:short)', 'refs/heads')).toBe('dev\nmain');
    await expect(assertRepositoryWorkflowDone(policy, previousState)).resolves.toBeUndefined();
  });

  it('resumes the prepared commit after development is no longer checked out', async () => {
    const base = useTwoBranches();
    git('switch', 'dev');
    const command = await approve();
    await expect(run(command)).rejects.toThrow('aperto in un checkout');
    expect(git('rev-parse', 'dev')).toBe(base);
    expect(await run('/workflow status')).toMatchObject({ phase: 'waiting', message: expect.stringContaining('Commit preparato') });
    git('switch', 'main');
    const generate = vi.fn<Generate>(async (stage) => response(stage));
    expect((await run('/workflow resume', generate)).phase).toBe('done');
    expect(generate).not.toHaveBeenCalled();
    expect(git('rev-parse', 'dev^')).toBe(base);
    expect(git('rev-parse', 'main')).toBe(base);
  });

  it('replans against a changed development branch without applying the old prepared commit', async () => {
    const base = useTwoBranches();
    git('switch', 'dev');
    const command = await approve();
    await expect(run(command)).rejects.toThrow('aperto in un checkout');
    await fs.writeFile(path.join(policy.root, 'src/notes.md'), 'Aggiornamento esterno.\n');
    git('add', 'src/notes.md');
    git('commit', '-m', 'Aggiornamento indipendente');
    const updated = git('rev-parse', 'dev');
    git('switch', 'main');
    await expect(run('/workflow resume')).rejects.toThrow('prima dell’integrazione');
    const next = await approve();
    expect(next).not.toBe(command);
    expect(git('rev-parse', 'dev')).toBe(updated);
    expect(git('show', 'dev:src/filter.ts')).toBe(original.trim());
    expect(git('rev-parse', 'main')).toBe(base);
  });

  it('refuses an approval invalidated by a change in an approved source', async () => {
    const command = await approve('feature');
    await fs.writeFile(path.join(policy.root, 'DESIGN.md'), 'Nuova decisione.');
    await expect(run(command)).rejects.toThrow('fonti sono cambiate');
    expect(await fs.readFile(source(), 'utf8')).toBe(original);
  });

  it('plans a dedicated mobile flow, consults shadcn and reruns both reviews after a design correction', async () => {
    const design = { sharedLogic: 'Riusa filter.', ui: null, mobile: 'Schede con filtro nella barra delle azioni e dettagli a richiesta.', questions: [] };
    const fixedWithDetails = fixed + 'export const openDetails = (id: string) => ({ id });\n';
    let corrected = false;
    const generate = vi.fn<Generate>(async (stage, instructions, input) => {
      if (stage === 'plan') {
        return JSON.stringify({ ...plan, surface: 'mobile', skillNames: ['typescript-core'], components: ['drawer'] });
      }
      if (stage === 'design') {
        expect(instructions).toContain('Designer UI/UX');
        expect(JSON.parse(input).componentReferences).toEqual(['@shadcn/drawer']);
        return JSON.stringify(design);
      }
      if (stage === 'design-review' && !corrected) {
        return JSON.stringify({ verdict: 'fail', findings: ['Manca l’accesso ai dettagli.'] });
      }
      if (stage === 'debug') {
        expect(instructions).toContain('Correttore');
        expect(JSON.parse(input)).toMatchObject({ previousChanges: [{ path: 'src/filter.ts', content: fixed }], feedback: ['Manca l’accesso ai dettagli.'] });
        corrected = true;
        return JSON.stringify({ changes: [{ path: 'src/filter.ts', content: fixedWithDetails }] });
      }
      if (stage === 'implement' || stage === 'review') {
        expect(JSON.parse(input)).toMatchObject({ plan: { design }, skills: [{ name: 'typescript-core', text: 'Verifica i chiamanti.' }] });
      }
      return response(stage === 'design-review' ? 'review' : stage);
    });
    const designCatalog = vi.fn(async () => ['@shadcn/drawer']);
    const skills = async () => ({ available: [{ name: 'typescript-core', description: 'Guida TypeScript' }], read: async () => 'Verifica i chiamanti.' });
    const execute = (prompt: string) => runRepositoryWorkflow({ policy, statePath, prompt, generate, designCatalog, skills });
    const draft = await execute('/workflow change Progetta una UI dedicata al mobile.');
    expect(draft.message).toContain(design.mobile);
    expect(designCatalog).toHaveBeenCalledExactlyOnceWith(['drawer']);
    expect(generate.mock.calls.map(([stage]) => stage)).toEqual(['plan', 'design']);
    const approval = draft.message.match(/\/workflow approve [0-9a-f]{64}/)![0];
    const delivery = await execute(approval);
    expect(delivery.phase).toBe('done');
    expect(delivery.message).toContain('Revisione UI/UX del codice PASS');
    expect(generate.mock.calls.map(([stage]) => stage)).toEqual(['plan', 'design', 'implement', 'review', 'design-review', 'debug', 'review', 'design-review']);
    await expect(readRemoteRepositoryPatch(policy, statePath, approval.slice('/workflow approve '.length))).resolves.toContain('openDetails');
    expect(await fs.readFile(source(), 'utf8')).toBe(original);
  });

  it('requires a new plan if a selected skill changes before approval', async () => {
    let text = 'Usa il filtro esistente.';
    const skills = async () => ({ available: [{ name: 'typescript-core', description: 'Guida TypeScript' }], read: async () => text });
    const generate = vi.fn<Generate>(async (stage) => (stage === 'plan' ? JSON.stringify({ ...plan, skillNames: ['typescript-core'] }) : response(stage)));
    const draft = await runRepositoryWorkflow({ policy, statePath, prompt: '/workflow change Aggiorna il filtro.', generate, skills });
    const approval = draft.message.match(/\/workflow approve [0-9a-f]{64}/)![0];
    const unavailableCatalog = vi.fn(async () => {
      throw new Error('Catalogo indisponibile.');
    });
    await expect(runRepositoryWorkflow({ policy, statePath, prompt: '/workflow status', generate, skills: unavailableCatalog })).resolves.toMatchObject({
      phase: 'plan',
    });
    expect(unavailableCatalog).not.toHaveBeenCalled();
    text = 'Guida cambiata.';
    await expect(runRepositoryWorkflow({ policy, statePath, prompt: approval, generate, skills })).rejects.toThrow('Skill cambiata');
    expect(generate.mock.calls.map(([stage]) => stage)).toEqual(['plan']);
  });

  it('rejects changes outside the approved file list and empty review verdicts', async () => {
    const command = await approve('change');
    const bad = vi.fn(async (stage: WorkflowStage) =>
      JSON.stringify(
        stage === 'review'
          ? {}
          : {
              changes: [{ path: 'src/notes.md', content: 'Fuori dal piano.' }],
            },
      ),
    );
    expect((await run(command, bad)).phase).toBe('waiting');
    expect(bad.mock.calls.map(([stage]) => stage)).toEqual(['implement', 'debug', 'debug']);
    const noReview = vi.fn(async (stage: WorkflowStage) => (stage === 'review' ? '{}' : response(stage)));
    expect((await run('/workflow resume', noReview)).phase).toBe('waiting');
    await expect(assertRepositoryWorkflowDone(policy, statePath)).rejects.toThrow('chiusura');
  });

  it('rejects a bug when its configured reproduction is already green', async () => {
    await fs.writeFile(source(), fixed);
    const command = await approve();
    const generate = vi.fn(async (stage: WorkflowStage) => response(stage));
    await expect(run(command, generate)).rejects.toThrow('deve fallire');
    expect(generate).not.toHaveBeenCalled();
  });

  it('marks the remote receipt stale after a file appears in the delivered folder', async () => {
    const command = await approve('feature');
    expect((await run(command)).phase).toBe('done');
    const jobs = path.join(path.dirname(statePath), 'task-jobs');
    const candidate = (await fs.readdir(jobs, { withFileTypes: true })).find((entry) => entry.isDirectory())!;
    await fs.writeFile(path.join(jobs, candidate.name, 'extra.txt'), 'Contenuto estraneo.');
    await expect(readRepositoryWorkflow(statePath, policy)).resolves.toMatchObject({ phase: 'stale', checks: [] });
    await expect(readRemoteRepositoryPatch(policy, statePath, command.slice('/workflow approve '.length))).rejects.toThrow('estraneo al piano');
  });
  it.skipIf(!process.env.AIDER_DESK_DOCKER_TEST_IMAGE)(
    'uses the real isolated Docker runner for reproduction and delivery',
    async () => {
      const image = process.env.AIDER_DESK_DOCKER_TEST_IMAGE!;
      assertDockerImage(image);
      policy.context.push('verify.mjs');
      policy.checks.push({ id: 'docker-contract', type: 'docker', image, args: ['node', '/workspace/verify.mjs'] });
      await fs.writeFile(
        path.join(policy.root, 'verify.mjs'),
        [
          'import assert from "node:assert/strict";',
          'import os from "node:os";',
          'import fs from "node:fs/promises";',
          'import { filter } from "./src/filter.ts";',
          'assert.deepEqual(Object.keys(os.networkInterfaces()).filter(name => name !== "lo"), []);',
          'await assert.rejects(fs.writeFile("/workspace/probe", "test"), { code: "EROFS" });',
          'assert.deepEqual(filter(Object.freeze([-1, 1, 0, 2])), [1, 2]);',
        ].join('\n'),
      );
      const generate = vi.fn<Generate>(async (stage) => (stage === 'plan' ? JSON.stringify({ ...plan, reproduction: 'docker-contract' }) : response(stage)));
      const draft = await run('/workflow bug Correggi il filtro.', generate);
      const approval = draft.message.match(/\/workflow approve [0-9a-f]{64}/)![0];
      expect((await run(approval, generate)).phase).toBe('done');
      expect(await readRepositoryWorkflow(statePath, policy)).toMatchObject({
        checks: expect.arrayContaining([{ id: 'docker-contract', passed: true, detail: 'PASS' }]),
      });
    },
    60_000,
  );
  it('loads an explicit configuration outside the repository and guards reserved paths', async () => {
    const config = path.join(tmp, 'policy.json');
    await fs.writeFile(config, JSON.stringify({ version: 1, projects: [policy] }));
    vi.stubEnv('AIDER_DESK_WORKFLOW_CONFIG', config);
    expect(listWorkflowProjects()).toHaveLength(1);
    expect(workflowProjectFor(policy.root)?.id).toBe('demo');
    expect(workflowProjectFor(tmp)).toBeUndefined();
    for (const file of ['../settings.json', '.env', 'C:foo', 'dir/.git/config', 'CON.txt', 'src/test.ts ']) {
      expect(() => validateWorkflowPath(file)).toThrow('perimetro');
    }
  });
});
