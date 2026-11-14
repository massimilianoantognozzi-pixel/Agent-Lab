import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AssistantMessageBlock } from '../AssistantMessageBlock';
import { areMessagesEqual } from '../utils';

import type { AssistantGroupMessage, ResponseMessage } from '@common/types';

import { render } from '@/__tests__/render';

vi.mock('../MessageBlockWrapper', () => ({
  MessageBlockWrapper: ({ message }: { message: ResponseMessage }) => <div>{message.proposedPlan?.markdown}</div>,
}));
vi.mock('../MessageBar', () => ({ MessageBar: () => null }));

describe('structured plan in compact history', () => {
  const plan: ResponseMessage = { id: 'response', type: 'response', content: '', proposedPlan: { id: 'response:plan', markdown: 'Read the source.' } };

  it('renders the Plan-only assistant response inside a group', () => {
    const message: AssistantGroupMessage = { id: 'group', type: 'assistant-group', content: '', responseMessage: plan, toolMessages: [] };
    render(<AssistantMessageBlock baseDir="fixture" taskId="task" message={message} allFiles={[]} renderMarkdown={false} />);
    expect(screen.getByText('Read the source.')).toBeInTheDocument();
  });

  it('treats changed plan Markdown as a new renderer state', () => {
    expect(areMessagesEqual(plan, { ...plan, proposedPlan: { id: 'response:plan', markdown: 'Read and run the tests.' } } as ResponseMessage)).toBe(false);
  });
});
