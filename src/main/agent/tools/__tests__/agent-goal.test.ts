import { asSchema } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { createAgentGoalTools, matchesGoalVerificationRead } from '../agent-goal';

import type { AgentGoalTurn } from '@/task/agent-goal';

describe('provider-neutral goal update tool', () => {
  const execution = { toolCallId: 'update', messages: [], context: {} };

  it('recognizes only reads that returned the latest real receipt for the same active goal', () => {
    const goal = { id: 'active', objective: 'Verify the change', verifier: 'npm test', status: 'active', tokensUsed: 0, timeUsedMs: 0 } as const;
    const receipt = { toolCallId: 'native', command: 'npm test' };
    expect(matchesGoalVerificationRead({ error: 'Goal changed' }, goal, ['native'])).toBe(false);
    expect(matchesGoalVerificationRead({ goal: { ...goal, id: 'old' }, availableVerification: [receipt] }, goal, ['native'])).toBe(false);
    expect(matchesGoalVerificationRead({ goal, availableVerification: [] }, goal, ['native'])).toBe(false);
    expect(matchesGoalVerificationRead({ goal, availableVerification: [receipt] }, goal, ['native'])).toBe(true);
  });

  it('publishes an object schema with an explicit status enum', async () => {
    const schema = await asSchema(createAgentGoalTools(() => undefined).update_goal.inputSchema).jsonSchema;
    expect(schema).toMatchObject({ type: 'object', required: ['status'], properties: { status: { enum: ['complete', 'blocked'] } } });
    expect(schema).not.toHaveProperty('oneOf');
  });

  it('requires native verification before accepting completion', async () => {
    const proposeCompletion = vi.fn().mockResolvedValue('Recorded');
    const turn = { proposeCompletion } as unknown as AgentGoalTurn;
    const update = createAgentGoalTools(() => turn).update_goal.execute!;
    await expect(update({ status: 'complete', summary: 'Done' }, execution)).rejects.toThrow('native verification');
    expect(proposeCompletion).not.toHaveBeenCalled();
    await expect(update({ status: 'complete', summary: 'Verified', evidenceIds: ['native-receipt'] }, execution)).resolves.toBe('Recorded');
    expect(proposeCompletion).toHaveBeenCalledWith('Verified', ['native-receipt']);
  });
});
