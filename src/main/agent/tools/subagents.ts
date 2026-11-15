import { randomUUID } from 'node:crypto';
import { clearTimeout as clearWaitTimer, setTimeout as setWaitTimer } from 'node:timers';

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { AgentProfile, ContextMessage, InvocationMode, SettingsData, ToolApprovalState } from '@common/types';
import { getSubagentId } from '@common/agent';
import { SUBAGENTS_TOOL_GROUP_NAME, SUBAGENTS_TOOL_RUN_TASK, TOOL_GROUP_NAME_SEPARATOR } from '@common/tools';

import type { WorkerProgress, WorkerRecord, WorkerToolReceipt } from '@/agent/worker-checkpoint';
import type { AgentGoalUsage } from '@/task/agent-goal';

import { describeInterruptedTools, recoveredTurnHistory, reconcileTurnProgress, WORKER_STOP } from '@/agent/worker-checkpoint';
import { AgentProfileManager } from '@/agent/agent-profile-manager';
import { findEnabledSubagent, getEnabledSubagents, runSubagentTask, type RunSubagentTaskResult } from '@/agent/subagent';
import { Task } from '@/task';

type BackgroundWorker = {
  subagentId: string;
  controller: AbortController;
  completion: Promise<RunSubagentTaskResult>;
  mailbox: string[];
  settled: boolean;
  waiters: Set<() => void>;
};

const waitTaskInput = z.object({
  workerId: z.string().uuid().optional().describe('Use for a single worker result.'),
  workerIds: z.array(z.string().uuid()).min(1).max(8).optional().describe('Use to collect the first available results across multiple workers.'),
  timeoutMs: z.number().int().min(1).max(60000).optional(),
});

const waitForWorkerSettlement = async (workers: readonly BackgroundWorker[], timeoutMs: number, signal: AbortSignal): Promise<boolean> => {
  signal.throwIfAborted();
  let cleanup = () => {};
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const wake = () => resolve(true);
      const onAbort = () => reject(signal.reason);
      const timer = setWaitTimer(() => resolve(false), timeoutMs);
      signal.addEventListener('abort', onAbort, { once: true });
      for (const worker of workers) {
        worker.waiters.add(wake);
      }
      cleanup = () => {
        clearWaitTimer(timer);
        signal.removeEventListener('abort', onAbort);
        for (const worker of workers) {
          worker.waiters.delete(wake);
        }
      };
    });
  } finally {
    cleanup();
  }
};

export const createSubagentsToolset = async (
  _settings: SettingsData,
  task: Task,
  agentProfileManager: AgentProfileManager,
  mainAgentProfile: AgentProfile,
  abortSignal?: AbortSignal,
  contextMessages: ContextMessage[] = [],
  currentMessages: ContextMessage[] = [],
  onGoalUsage?: AgentGoalUsage,
): Promise<ToolSet> => {
  const allProfiles = agentProfileManager.getProjectProfiles(task.project);
  const enabledSubagents = getEnabledSubagents(allProfiles, mainAgentProfile);
  const epoch = task.workerEpoch?.();
  const hasCurrentContext = () => task.workerEpoch?.() === epoch;
  const workers = new Map<string, BackgroundWorker>();
  const waitToolName = `${SUBAGENTS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}wait_task`;
  const startBackground = async (
    workerId: string,
    targetSubagent: AgentProfile,
    prompt: string | null,
    params: Partial<Parameters<typeof runSubagentTask>[0]> = {},
    pendingTools: WorkerRecord['pendingTools'] = [],
    unmergedReceipts: WorkerToolReceipt[] = [],
  ) => {
    if (!hasCurrentContext()) {
      return { error: 'The task context has been cleared.' };
    }
    if (workers.has(workerId) || workers.size >= 8) {
      return { error: 'Collect pending worker results before starting more workers.' };
    }
    if (!task.claimWorkerTurn(workerId)) {
      return { error: 'This worker is already running or the task is closing.' };
    }
    const controller = new AbortController();
    const signal = abortSignal ? AbortSignal.any([abortSignal, controller.signal]) : controller.signal;
    const mailbox: string[] = [];
    const turnId = params.turnId ?? randomUUID();
    const record: WorkerRecord = {
      profileId: targetSubagent.id,
      directory: task.getTaskDir(),
      epoch,
      state: 'running',
      turnId,
      modelSettings: params.recoveredModelSettings,
      messages: [...(params.workerHistory ?? []), ...(prompt === null ? [] : [{ id: turnId, role: 'user' as const, content: prompt }])],
      pendingTools: [...pendingTools],
      unmergedReceipts: [...unmergedReceipts],
    };
    let write = Promise.resolve();
    const update = (progress: WorkerProgress) => {
      write = write.then(async () => {
        reconcileTurnProgress(record, progress);
        await task.saveWorkerHistory(workerId, record);
      });
      return write;
    };
    const ready = update({});
    const completion = ready.then(async (): Promise<RunSubagentTaskResult> => {
      signal.throwIfAborted();
      const result = await runSubagentTask({
        ...params,
        task,
        targetSubagent,
        prompt,
        turnId,
        abortSignal: signal,
        takeSteering: () => mailbox.splice(0),
        onProgress: update,
        onGoalUsage,
      });
      await write;
      if (result.status === 'success') {
        record.state = 'success';
        record.messages = result.messages;
        const mergedIds = new Set(result.messages.flatMap((message) => (message.role === 'tool' ? message.content.map((part) => part.toolCallId) : [])));
        record.unmergedReceipts = record.unmergedReceipts!.filter((receipt) => !mergedIds.has(receipt.id));
      } else {
        record.state =
          result.status === 'error' ? (result.recoverable ? 'running' : 'error') : result.explicitStop || controller.signal.aborted ? 'cancelled' : 'running';
      }
      await task.saveWorkerHistory(workerId, record);
      return result;
    });
    const worker: BackgroundWorker = { subagentId: getSubagentId(targetSubagent), controller, completion, mailbox, settled: false, waiters: new Set() };
    workers.set(workerId, worker);
    const settled = () => {
      worker.settled = true;
      task.releaseWorkerTurn(workerId);
      for (const wake of worker.waiters) {
        wake();
      }
      worker.waiters.clear();
    };
    void completion.then(settled, settled);
    task.trackWorkerRun(completion);
    try {
      await ready;
    } catch (error) {
      workers.delete(workerId);
      throw error;
    }
    return { workerId, status: 'running', ...(prompt === null ? { turnId } : {}) };
  };

  const generateSubagentsRunTaskDescription = (): string => {
    const automaticSubagents = enabledSubagents.filter((agentProfile) => agentProfile.subagent.invocationMode === InvocationMode.Automatic);
    const onDemandSubagents = enabledSubagents.filter((agentProfile) => agentProfile.subagent.invocationMode === InvocationMode.OnDemand);

    let description = 'Delegates a specific task to a subagent. You have access to the following subagents:\n';

    if (automaticSubagents.length > 0) {
      description += '\n<automatic-subagents>\n';
      for (const subagent of automaticSubagents) {
        description += `  <subagent>\n    <id>${getSubagentId(subagent)}</id>\n    <name>${subagent.name}</name>\n    <description>${subagent.subagent.description}</description>\n  </subagent>\n`;
      }
      description += '</automatic-subagents>\n';
    }

    if (onDemandSubagents.length > 0) {
      description += '\n<on-demand-subagents>\n';
      for (const subagent of onDemandSubagents) {
        description += `  <subagent>\n    <id>${getSubagentId(subagent)}</id>\n    <name>${subagent.name}</name>\n  </subagent>\n`;
      }
      description += '</on-demand-subagents>\n';
    }

    description +=
      '\nWhen user asks to use subagent by name, find the most fitting one by the name. The subagent is responsible for its own deep context gathering if needed, you are expected to only provide `prompt`.';

    return description;
  };

  const runTaskTool = tool({
    description: generateSubagentsRunTaskDescription(),
    inputSchema: z.object({
      subagentId: z.string().describe('The ID of the specific subagent to use.'),
      background: z.boolean().optional().describe('Return a worker ID immediately. Use wait_task to collect the result before finishing.'),
      prompt: z
        .string()
        .describe(
          'A clear and concise natural language prompt describing the task the subagent needs to perform. This prompt should provide all necessary information for the subagent to complete its task independently within its limited context.',
        ),
      description: z
        .string()
        .optional()
        .describe(
          'A short informational message describing what the subagent is doing, in continuous present tense (e.g., "Fixing the login bug"). This will be shown to the user while the subagent is working.',
        ),
    }),
    execute: async (input, { toolCallId }) => {
      const { prompt, subagentId, description } = input;
      const targetSubagent = findEnabledSubagent(enabledSubagents, subagentId);
      if (!targetSubagent) {
        return `Error: Subagent with ID '${subagentId}' not found or not enabled.`;
      }
      abortSignal?.throwIfAborted();
      if (input.background && workers.size >= 8) {
        return { error: 'Collect pending results with wait_task before starting more workers.' };
      }
      const params: Partial<Parameters<typeof runSubagentTask>[0]> = {
        description,
        contextMessages,
        currentMessages,
        onStarted: (promptContext) => {
          task.addToolMessage(
            toolCallId,
            SUBAGENTS_TOOL_GROUP_NAME,
            SUBAGENTS_TOOL_RUN_TASK,
            {
              prompt,
              subagentId,
              description,
            },
            undefined,
            undefined,
            promptContext,
          );
        },
      };
      if (input.background) {
        return startBackground(randomUUID(), targetSubagent, prompt, params);
      }
      const result = await runSubagentTask({ ...params, task, targetSubagent, prompt, abortSignal, onGoalUsage });

      if (result.status === 'cancelled') {
        return {
          messages: result.messages,
          promptContext: result.promptContext,
          cancelled: true,
        };
      }

      if (result.status === 'error') {
        return {
          error: result.error,
          promptContext: result.promptContext,
        };
      }

      return {
        messages: result.messages,
        promptContext: result.promptContext,
      };
    },
  });

  const toolSet: ToolSet = {};
  const readStoredWorkerResult = async (workerId: string) => {
    const saved = await task.readWorkerHistory(workerId);
    const profile = enabledSubagents.find(({ id }) => id === saved?.profileId);
    if (!saved || !profile || (saved.directory && saved.directory !== task.getTaskDir())) {
      return { workerId, status: 'not_found' as const, error: 'Worker unavailable in this agent run.' };
    }
    return {
      workerId,
      subagentId: getSubagentId(profile),
      status: saved.state === 'running' ? ('interrupted' as const) : (saved.state ?? 'success'),
      messages: saved.messages,
      turnId: saved.turnId,
      pendingTools: saved.pendingTools,
      unmergedReceipts: saved.unmergedReceipts,
    };
  };

  if (
    enabledSubagents.length > 0 &&
    mainAgentProfile.toolApprovals?.[`${SUBAGENTS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}${SUBAGENTS_TOOL_RUN_TASK}`] !== ToolApprovalState.Never
  ) {
    toolSet[`${SUBAGENTS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}${SUBAGENTS_TOOL_RUN_TASK}`] = runTaskTool;
    toolSet[waitToolName] = tool<z.infer<typeof waitTaskInput>, unknown, Record<string, unknown>>({
      description:
        'Collect one background worker with workerId, or wait for the first final result from workerIds. A batch returns the results already available by worker ID, or an empty status on timeout. Workers that are still running remain available.',
      inputSchema: waitTaskInput,
      execute: async ({ workerId, workerIds, timeoutMs }, options) => {
        if (!hasCurrentContext()) {
          return { error: 'The task context has been cleared.' };
        }
        const ids = workerId ? [workerId] : workerIds;
        if (!ids?.length || (workerId && workerIds !== undefined)) {
          return { error: 'Supply workerId or a non-empty workerIds list.' };
        }
        const signals = [abortSignal, options?.abortSignal].filter((signal): signal is AbortSignal => signal !== undefined);
        const signal = AbortSignal.any(signals);
        signal.throwIfAborted();
        const selected = [...new Set(ids)].map((id) => ({ id, worker: workers.get(id) }));
        const savedSnapshots = await Promise.all(selected.filter(({ worker }) => !worker).map(({ id }) => readStoredWorkerResult(id)));
        signal.throwIfAborted();
        if (!hasCurrentContext()) {
          return { error: 'The task context has been cleared.' };
        }
        const active = selected.flatMap(({ id, worker }) => {
          const observedWorker = worker ?? workers.get(id);
          return observedWorker ? [{ id, worker: observedWorker }] : [];
        });
        const activeIds = new Set(active.map(({ id }) => id));
        const saved = savedSnapshots.filter((result) => !activeIds.has(result.workerId));
        if (!saved.length && !active.some(({ worker }) => worker.settled)) {
          const settled = await waitForWorkerSettlement(
            active.map(({ worker }) => worker),
            timeoutMs ?? (workerId ? 10000 : 30000),
            signal,
          );
          signal.throwIfAborted();
          if (!hasCurrentContext()) {
            return { error: 'The task context has been cleared.' };
          }
          if (!settled) {
            return workerId ? { workerId, status: 'running' } : { status: {}, timedOut: true };
          }
        }
        const completed = active.filter(({ worker }) => worker.settled);
        const liveResults = await Promise.all(
          completed.map(async ({ id, worker }) => {
            try {
              return { workerId: id, subagentId: worker.subagentId, ...(await worker.completion) };
            } catch (error) {
              if (workerId) {
                throw error;
              }
              return { workerId: id, subagentId: worker.subagentId, status: 'error' as const, error: error instanceof Error ? error.message : String(error) };
            }
          }),
        );
        signal.throwIfAborted();
        if (!hasCurrentContext()) {
          return { error: 'The task context has been cleared.' };
        }
        for (const { id, worker } of completed) {
          if (workers.get(id) === worker) {
            workers.delete(id);
          }
        }
        const results = [...saved, ...liveResults];
        if (workerId) {
          const result = results[0];
          return result.status === 'not_found' ? { error: result.error } : result;
        }
        return { status: Object.fromEntries(results.map((result) => [result.workerId, result])), timedOut: false };
      },
    });
    toolSet[`${SUBAGENTS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}list_workers`] = tool({
      description: 'List workers owned by this task, including interrupted workers that can be recovered by ID.',
      inputSchema: z.object({}),
      execute: async () =>
        (await task.listWorkerHistory()).flatMap(({ workerId, record }) => {
          const profile = enabledSubagents.find(({ id }) => id === record.profileId);
          if (!profile || (record.directory && record.directory !== task.getTaskDir())) {
            return [];
          }
          const status = record.state === 'running' && !workers.has(workerId) ? 'interrupted' : (record.state ?? 'success');
          return [{ workerId, subagentId: getSubagentId(profile), status, turnId: record.turnId }];
        }),
    });
    toolSet[`${SUBAGENTS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}resume_task`] = tool({
      description:
        'Resume an interrupted worker turn with its original context and turn ID. No new worker prompt is added. Use wait_task to collect the result.',
      inputSchema: z.object({ workerId: z.string().uuid() }),
      execute: async ({ workerId }) => {
        abortSignal?.throwIfAborted();
        if (!hasCurrentContext() || workers.has(workerId)) {
          return { error: 'This worker is not available for recovery.' };
        }
        const stored = await task.readWorkerHistory(workerId);
        const targetSubagent = enabledSubagents.find(({ id }) => id === stored?.profileId);
        if (!stored || !targetSubagent || stored.state !== 'running' || (stored.directory && stored.directory !== task.getTaskDir())) {
          return { error: 'No interrupted worker turn in this task and checkout.' };
        }
        // Legacy checkpoints have no separate turn ID. Steering messages do not carry a prompt context.
        const turnId = stored.turnId ?? stored.messages.findLast((message) => message.role === 'user' && message.promptContext?.id === message.id)?.id;
        if (!turnId) {
          return { error: 'This worker checkpoint has no recoverable turn ID.' };
        }
        abortSignal?.throwIfAborted();
        const recoveryInstructions = `Resume the saved worker turn from its existing messages. ${describeInterruptedTools(stored)} Inspect current state with read-only checks before editing. Do not replay an interrupted command blindly.`;
        const interruptedToolFingerprints = new Set(
          [...(stored.pendingTools ?? []), ...(stored.unmergedReceipts ?? [])].flatMap(({ fingerprint }) => (fingerprint ? [fingerprint] : [])),
        );
        return startBackground(
          workerId,
          targetSubagent,
          null,
          {
            workerHistory: recoveredTurnHistory(stored),
            turnId,
            recoveryInstructions,
            interruptedToolFingerprints,
            recoveredModelSettings: stored.modelSettings,
          },
          stored.pendingTools,
          stored.unmergedReceipts,
        );
      },
    });
    toolSet[`${SUBAGENTS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}followup_task`] = tool({
      description: 'Continue a completed or interrupted worker using its saved conversation. Returns the same worker ID.',
      inputSchema: z.object({ workerId: z.string().uuid(), prompt: z.string().min(1).max(10000) }),
      execute: async ({ workerId, prompt }) => {
        abortSignal?.throwIfAborted();
        if (workers.has(workerId) || workers.size >= 8) {
          return { error: 'Collect pending worker results before following up.' };
        }
        const stored = await task.readWorkerHistory(workerId);
        if (stored?.state === 'cancelled' || stored?.state === 'error') {
          return { error: 'This worker ended unsuccessfully. Start a new worker for a new attempt.' };
        }
        if (stored?.directory && stored.directory !== task.getTaskDir()) {
          return { error: 'Worker belongs to a different checkout.' };
        }
        const previous =
          stored || task.workerEpoch?.()
            ? undefined
            : [...contextMessages, ...currentMessages]
                .flatMap((message) => (message.role === 'tool' ? message.content : []))
                .filter((part) => part.type === 'tool-result' && part.toolName === waitToolName && part.output.type === 'json')
                .map((part) => (part.output as { value?: { workerId?: string; subagentId?: string; status?: string; messages?: ContextMessage[] } }).value)
                .findLast((value) => value?.workerId === workerId && value?.status !== 'running');
        const targetSubagent = stored
          ? enabledSubagents.find(({ id }) => id === stored.profileId)
          : previous?.subagentId && findEnabledSubagent(enabledSubagents, previous.subagentId);
        const history = stored ? recoveredTurnHistory(stored) : previous?.status === 'success' ? previous.messages : undefined;
        if (!targetSubagent || !Array.isArray(history)) {
          return { error: 'No completed result for this worker in the task context.' };
        }
        abortSignal?.throwIfAborted();
        if (workers.has(workerId) || workers.size >= 8) {
          return { error: 'Collect pending worker results before following up.' };
        }
        const unfinished = stored?.state === 'running' || Boolean(stored?.pendingTools?.length);
        const recovery = unfinished
          ? `\n\nThe previous worker run was interrupted. ${describeInterruptedTools(stored!)} Reconcile the workspace using read-only checks before making changes. Never replay an interrupted command blindly.`
          : '';
        const interruptedToolFingerprints = new Set(
          [...(stored?.pendingTools ?? []), ...(stored?.unmergedReceipts ?? [])].flatMap(({ fingerprint }) => (fingerprint ? [fingerprint] : [])),
        );
        return startBackground(
          workerId,
          targetSubagent,
          prompt + recovery,
          { workerHistory: history, interruptedToolFingerprints },
          stored?.pendingTools,
          stored?.unmergedReceipts,
        );
      },
    });
    toolSet[`${SUBAGENTS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}send_message`] = tool({
      description: 'Send instructions to a running worker at its next model step. Use followup_task for a completed worker.',
      inputSchema: z.object({ workerId: z.string().uuid(), message: z.string().min(1).max(10000) }),
      execute: async ({ workerId, message }) => {
        if (!hasCurrentContext()) {
          return { error: 'The task context has been cleared.' };
        }
        const worker = workers.get(workerId);
        if (!worker || worker.settled || worker.controller.signal.aborted) {
          return { error: 'Worker is not running in this agent run.' };
        }
        if (worker.mailbox.length >= 8) {
          return { error: 'Worker already has pending messages.' };
        }
        worker.mailbox.push(message);
        return { workerId, status: 'queued' };
      },
    });
    toolSet[`${SUBAGENTS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}interrupt_task`] = tool({
      description: 'Request cancellation of a background subagent in this run. Use wait_task to collect the final status.',
      inputSchema: z.object({ workerId: z.string().uuid() }),
      execute: async ({ workerId }) => {
        if (!hasCurrentContext()) {
          return { error: 'The task context has been cleared.' };
        }
        const worker = workers.get(workerId);
        if (!worker) {
          return { error: 'Worker unavailable in this agent run.' };
        }
        worker.controller.abort(WORKER_STOP);
        return { workerId, status: 'cancellation-requested' };
      },
    });
  }

  return toolSet;
};
