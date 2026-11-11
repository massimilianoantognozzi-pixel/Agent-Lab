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
  const approve = async (kind: 'bug' | 'change' | 'feature' = 'bug') => {
    const result = await run('/workflow ' + kind + ' Correggi il filtro.');
    const match = result.message.match(/\/workflow approve [0-9a-f]{64}/);
    expect(match).not.toBeNull();
    return match![0];
  };

  it('delivers a staged patch only after the old bug fails and the candidate passes', async () => {
    const command = await approve();
    await expect(run('/workflow resume')).rejects.toThrow('versione esatta');
    const generate = vi.fn<Generate>(async (stage) => response(stage));
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

  it('refuses an approval invalidated by a change in an approved source', async () => {
    const command = await approve('feature');
    await fs.writeFile(path.join(policy.root, 'DESIGN.md'), 'Nuova decisione.');
    await expect(run(command)).rejects.toThrow('fonti sono cambiate');
    expect(await fs.readFile(source(), 'utf8')).toBe(original);
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
