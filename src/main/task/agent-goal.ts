import fs from 'fs/promises';
import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { atomicWriteJsonFile } from '@/utils/atomic-write';

const status = z.enum(['active', 'paused', 'blocked', 'usage_limited', 'budget_limited', 'complete']);
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const goalSchema = z.object({
  id: z.string(),
  objective: z.string().trim().min(1).max(20_000),
  verifier: z.string().trim().min(1).max(4000).optional(),
  status,
  tokenBudget: positiveInteger.optional(),
  tokensUsed: z.number().int().nonnegative(),
  timeUsedMs: z.number().int().nonnegative(),
  blocker: z
    .object({
      condition: z.string(),
      turns: positiveInteger,
      lastTurnId: z.string(),
    })
    .optional(),
  evidence: z
    .object({
      turnId: z.string(),
      summary: z.string(),
      toolCallIds: z.array(z.string()),
    })
    .optional(),
  lastTurnId: z.string().optional(),
  originTurnId: z.string().optional(),
});

export type AgentGoal = z.infer<typeof goalSchema>;

export type CreateGoalInTurn = (objective: string, userAuthorization: string, tokenBudget?: number) => Promise<AgentGoalTurn>;

export type GoalVerification = { command: string; revision: string | undefined; generation: number };

export type AgentGoalTurn = {
  goal: AgentGoal;
  signal: AbortSignal;
  readGoal: () => Promise<AgentGoal | null>;
  getAvailableVerification: () => { toolCallId: string; command: string }[];
  onUsage: (tokens: number | undefined, countTime?: boolean) => Promise<boolean>;
  proposeCompletion: (summary: string, evidenceIds: string[]) => Promise<string>;
  commitCompletion: () => Promise<boolean>;
  reportBlocker: (condition: string) => Promise<AgentGoal>;
  canExecute: () => Promise<boolean>;
  beginVerification: (input: Record<string, unknown> | undefined) => Promise<GoalVerification | undefined>;
  continueVerification: (verification: GoalVerification) => GoalVerification;
  acceptToolResult: (id: string, verification: GoalVerification | undefined, output: unknown, stillCurrent?: () => boolean) => Promise<void>;
  reportUsageLimit: () => Promise<void>;
  reportTerminalError: () => Promise<void>;
  invalidateVerification: () => void;
};

export const agentGoalCommandPattern = /^\/goal(?:\s+([\s\S]*))?$/;

export const uncachedGoalTokens = (
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    inputTokenDetails?: { noCacheTokens?: number; cacheReadTokens?: number };
  },
  normalized?: { sentTokens: number; receivedTokens: number },
): number | undefined => {
  const count = (value: number | undefined) => (value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined);
  const cached = count(usage?.inputTokenDetails?.cacheReadTokens) ?? 0;
  const input = count(usage?.inputTokens);
  const output = count(usage?.outputTokens);
  const total = count(usage?.totalTokens);
  const explicitUncached = count(usage?.inputTokenDetails?.noCacheTokens);
  if (output !== undefined && (explicitUncached !== undefined || input !== undefined)) {
    const uncached = explicitUncached ?? count(normalized?.sentTokens) ?? Math.max(0, input! - cached);
    return count(uncached + output);
  }
  return total === undefined ? undefined : Math.max(0, total - cached);
};

export const newAgentGoal = (objective: string, tokenBudget?: number, verifier?: string): AgentGoal =>
  goalSchema.parse({
    id: randomUUID(),
    objective,
    tokenBudget,
    verifier,
    status: 'active',
    tokensUsed: 0,
    timeUsedMs: 0,
  });

export const describeAgentGoal = (goal: AgentGoal | null) =>
  goal
    ? {
        ...goal,
        remainingTokens: goal.tokenBudget === undefined ? null : Math.max(goal.tokenBudget - goal.tokensUsed, 0),
      }
    : null;

export class AgentGoalStore {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string) {}

  private async readDisk(): Promise<AgentGoal | null> {
    try {
      return goalSchema.nullable().parse(JSON.parse(await fs.readFile(this.file, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async read(): Promise<AgentGoal | null> {
    await this.pending;
    return this.readDisk();
  }

  mutate(update: (current: AgentGoal | null) => AgentGoal | null): Promise<AgentGoal | null> {
    const operation = this.pending.then(async () => {
      const current = await this.readDisk();
      const next = update(current);
      if (next !== current) {
        await atomicWriteJsonFile(this.file, goalSchema.nullable().parse(next));
      }
      return next;
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
}
