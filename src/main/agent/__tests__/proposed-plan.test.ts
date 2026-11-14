import { describe, expect, it } from 'vitest';

import { ProposedPlanParser, extractProposedPlan, planResponseText } from '../proposed-plan';

describe('Codex proposed plan stream', () => {
  it('separates native assistant text and the plan across split tag boundaries', () => {
    const parser = new ProposedPlanParser();
    const results = ['Intro\n<prop', 'osed_plan>\r\n- Step 1\r\n', '</proposed_', 'plan>\nOutro'].flatMap((chunk) => parser.push(chunk));
    results.push(...parser.finish());
    expect(
      results
        .filter(({ type }) => type === 'text')
        .map(({ text }) => text)
        .join(''),
    ).toBe('Intro\nOutro');
    expect(
      results
        .filter(({ type }) => type === 'plan')
        .map(({ text }) => text)
        .join(''),
    ).toBe('- Step 1\r\n');
    expect(results.map(({ type }) => type).filter((type) => type !== 'text' && type !== 'plan')).toEqual(['start', 'end']);
  });

  it('treats inline tags as ordinary text and uses the last standalone block', () => {
    expect(extractProposedPlan('Literal <proposed_plan> example')).toEqual({ text: 'Literal <proposed_plan> example', plan: undefined });
    expect(extractProposedPlan('<proposed_plan>\nA\n</proposed_plan>\n  <proposed_plan> \nB\n</proposed_plan>')).toEqual({ text: '', plan: 'B\n' });
  });

  it('accepts end-of-message only when the caller finalizes the assistant item', () => {
    const parser = new ProposedPlanParser();
    const partial = parser.push('<proposed_plan>\n- Final line');
    expect(partial.some(({ type }) => type === 'end')).toBe(false);
    expect(parser.finish()).toEqual([{ type: 'end', text: '' }]);
    expect(extractProposedPlan('<proposed_plan>\n- Final line').plan).toBe('- Final line');
  });

  it('projects a single exact plan from all text parts of the assistant item', () => {
    const item = [
      { type: 'text', text: 'Intro\n<proposed_plan>\n- Step 1\n' },
      { type: 'reasoning', text: 'Internal reasoning' },
      { type: 'text', text: '- Step 2\n</proposed_plan>\nOutro' },
    ];
    expect(extractProposedPlan(planResponseText(item))).toEqual({ text: 'Intro\nOutro', plan: '- Step 1\n- Step 2\n' });
  });
});
