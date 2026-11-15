import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getAgentDesignCandidate, legacyDesignTouches, parseAgentDesignReview, readAgentDesignSnapshot } from '../agent-design-review';

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

  it('admits a strict Designer verdict and rejects a malformed or contradictory result', () => {
    expect(parseAgentDesignReview('```json\n{"verdict":"pass","findings":[]}\n```')).toEqual({ verdict: 'pass', findings: [] });
    expect(() => parseAgentDesignReview('{"verdict":"pass","findings":["wrong label"]}')).toThrow();
    expect(() => parseAgentDesignReview('{"verdict":"fail","findings":[]}')).toThrow();
    expect(() => parseAgentDesignReview('done')).toThrow();
  });
});
