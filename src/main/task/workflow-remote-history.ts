import { extractTextContent } from '@common/utils';

import { assertWorkflowText } from './workflow-policy';

import type { AutonomyMode, ContextMessage } from '@common/types';

export const remoteReasoningOptions = ['default', 'low', 'medium', 'high', 'xhigh'] as const;
export type RemoteReasoning = (typeof remoteReasoningOptions)[number];
export type RemoteTaskSettings = { autonomy?: AutonomyMode; reasoning?: RemoteReasoning };

export const remoteReasoning = (value: unknown): RemoteReasoning => remoteReasoningOptions.find((option) => option === value) ?? 'default';

type PublicMessage = { id: string; role: 'user' | 'assistant'; text: string };
const planTitle = /^## (?:Correzione|Piano di modifica|Blueprint funzionale)\r?\n/;
const taskRequest = /^\/workflow (?:bug|change|feature)\s+/;
const taskAction = /^\/workflow (?:approve|resume)(?:\s|$)/;
const workflowCommand = /^\/workflow(?:\s|$)/;
const hostPath = /(?:[a-z]:[\\/]|(?:^|\s)\\\\|(?:^|\s)\/(?:home|Users|tmp|var)\/)/im;

const safeText = (value: string): string | undefined => {
  try {
    assertWorkflowText(value);
    return value;
  } catch {
    return undefined;
  }
};

export const remoteWorkflowTitle = (prompt: string): string | undefined => {
  if (!taskRequest.test(prompt)) {
    return undefined;
  }
  const request = safeText(prompt.replace(taskRequest, '').trim());
  return request && !hostPath.test(request) ? request.replace(/\s+/g, ' ').slice(0, 80) : undefined;
};

export const remoteTaskLabel = (label: string): string => {
  const value = safeText(label.trim());
  return value && !hostPath.test(value) ? value.slice(0, 100) : 'Conversazione Agent-Lab';
};

const resultText = (text: string): string | undefined => {
  if (planTitle.test(text)) {
    const outcome = text.split(/\r?\n\r?\n/)[1]?.trim();
    if (outcome && !hostPath.test(outcome)) {
      return safeText(outcome)?.slice(0, 900);
    }
    return 'Ho preparato il piano per questa richiesta.';
  }
  if (text.startsWith('## Consegna verificata')) {
    return 'Ho completato le verifiche e preparato la patch.';
  }
  if (text.startsWith('Consegna sospesa.')) {
    return 'I controlli non sono ancora superati. Puoi riprendere il lavoro dal task.';
  }
  return undefined;
};

export const remoteWorkflowMessages = (history: ContextMessage[]): PublicMessage[] => {
  const requests = new Map<string, string>();
  for (const message of history) {
    if (message.role === 'user' && message.promptContext?.id) {
      requests.set(message.promptContext.id, extractTextContent(message.content).trim());
    }
  }
  const responded = new Set<string>();
  const replies = new Map<string, string>();
  for (const message of history) {
    const id = message.promptContext?.id;
    if (message.role !== 'assistant' || !id) {
      continue;
    }
    const request = requests.get(id);
    if (!request || (workflowCommand.test(request) && !taskRequest.test(request) && !taskAction.test(request))) {
      continue;
    }
    const content = extractTextContent(message.content).trim();
    if (
      !workflowCommand.test(request) &&
      !(planTitle.test(content) && content.includes('File autorizzati dal piano') && content.includes('Criteri') && /^Versione: [0-9a-f]{64}$/m.test(content))
    ) {
      continue;
    }
    const reply = resultText(content);
    if (reply) {
      responded.add(id);
      replies.set(message.id, reply);
    }
  }

  const visible: PublicMessage[] = [];
  for (const message of history) {
    const id = message.promptContext?.id;
    if (message.role === 'user' && id) {
      const request = requests.get(id);
      if (request && (taskRequest.test(request) || (!workflowCommand.test(request) && responded.has(id)))) {
        const text = safeText(request.replace(taskRequest, '').trim());
        if (text) {
          visible.push({ id: message.id, role: 'user', text: hostPath.test(text) ? 'Richiesta con riferimento a un percorso locale.' : text.slice(0, 1500) });
        }
      }
    } else if (message.role === 'assistant') {
      const reply = replies.get(message.id);
      if (reply) {
        visible.push({ id: message.id, role: 'assistant', text: reply });
      }
    }
  }
  return visible.slice(-40);
};
