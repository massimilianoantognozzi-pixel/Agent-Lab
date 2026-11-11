import { describe, expect, it, vi } from 'vitest';

import { compactLabMessages } from '../lab-projects/context';
import { optimizeMessages } from '../agent/message-preparation/optimizations';

import type { ContextMessage } from '@common/types';
import type { ModelMessage } from 'ai';
vi.mock('@/logger');

describe('Local coding context preserves real evidence', () => {
  const pair = (id: string, toolName: string, output: Record<string, string | boolean>): ModelMessage[] => [
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: id, toolName, input: {} }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: id, toolName, output: { type: 'json', value: output } }] },
  ];
  it('keeps successive different check outcomes even when arguments are equal', () => {
    const messages = [...pair('one', 'lab---project_check', { pass: false }), ...pair('two', 'lab---project_check', { pass: true })];
    expect(optimizeMessages(messages)).toEqual(messages);
  });
  it('keeps changed file-read results on consecutive reads', () => {
    const messages = [...pair('one', 'lab---file_read', { text: 'old' }), ...pair('two', 'lab---file_read', { text: 'new' })];
    expect(optimizeMessages(messages)).toEqual(messages);
  });
  it('reduces only completed old writes without altering the original history', () => {
    const messages = [
      {
        id: 'a',
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'write', toolName: 'lab---file_write', input: { file: 'app.js', content: 'LONG ORIGINAL SOURCE' } }],
      },
      {
        id: 'b',
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'write',
            toolName: 'lab---file_write',
            output: { type: 'json', value: { revision: '343530c0-0192-4cd5-8c32-f39b3b2bff6d' } },
          },
        ],
      },
      ...Array.from({ length: 4 }, (_, index) => ({ id: 'later' + index, role: 'user', content: 'next' })),
    ] as ContextMessage[];
    const original = structuredClone(messages);
    const reduced = compactLabMessages(messages);
    expect(JSON.stringify(reduced)).not.toContain('LONG ORIGINAL SOURCE');
    expect(messages).toEqual(original);
    expect(JSON.stringify(reduced)).toContain('app.js');
    expect(JSON.stringify(reduced)).toContain('343530c0');
  });
  it('retains unsuccessful writes in full', () => {
    const messages = [
      {
        id: 'a',
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'write', toolName: 'lab---file_write', input: { file: 'app.js', content: 'IMPORTANT FAILED SOURCE' } }],
      },
      {
        id: 'b',
        role: 'tool',
        content: [{ type: 'tool-result', toolCallId: 'write', toolName: 'lab---file_write', output: { type: 'error-text', value: 'denied' } }],
      },
      ...Array.from({ length: 4 }, (_, index) => ({ id: 'later' + index, role: 'user', content: 'next' })),
    ] as ContextMessage[];
    expect(JSON.stringify(compactLabMessages(messages))).toContain('IMPORTANT FAILED SOURCE');
  });
});
