import { describe, expect, it, vi } from 'vitest';

import { createPlanInputTool, planInputSchema } from '../plan-input';

import type { Task } from '@/task';

describe('Plan user input', () => {
  const options = [
    { label: 'Current schema', description: 'Preserves client compatibility.' },
    { label: 'New schema', description: 'Requires a migration.' },
  ];
  const first = { id: 'schema', header: 'Schema', question: 'Which schema should the plan use?', options };
  const second = { id: 'future', header: 'Future', question: 'When should this migrate?', options };

  it('returns option labels and free-form input using stable question IDs', async () => {
    const askQuestion = vi.fn().mockResolvedValueOnce(['2', undefined]).mockResolvedValueOnce(['n', 'After the release']);
    const input = createPlanInputTool({ getProjectDir: () => 'fixture', taskId: 'task', askQuestion } as unknown as Task);
    const result = await input.execute!({ questions: [first, second] }, { toolCallId: 'id', messages: [], context: {} });
    expect(result).toEqual({ answers: { schema: { answers: ['New schema'] }, future: { answers: ['After the release'] } } });
    expect(askQuestion.mock.calls[0][0]).toMatchObject({
      answers: [
        { text: 'Current schema', shortkey: '1' },
        { text: 'New schema', shortkey: '2' },
      ],
      internal: true,
    });
  });

  it('rejects duplicate IDs and questions without alternatives', () => {
    expect(planInputSchema.safeParse({ questions: [first, first] }).success).toBe(false);
    expect(planInputSchema.safeParse({ questions: [{ ...first, options: [options[0]] }] }).success).toBe(false);
  });

  it('serializes parallel tool calls until the earlier question has its own answer', async () => {
    let answerFirst!: (answer: [string, string | undefined]) => void;
    const firstAnswer = new Promise<[string, string | undefined]>((resolve) => {
      answerFirst = resolve;
    });
    const askQuestion = vi.fn().mockReturnValueOnce(firstAnswer).mockResolvedValueOnce(['2', undefined]);
    const input = createPlanInputTool({ getProjectDir: () => 'fixture', taskId: 'task', askQuestion } as unknown as Task);
    const firstCall = input.execute!({ questions: [first] }, { toolCallId: 'first', messages: [], context: {} });
    const secondCall = input.execute!({ questions: [second] }, { toolCallId: 'second', messages: [], context: {} });
    await vi.waitFor(() => expect(askQuestion).toHaveBeenCalledTimes(1));
    answerFirst(['1', undefined]);
    await expect(firstCall).resolves.toEqual({ answers: { schema: { answers: ['Current schema'] } } });
    await expect(secondCall).resolves.toEqual({ answers: { future: { answers: ['New schema'] } } });
  });
});
