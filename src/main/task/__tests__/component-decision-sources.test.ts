import { describe, expect, it } from 'vitest';

import { componentDecisionReferences } from '../component-decision-sources';

describe('component decision references', () => {
  it.each(['AGENTS.md', 'AGENTS.override.md', 'DESIGN.md'])('reads explicit local decision sources from %s in declaration order', (owner) => {
    const available = new Set(['docs/blueprints/InitialPlan.md', 'docs/UI/Design Decisions.md', 'docs/UI/report.md']);
    const content = [
      '- [Blueprint e decisioni approvate](docs/blueprints/InitialPlan.md#componenti)',
      '    - [Design decisions](<docs/UI/Design Decisions.md#filters> "Approved choices")',
      '- [`BLUEPRINT`](docs/blueprints/InitialPlan.md#modali)',
      '- [Verifiche](docs/UI/report.md)',
    ].join('\n');
    expect(componentDecisionReferences(owner, content, available)).toEqual(['docs/blueprints/InitialPlan.md', 'docs/UI/Design Decisions.md']);
  });

  it('resolves from the owner, respects authorized spelling and strips anchors', () => {
    const available = new Set(['modules/UI/docs/Spec (v2).md', 'modules/Shared/Decision Sheet.md', 'docs/Spec (v2).md', 'modules/UI/docs/OnlyCase.md']);
    const content = [
      '[Design](./docs/Spec%20(v2).md#buttons)',
      '[Decisioni](../Shared/Decision%20Sheet.md)',
      '[Design](docs/onlycase.md)',
      '[Blueprint](#notes)',
      '[Blueprint](docs/missing.md)',
    ].join('\n');
    expect(componentDecisionReferences('modules/UI/AGENTS.override.md', content, available)).toEqual([
      'modules/UI/docs/Spec (v2).md',
      'modules/Shared/Decision Sheet.md',
    ]);
  });

  it('ignores historical decisions, outcomes and generic links even when their targets are available', () => {
    const available = new Set(['docs/archive/design.md', 'docs/esiti/blueprint.md', 'docs/real.md']);
    const content = [
      '[Design](docs/archive/design.md)',
      '[Blueprint](docs/esiti/blueprint.md)',
      '[Decisioni passate](docs/real.md)',
      '[Test](docs/real.md)',
      '[Test del blueprint](docs/real.md)',
      '![Design](docs/real.md)',
      '`[Blueprint](docs/real.md)`',
      '<!-- [Design](docs/real.md) -->',
      '~~~md',
      '[Decisioni](docs/real.md)',
      '~~~',
      '## Storico',
      '### Esempi',
      '[Blueprint](docs/real.md)',
    ].join('\n');
    expect(componentDecisionReferences('DESIGN.md', content, available)).toEqual([]);
    expect(componentDecisionReferences('archive/DESIGN.md', '[Design](../docs/real.md)', available)).toEqual([]);
    expect(componentDecisionReferences('DESIGN.md', content + '\n## Decisioni attuali\n[Design](docs/real.md)', available)).toEqual(['docs/real.md']);
  });

  it('rejects non-documents, external targets, absolute paths, broken URL escaping and escapes from the snapshot', () => {
    const targets = [
      '../../escape.md',
      '/absolute.md',
      '//host/a.md',
      'C:/a.md',
      'https://example.invalid/a.md',
      'file:///a.md',
      '../%2e%2e/escape.md',
      '%2Fabsolute.md',
      'a%5Cb.md',
      'bad%20%.md',
      'local.md?rev=1',
      'guide.svg',
      '~/local.md',
    ];
    const available = new Set([...targets, 'escape.md', 'absolute.md', 'a/b.md', 'module/local.md']);
    const content = targets.map((target) => '[Blueprint](' + target + ')').join('\n');
    expect(componentDecisionReferences('module/AGENTS.md', content, available)).toEqual([]);
    for (const owner of ['module/README.md', '/module/AGENTS.md', 'C:\\module\\DESIGN.md', '../AGENTS.md']) {
      expect(componentDecisionReferences(owner, '[Design](local.md)', available)).toEqual([]);
    }
  });
});
