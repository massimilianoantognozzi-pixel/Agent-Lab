import { describe, expect, it } from 'vitest';

import { uncachedGoalTokens } from '../agent-goal';

describe('goal token usage', () => {
  it('excludes cached input and keeps real zero uncached tokens', () => {
    expect(uncachedGoalTokens({ inputTokens: 100, outputTokens: 5, totalTokens: 105, inputTokenDetails: { cacheReadTokens: 90 } })).toBe(15);
    expect(uncachedGoalTokens({ inputTokens: 100, outputTokens: 5, totalTokens: 105, inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 100 } })).toBe(5);
  });

  it('distinguishes unreported token usage and counts a total-only adapter once', () => {
    expect(uncachedGoalTokens(undefined)).toBeUndefined();
    expect(uncachedGoalTokens({ totalTokens: 12 })).toBe(12);
    expect(uncachedGoalTokens({ inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it('treats invalid counters as unavailable without reversing accrued usage', () => {
    expect(uncachedGoalTokens({ outputTokens: -8, totalTokens: NaN })).toBeUndefined();
    expect(uncachedGoalTokens({ inputTokens: 4.2, outputTokens: 1, totalTokens: 8, inputTokenDetails: { cacheReadTokens: -2 } })).toBe(8);
    expect(uncachedGoalTokens({ inputTokens: 15, outputTokens: 2, inputTokenDetails: { noCacheTokens: Infinity, cacheReadTokens: 5 } })).toBe(12);
  });
});
