import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { runRepositoryWorkflow } from '../repository-workflow';
import { ensureWorkflowDocker } from '../workflow-docker';

import type { WorkflowProject } from '../workflow-policy';
import type { WorkflowStage } from '../workflow-skills';

vi.unmock('fs');
vi.unmock('path');
vi.mock('../workflow-docker', { spy: true });

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
      afterValidation?: string[];
      validations?: { id: string; title: string; environment: string; steps: string[]; expected: string; files: string[] }[];
    }[] = [
      { id: 'T-12', kind: 'bug', request: 'Correggi il filtro dei turni.', files: ['src/turni.ts'], checks: ['regressione'] },
      {
        id: 'T-13',
        kind: 'feature',
        request: 'Crea la vista mobile dei turni.',
        files: ['src/mobile.ts'],
        checks: ['mobile'],
        dependsOn: ['T-12'],
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
        'src/labels.json': '{"settings":"Impostazioni"}\n',
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

    await send('Registra esito V-03 superata', 'giorno-dopo');
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
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}, 30_000);
