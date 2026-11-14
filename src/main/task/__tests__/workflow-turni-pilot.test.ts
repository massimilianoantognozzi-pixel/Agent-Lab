import { createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect, it, vi } from 'vitest';

import { readRepositoryWorkflow, runRepositoryWorkflow } from '../repository-workflow';
import { ensureWorkflowDocker } from '../workflow-docker';

import type { WorkflowProject } from '../workflow-policy';
import type { WorkflowStage } from '../workflow-skills';

vi.unmock('fs');
vi.unmock('path');
vi.mock('../workflow-docker', { spy: true });
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  const { promisify } = await import('node:util');
  return { ...original, execFile: Object.assign(vi.fn(original.execFile), { [promisify.custom]: vi.fn(promisify(original.execFile)) }) };
});

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const exec = vi.mocked<
  (
    file: string,
    args: readonly string[] | null | undefined,
    options: import('node:child_process').ExecFileOptions | null | undefined,
  ) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>
>(promisify(execFile));

it('runs the Turni plan on two Git branches and resumes a manual validation in another chat', async () => {
  const tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agentlab-turni-')));
  const root = path.join(tmp, 'repository');
  try {
    await fs.mkdir(path.join(root, 'docs'), { recursive: true });
    await fs.mkdir(path.join(root, 'src'));
    const filter = 'export const activeShifts = (items: { active: boolean }[]) => items.filter(item => item.active === true);\n';
    const mobile = "import { activeShifts } from './turni';\nexport const mobileRows = (shifts: { active: boolean }[]) => activeShifts(shifts);\n";
    await fs.writeFile(path.join(root, 'src/turni.ts'), filter.replace('=== true', '=== false'));
    await fs.writeFile(path.join(root, 'src/labels.json'), '{"settings":"Impostazoni"}\n');
    await fs.writeFile(path.join(root, 'docs/blueprint.md'), 'Mostra solo i turni attivi, conservandone l’ordine. La vista mobile usa lo stesso filtro.');
    await fs.writeFile(path.join(root, 'docs/stato.md'), 'T-12 è il prossimo task.');
    const tasks: {
      id: string;
      kind: string;
      request: string;
      files: string[];
      checks: string[];
      dependsOn?: string[];
      evidenceFiles?: string[];
      evidenceRevision?: string;
      afterValidation?: string[];
      validations?: { id: string; title: string; environment: string; steps: string[]; expected: string; files: string[] }[];
    }[] = [
      { id: 'T-12', kind: 'bug', request: 'Correggi il filtro dei turni.', files: ['src/turni.ts'], checks: ['regressione'], evidenceFiles: ['src/turni.ts'] },
      {
        id: 'T-13',
        kind: 'feature',
        request: 'Crea la vista mobile dei turni.',
        files: ['src/mobile.ts'],
        checks: ['mobile'],
        dependsOn: ['T-12'],
        evidenceFiles: ['src/turni.ts'],
        validations: [
          {
            id: 'V-03',
            title: 'Filtro dei turni sul telefono',
            environment: 'Telefono reale',
            steps: ['Seleziona Solo attivi.', 'Riapri la schermata.'],
            expected: 'La selezione Solo attivi è conservata.',
            files: ['src/mobile.ts', 'src/turni.ts'],
          },
        ],
      },
      { id: 'T-14', kind: 'change', request: 'Correggi il testo delle impostazioni.', files: ['src/labels.json'], checks: ['testo'] },
    ];
    const image = process.env.AIDER_DESK_DOCKER_TEST_IMAGE;
    if (image) {
      tasks[2].checks.push('testo-docker');
    }
    await fs.writeFile(path.join(root, 'docs/piano.json'), JSON.stringify({ tasks }));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, windowsHide: true, encoding: 'utf8' }).trim();
    git('init', '-b', 'main');
    git('config', 'user.name', 'Agent-Lab Test');
    git('config', 'user.email', 'test@example.invalid');
    git('add', '.');
    git('commit', '-m', 'Base del pilota Turni');
    const base = git('rev-parse', 'main');
    git('branch', 'dev');
    const policy: WorkflowProject = {
      id: 'turni',
      root,
      provider: 'pilot',
      model: 'scripted',
      branches: { main: 'main', development: 'dev' },
      workPlan: 'docs/piano.json',
      references: [
        { path: 'docs/blueprint.md', role: 'blueprint' },
        { path: 'docs/stato.md', role: 'state' },
      ],
      context: ['src/turni.ts'],
      evidenceExcludes: {
        'T-12': ['src/labels.json', 'src/mobile.ts', 'docs/nota.txt'],
        'T-13': ['src/labels.json', 'docs/nota.txt'],
      },
      editable: tasks.flatMap((task) => task.files),
      checks: [
        {
          id: 'regressione',
          type: 'typescript-expression',
          file: 'src/turni.ts',
          variable: 'activeShifts',
          expected: 'items.filter(item => item.active === true)',
        },
        { id: 'mobile', type: 'contains', file: 'src/mobile.ts', text: 'activeShifts(shifts)' },
        { id: 'testo', type: 'contains', file: 'src/labels.json', text: 'Impostazioni' },
        ...(image
          ? [
              {
                id: 'testo-docker',
                type: 'docker' as const,
                image,
                args: ['node', '-e', "if (require('./src/labels.json').settings !== 'Impostazioni') process.exit(1)"],
              },
              {
                id: 'mobile-docker',
                type: 'docker' as const,
                image,
                args: ['node', '-e', "if (!require('node:fs').readFileSync('src/mobile.ts', 'utf8').includes('Filtra i turni')) process.exit(1)"],
              },
            ]
          : []),
      ],
    };
    const stages: string[] = [];
    const generate = vi.fn(async (stage: WorkflowStage, _instructions: string, input: string) => {
      const payload = JSON.parse(input);
      if (stage === 'investigate') {
        return JSON.stringify({ findings: ['La nuova sorgente richiede copertura aggiuntiva.'], checks: [] });
      }
      if (stage === 'plan') {
        const task = tasks.find((candidate) => candidate.request === payload.request)!;
        expect(task).toBeDefined();
        expect(payload.sources).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'state', content: 'T-12 è il prossimo task.' })]));
        if (task.id === 'T-13') {
          expect(payload.files['src/turni.ts']).toBe(filter);
          expect(payload.projectTask).toMatchObject({ id: 'T-13', integrated: [{ id: 'T-12', commit: expect.stringMatching(/^[a-f0-9]{40}$/) }] });
        }
        stages.push(task.id);
        return JSON.stringify({
          outcome: task.request,
          delta: task.request,
          files: task.files,
          reuse: [],
          steps: ['Applica la modifica del piano.'],
          criteria: [{ scenario: task.request, check: task.checks[0] }],
          reproduction: task.kind === 'bug' ? 'regressione' : null,
          questions: [],
          surface: task.id === 'T-13' ? 'mobile' : 'none',
        });
      }
      if (stage === 'design') {
        return JSON.stringify({ sharedLogic: 'Riusa il filtro attivo.', ui: null, mobile: 'Mostra le righe attive con filtro per telefono.', questions: [] });
      }
      if (stage === 'review' || stage === 'design-review') {
        stages.push(stage);
        return JSON.stringify({ verdict: 'pass', findings: [] });
      }
      const file = payload.plan.files[0];
      if (payload.projectTask.id === 'T-14' && image) {
        expect(ensureWorkflowDocker).toHaveBeenCalledOnce();
      }
      const content = {
        'src/turni.ts': filter,
        'src/mobile.ts': payload.projectTask.id === 'T-15' ? mobile + 'export const filterLabel = "Filtra i turni";\n' : mobile,
        'src/labels.json':
          { 'T-17': '{"settings":"Impostazioni","filter":"Attivi"}\n', 'T-18': '{"settings":"Impostazioni","filter":"Turni attivi"}\n' }[
            payload.projectTask.id as string
          ] ?? '{"settings":"Impostazioni"}\n',
      }[file as string];
      return JSON.stringify({ changes: [{ path: file, content }] });
    });
    const send = (prompt: string, chat = 'giorno') => runRepositoryWorkflow({ policy, statePath: path.join(tmp, 'stato', chat + '.json'), prompt, generate });
    const day = await send('Avvia il lavoro');
    expect(day.message).toContain('T-12, T-13, T-14');
    expect(day.message).toContain('Validazioni in attesa: V-03');
    expect(stages).toEqual(['T-12', 'review', 'T-13', 'review', 'design-review', 'T-14', 'review']);
    const head = git('rev-parse', 'dev');
    const mobileCommit = git('rev-parse', 'dev^');
    expect(git('rev-list', '--count', 'main..dev')).toBe('3');
    expect(git('show', 'dev~2:src/turni.ts')).toBe(filter.trim());
    expect(git('show', 'dev^:src/mobile.ts')).toBe(mobile.trim());
    expect(git('show', 'dev:src/labels.json')).toContain('Impostazioni');
    expect(git('for-each-ref', '--format=%(refname:short)', 'refs/heads')).toBe('dev\nmain');
    expect(git('rev-parse', 'main')).toBe(base);
    expect(git('status', '--porcelain')).toBe('');
    expect(ensureWorkflowDocker).toHaveBeenCalledTimes(image ? 1 : 0);

    generate.mockClear();
    expect((await send('Riprendi le validazioni', 'sera')).message).toContain('Prossimo passaggio: 1. Seleziona Solo attivi.');
    await send('Conferma passaggio V-03 1', 'sera');
    const reopened = await send('Riprendi le validazioni', 'giorno-dopo');
    expect(reopened.message).toContain(mobileCommit);
    expect(reopened.message).toContain('Ultimo passaggio confermato: 1. Seleziona Solo attivi.');
    expect(reopened.message).toContain('Prossimo passaggio: 2. Riapri la schermata.');
    await send('Conferma passaggio V-03 2', 'giorno-dopo');
    expect((await send('Registra esito V-03 superata', 'giorno-dopo')).message).toContain('V-03 superata');
    expect((await send('Riprendi le validazioni', 'giorno-dopo')).message).toContain('Nessuna prova da riprendere');
    await send('Riprendi il lavoro', 'giorno-dopo');
    expect(generate).not.toHaveBeenCalled();
    expect(git('rev-parse', 'dev')).toBe(head);
    expect(git('rev-parse', 'main')).toBe(base);

    git('switch', 'dev');
    tasks[1].validations![0].steps[1] = 'Riapri la schermata da Impostazioni.';
    await fs.writeFile(path.join(root, 'docs/piano.json'), JSON.stringify({ tasks }));
    git('add', 'docs/piano.json');
    git('commit', '-m', 'Aggiorna le istruzioni della prova mobile');
    git('switch', 'main');
    expect((await send('Registra esito V-03 superata', 'giorno-dopo')).message).toContain('versione precedente');
    const updated = await send('Riprendi le validazioni', 'giorno-dopo');
    expect(updated.message).toContain('Prossimo passaggio: 1. Seleziona Solo attivi.');
    await send('Conferma passaggio V-03 1', 'giorno-dopo');
    expect((await send('Riprendi le validazioni', 'giorno-dopo')).message).toContain('Riapri la schermata da Impostazioni.');
    expect(generate).not.toHaveBeenCalled();

    const attested = await send('Registra esito V-03 superata', 'giorno-dopo');
    expect(attested.message).toContain('Passaggi confermati singolarmente: 1 su 2');
    git('switch', 'dev');
    tasks.push(
      {
        id: 'T-15',
        kind: 'change',
        request: 'Cambia il controllo del filtro mobile.',
        files: ['src/mobile.ts'],
        checks: image ? ['mobile', 'mobile-docker'] : ['mobile'],
        dependsOn: ['T-13'],
      },
      {
        id: 'T-16',
        kind: 'change',
        request: 'Procedi dopo la validazione mobile.',
        files: ['src/labels.json'],
        checks: ['testo'],
        dependsOn: ['T-15'],
        afterValidation: ['V-03'],
      },
    );
    await fs.writeFile(path.join(root, 'docs/piano.json'), JSON.stringify({ tasks }));
    git('add', 'docs/piano.json');
    git('commit', '-m', 'Aggiungi attività successive alla prova pilota');
    git('switch', 'main');
    if (image) {
      vi.mocked(ensureWorkflowDocker).mockRejectedValueOnce(new Error('Motore Docker in attesa'));
      const stopped = await send('Avvia il lavoro');
      expect(stopped.message).toContain('T-15 · Motore Docker in attesa');
      expect(stopped.message).toContain('T-16 · dipendenza in attesa');
      expect(generate.mock.calls.map(([stage]) => stage)).toEqual(['plan']);
    }
    const later = await send('Riprendi il lavoro');
    expect(later.message).toContain('T-12, T-13, T-14, T-15');
    expect(later.message).toContain('T-16 · dipendenza in attesa');
    expect(later.message).toContain('Validazioni in attesa: V-03');
    expect(stages).not.toContain('T-16');
    expect(ensureWorkflowDocker).toHaveBeenCalledTimes(image ? 3 : 0);
    expect(git('for-each-ref', '--format=%(refname:short)', 'refs/heads')).toBe('dev\nmain');

    const commitFiles = async (files: Record<string, string>) => {
      git('switch', 'dev');
      for (const [file, content] of Object.entries(files)) {
        await fs.writeFile(path.join(root, file), content);
      }
      git('add', ...Object.keys(files));
      git('commit', '-m', 'Aggiorna il pilota');
      git('switch', 'main');
      return git('rev-parse', 'dev');
    };
    tasks.push({
      id: 'T-17',
      kind: 'change',
      request: 'Aggiorna le etichette dopo la verifica del filtro condiviso.',
      files: ['src/labels.json'],
      checks: ['testo'],
      dependsOn: ['T-13'],
    });
    const regressed = await commitFiles({ 'docs/piano.json': JSON.stringify({ tasks }), 'src/turni.ts': filter.replace('=== true', '=== false') });
    generate.mockClear();
    const blocked = await send('Riprendi il lavoro', 'dopo-regressione');
    expect(blocked.message).toContain('T-12, T-13, T-14, T-15');
    expect(blocked.message).toContain('T-17 · dipendenza in attesa');
    expect(generate).not.toHaveBeenCalled();
    expect(git('rev-parse', 'dev')).toBe(regressed);

    const repaired = await commitFiles({ 'src/turni.ts': filter + '// Correzione successiva del filtro.\n' });
    const interrupted = new AbortController();
    const stopAfterChecks = vi.fn(async (stage: WorkflowStage) => {
      expect(stage).toBe('plan');
      interrupted.abort();
      throw interrupted.signal.reason;
    });
    await expect(
      runRepositoryWorkflow({
        policy,
        statePath: path.join(tmp, 'stato', 'interrotto.json'),
        prompt: 'Riprendi il lavoro',
        signal: interrupted.signal,
        generate: stopAfterChecks,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(stopAfterChecks).toHaveBeenCalledOnce();
    expect(git('rev-parse', 'dev')).toBe(repaired);

    let advanced: string | undefined;
    const concurrent = await runRepositoryWorkflow({
      policy,
      statePath: path.join(tmp, 'stato', 'concorrenza.json'),
      prompt: 'Riprendi il lavoro',
      generate: async (stage, instructions, input) => {
        if (stage === 'review' && !advanced) {
          advanced = await commitFiles({ 'docs/nota.txt': 'Aggiornamento indipendente durante la revisione.\n' });
        }
        return generate(stage, instructions, input);
      },
    });
    expect(advanced).toBeDefined();
    expect(concurrent.message).toContain('T-12, T-13, T-14, T-15, T-17');
    expect(git('rev-parse', 'dev^')).toBe(advanced);
    expect(git('rev-parse', 'dev~2')).toBe(repaired);
    generate.mockClear();
    const resumed = await send('Riprendi il lavoro', 'dopo-correzione');
    expect(resumed.message).toContain('T-12, T-13, T-14, T-15, T-17');
    expect(git('rev-parse', 'dev^')).toBe(advanced);
    expect(git('show', 'dev:src/turni.ts')).toContain('Correzione successiva');
    expect(generate).not.toHaveBeenCalled();

    tasks.push({
      id: 'T-18',
      kind: 'change',
      request: 'Aggiorna le etichette dopo il riesame del blueprint.',
      files: ['src/labels.json'],
      checks: ['testo'],
      dependsOn: ['T-13'],
    });
    const changedBlueprint = await commitFiles({
      'docs/piano.json': JSON.stringify({ tasks }),
      'docs/blueprint.md': 'Mostra solo i turni attivi e preserva gli identificativi.',
    });
    generate.mockClear();
    const reviewRequired = await send('Riprendi il lavoro', 'riesame');
    expect(reviewRequired.message).toContain('T-18 · dipendenza in attesa');
    expect(reviewRequired.message).toContain('fonti approvate cambiate');
    expect(generate).not.toHaveBeenCalled();
    expect(git('rev-parse', 'dev')).toBe(changedBlueprint);

    tasks[1].request += ' Mantieni gli identificativi.';
    const revisedCriteria = await commitFiles({ 'docs/piano.json': JSON.stringify({ tasks }) });
    tasks[0].evidenceRevision = changedBlueprint;
    tasks[1].evidenceRevision = revisedCriteria;
    const reviewed = await commitFiles({ 'docs/piano.json': JSON.stringify({ tasks }) });
    const afterReview = await send('Riprendi il lavoro', 'riesame-approvato');
    expect(afterReview.message).toContain('T-12, T-13, T-14, T-15, T-17, T-18');
    expect(generate.mock.calls.map(([stage]) => stage)).toEqual(['plan', 'implement', 'review']);
    expect(git('rev-parse', 'dev^')).toBe(reviewed);
    expect(git('rev-parse', 'main')).toBe(base);

    const stateDir = path.join(tmp, 'stato');
    const registryName = (await fs.readdir(stateDir)).find((name) => name.endsWith('-validazioni.json'))!;
    const registry = JSON.parse(await fs.readFile(path.join(stateDir, registryName), 'utf8'));
    const automatic = Object.values(registry.checks).flat();
    expect(automatic).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ commit: regressed, results: expect.arrayContaining([expect.objectContaining({ id: 'regressione', passed: false })]) }),
        expect.objectContaining({ commit: repaired, results: expect.arrayContaining([expect.objectContaining({ id: 'regressione', passed: true })]) }),
      ]),
    );
    expect(automatic.filter((result) => (result as { commit: string }).commit === repaired)).toHaveLength(2);
    expect(Object.values(registry.records)).toEqual(expect.arrayContaining([expect.objectContaining({ commit: mobileCommit, passed: true })]));
    expect([...Object.values(registry.records), ...Object.values(registry.history)]).toEqual(
      expect.arrayContaining([expect.objectContaining({ passed: true, confirmed: 1 })]),
    );

    tasks.push({
      id: 'T-19',
      kind: 'change',
      request: 'Procedi dopo i controlli delle impostazioni.',
      files: ['src/labels.json'],
      checks: ['testo'],
      dependsOn: ['T-14'],
    });
    const unknownInput = await commitFiles({
      'docs/piano.json': JSON.stringify({ tasks }),
      'src/unknown.ts': 'export const sharedSetting = true;\n',
    });
    generate.mockClear();
    const incompleteScope = await send('Riprendi il lavoro', 'perimetro-incompleto');
    expect(incompleteScope.message).toContain('T-19 · dipendenza in attesa');
    expect(incompleteScope.message).toContain('T-14 · fonti approvate cambiate');
    expect(generate).not.toHaveBeenCalled();
    expect(git('rev-parse', 'dev')).toBe(unknownInput);

    tasks[2].evidenceRevision = changedBlueprint;
    await commitFiles({ 'docs/piano.json': JSON.stringify({ tasks }) });
    const unknown = await send('Riprendi il lavoro', 'perimetro-senza-dipendenza');
    expect(unknown.message).toContain('T-19 · dipendenza in attesa');
    expect(unknown.message).toContain('T-14 · copertura delle dipendenze da verificare');
    expect(generate.mock.calls.map(([stage]) => stage)).toEqual(['investigate']);

    tasks.push({
      id: 'T-20',
      kind: 'change',
      request: 'Usa la prova del componente condiviso.',
      files: ['src/labels.json'],
      checks: ['testo'],
      dependsOn: ['T-13'],
    });
    const omitted = await commitFiles({
      'docs/piano.json': JSON.stringify({ tasks }),
      'src/shared-config.ts': 'export const showArchived = true;\n',
    });
    generate.mockClear();
    expect((await send('Riprendi il lavoro')).message).toContain('T-20 · dipendenza in attesa');
    expect(generate.mock.calls.every(([stage]) => stage === 'investigate')).toBe(true);
    expect(git('rev-parse', 'dev')).toBe(omitted);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}, 240_000);

it.each([
  'legacy',
  'legacy-alias',
  'foreign-receipts',
  'published',
  'before-publish',
  'pending-policy',
  'before-receipt',
  'before-snapshot',
  'atomic-update',
] as const)(
  'recovers or stops at the %s boundary without replaying published work',
  async (boundary) => {
    const tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agentlab-resume-')));
    const root = path.join(tmp, 'repo');
    const workspace = path.join(tmp, 'state');
    const workPlan = 'plan.json';
    const task = {
      id: 'T-1',
      kind: 'change',
      request: 'Scrivi il risultato.',
      files: ['result.txt'],
      checks: ['result'],
      dependsOn: [],
      afterValidation: [],
    };
    const policy: WorkflowProject = {
      id: 'resume',
      root,
      provider: 'pilot',
      model: 'scripted',
      branches: { main: 'main', development: 'dev' },
      workPlan,
      references: [{ path: 'blueprint.md', role: 'blueprint' }],
      context: [],
      editable: ['result.txt', 'next.txt'],
      checks: [
        { id: 'result', type: 'contains', file: 'result.txt', text: 'pronto' },
        { id: 'next', type: 'contains', file: 'next.txt', text: 'pronto' },
      ],
    };
    const runGit = (...argv: string[]) => execFileSync('git', argv, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    const readHead = () => runGit('rev-parse', 'dev');
    const send = () =>
      runRepositoryWorkflow({ policy, statePath: path.join(workspace, 'chat.json'), prompt: 'Riprendi il lavoro', generate, signal: controller.signal });
    let controller = new AbortController();
    let concurrent: string | undefined;
    const generate = vi.fn(async (stage: WorkflowStage, _instructions: string, input: string) => {
      const payload = JSON.parse(input);
      const active = payload.projectTask.id === task.id ? task : dependent;
      if (stage === 'plan') {
        return JSON.stringify({
          outcome: active.request,
          delta: active.request,
          files: active.files,
          reuse: [],
          steps: ['Scrivi il risultato.'],
          criteria: [{ scenario: 'Il risultato è pronto.', check: active.checks[0] }],
          reproduction: null,
          questions: [],
          surface: 'none',
        });
      }
      return stage === 'review'
        ? JSON.stringify({ verdict: 'pass', findings: [] })
        : JSON.stringify({ changes: [{ path: active.files[0], content: 'pronto\n' }] });
    });
    const dependent = { ...task, id: 'T-2', files: ['next.txt'], checks: ['next'], dependsOn: ['T-1'] };
    const savePlan = (tasks: unknown[]) => fs.writeFile(path.join(root, workPlan), JSON.stringify({ tasks }));
    const advance = () => {
      const base = readHead();
      const next = runGit('commit-tree', base + '^{tree}', '-p', base, '-m', 'Modifica concorrente');
      runGit('update-ref', 'refs/heads/dev', next, base);
      return next;
    };
    try {
      await fs.mkdir(root);
      await fs.writeFile(path.join(root, 'blueprint.md'), 'Registra il risultato.');
      await savePlan([task]);
      runGit('init', '-b', 'main');
      runGit('config', 'user.name', 'Agent-Lab Test');
      runGit('config', 'user.email', 'test@example.invalid');
      runGit('add', '.');
      runGit('commit', '-m', 'Base');
      const base = runGit('rev-parse', 'main');
      runGit('branch', 'dev');
      const actualExec = promisify((await vi.importActual<typeof import('node:child_process')>('node:child_process')).execFile);
      if (
        boundary === 'before-publish' ||
        boundary === 'pending-policy' ||
        boundary === 'published' ||
        boundary === 'before-receipt' ||
        boundary === 'atomic-update'
      ) {
        exec.mockImplementation(async (...argv) => {
          const gitArgs = argv[1];
          if (argv[0] !== 'git' || !Array.isArray(gitArgs) || !gitArgs.includes('update-ref')) {
            return actualExec(...argv);
          }
          if (boundary === 'atomic-update') {
            concurrent ??= advance();
            return actualExec(...argv);
          }
          if (boundary !== 'before-publish' && boundary !== 'pending-policy') {
            await actualExec(...argv);
          }
          if (boundary === 'before-receipt') {
            throw new Error('Scrittura della ricevuta interrotta dopo la pubblicazione');
          }
          controller.abort();
          throw controller.signal.reason;
        });
        if (boundary === 'before-publish' || boundary === 'pending-policy' || boundary === 'published') {
          await expect(send()).rejects.toMatchObject({ name: 'AbortError' });
        } else if (boundary === 'atomic-update' || boundary === 'before-receipt') {
          expect((await send()).message).toContain('Task integrati sul ramo di sviluppo: T-1');
        } else {
          expect((await send()).message).not.toContain('Task integrati sul ramo di sviluppo: T-1');
        }
        exec.mockImplementation(actualExec);
      } else {
        expect((await send()).message).toContain('Task integrati sul ramo di sviluppo: T-1');
      }
      const first = readHead();
      const stable = digest([digest(root), task.id]) + '-task';
      let statePath = path.join(workspace, stable + '.json');
      if (boundary === 'legacy' || boundary === 'legacy-alias') {
        const taskPolicy = { ...policy, editable: task.files, checks: [policy.checks[0]] };
        const legacy = digest([digest(root), digest([task, taskPolicy, []])]);
        const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
        delete state.projectTaskId;
        await fs.writeFile(statePath, JSON.stringify(state));
        await fs.rename(statePath, path.join(workspace, legacy + '.json'));
        await fs.rename(path.join(workspace, stable + '-jobs'), path.join(workspace, legacy + '-jobs'));
        statePath = path.join(workspace, legacy + '.json');
        if (boundary === 'legacy-alias') {
          policy.checks[0] = { id: 'result', type: 'contains', file: 'result.txt', text: 'ront' };
          policy.legacyReceipts = { [task.id]: legacy };
        }
      }
      if (boundary === 'foreign-receipts') {
        const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
        delete state.projectTaskId;
        await fs.writeFile(path.join(workspace, 'a'.repeat(64) + '.json'), JSON.stringify(state));
        state.delivered.integration.commit = 'f'.repeat(40);
        await fs.writeFile(path.join(workspace, 'b'.repeat(64) + '.json'), JSON.stringify(state));
        runGit('switch', 'dev');
        await savePlan([task, { ...dependent, dependsOn: [] }]);
        runGit('commit', '-am', 'Aggiungi un task indipendente');
        runGit('switch', 'main');
        generate.mockClear();
        expect((await send()).message).toContain('Task integrati sul ramo di sviluppo: T-1, T-2');
        expect(generate.mock.calls.map(([stage]) => stage)).toEqual(['plan', 'implement', 'review']);
        expect(runGit('show', 'dev:next.txt')).toBe('pronto');
        return;
      }
      if (boundary === 'atomic-update') {
        expect(runGit('rev-parse', 'dev^')).toBe(concurrent);
        expect(runGit('rev-parse', 'dev~2')).toBe(base);
        expect(await readRepositoryWorkflow(statePath)).toMatchObject({ phase: 'done', commit: first });
        return;
      }
      controller = new AbortController();
      generate.mockClear();
      if (boundary === 'before-publish' || boundary === 'pending-policy') {
        expect(first).toBe(base);
        const pending = await readRepositoryWorkflow(statePath, policy, true);
        expect(pending).toHaveProperty('pendingCommit');
        if (boundary === 'pending-policy') {
          policy.checks[0] = { id: 'result', type: 'contains', file: 'result.txt', text: 'ront' };
          expect((await send()).message).toContain('Task integrati sul ramo di sviluppo: T-1');
          expect(readHead()).not.toBe('pendingCommit' in pending ? pending.pendingCommit : undefined);
          expect(runGit('rev-parse', 'dev^')).toBe(base);
          expect(generate.mock.calls.map(([stage]) => stage)).toEqual(['plan', 'implement', 'review']);
          generate.mockClear();
          const integrated = readHead();
          expect((await send()).message).toContain('Task integrati sul ramo di sviluppo: T-1');
          expect(readHead()).toBe(integrated);
          expect(generate).not.toHaveBeenCalled();
          return;
        }
        expect((await send()).message).toContain('Task integrati sul ramo di sviluppo: T-1');
        expect(readHead()).toBe('pendingCommit' in pending ? pending.pendingCommit : undefined);
      } else if (boundary === 'before-snapshot') {
        runGit('switch', 'dev');
        await savePlan([task, dependent]);
        runGit('commit', '-am', 'Aggiungi dipendenza');
        runGit('switch', 'main');
        let injected = false;
        let sawDependencyCheck = false;
        exec.mockImplementation(async (...argv) => {
          const gitArgs = argv[1];
          if (argv[0] === 'git' && Array.isArray(gitArgs) && gitArgs.includes('diff') && gitArgs.includes('--name-only') && gitArgs.includes(first)) {
            sawDependencyCheck = true;
          }
          if (!injected && sawDependencyCheck && argv[0] === 'git' && Array.isArray(gitArgs) && gitArgs.includes('for-each-ref')) {
            // Status validation and the queue's final head check both see the old ref.
            const result = await actualExec(...argv);
            if (++reads === 2) {
              injected = true;
              concurrent = advance();
            }
            return result;
          }
          return actualExec(...argv);
        });
        let reads = 0;
        const outcome = await send();
        expect(injected).toBe(true);
        expect(runGit('rev-parse', 'dev^')).toBe(concurrent);
        expect(outcome.message).toContain('Task integrati sul ramo di sviluppo: T-1, T-2');
        expect(generate.mock.calls.map(([stage]) => stage)).toEqual(['plan', 'implement', 'review']);
        return;
      } else {
        expect(first).not.toBe(base);
        if (boundary === 'before-receipt') {
          policy.checks[0] = { id: 'result', type: 'contains', file: 'result.txt', text: 'ront' };
        }
        runGit('switch', 'dev');
        await savePlan([{ ...task, request: 'Definizione aggiornata del risultato.' }]);
        runGit('commit', '-am', 'Aggiorna la definizione');
        runGit('switch', 'main');
        const updated = readHead();
        expect((await send()).message).toContain('Task integrati sul ramo di sviluppo: T-1');
        expect(readHead()).toBe(updated);
        expect(await readRepositoryWorkflow(statePath, policy, true)).not.toHaveProperty('pendingCommit');
      }
      expect(generate).not.toHaveBeenCalled();
      const recovered = readHead();
      expect((await send()).message).toContain('Task integrati sul ramo di sviluppo: T-1');
      expect(readHead()).toBe(recovered);
      expect(generate).not.toHaveBeenCalled();
    } finally {
      exec.mockReset();
      await fs.rm(tmp, { recursive: true, force: true });
    }
  },
  45_000,
);
