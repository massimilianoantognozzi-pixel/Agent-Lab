import { randomUUID } from 'node:crypto';
import { clearTimeout as clearWaitTimer, setTimeout as setWaitTimer } from 'node:timers';

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { AgentProfile, ContextMessage, InvocationMode, SettingsData } from '@common/types';
import { getSubagentId } from '@common/agent';
import { SUBAGENTS_TOOL_GROUP_NAME, SUBAGENTS_TOOL_RUN_TASK, TOOL_GROUP_NAME_SEPARATOR } from '@common/tools';

import { AgentProfileManager } from '@/agent/agent-profile-manager';
import { findEnabledSubagent, getEnabledSubagents, runSubagentTask, type RunSubagentTaskResult } from '@/agent/subagent';
import { Task } from '@/task';

export const createSubagentsToolset = async (
  _settings: SettingsData,
  task: Task,
  agentProfileManager: AgentProfileManager,
  mainAgentProfile: AgentProfile,
  abortSignal?: AbortSignal,
  contextMessages: ContextMessage[] = [],
  currentMessages: ContextMessage[] = [],
): Promise<ToolSet> => {
  const allProfiles = agentProfileManager.getProjectProfiles(task.project);
  const enabledSubagents = getEnabledSubagents(allProfiles, mainAgentProfile);
  const workers = new Map<
    string,
    {
      subagentId: string;
      profileId: string;
      controller: AbortController;
      completion: Promise<RunSubagentTaskResult>;
      mailbox: string[];
      settled: boolean;
    }
  >();
  const waitToolName = `${SUBAGENTS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}wait_task`;

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
      const controller = input.background ? new AbortController() : undefined;
      const signal = controller && abortSignal ? AbortSignal.any([abortSignal, controller.signal]) : (controller?.signal ?? abortSignal);
      const mailbox: string[] = [];

      const completion = runSubagentTask({
        task,
        targetSubagent,
        prompt,
        description,
        abortSignal: signal,
        contextMessages,
        currentMessages,
        takeSteering: controller ? () => mailbox.splice(0) : undefined,
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
      });
      if (controller) {
        const workerId = randomUUID();
        const worker = { subagentId, profileId: targetSubagent.id, controller, completion, mailbox, settled: false };
        workers.set(workerId, worker);
        void completion.then(() => {
          worker.settled = true;
        });
        return { workerId, status: 'running' };
      }
      const result = await completion;

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

  if (enabledSubagents.length > 0) {
    toolSet[`${SUBAGENTS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}${SUBAGENTS_TOOL_RUN_TASK}`] = runTaskTool;
    toolSet[waitToolName] = tool({
      description: 'Collect the result of a background subagent. A running result means it has not finished yet.',
      inputSchema: z.object({ workerId: z.string().uuid(), timeoutMs: z.number().int().min(1).max(60000).default(10000) }),
      execute: async ({ workerId, timeoutMs }) => {
        const worker = workers.get(workerId);
        if (!worker) {
          return { error: 'Worker unavailable in this agent run.' };
        }
        let timer: NodeJS.Timeout | number | undefined;
        try {
          const result = await Promise.race([
            worker.completion,
            new Promise<undefined>((resolve) => {
              timer = setWaitTimer(resolve, timeoutMs);
            }),
          ]);
          if (!result) {
            return { workerId, status: 'running' };
          }
          if (result.status === 'success') {
            await task.saveWorkerHistory(workerId, worker.profileId, result.messages);
          }
          workers.delete(workerId);
          return { workerId, subagentId: worker.subagentId, ...result };
        } finally {
          clearWaitTimer(timer);
        }
      },
    });
    toolSet[`${SUBAGENTS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}followup_task`] = tool({
      description: 'Continue a completed worker using its saved conversation. Collect the prior result with wait_task first. Returns the same worker ID.',
      inputSchema: z.object({ workerId: z.string().uuid(), prompt: z.string().min(1).max(10000) }),
      execute: async ({ workerId, prompt }) => {
        abortSignal?.throwIfAborted();
        if (workers.has(workerId) || workers.size >= 8) {
          return { error: 'Collect pending worker results before following up.' };
        }
        const stored = await task.readWorkerHistory(workerId);
        const previous = stored
          ? undefined
          : [...contextMessages, ...currentMessages]
              .flatMap((message) => (message.role === 'tool' ? message.content : []))
              .filter((part) => part.type === 'tool-result' && part.toolName === waitToolName && part.output.type === 'json')
              .map((part) => (part.output as { value?: { workerId?: string; subagentId?: string; status?: string; messages?: ContextMessage[] } }).value)
              .findLast((value) => value?.workerId === workerId && value?.status !== 'running');
        const targetSubagent = stored
          ? enabledSubagents.find(({ id }) => id === stored.profileId)
          : previous?.subagentId && findEnabledSubagent(enabledSubagents, previous.subagentId);
        const history = stored?.messages ?? (previous?.status === 'success' ? previous.messages : undefined);
        if (!targetSubagent || !Array.isArray(history)) {
          return { error: 'No completed result for this worker in the task context.' };
        }
        abortSignal?.throwIfAborted();
        if (workers.has(workerId) || workers.size >= 8) {
          return { error: 'Collect pending worker results before following up.' };
        }
        const controller = new AbortController();
        const signal = abortSignal ? AbortSignal.any([abortSignal, controller.signal]) : controller.signal;
        const mailbox: string[] = [];
        const completion = runSubagentTask({
          task,
          targetSubagent,
          prompt,
          abortSignal: signal,
          workerHistory: history,
          takeSteering: () => mailbox.splice(0),
        });
        const worker = { subagentId: getSubagentId(targetSubagent), profileId: targetSubagent.id, controller, completion, mailbox, settled: false };
        workers.set(workerId, worker);
        void completion.then(() => {
          worker.settled = true;
        });
        return { workerId, status: 'running' };
      },
    });
    toolSet[`${SUBAGENTS_TOOL_GROUP_NAME}${TOOL_GROUP_NAME_SEPARATOR}send_message`] = tool({
      description: 'Send instructions to a running worker at its next model step. Use followup_task for a completed worker.',
      inputSchema: z.object({ workerId: z.string().uuid(), message: z.string().min(1).max(10000) }),
      execute: async ({ workerId, message }) => {
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
        const worker = workers.get(workerId);
        if (!worker) {
          return { error: 'Worker unavailable in this agent run.' };
        }
        worker.controller.abort();
        return { workerId, status: 'cancellation-requested' };
      },
    });
  }

  return toolSet;
};
