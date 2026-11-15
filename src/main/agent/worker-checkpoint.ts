import { createHash, randomUUID } from 'node:crypto';

import type { ContextMessage, ContextUserMessage, Mode, PromptContext, ProposedPlan, Reasoning } from '@common/types';
import type { GoalVerificationCheckpoint, GoalVerificationUpdate } from '@/task/agent-goal';
import type { AgentDesignReview } from '@/task/agent-design-review';

import { goalVerificationCheckpointSchema } from '@/task/agent-goal';

export const WORKER_STOP = Symbol('explicit worker cancellation');

export class TurnSettingsMismatch extends Error {}

const canonicalInput = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalInput);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalInput(item)]),
    );
  }
  return value;
};

export const workerToolFingerprint = (name: string, input: Record<string, unknown> | undefined): string => {
  if (name === 'power---bash') {
    return createHash('sha256')
      .update(JSON.stringify([name, input?.command, input?.cwd ?? '.']))
      .digest('hex');
  }
  return createHash('sha256')
    .update(JSON.stringify([name, canonicalInput(input ?? {})]))
    .digest('hex');
};

export type WorkerProgress = {
  messages?: ContextMessage[];
  tool?: { id: string; name: string; processId?: string; fingerprint?: string };
  receipt?: WorkerToolReceipt;
  goalVerification?: GoalVerificationUpdate & { onSaved: () => void };
  modelSettings?: RecordedModelSettings;
};

export type RecordedModelSettings = { provider: string; model: string; reasoning: Reasoning | null; providerReasoningEffort?: string };

export type WorkerToolReceipt = { id: string; name: string; fingerprint: string; input: string; output: string };

export type WorkerRecord = {
  profileId: string;
  messages: ContextMessage[];
  directory?: string;
  state?: 'running' | 'success' | 'cancelled' | 'error';
  pendingTools?: NonNullable<WorkerProgress['tool']>[];
  epoch?: string;
  turnId?: string;
  unmergedReceipts?: WorkerToolReceipt[];
  modelSettings?: RecordedModelSettings;
};

export type RootTurnRecord = WorkerRecord & {
  turnId: string;
  directory: string;
  provider: string;
  model: string;
  mode?: Mode;
  goalId?: string;
  goalVerification?: GoalVerificationCheckpoint;
  approvedPlan?: ProposedPlan;
  designReview?: AgentDesignReview;
  completedShellFingerprints?: string[];
  pendingSteering?: ContextUserMessage[];
};

export const hasSteeringToRecover = (record: RootTurnRecord | undefined): boolean => {
  if (!record || record.state !== 'running') {
    return false;
  }
  const last = record.messages.at(-1);
  return Boolean(record.pendingSteering?.length || (last?.role === 'user' && last.promptContext?.id === record.turnId && last.id !== record.turnId));
};

export const rememberGoalVerification = (record: RootTurnRecord, update: GoalVerificationUpdate | undefined): boolean => {
  if (!update || !update.isCurrent() || record.goalId !== update.goalId || record.pendingSteering?.length) {
    return false;
  }
  const saved = goalVerificationCheckpointSchema.safeParse(record.goalVerification);
  const receipts = saved.success && saved.data.binding === update.binding ? saved.data.receipts : [];
  record.goalVerification = {
    binding: update.binding,
    receipts: update.receipt
      ? [...receipts.filter(({ toolCallId }) => toolCallId !== update.receipt?.toolCallId), update.receipt]
      : receipts.filter(({ command }) => command !== update.command),
  };
  return true;
};

export const createRecordedInput = (prompt: string, images: string[] | undefined, promptContext: PromptContext): ContextUserMessage => ({
  id: promptContext.id,
  role: 'user',
  content: images?.length
    ? [
        { type: 'text', text: prompt },
        ...images.map((dataUrl) => {
          const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
          return { type: 'file' as const, data: match ? match[2] : dataUrl, mediaType: match ? match[1] : 'image/png' };
        }),
      ]
    : prompt,
  promptContext,
  timestamp: Date.now(),
});

export const recoveredTurnHistory = (record: WorkerRecord): ContextMessage[] => {
  const mergedIds = new Set(record.messages.flatMap((message) => (message.role === 'tool' ? message.content.map((part) => part.toolCallId) : [])));
  const receipts = (record.unmergedReceipts ?? []).filter((receipt) => !mergedIds.has(receipt.id));
  if (!receipts.length) {
    return record.messages;
  }
  return [
    ...record.messages,
    {
      id: randomUUID(),
      role: 'assistant',
      content: receipts.map((receipt) => ({ type: 'tool-call', toolCallId: receipt.id, toolName: receipt.name, input: JSON.parse(receipt.input) })),
    },
    {
      id: randomUUID(),
      role: 'tool',
      content: receipts.map((receipt) => ({
        type: 'tool-result',
        toolCallId: receipt.id,
        toolName: receipt.name,
        output: { type: 'text', value: receipt.output },
      })),
    },
  ];
};

export const describeInterruptedTools = (record: WorkerRecord): string => {
  const tools = (record.pendingTools ?? []).filter(({ id, name }) => /^[\w.:-]{1,180}$/.test(id) && /^[\w.:-]{1,180}$/.test(name));
  if (!tools.length) {
    return 'No interrupted operation was identified in this checkpoint.';
  }
  const entries = tools.slice(0, 24).map(({ id, name }) => ({ callId: id, tool: name, outcome: 'unknown' }));
  return `The checkpoint lists these interrupted operations with unknown effects: ${JSON.stringify(entries)}${tools.length > entries.length ? ` (${tools.length - entries.length} additional operations)` : ''}.`;
};

export const reconcileTurnProgress = (record: WorkerRecord, progress: WorkerProgress): void => {
  if (progress.modelSettings) {
    record.modelSettings = progress.modelSettings;
  }
  const pending = (record.pendingTools ??= []);
  const receipts = (record.unmergedReceipts ??= []);
  if (progress.tool && !pending.some(({ id }) => id === progress.tool?.id)) {
    pending.push(progress.tool);
  }
  if (progress.receipt) {
    const receipt = progress.receipt;
    record.pendingTools = pending.filter(({ id }) => id !== receipt.id);
    if (!receipts.some(({ id }) => id === receipt.id)) {
      receipts.push(receipt);
    }
  }
  if (progress.messages) {
    record.messages = progress.messages;
    const results = progress.messages.flatMap((message) => (message.role === 'tool' ? message.content : []));
    const calls = progress.messages.flatMap((message) => (message.role === 'assistant' && Array.isArray(message.content) ? message.content : []));
    for (const result of results) {
      record.unmergedReceipts = record.unmergedReceipts!.filter((receipt) => receipt.id !== result.toolCallId);
      const output = result.output.type === 'json' ? (result.output.value as { exitCode?: number | null; processId?: string } | null) : null;
      const operation = record.pendingTools!.find(({ id }) => id === result.toolCallId);
      if (operation && output?.exitCode === null && output.processId) {
        operation.processId = output.processId;
        continue;
      }
      const call = calls.find((part) => part.type === 'tool-call' && part.toolCallId === result.toolCallId);
      const processId =
        call?.type === 'tool-call' && call.toolName === 'power---bash_poll' && typeof output?.exitCode === 'number'
          ? (call.input as { processId?: string })?.processId
          : undefined;
      record.pendingTools = record.pendingTools!.filter((item) => item.id !== result.toolCallId && (!processId || item.processId !== processId));
    }
  }
};

export const rememberCompletedShell = (record: RootTurnRecord, receipt: WorkerToolReceipt | undefined): void => {
  if (!receipt) {
    return;
  }
  const fingerprint =
    receipt.name === 'power---bash'
      ? receipt.fingerprint
      : receipt.name === 'power---bash_poll'
        ? record.pendingTools?.find((tool) => tool.processId && tool.processId === (JSON.parse(receipt.input) as { processId?: string }).processId)?.fingerprint
        : undefined;
  if (fingerprint && !(record.completedShellFingerprints ??= []).includes(fingerprint)) {
    record.completedShellFingerprints.push(fingerprint);
  }
};
