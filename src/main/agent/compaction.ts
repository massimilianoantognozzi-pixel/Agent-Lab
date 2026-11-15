import { v4 as uuidv4 } from 'uuid';

import type { AgentProfile, ContextMessage, PromptContext } from '@common/types';
import type { Task } from '@/task';

export { CompactionLevel, smartCompactMessages } from './smart-compaction';
export type { SmartCompactionPass, SmartCompactionPassSelection } from './smart-compaction';

export const extractUsableSummary = (content: string | undefined): string | undefined => {
  if (!content?.trim()) {
    return undefined;
  }
  const lines = content.split('\n');
  const summaryMarker = '### **Conversation Summary**';
  const markerIndex = lines.findIndex((line) => line.trim() === summaryMarker);
  if (markerIndex === -1) {
    return content;
  }
  const body = lines
    .slice(markerIndex + 1)
    .join('\n')
    .trim();
  return body ? lines.slice(markerIndex).join('\n') : undefined;
};

export const getSubagentOldResultIds = (resultMessages: ContextMessage[], userRequestMessageId: string): string[] =>
  resultMessages.filter((m) => m.id !== userRequestMessageId).map((m) => m.id);

export const getReloadableMessages = (messages: ContextMessage[]): ContextMessage[] => messages.filter((m) => m.role !== 'user');

export const buildCompactSummaryMessages = (userMessage: ContextMessage, summaryContent: string, promptContext?: PromptContext): ContextMessage[] => [
  userMessage,
  {
    id: uuidv4(),
    role: 'assistant',
    content: summaryContent,
    promptContext,
    timestamp: Date.now(),
  },
];

export const generateCompactedSummary = async (
  userMessage: ContextMessage,
  allMessages: ContextMessage[],
  profile: AgentProfile,
  task: Task,
  promptContext?: PromptContext,
  abortSignal?: AbortSignal,
  getCompactConversationPrompt: (task: Task, customInstructions?: string) => Promise<string> = async () => '',
  generateText: (
    modelId: string,
    systemPrompt: string,
    prompt: string,
    projectDir: string,
    messages: ContextMessage[],
    abortable: boolean,
    abortSignal?: AbortSignal,
    sessionId?: string,
  ) => Promise<string | undefined> = async () => undefined,
): Promise<ContextMessage[] | undefined> => {
  const compactPrompt = await getCompactConversationPrompt(task, undefined);
  const summaryText = await generateText(
    `${profile.provider}/${profile.model}`,
    '',
    compactPrompt,
    task.getProjectDir(),
    allMessages,
    true,
    abortSignal,
    task.task.id,
  );
  const summary = extractUsableSummary(summaryText);
  return summary ? buildCompactSummaryMessages(userMessage, summary, promptContext) : undefined;
};
