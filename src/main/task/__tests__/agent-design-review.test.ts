import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AgentDesignReviewPending,
  getAgentDesignCandidate,
  legacyDesignTouches,
  parseAgentDesignReview,
  readAgentDesignSnapshot,
  runAgentDesignReview,
} from '../agent-design-review';

import type { RootTurnRecord } from '@/agent/worker-checkpoint';

const request = { instructions: ['Keep shared UI consistent.'] };

describe('ordinary Agent Designer evidence', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-design-proof-'));
    await simpleGit(root).init();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const write = (file: string, text: string) => fs.writeFile(path.join(root, file), text);

  it('binds the indirect change, design rules and actual request while ignoring an unrelated module', async () => {
    await Promise.all([
      write('view.tsx', "import { label } from './bridge'; export const View = () => <button>{label}</button>;"),
      write('bridge.ts', "export { label } from './labels';"),
      write('labels.ts', "export const label = 'Before';"),
      write('independent.ts', 'export const retries = 1;'),
      write('AGENTS.md', 'Preserve shared variants.'),
      write('credentials.json', '{"key":"test-secret-fixture"}'),
    ]);
    const { hashes, scope } = await readAgentDesignSnapshot(root);
    const baseline = { hashes, scope };
    expect(hashes).not.toHaveProperty('credentials.json');
    await write('independent.ts', 'export const retries = 3;');
    expect(getAgentDesignCandidate(baseline, await readAgentDesignSnapshot(root), request)).toBeUndefined();

    await write('labels.ts', "export const label = 'After';");
    const current = await readAgentDesignSnapshot(root);
    const entry = getAgentDesignCandidate(baseline, current, request)!;
    expect(JSON.parse(entry.reviewInput())).toMatchObject({
      request,
      changes: [{ file: 'labels.ts', previousDigest: hashes['labels.ts'], current: "export const label = 'After';" }],
      productRules: [{ file: 'AGENTS.md', content: 'Preserve shared variants.' }],
      relatedPaths: ['bridge.ts', 'labels.ts', 'view.tsx'],
      relatedSources: [
        { file: 'bridge.ts', content: "export { label } from './labels';" },
        { file: 'view.tsx', content: expect.stringContaining('<button>') },
      ],
    });
    expect(getAgentDesignCandidate(baseline, current, { instructions: ['New design request'] })?.candidate).not.toBe(entry.candidate);
    await write('AGENTS.md', 'Changed design instructions.');
    expect(getAgentDesignCandidate(baseline, await readAgentDesignSnapshot(root), request)?.candidate).not.toBe(entry.candidate);
    const active = getAgentDesignCandidate(baseline, current, request, 'Resolved AGENTS.override.md');
    expect(JSON.parse(active!.reviewInput())).toMatchObject({ inheritedRules: 'Resolved AGENTS.override.md', productRules: [] });
    expect(active?.candidate).not.toBe(entry.candidate);
  });

  it('uses prior native tool attribution on legacy resume and keeps opaque operations uncertain', () => {
    const turn: RootTurnRecord = {
      turnId: 'turn-id',
      directory: root,
      state: 'running',
      provider: 'fixture',
      model: 'fixture',
      profileId: 'parent',
      messages: [{ role: 'user', id: 'turn-id', content: 'Review the project.' }],
    };
    expect(legacyDesignTouches(turn)).toEqual([]);
    turn.messages.push({
      role: 'assistant',
      id: 'sample',
      content: [{ type: 'tool-call', toolName: 'power---file_edit', toolCallId: 'edit', input: { filePath: 'src/view.tsx' } }],
    });
    expect(legacyDesignTouches(turn)).toEqual(['src/view.tsx']);
    turn.pendingTools = [{ id: 'bash', name: 'power---bash' }];
    expect(legacyDesignTouches(turn)).toBeUndefined();
  });

  it('catches deletion of the only view and considers existing UI on recovery without a baseline', async () => {
    await write('view.tsx', 'export const View = () => <button>Open</button>;');
    const baseline = await readAgentDesignSnapshot(root);
    expect(getAgentDesignCandidate(undefined, baseline, request)).toBeDefined();
    await fs.unlink(path.join(root, 'view.tsx'));
    const entry = getAgentDesignCandidate(baseline, await readAgentDesignSnapshot(root), request);
    expect(JSON.parse(entry!.reviewInput()).changes).toEqual([{ file: 'view.tsx', previousDigest: baseline.hashes['view.tsx'], current: null }]);
  });

  it('requires Designer for a React createElement view in a plain TypeScript module', async () => {
    const component = "import { createElement as el } from 'react'; export const Button = () => el('button', {}, 'Open');";
    await write('view.ts', component);
    const baseline = await readAgentDesignSnapshot(root);
    await write('view.ts', component.replace('Open', 'View'));
    const entry = getAgentDesignCandidate(baseline, await readAgentDesignSnapshot(root), request);
    expect(JSON.parse(entry!.reviewInput()).changes).toEqual([
      { file: 'view.ts', previousDigest: baseline.hashes['view.ts'], current: component.replace('Open', 'View') },
    ]);
  });

  it('requires Designer for an SVG change and supplies the consuming component', async () => {
    const asset = '<svg><title>Open card</title></svg>';
    const component = "import icon from './icon.svg'; export const Card = () => <img src={icon}/>;";
    await Promise.all([write('view.tsx', component), write('icon.svg', asset)]);
    const baseline = await readAgentDesignSnapshot(root);
    await write('icon.svg', asset.replace('Open', 'View'));
    const entry = getAgentDesignCandidate(baseline, await readAgentDesignSnapshot(root), request);
    expect(JSON.parse(entry!.reviewInput())).toMatchObject({
      changes: [{ file: 'icon.svg', previousDigest: baseline.hashes['icon.svg'], current: asset.replace('Open', 'View') }],
      relatedSources: [{ file: 'view.tsx', content: component }],
    });
  });

  it('preserves JSX roots with valid nonalphabetic identifiers', async () => {
    await write('view.tsx', 'export const View = () => <_Icon label="Open" />;');
    const baseline = await readAgentDesignSnapshot(root);
    await write('view.tsx', 'export const View = () => <_Icon label="View" />;');
    expect(getAgentDesignCandidate(baseline, await readAgentDesignSnapshot(root), request)).toBeDefined();
  });

  it.skipIf(process.platform !== 'win32')('uses the real file casing for a legacy native edit target', async () => {
    await write('view.tsx', 'export const View = () => <button>Open</button>;');
    const snapshot = await readAgentDesignSnapshot(root);
    const entry = getAgentDesignCandidate(snapshot, snapshot, request, undefined, ['View.tsx']);
    expect(JSON.parse(entry!.reviewInput()).changes).toEqual([
      { file: 'view.tsx', previousDigest: snapshot.hashes['view.tsx'], current: snapshot.files['view.tsx'] },
    ]);
  });

  it('supplies the scoped rule of an importing page and invalidates the approval when that rule changes', async () => {
    await fs.mkdir(path.join(root, 'reports'));
    await Promise.all([
      write('format.ts', 'export const day = "Monday";'),
      write('reports/schedule.tsx', "import { day } from '../format'; export const Schedule = () => <time>{day}</time>;"),
      write('reports/AGENTS.md', 'Regola base da sostituire.'),
      write('reports/AGENTS.override.md', 'Questa vista usa i nomi dei giorni per esteso.'),
    ]);
    const baseline = await readAgentDesignSnapshot(root);
    await write('format.ts', 'export const day = "Mon";');
    const entry = getAgentDesignCandidate(baseline, await readAgentDesignSnapshot(root), request)!;
    const input = JSON.parse(entry.reviewInput());
    expect(input.relatedSources.map((source: { file: string }) => source.file)).toContain('reports/schedule.tsx');
    expect(input.productRules).toEqual([{ file: 'reports/AGENTS.override.md', content: 'Questa vista usa i nomi dei giorni per esteso.' }]);
    await write('reports/AGENTS.override.md', 'La vista compatta può abbreviare i giorni.');
    expect(getAgentDesignCandidate(baseline, await readAgentDesignSnapshot(root), request)?.candidate).not.toBe(entry.candidate);
  });

  const disconnectedSchedule = async () => {
    await fs.mkdir(path.join(root, 'mobile'));
    await Promise.all([
      write('schedule.tsx', 'export const Schedule = () => <section><time>09:00</time></section>;'),
      write('mobile/agenda.html', '<article><time>15:45</time></article>'),
      write('mobile/DESIGN.md', 'Mostra gli orari locali nel riepilogo compatto.'),
      write('unrelated.ts', 'export const batchSize = 28;'),
      write('credentials.json', '{"key":"fixture"}'),
    ]);
    const baseline = await readAgentDesignSnapshot(root);
    await write('schedule.tsx', 'export const Schedule = () => <section><time>10:00</time></section>;');
    const current = await readAgentDesignSnapshot(root);
    return { baseline, current, entry: getAgentDesignCandidate(baseline, current, request)! };
  };

  it('lets the Designer compare a disconnected schedule only after requesting its exact snapshot path', async () => {
    const { baseline, current, entry } = await disconnectedSchedule();
    const initial = JSON.parse(entry.reviewInput());
    expect(initial.availableUiPaths).toEqual(['mobile/agenda.html']);
    expect(initial.relatedSources).toEqual([]);
    expect(initial.productRules).toEqual([]);
    expect(entry.reviewInput()).not.toContain('15:45');

    await write('mobile/agenda.html', '<article>Nuova versione</article>');
    const generate = vi.fn(async (_instructions: string, source: string) => {
      const input = JSON.parse(source);
      if (!input.requestedSources) {
        return JSON.stringify({ requestSources: ['mobile/agenda.html'] });
      }
      expect(input.requestedSources).toEqual([{ file: 'mobile/agenda.html', content: current.files['mobile/agenda.html'] }]);
      expect(input.productRules).toEqual([{ file: 'mobile/DESIGN.md', content: current.files['mobile/DESIGN.md'] }]);
      expect(input.changes).toEqual(initial.changes);
      return JSON.stringify({ verdict: 'fail', findings: ['Il formato degli orari diverge dal riepilogo compatto.'] });
    });
    await expect(runAgentDesignReview(entry.reviewInput, generate)).resolves.toMatchObject({ verdict: 'fail' });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(getAgentDesignCandidate(baseline, await readAgentDesignSnapshot(root), request)?.candidate).not.toBe(entry.candidate);
    await write('mobile/agenda.html', current.files['mobile/agenda.html']);
    await write('mobile/DESIGN.md', 'Nuova convenzione.');
    expect(getAgentDesignCandidate(baseline, await readAgentDesignSnapshot(root), request)?.candidate).not.toBe(entry.candidate);
  });

  it.each([['../outside.tsx'], ['unrelated.ts'], ['credentials.json'], ['MOBILE/agenda.html'], ['mobile/agenda.html', 'mobile/agenda.html']])(
    'keeps the review pending for an inadmissible selection (%s)',
    async (...paths: string[]) => {
      const { entry } = await disconnectedSchedule();
      const generate = vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify({ requestSources: paths }))
        .mockResolvedValue('{"verdict":"pass","findings":[]}');
      await expect(runAgentDesignReview(entry.reviewInput, generate)).rejects.toBeInstanceOf(AgentDesignReviewPending);
      expect(generate).toHaveBeenCalledTimes(1);
    },
  );

  it('requires a verdict after the single consultation and stops before sending over-budget content', async () => {
    const { entry } = await disconnectedSchedule();
    const select = JSON.stringify({ requestSources: ['mobile/agenda.html'] });
    const repeated = vi.fn().mockResolvedValue(select);
    await expect(runAgentDesignReview(entry.reviewInput, repeated)).rejects.toBeInstanceOf(AgentDesignReviewPending);
    expect(repeated).toHaveBeenCalledTimes(2);
    const insufficient = vi.fn().mockResolvedValueOnce('{"insufficientContext":true}').mockResolvedValue('{"verdict":"pass","findings":[]}');
    await expect(runAgentDesignReview(entry.reviewInput, insufficient)).rejects.toBeInstanceOf(AgentDesignReviewPending);
    expect(insufficient).toHaveBeenCalledTimes(1);
    await write('mobile/agenda.html', '<main>' + 'x'.repeat(240000) + '</main>');
    const largeBaseline = await readAgentDesignSnapshot(root);
    await write('schedule.tsx', 'export const Schedule = () => <section><time>12:00</time></section>;');
    const large = getAgentDesignCandidate(largeBaseline, await readAgentDesignSnapshot(root), request)!;
    const lookup = vi.fn().mockResolvedValue(select);
    await expect(runAgentDesignReview(large.reviewInput, lookup)).rejects.toBeInstanceOf(AgentDesignReviewPending);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('invalidates a legacy approval for identical files and preserves direct verdicts and the format retry', async () => {
    await write('schedule.tsx', 'export const Schedule = () => <main>Prima</main>;');
    const baseline = await readAgentDesignSnapshot(root);
    await write('schedule.tsx', 'export const Schedule = () => <main>Dopo</main>;');
    const current = await readAgentDesignSnapshot(root);
    const entry = getAgentDesignCandidate(baseline, current, request)!;
    const legacyBinding = [['schedule.tsx', baseline.hashes['schedule.tsx'], current.hashes['schedule.tsx']]];
    const legacyCandidate = createHash('sha256')
      .update(JSON.stringify([request, legacyBinding]))
      .digest('hex');
    expect(entry.candidate).not.toBe(legacyCandidate);
    const direct = vi.fn().mockResolvedValue('{"verdict":"pass","findings":[]}');
    await expect(runAgentDesignReview(entry.reviewInput, direct)).resolves.toEqual({ verdict: 'pass', findings: [] });
    expect(direct).toHaveBeenCalledTimes(1);
    const repaired = vi.fn().mockResolvedValueOnce('risposta illeggibile').mockResolvedValue('{"verdict":"pass","findings":[]}');
    await expect(runAgentDesignReview(entry.reviewInput, repaired)).resolves.toEqual({ verdict: 'pass', findings: [] });
    expect(repaired).toHaveBeenCalledTimes(2);
  });

  const declarativeTimeline = async (large = false, localInterval = 15) => {
    await fs.mkdir(path.join(root, 'ui', 'views'), { recursive: true });
    const overview = 'ui/views/overview.json',
      bedside = 'ui/views/detail.json',
      empty = 'ui/views/empty.json';
    const owner = 'ui/axis.json',
      renderer = 'ui/render.tsx';
    const files = {
      [owner]: { variants: { standard: { interval: 15 } } },
      [overview]: { title: 'Riepilogo', elements: [{ component: 'axis' }] },
      [bedside]: { title: 'Dettaglio', elements: [{ appearance: { interval: localInterval } }], ...(large ? { description: 'x'.repeat(34000) } : {}) },
      [empty]: { title: 'Archivio', elements: [] },
      'ui/version.json': { release: 'UNRELATED-CONFIGURATION' },
      'ui/views/unused.json': { title: 'UI estranea', elements: [], marker: 'UNIMPORTED-DATA' },
    };
    await Promise.all(Object.entries(files).map(([file, data]) => write(file, JSON.stringify(data))));
    await write(
      renderer,
      [
        "import axis from './axis.json'; import overview from './views/overview.json'; import detail from './views/detail.json';",
        "import archive from './views/empty.json'; import version from './version.json';",
        'export const Timeline = ({entry}) => <time>{entry.appearance?.interval ?? axis.variants.standard.interval}</time>;',
      ].join('\n'),
    );
    await write('ui/views/DESIGN.md', 'La scala del dettaglio segue la convenzione comune.');
    const baseline = await readAgentDesignSnapshot(root);
    await write(owner, JSON.stringify({ variants: { standard: { interval: 30 } } }));
    const entry = getAgentDesignCandidate(baseline, await readAgentDesignSnapshot(root), request)!;
    const comparisons = [
      { file: overview, quote: '"component":"axis"', assessment: 'Il riepilogo usa la scala comune.' },
      { file: bedside, quote: '"interval":' + localInterval, assessment: 'Questa vista usa un intervallo locale di ' + localInterval + ' minuti.' },
      { file: empty, quote: '"elements":[]', assessment: 'La vista non dichiara intervalli.' },
    ];
    return { entry, baseline, owner, renderer, overview, bedside, empty, comparisons };
  };

  it('supplies the actual declarative siblings and scoped rules on the first call; rejects a bare or invented pass', async () => {
    const { entry, overview, bedside, empty, comparisons } = await declarativeTimeline();
    const source = entry.reviewInput();
    const packet = JSON.parse(source);
    expect(packet.comparisonPaths).toEqual([bedside, empty, overview]);
    expect(packet.relatedSources.map((s: { file: string }) => s.file)).toEqual(expect.arrayContaining([overview, bedside, empty]));
    expect(packet.productRules).toContainEqual({ file: 'ui/views/DESIGN.md', content: 'La scala del dettaglio segue la convenzione comune.' });
    expect(source).not.toContain('UNIMPORTED-DATA');
    expect(source).not.toContain('UNRELATED-CONFIGURATION');
    const bare = vi.fn().mockResolvedValue('{"verdict":"pass","findings":[]}');
    await expect(runAgentDesignReview(entry.reviewInput, bare)).rejects.toBeInstanceOf(AgentDesignReviewPending);
    const invented = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ verdict: 'pass', findings: [], comparisons: comparisons.map((c) => ({ ...c, quote: 'invented value' })) }));
    await expect(runAgentDesignReview(entry.reviewInput, invented)).rejects.toBeInstanceOf(AgentDesignReviewPending);
    const fail = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ verdict: 'fail', findings: ['In ui/views/detail.json la scala locale vale 15 e prevale sulla fonte aggiornata a 30.'] }),
      );
    await expect(runAgentDesignReview(entry.reviewInput, fail)).resolves.toMatchObject({ verdict: 'fail' });
    expect(fail).toHaveBeenCalledOnce();
  });

  it('requires the actual source of a large declarative peer before accepting grounded comparisons', async () => {
    const { entry, bedside, comparisons } = await declarativeTimeline(true, 30);
    const first = JSON.parse(entry.reviewInput());
    expect(first.availableUiPaths).toContain(bedside);
    expect(first.relatedSources.map((item: { file: string }) => item.file)).not.toContain(bedside);
    const raw = JSON.stringify({ verdict: 'pass', findings: [], comparisons });
    await expect(runAgentDesignReview(entry.reviewInput, vi.fn().mockResolvedValue(raw))).rejects.toBeInstanceOf(AgentDesignReviewPending);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ requestSources: [bedside] }))
      .mockResolvedValue(raw);
    await expect(runAgentDesignReview(entry.reviewInput, fetch)).resolves.toMatchObject({ verdict: 'pass', comparisons });
    expect(JSON.parse(fetch.mock.calls[1][1]).requestedSources[0].file).toBe(bedside);
  });

  it('withholds private declarative data even when a rendering consumer imports it', async () => {
    const { baseline, bedside, owner } = await declarativeTimeline();
    const privateData = JSON.stringify({ elements: [{ appearance: { interval: 15 } }], apiKey: 'fixture-sensitive-value' });
    await write(bedside, privateData);
    const stable = await readAgentDesignSnapshot(root);
    await write(owner, JSON.stringify({ variants: { standard: { interval: 45 } } }));
    const current = await readAgentDesignSnapshot(root);
    const entry = getAgentDesignCandidate(stable, current, request)!;
    const packet = JSON.parse(entry.reviewInput());
    expect(packet.unavailableComparison).toBe(true);
    expect(entry.reviewInput()).not.toContain('fixture-sensitive-value');
    expect(() => entry.reviewInput([bedside])).toThrow(AgentDesignReviewPending);
    const pass = vi.fn().mockResolvedValue('{"verdict":"pass","findings":[]}');
    await expect(runAgentDesignReview(entry.reviewInput, pass)).rejects.toBeInstanceOf(AgentDesignReviewPending);
    expect(pass).toHaveBeenCalledOnce();
    const changedPrivate = getAgentDesignCandidate(baseline, current, request)!;
    expect(() => changedPrivate.reviewInput()).toThrow(AgentDesignReviewPending);
  });

  it('makes unrelated widgets in a large layout available without requiring an exhaustive comparison', async () => {
    const widgets = ['Calendar', 'Billing', 'Footer', 'Feedback', 'Sidebar', 'Alerts', 'Map', 'Search', 'Notes', 'Profile', 'Orders', 'Stats'];
    await Promise.all(widgets.map((name) => write(name + '.tsx', 'export default () => <section>' + name + '</section>;')));
    await write(
      'Layout.tsx',
      widgets.map((name) => 'import ' + name + " from './" + name + "';").join('\n') + '\nexport default () => <main>Dashboard</main>;',
    );
    const baseline = await readAgentDesignSnapshot(root);
    await write('Notes.tsx', 'export default () => <section>Note personali</section>;');
    const entry = getAgentDesignCandidate(baseline, await readAgentDesignSnapshot(root), request)!;
    const packet = JSON.parse(entry.reviewInput());
    expect(packet.comparisonPaths).toEqual([]);
    expect(packet.availableUiPaths).toContain('Map.tsx');
    expect(packet.relatedSources.map((s: { file: string }) => s.file)).toEqual(['Layout.tsx']);
    await expect(runAgentDesignReview(entry.reviewInput, vi.fn().mockResolvedValue('{"verdict":"pass","findings":[]}'))).resolves.toEqual({
      verdict: 'pass',
      findings: [],
    });
  });

  const correction = { instructions: ['Ho approvato il passo di 30 minuti per i calendari. Applica la correzione e conservala per il lavoro futuro.'] };
  const verdictWith = (file: string, quote: string) => JSON.stringify({ verdict: 'pass', findings: [], decisionEvidence: { file, quote } });
  const calendar = async (rule?: string) => {
    await write('Calendar.tsx', 'export const Calendar = () => <time>15 minuti</time>');
    if (rule) {
      await write('DESIGN.md', rule);
    }
    const before = await readAgentDesignSnapshot(root);
    await write('Calendar.tsx', 'export const Calendar = () => <time>30 minuti</time>');
    return { before, after: await readAgentDesignSnapshot(root) };
  };

  it('returns the stable source to the author when the reviewer twice accepts an unrecorded decision', async () => {
    const old = 'Il passo di tutti i calendari è di 15 minuti.';
    const { before, after } = await calendar(old);
    const entry = getAgentDesignCandidate(before, after, correction)!;
    expect(entry.unchangedDecisionSources).toEqual(['DESIGN.md']);
    const packet = JSON.parse(entry.reviewInput());
    expect(packet.decisionPersistence.sources).toEqual([{ file: 'DESIGN.md', changedSinceBaseline: false, excerpts: [old] }]);
    const evaluate = vi.fn().mockResolvedValueOnce('{"verdict":"pass","findings":[]}').mockResolvedValue(verdictWith('DESIGN.md', old));
    await expect(runAgentDesignReview(entry.reviewInput, evaluate)).resolves.toMatchObject({
      verdict: 'fail',
      findings: [expect.stringContaining('DESIGN.md')],
    });
    expect(evaluate).toHaveBeenCalledTimes(2);

    const updated = 'Il passo dei calendari è di 30 minuti.';
    await write('DESIGN.md', updated);
    const current = getAgentDesignCandidate(before, await readAgentDesignSnapshot(root), correction)!;
    expect(current.candidate).not.toBe(entry.candidate);
    expect(current.unchangedDecisionSources).toEqual([]);
    expect(JSON.parse(current.reviewInput()).decisionPersistence.sources[0].changedSinceBaseline).toBe(true);
    await expect(runAgentDesignReview(current.reviewInput, vi.fn().mockResolvedValue(verdictWith('DESIGN.md', updated)))).resolves.toMatchObject({
      verdict: 'pass',
    });
  });

  it('requires subject evidence as well as the new measurement and ignores superseded values and ticket numbers', async () => {
    const spacing = 'La spaziatura dei pannelli è di 9 px.';
    const correct = 'Il raggio delle etichette di stato è 9px.';
    const { before, after } = await calendar([spacing, correct].join('\n'));
    const instruction = 'Per il ticket 514 approvo il raggio delle etichette di stato da 2 px a 9 px.';
    const entry = getAgentDesignCandidate(before, after, { instructions: [instruction] })!;
    expect(entry.unchangedDecisionSources).toEqual(['DESIGN.md']);
    const wrong = vi.fn().mockResolvedValue(verdictWith('DESIGN.md', spacing));
    await expect(runAgentDesignReview(entry.reviewInput, wrong)).resolves.toMatchObject({ verdict: 'fail', findings: [expect.stringContaining('DESIGN.md')] });
    expect(wrong).toHaveBeenCalledTimes(2);
    const proper = vi.fn().mockResolvedValue(verdictWith('DESIGN.md', correct));
    await expect(runAgentDesignReview(entry.reviewInput, proper)).resolves.toMatchObject({ verdict: 'pass' });
    expect(proper).toHaveBeenCalledOnce();
  });

  it('accepts an already recorded correction without an empty edit and distinguishes approval from reuse', async () => {
    const rule = 'Il bordo arrotondato vale per tutte le schede.';
    const { before, after } = await calendar(rule);
    const candidate = (message: string, plan?: string) => getAgentDesignCandidate(before, after, { instructions: [message], plan })!;
    const approved = candidate('Approvo il bordo arrotondato per tutte le schede.');
    expect(approved.unchangedDecisionSources).toEqual(['DESIGN.md']);
    await expect(runAgentDesignReview(approved.reviewInput, vi.fn().mockResolvedValue(verdictWith('DESIGN.md', rule)))).resolves.toMatchObject({
      verdict: 'pass',
    });
    for (const text of [
      'Riutilizza il componente approvato nella nuova scheda.',
      'Non approvo il bordo arrotondato.',
      'Preferirei il bordo arrotondato, valuta se adottarlo.',
      'Approvo il piano.',
    ]) {
      expect(candidate(text).unchangedDecisionSources).toEqual([]);
    }
    expect(candidate('Approvo il piano.', 'Aggiornare il bordo del componente condiviso.').unchangedDecisionSources).toEqual(['DESIGN.md']);
    expect(candidate('Approvo il piano.', 'Creare una nuova vista e riutilizzare il componente condiviso esistente.').unchangedDecisionSources).toEqual([]);
  });

  it('grounds an inherited rule link in one relevant blueprint excerpt even when its baseline hash is unknown', async () => {
    await fs.mkdir(path.join(root, 'docs'));
    const blueprint = 'docs/blueprint.md';
    const rule = 'Tutti i calendari avanzano di 30 minuti.';
    await Promise.all([
      write('AGENTS.md', '[Blueprint e decisioni approvate](docs/blueprint.md)'),
      write(blueprint, 'Riferimento estraneo al calendario.\n'.repeat(8000) + rule + '\n' + 'Una coda di materiale generico.\n'.repeat(40)),
      write('docs/private-note.md', 'Testo estraneo non dichiarato.'),
    ]);
    const { before, after } = await calendar();
    expect(after.files).not.toHaveProperty('docs/private-note.md');
    const entry = getAgentDesignCandidate(before, after, correction, 'Regole già risolte.')!;
    expect(entry.unchangedDecisionSources).toEqual([blueprint]);
    const source = entry.reviewInput();
    expect(source.length).toBeLessThan(5000);
    expect(JSON.parse(source).decisionPersistence.sources[0].excerpts).toContain(rule);
    expect(source).not.toContain('coda di materiale');
    await expect(runAgentDesignReview(entry.reviewInput, vi.fn().mockResolvedValue(verdictWith(blueprint, rule)))).resolves.toMatchObject({ verdict: 'pass' });
    const legacy = { hashes: { 'Calendar.tsx': before.hashes['Calendar.tsx'] }, scope: before.scope };
    const resumed = getAgentDesignCandidate(legacy, after, correction)!;
    expect(JSON.parse(resumed.reviewInput()).decisionPersistence.sources[0].changedSinceBaseline).toBeNull();
    expect(resumed.unchangedDecisionSources).toEqual([]);
    await expect(runAgentDesignReview(resumed.reviewInput, vi.fn().mockResolvedValue('{"verdict":"pass","findings":[]}'))).resolves.toMatchObject({
      verdict: 'fail',
    });

    expect(getAgentDesignCandidate(before, after, request)!.reviewInput()).not.toContain(rule);
    await write('DESIGN.md', 'Le etichette sono brevi.');
    const twoSources = getAgentDesignCandidate(before, await readAgentDesignSnapshot(root), correction)!;
    await expect(runAgentDesignReview(twoSources.reviewInput, vi.fn().mockResolvedValue(verdictWith(blueprint, rule)))).resolves.toMatchObject({
      verdict: 'pass',
    });
    await fs.unlink(path.join(root, 'DESIGN.md'));
    await write('AGENTS.md', 'Usare i comandi del progetto.');
    const none = getAgentDesignCandidate(before, await readAgentDesignSnapshot(root), correction)!;
    expect(JSON.parse(none.reviewInput())).not.toHaveProperty('decisionPersistence');
    expect(none.unchangedDecisionSources).toEqual([]);
  });

  it('returns a structured rejection to the author without inviting a second verdict on the same candidate', async () => {
    const raw = JSON.stringify({
      verdict: 'fail',
      findings: [{ file: 'views/ledger.json', issue: 'La vista ha un raggio locale diverso dalla fonte.', correction: 'Usa il componente condiviso.' }],
      comparisons: [{ unexpected: true }],
    });
    const generate = vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce('{"verdict":"pass","findings":[]}');
    await expect(runAgentDesignReview(() => '{}', generate)).resolves.toEqual({
      verdict: 'fail',
      findings: ['views/ledger.json — La vista ha un raggio locale diverso dalla fonte. — Usa il componente condiviso.'],
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('keeps a rejected candidate pending when a formatting retry switches to pass', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce('{"verdict":"fail","findings":[{"unknown":"Non conforme"}]}')
      .mockResolvedValueOnce('{"verdict":"pass","findings":[]}');
    await expect(runAgentDesignReview(() => '{}', generate)).rejects.toThrow('ha cambiato il verdetto');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('admits a strict Designer verdict and rejects a malformed or contradictory result', () => {
    expect(parseAgentDesignReview('```json\n{"verdict":"pass","findings":[]}\n```')).toEqual({ verdict: 'pass', findings: [] });
    expect(() => parseAgentDesignReview('{"verdict":"pass","findings":["wrong label"]}')).toThrow();
    expect(() => parseAgentDesignReview('{"verdict":"fail","findings":[]}')).toThrow();
    expect(() => parseAgentDesignReview('done')).toThrow();
  });
});
