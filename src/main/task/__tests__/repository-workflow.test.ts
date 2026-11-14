import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertRepositoryWorkflowDone,
  readRemoteRepositoryPatch,
  readRepositoryWorkflow,
  repositoryContinuationRevision,
  runRepositoryWorkflow,
} from '../repository-workflow';
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
    await expect(readRepositoryWorkflow(previousState, policy)).resolves.toMatchObject({ phase: 'stale', commit, checks: [] });
  }, 30_000);

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

  it('continues diagnosis after reopening and does not check an identical failed proposal again', async () => {
    const command = await approve();
    const bad = 'export const filter = (items: number[]) => items.filter(item => item >= 0);\n';
    const failure = JSON.stringify({ changes: [{ path: 'src/filter.ts', content: bad }] });
    const first = vi.fn<Generate>().mockResolvedValue(failure);
    const suspended = await run(command, first);
    expect(suspended.phase).toBe('waiting');
    expect(await fs.readFile(source(), 'utf8')).toBe(original);
    await expect(assertRepositoryWorkflowDone(policy, statePath)).rejects.toThrow();
    expect(JSON.parse(first.mock.calls[2][2]).feedback).toContain('candidato già respinto');

    const resumed = vi.fn<Generate>(async (stage, _instructions, input) => {
      if (stage === 'debug') {
        const payload = JSON.parse(input);
        expect(payload.previousChanges).toEqual([{ path: 'src/filter.ts', content: bad }]);
        expect(payload.previousFailures).toEqual(
          expect.arrayContaining([expect.arrayContaining([expect.objectContaining({ id: 'regression', passed: false })])]),
        );
      }
      return response(stage);
    });
    expect((await run('/workflow resume', resumed)).phase).toBe('done');
    expect(resumed.mock.calls.map(([stage]) => stage)).toEqual(['debug', 'review']);
  });

  it('routes empty implementation and review results through the correction role', async () => {
    const command = await approve();
    let reviews = 0;
    const generate = vi.fn<Generate>(async (stage) => {
      if (stage === 'implement' || (stage === 'review' && reviews++ === 0)) {
        return undefined;
      }
      return response(stage);
    });
    expect((await run(command, generate)).phase).toBe('done');
    expect(generate.mock.calls.map(([stage]) => stage)).toEqual(['implement', 'debug', 'review', 'debug', 'review']);
  });

  it('retains an approved objective for service retry without fabricating a test result', async () => {
    const command = await approve();
    const { RetryError } = await import('ai');
    const transient = Object.assign(new Error('Request timed out'), { statusCode: 408, isRetryable: true });
    const generate = vi
      .fn<Generate>()
      .mockRejectedValue(new RetryError({ message: 'Retries exhausted', reason: 'maxRetriesExceeded', errors: [transient, transient] }));
    const result = await run(command, generate);
    expect(result).toMatchObject({ phase: 'waiting', retryable: true });
    await expect(assertRepositoryWorkflowDone(policy, statePath)).rejects.toThrow();
    expect((await run('/workflow resume')).phase).toBe('done');
  });

  it('uses technical research after three failed candidates and only delivers after new checks and review', async () => {
    const command = await approve();
    const stages: WorkflowStage[] = [];
    const search = vi.fn(async () => '## Search Results\n### [TypeScript Handbook](https://www.typescriptlang.org/docs/)\nUse a strict positive comparison.');
    let proposals = 0;
    const generate = vi.fn<Generate>(async (stage, _instructions, input) => {
      stages.push(stage);
      if (stage === 'strategy') {
        expect(JSON.parse(input).research).toContain('https://www.typescriptlang.org/docs/');
        return JSON.stringify({ hypothesis: 'Il confronto include lo zero.', approach: 'Verifica il confine con un confronto stretto.' });
      }
      if (stage === 'implement' || stage === 'debug') {
        if (++proposals <= 3) {
          return JSON.stringify({ changes: [{ path: 'src/filter.ts', content: original.replace('< 0', '> ' + proposals) }] });
        }
        expect(JSON.parse(input).strategy).toMatchObject({ approach: 'Verifica il confine con un confronto stretto.' });
      }
      return response(stage);
    });
    expect((await runRepositoryWorkflow({ policy, statePath, prompt: command, generate, search })).phase).toBe('done');
    expect(search).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^TypeScript \d/));
    expect(stages).toEqual(['implement', 'debug', 'debug', 'strategy', 'debug', 'review']);
    await expect(assertRepositoryWorkflowDone(policy, statePath)).resolves.toBeUndefined();
  });

  it('keeps research eligible on resume when the search returned no sources', async () => {
    const command = await approve();
    const failed = JSON.stringify({ changes: [{ path: 'src/filter.ts', content: original.replace('< 0', '>= 0') }] });
    const emptySearch = vi.fn(async () => undefined);
    const generate = vi.fn<Generate>(async (stage) =>
      stage === 'strategy' ? JSON.stringify({ hypothesis: 'Confine errato.', approach: 'Controlla il valore zero.' }) : failed,
    );
    expect((await runRepositoryWorkflow({ policy, statePath, prompt: command, generate, search: emptySearch })).phase).toBe('waiting');
    expect(emptySearch).toHaveBeenCalledOnce();
    await expect(assertRepositoryWorkflowDone(policy, statePath)).rejects.toThrow();

    const search = vi.fn(async () => '## Search Results: TypeScript handbook');
    const resumed = vi.fn<Generate>(async (stage, _instructions, input) => {
      if (stage === 'strategy') {
        expect(JSON.parse(input).research).toContain('handbook');
        return JSON.stringify({ hypothesis: 'Il valore zero va escluso.', approach: 'Usa confronto stretto e ripeti la regressione.' });
      }
      return response(stage);
    });
    expect((await runRepositoryWorkflow({ policy, statePath, prompt: '/workflow resume', generate: resumed, search })).phase).toBe('done');
    expect(resumed.mock.calls.map(([stage]) => stage)).toEqual(['strategy', 'debug', 'review']);
    expect(search).toHaveBeenCalledOnce();
  });

  it('attempts the network once when search fails and local corrections still fail', async () => {
    const command = await approve();
    policy.researchAfterFailures = 1;
    const draft = await run('/workflow bug Correggi il filtro.');
    const currentApproval = draft.message.match(/\/workflow approve [0-9a-f]{64}/)![0];
    expect(currentApproval).not.toBe(command);
    const search = vi.fn(async () => {
      throw new Error('Ricerca temporaneamente indisponibile.');
    });
    const failed = JSON.stringify({ changes: [{ path: 'src/filter.ts', content: original.replace('< 0', '>= 0') }] });
    const generate = vi.fn<Generate>(async (stage) =>
      stage === 'strategy' ? JSON.stringify({ hypothesis: 'Confine errato.', approach: 'Controlla il caso zero.' }) : failed,
    );
    expect((await runRepositoryWorkflow({ policy, statePath, prompt: currentApproval, generate, search })).phase).toBe('waiting');
    expect(search).toHaveBeenCalledOnce();
    await expect(assertRepositoryWorkflowDone(policy, statePath)).rejects.toThrow();
  });

  it('resumes strategy from persisted references without repeating an interrupted search', async () => {
    const command = await approve();
    const controller = new AbortController();
    const search = vi.fn(async () => '## Search Results: TypeScript handbook');
    const failed = JSON.stringify({ changes: [{ path: 'src/filter.ts', content: original.replace('< 0', '>= 0') }] });
    const interrupted = vi.fn<Generate>(async (stage) => {
      if (stage === 'strategy') {
        controller.abort();
        throw controller.signal.reason;
      }
      return failed;
    });
    await expect(runRepositoryWorkflow({ policy, statePath, prompt: command, generate: interrupted, search, signal: controller.signal })).rejects.toMatchObject(
      {
        name: 'AbortError',
      },
    );
    const resumed = vi.fn<Generate>(async (stage, _instructions, input) => {
      if (stage === 'strategy') {
        expect(JSON.parse(input).research).toContain('handbook');
        return JSON.stringify({ hypothesis: 'Soglia errata.', approach: 'Verifica il caso zero.' });
      }
      return response(stage);
    });
    expect((await runRepositoryWorkflow({ policy, statePath, prompt: '/workflow resume', generate: resumed, search })).phase).toBe('done');
    expect(search).toHaveBeenCalledOnce();
    expect(resumed.mock.calls.map(([stage]) => stage)).toEqual(['strategy', 'debug', 'review']);
  });

  it('continues from a second evidence-backed strategy in the same authorized run', async () => {
    const command = await approve();
    const search = vi.fn(async () => '## Search Results: TypeScript handbook');
    let attempts = 0;
    let strategies = 0;
    const generate = vi.fn<Generate>(async (stage, _instructions, input) => {
      if (stage === 'strategy') {
        strategies++;
        return JSON.stringify({ hypothesis: 'Ipotesi ' + strategies, approach: 'Controllo ' + strategies });
      }
      if ((stage === 'implement' || stage === 'debug') && ++attempts <= 6) {
        return JSON.stringify({ changes: [{ path: 'src/filter.ts', content: original.replace('< 0', '>= ' + attempts) }] });
      }
      if (stage === 'debug') {
        expect(JSON.parse(input).previousStrategies).toHaveLength(2);
      }
      return response(stage);
    });
    expect((await runRepositoryWorkflow({ policy, statePath, prompt: command, generate, search })).phase).toBe('done');
    expect(strategies).toBe(2);
    expect(search).toHaveBeenCalledOnce();
    await expect(assertRepositoryWorkflowDone(policy, statePath)).resolves.toBeUndefined();
  });

  it('continues an approved objective beyond the first correction window without external search', async () => {
    const command = await approve();
    let proposals = 0;
    const generate = vi.fn<Generate>(async (stage, _instructions, input) => {
      if (stage === 'strategy') {
        expect(JSON.parse(input).failures).toHaveLength(3);
        return JSON.stringify({ hypothesis: 'Valori positivi scartati.', approach: 'Confronta con zero usando un limite esclusivo.' });
      }
      if ((stage === 'implement' || stage === 'debug') && ++proposals <= 3) {
        return JSON.stringify({ changes: [{ path: 'src/filter.ts', content: original.replace('< 0', '>= ' + proposals) }] });
      }
      return response(stage);
    });
    expect((await runRepositoryWorkflow({ policy, statePath, prompt: command, generate, continueRecovery: true })).phase).toBe('done');
    expect(generate.mock.calls.map(([stage]) => stage)).toEqual(['implement', 'debug', 'debug', 'strategy', 'debug', 'review']);
  });

  it('continues from a persisted correction batch while it yields new evidence', async () => {
    const command = await approve();
    let proposals = 0;
    const generate = vi.fn<Generate>(async (stage, _instructions, input) => {
      if (stage === 'strategy') {
        expect(JSON.parse(input).failures.length).toBeGreaterThanOrEqual(3);
        return JSON.stringify({ hypothesis: 'Prima ipotesi.', approach: 'Controlla il confronto.' });
      }
      if ((stage === 'implement' || stage === 'debug') && ++proposals <= 10) {
        const content = proposals < 5 ? original.replace('< 0', '>= ' + proposals) : 'export const filter = (\n// tentativo ' + proposals;
        return JSON.stringify({ changes: [{ path: 'src/filter.ts', content }] });
      }
      return response(stage);
    });
    const result = await runRepositoryWorkflow({ policy, statePath, prompt: command, generate, continueRecovery: true });
    expect(result.phase).toBe('done');
    expect(proposals).toBe(11);
    await expect(assertRepositoryWorkflowDone(policy, statePath)).resolves.toBeUndefined();
  });

  it('keeps an objective open without repeating batches with identical verification outcomes', async () => {
    const command = await approve();
    let proposals = 0;
    const generate = vi.fn<Generate>(async (stage) =>
      stage === 'strategy'
        ? JSON.stringify({ hypothesis: 'Stessa ipotesi.', approach: 'Stesso controllo.' })
        : JSON.stringify({ changes: [{ path: 'src/filter.ts', content: original.replace('< 0', '>= ' + ++proposals) }] }),
    );
    const onProgress = vi.fn();
    expect((await runRepositoryWorkflow({ policy, statePath, prompt: command, generate, continueRecovery: true, onProgress })).phase).toBe('waiting');
    expect(onProgress).toHaveBeenCalledExactlyOnceWith('Rivaluto la correzione dalle nuove evidenze salvate.');
    await expect(assertRepositoryWorkflowDone(policy, statePath)).rejects.toThrow();
  });

  it('refuses automatic queue continuation after an approved source changes', async () => {
    useTwoBranches();
    policy.references = [{ path: 'DESIGN.md', role: 'blueprint' }];
    policy.workPlan = 'plan.json';
    git('switch', 'dev');
    await fs.writeFile(path.join(policy.root, 'plan.json'), JSON.stringify({ tasks: [] }));
    git('add', 'plan.json');
    git('commit', '-m', 'Registra il piano');
    git('switch', 'main');
    const expectedContinuationRevision = await repositoryContinuationRevision(policy);
    git('switch', 'dev');
    await fs.writeFile(path.join(policy.root, 'DESIGN.md'), 'Nuovo requisito.');
    git('commit', '-am', 'Aggiorna le fonti');
    git('switch', 'main');
    const generate = vi.fn<Generate>();
    await expect(
      runRepositoryWorkflow({ policy, statePath, prompt: 'Riprendi il lavoro', generate, continueRecovery: true, expectedContinuationRevision }),
    ).rejects.toThrow('Il piano autorizzato o la configurazione sono cambiati');
    expect(generate).not.toHaveBeenCalled();
  }, 30_000);

  it('enforces a project check even when the queued task does not select it', async () => {
    const base = useTwoBranches();
    policy.references = [{ path: 'DESIGN.md', role: 'blueprint' }];
    policy.workPlan = 'plan.json';
    policy.checks.push({ id: 'rule', type: 'excludes', file: 'src/filter.ts', text: 'forbidden' });
    Object.assign(policy, { requiredChecks: ['rule'] });
    git('switch', 'dev');
    await fs.writeFile(
      path.join(policy.root, 'plan.json'),
      JSON.stringify({ tasks: [{ id: 'T-1', kind: 'bug', request: 'Correggi il filtro.', files: ['src/filter.ts'], checks: ['regression'] }] }),
    );
    git('add', 'plan.json');
    git('commit', '-m', 'Registra il piano');
    const before = git('rev-parse', 'dev');
    git('switch', 'main');
    const generate = vi.fn<Generate>(async (stage, _instructions, input) => {
      if (stage === 'plan') {
        return JSON.stringify(plan);
      }
      if (stage === 'implement') {
        return JSON.stringify({ changes: [{ path: 'src/filter.ts', content: fixed + '// forbidden\n' }] });
      }
      if (stage === 'debug') {
        expect(JSON.parse(input).feedback).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'rule', passed: false })]));
      }
      return response(stage);
    });
    expect((await run('Avvia il lavoro', generate)).message).toContain('Task integrati sul ramo di sviluppo: T-1');
    expect(generate.mock.calls.map(([stage]) => stage)).toEqual(['plan', 'implement', 'debug', 'review']);
    expect(git('rev-parse', 'dev^')).toBe(before);
    expect(git('show', 'dev:src/filter.ts')).not.toContain('forbidden');
    expect(git('rev-parse', 'main')).toBe(base);
  }, 30_000);

  it('keeps a resumed objective bound to its approved revision', async () => {
    const command = await approve();
    const generate = vi.fn<Generate>();
    await expect(
      runRepositoryWorkflow({
        policy,
        statePath,
        prompt: '/workflow resume',
        generate,
        continueRecovery: true,
        expectedApprovedRevision: 'f'.repeat(64),
      }),
    ).rejects.toThrow('La revisione del task autorizzato è cambiata');
    expect(generate).not.toHaveBeenCalled();
    expect((await run(command)).phase).toBe('done');
  });

  it('revisits a blocked task when independent work restores its prerequisite', async () => {
    useTwoBranches();
    policy.references = [{ path: 'DESIGN.md', role: 'blueprint' }];
    policy.workPlan = 'plan.json';
    const upstream = { id: 'T-1', kind: 'bug', request: 'Correggi il filtro.', files: ['src/filter.ts'], checks: ['regression'] };
    const dependent = { id: 'T-2', kind: 'change', request: 'Documenta il filtro.', files: ['src/notes.md'], checks: ['notes'], dependsOn: ['T-1'] };
    const repair = { ...upstream, id: 'T-3', request: 'Ripristina il filtro dopo la regressione.' };
    policy.evidenceExcludes = { 'T-1': ['src/notes.md'], 'T-3': ['src/notes.md'] };
    policy.checks.push({ id: 'notes', type: 'contains', file: 'src/notes.md', text: 'positivi' });
    const commitPlan = async (tasks: unknown[], regressed = false) => {
      git('switch', 'dev');
      await fs.writeFile(path.join(policy.root, 'plan.json'), JSON.stringify({ tasks }));
      if (regressed) {
        await fs.writeFile(source(), original);
      }
      git('add', '.');
      git('commit', '-m', 'Aggiorna il piano');
      git('switch', 'main');
    };
    await commitPlan([upstream]);
    expect((await run('Avvia il lavoro')).message).toContain('Task integrati sul ramo di sviluppo: T-1');
    await commitPlan([upstream, dependent, repair], true);
    const planned: string[] = [];
    const generate = vi.fn<Generate>(async (stage, _instructions, input) => {
      const payload = JSON.parse(input);
      if (stage === 'plan') {
        planned.push(payload.projectTask.id);
        if (payload.projectTask.id === dependent.id) {
          return JSON.stringify({ ...plan, files: dependent.files, criteria: [{ scenario: 'Documenta il filtro.', check: 'notes' }], reproduction: null });
        }
      }
      if (stage === 'implement' && payload.projectTask.id === dependent.id) {
        return JSON.stringify({ changes: [{ path: dependent.files[0], content: 'Mantiene solo i valori positivi.\n' }] });
      }
      return response(stage);
    });
    const result = await runRepositoryWorkflow({ policy, statePath, prompt: 'Riprendi il lavoro', generate, continueRecovery: true });
    expect(planned).toEqual(['T-3', 'T-2']);
    expect(result.message).toContain('T-1, T-3, T-2');
    expect(result.message).not.toContain('T-2 · dipendenza in attesa');
    expect(git('show', 'dev:src/notes.md')).toContain('positivi');
    expect(result.objectiveComplete).toBe(true);
  }, 30_000);

  it.skipIf(!process.env.AIDER_DESK_WORKFLOW_TEST_SEARCH_URL)(
    'uses live SearXNG results as research input and verifies the resulting candidate',
    async () => {
      const endpoint = new URL(process.env.AIDER_DESK_WORKFLOW_TEST_SEARCH_URL!);
      expect(endpoint.hostname).toBe('127.0.0.1');
      const command = await approve();
      let attempts = 0;
      const search = vi.fn(async (query: string) => {
        const url = new URL('/search', endpoint);
        url.search = new URLSearchParams({ q: query, format: 'json' }).toString();
        const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        expect(response.ok).toBe(true);
        const body = (await response.json()) as { results: { title: string; url: string }[] };
        expect(body.results.some(({ url }) => new URL(url).hostname === 'www.typescriptlang.org')).toBe(true);
        return JSON.stringify(body.results.slice(0, 5).map(({ title, url }) => ({ title, url })));
      });
      const generate = vi.fn<Generate>(async (stage, _instructions, input) => {
        if (stage === 'strategy') {
          expect(JSON.parse(input).research).toContain('typescriptlang.org');
          return JSON.stringify({ hypothesis: 'Controllo del valore soglia.', approach: 'Ripeti il controllo sul confronto stretto.' });
        }
        if ((stage === 'implement' || stage === 'debug') && ++attempts <= 3) {
          return JSON.stringify({ changes: [{ path: 'src/filter.ts', content: original.replace('< 0', '>= ' + attempts) }] });
        }
        return response(stage);
      });
      expect((await runRepositoryWorkflow({ policy, statePath, prompt: command, generate, search })).phase).toBe('done');
      expect(search).toHaveBeenCalledOnce();
      expect(generate.mock.calls.map(([stage]) => stage)).toContain('review');
      await expect(assertRepositoryWorkflowDone(policy, statePath)).resolves.toBeUndefined();
    },
    40_000,
  );

  it('finishes an approved plan without regenerating implementation when its verifier becomes available', async () => {
    policy.checks.push({ id: 'browser', type: 'browser' });
    vi.stubEnv('AIDER_DESK_WORKFLOW_NODE', process.execPath);
    const checker = path.join(tmp, 'verify.mjs');
    vi.stubEnv('AIDER_DESK_WORKFLOW_REPOSITORY_BROWSER_CHECK', checker);
    await fs.writeFile(
      checker,
      "import fs from 'node:fs'; import path from 'node:path'; const text = fs.readFileSync(path.join(process.argv[2], 'src/filter.ts'), 'utf8'); if (text.includes('> 0') && !fs.existsSync(new URL('./ready', import.meta.url))) process.exit(2); console.log('BROWSER_PASS fixture');",
    );
    const command = await approve();
    const calls: WorkflowStage[] = [];
    const generate = vi.fn<Generate>(async (stage) => {
      calls.push(stage);
      return response(stage);
    });
    await expect(run(command, generate)).rejects.toThrow();
    expect(calls).toEqual(['implement']);
    await fs.writeFile(path.join(tmp, 'ready'), '');
    vi.resetModules();
    const reopened = await import('../repository-workflow');
    expect((await reopened.runRepositoryWorkflow({ policy, statePath, prompt: '/workflow resume', generate })).phase).toBe('done');
    expect(calls).toEqual(['implement', 'review']);
  });

  it('gives the correction role the error from a failed review call', async () => {
    const command = await approve();
    let reviews = 0;
    const generate = vi.fn<Generate>(async (stage, _instructions, input) => {
      if (stage === 'review' && reviews++ === 0) {
        throw new Error('Revisore temporaneamente indisponibile.');
      }
      if (stage === 'debug') {
        expect(JSON.parse(input).feedback).toContain('Revisore temporaneamente indisponibile.');
        expect(JSON.parse(input).previousChanges).toEqual([{ path: 'src/filter.ts', content: fixed }]);
      }
      return response(stage);
    });
    expect((await run(command, generate)).phase).toBe('done');
    expect(generate.mock.calls.map(([stage]) => stage)).toEqual(['implement', 'review', 'debug', 'review']);
  });

  it('investigates a newly added indirect input before reusing an upstream receipt', async () => {
    const base = useTwoBranches();
    policy.references.push({ path: 'DESIGN.md', role: 'blueprint' });
    policy.workPlan = 'plan.json';
    const first = {
      id: 'T-1',
      kind: 'bug',
      request: 'Correggi il filtro.',
      files: ['src/filter.ts'],
      checks: ['regression'],
      evidenceFiles: ['src/filter.ts'],
    };
    const dependent = { id: 'T-2', kind: 'change', request: 'Documenta il filtro.', files: ['src/notes.md'], checks: ['notes'], dependsOn: ['T-1'] };
    policy.checks.push({ id: 'notes', type: 'contains', file: 'src/notes.md', text: 'positivi' });
    const commitPlan = async (tasks: unknown[], includeShared = false) => {
      git('switch', 'dev');
      await fs.writeFile(path.join(policy.root, 'plan.json'), JSON.stringify({ tasks }));
      if (includeShared) {
        await fs.writeFile(path.join(policy.root, 'src/shared.ts'), 'export const threshold = 1;\n');
      }
      git('add', '.');
      git('commit', '-m', 'Aggiorna il piano');
      git('switch', 'main');
    };
    await commitPlan([first]);
    expect((await run('Avvia il lavoro')).message).toContain('Task integrati sul ramo di sviluppo: T-1');
    await commitPlan([first, dependent], true);
    const head = git('rev-parse', 'dev');
    const outage = vi.fn<Generate>().mockRejectedValue(Object.assign(new Error('Service unavailable'), { statusCode: 503, isRetryable: true }));
    const waiting = await run('Riprendi il lavoro', outage);
    expect(waiting).toMatchObject({ retryable: true });
    expect(git('rev-parse', 'dev')).toBe(head);
    const investigate = vi.fn<Generate>(async (stage, _instructions, input) => {
      expect(stage).toBe('investigate');
      expect(JSON.parse(input)).toMatchObject({ task: 'T-1', unknownFiles: ['src/shared.ts'], commit: head });
      return JSON.stringify({ findings: ['Nuova configurazione da verificare con il filtro.'], checks: ['regression'] });
    });
    const result = await run('Riprendi il lavoro', investigate);
    expect(investigate).toHaveBeenCalledOnce();
    expect(result.message).toContain('T-2 · dipendenza in attesa');
    expect(result.message).toContain('Nuova configurazione da verificare con il filtro.');
    expect(git('rev-parse', 'dev')).toBe(head);
    expect(git('rev-parse', 'main')).toBe(base);
    investigate.mockClear();
    expect((await run('Riprendi il lavoro', investigate)).message).toContain('Nuova configurazione da verificare con il filtro.');
    expect(investigate).not.toHaveBeenCalled();
  }, 30_000);

  it('gives the next planner the attestation that unblocked its task', async () => {
    const first = {
      id: 'T-1',
      kind: 'bug',
      request: 'Correggi il filtro.',
      files: ['src/filter.ts'],
      checks: ['regression'],
      validations: [{ id: 'V-1', title: 'Filtro', environment: 'Node', steps: ['Verifica il filtro.'], expected: 'Solo valori positivi.' }],
    };
    const second = { id: 'T-2', kind: 'change', request: 'Documenta il filtro.', files: ['src/notes.md'], checks: ['notes'], afterValidation: ['V-1'] };
    policy.references.push({ path: 'DESIGN.md', role: 'blueprint' });
    policy.workPlan = 'plan.json';
    policy.checks.push({ id: 'notes', type: 'contains', file: 'src/notes.md', text: 'positivi' });
    policy.evidenceExcludes = { 'T-1': ['src/notes.md'] };
    await fs.writeFile(path.join(policy.root, 'src/notes.md'), 'Filtro.');
    await fs.writeFile(path.join(policy.root, 'plan.json'), JSON.stringify({ tasks: [first, second] }));
    const base = useTwoBranches();
    expect((await run('Avvia il lavoro')).message).toContain('T-2 · dipendenza in attesa');
    const attested = git('rev-parse', 'dev');
    await run('Riprendi le validazioni');
    expect((await run('Registra esito V-1 superata')).message).toContain(attested);

    const generate = vi.fn<Generate>(async (stage, _instructions, input) => {
      if (stage === 'plan') {
        expect(JSON.parse(input).projectTask).toMatchObject({ id: 'T-2', attestations: [{ id: 'V-1', commit: attested, passed: true }] });
        return JSON.stringify({ ...plan, files: second.files, criteria: [{ scenario: 'Documentazione.', check: 'notes' }], reproduction: null });
      }
      if (stage === 'implement') {
        return JSON.stringify({ changes: [{ path: 'src/notes.md', content: 'Mostra solo valori positivi.' }] });
      }
      return response(stage);
    });
    const result = await run('Riprendi il lavoro', generate);
    expect(result.message).toContain('T-1, T-2');
    expect(git('rev-parse', 'dev^')).toBe(attested);
    expect(git('rev-parse', 'main')).toBe(base);
  }, 30_000);

  it('preserves failed verification evidence if execution is interrupted during correction', async () => {
    const command = await approve();
    const controller = new AbortController();
    const generate = vi.fn<Generate>(async (stage) => {
      if (stage === 'debug') {
        controller.abort();
        throw controller.signal.reason;
      }
      return JSON.stringify({ changes: [{ path: 'src/filter.ts', content: 'export const filter = (\n' }] });
    });
    await expect(runRepositoryWorkflow({ policy, statePath, prompt: command, generate, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    const resumed = vi.fn<Generate>(async (stage, _instructions, input) => {
      if (stage === 'debug') {
        expect(JSON.parse(input).feedback).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'syntax', passed: false })]));
      }
      return response(stage);
    });
    expect((await run('/workflow resume', resumed)).phase).toBe('done');
    expect(resumed.mock.calls.map(([stage]) => stage)).toEqual(['debug', 'review']);
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
