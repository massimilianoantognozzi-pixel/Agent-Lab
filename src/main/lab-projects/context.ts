import { randomUUID } from 'node:crypto';

import type { ContextMessage } from '@common/types';

const prefix = '[Agent-Lab checkpoint] ';
type Checkpoint = { files: Record<string, { revision: string; sha256?: string }>; plan?: string; lastCheck?: object; recentErrors?: string[]; note: string };
// Only model working context is reduced. UI records, context backups, file
// snapshots, approved requirements and every user message remain available.
export const compactLabMessages = (messages: ContextMessage[]): ContextMessage[] => {
  const cutoff = Math.max(0, messages.length - 4);
  const calls = new Map<string, { name: string; input: Record<string, unknown> }>();
  const remove = new Set<string>();
  const failures: Array<{ id: string; error: string }> = [];
  let checkpoint: Checkpoint = {
    files: {},
    note: 'Historical operations saved on disk. Read current files before editing. lastCheck refers only to its recorded source version, not subsequent changes.',
  };
  for (const message of messages) {
    if (message.role === 'assistant' && typeof message.content === 'string' && message.content.startsWith(prefix)) {
      try {
        checkpoint = JSON.parse(message.content.slice(prefix.length)) as Checkpoint;
      } catch {
        /* Not a controller checkpoint. */
      }
    }
  }
  for (let index = 0; index < cutoff; index++) {
    const message = messages[index];
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (part.type === 'tool-call' && part.toolName.startsWith('lab---') && part.input && typeof part.input === 'object') {
        calls.set(part.toolCallId, { name: part.toolName, input: part.input as Record<string, unknown> });
      }
    }
  }
  for (let index = 0; index < cutoff; index++) {
    const message = messages[index];
    if (message.role !== 'tool') {
      continue;
    }
    for (const part of message.content) {
      if (part.type !== 'tool-result') {
        continue;
      }
      const call = calls.get(part.toolCallId);
      if (!call) {
        continue;
      }
      let value: Record<string, unknown> | null = null;
      try {
        value =
          part.output.type === 'text' ? JSON.parse(part.output.value) : part.output.type === 'json' ? (part.output.value as Record<string, unknown>) : null;
      } catch {
        /* Errors are never recorded as committed writes. */
      }
      if (['lab---file_write', 'lab---file_edit'].includes(call.name)) {
        if (!value || typeof value.revision !== 'string' || !/^[a-f0-9-]{36}$/.test(value.revision) || typeof call.input.file !== 'string') {
          failures.push({
            id: part.toolCallId,
            error: part.output.type === 'error-text' ? part.output.value.slice(0, 500) : 'Modifica non confermata; rileggere il file corrente.',
          });
          continue;
        }
        checkpoint.files[call.input.file] = { revision: value.revision, sha256: typeof value.sha256 === 'string' ? value.sha256 : undefined };
      } else if (call.name === 'lab---project_check' && value) {
        checkpoint.lastCheck = {
          id: value.id,
          pass: value.pass,
          status: value.status,
          sourceDigest: value.sourceDigest,
          errors: Array.isArray(value.errors) ? value.errors.slice(0, 3).map((error) => String(error).slice(0, 600)) : [],
        };
      } else if (call.name === 'lab---project_prepare' && value && value.project && typeof call.input.plan === 'string') {
        checkpoint.plan = call.input.plan;
      } else if (
        ![
          'lab---file_read',
          'lab---project_files',
          'lab---project_search',
          'lab---knowledge_search',
          'lab---knowledge_update',
          'lab---project_preview',
          'lab---project_export',
        ].includes(call.name)
      ) {
        continue;
      }
      remove.add(part.toolCallId);
    }
  }
  for (const failure of failures.slice(0, -2)) {
    remove.add(failure.id);
  }
  if (failures.length) {
    checkpoint.recentErrors = [...new Set(failures.slice(-2).map((failure) => failure.error))];
  }
  if (!remove.size) {
    return messages;
  }
  checkpoint.files = Object.fromEntries(Object.entries(checkpoint.files).slice(-60));
  const reduced: ContextMessage[] = [];
  for (const message of messages) {
    if (message.role === 'assistant' && typeof message.content === 'string' && message.content.startsWith(prefix)) {
      continue;
    }
    if (!Array.isArray(message.content)) {
      reduced.push(message);
      continue;
    }
    const content = message.content.filter((part) => !('toolCallId' in part && remove.has(part.toolCallId)));
    if (content.length) {
      reduced.push({ ...message, content } as ContextMessage);
    }
  }
  const firstUser = reduced.findIndex((message) => message.role === 'user');
  reduced.splice(firstUser + 1, 0, { id: randomUUID(), role: 'assistant', content: prefix + JSON.stringify(checkpoint), timestamp: Date.now() });
  return reduced;
};
