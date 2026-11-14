import { tool } from 'ai';
import { z } from 'zod';

import type { Task } from '@/task';

const option = z.object({ label: z.string().trim().min(1).max(80), description: z.string().trim().min(1).max(500) });
export const planInputSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[a-z][a-z0-9_]*$/)
          .max(60),
        header: z.string().trim().min(1).max(12),
        question: z.string().trim().min(1).max(500),
        options: z
          .array(option)
          .min(2)
          .max(3)
          .refine((options) => new Set(options.map(({ label }) => label.toLocaleLowerCase())).size === options.length, 'Choice labels must be unique.'),
      }),
    )
    .min(1)
    .max(3)
    .refine((questions) => new Set(questions.map(({ id }) => id)).size === questions.length, 'Question IDs must be unique.'),
});

export const createPlanInputTool = (task: Task, signal?: AbortSignal) => {
  let pending: Promise<unknown> = Promise.resolve();
  return tool({
    description:
      'Ask one to three decisions after reading the relevant local sources. Provide 2–3 distinct choices per question. Put the recommended option first. The user may also type a different answer.',
    inputSchema: planInputSchema,
    execute: async ({ questions }) => {
      const operation = pending.then(async () => {
        const answers: Record<string, { answers: string[] }> = {};
        for (const question of questions) {
          signal?.throwIfAborted();
          const options = question.options.map(({ label }, index) => ({ text: label, shortkey: String(index + 1) }));
          const [selection, customAnswer] = await task.askQuestion({
            baseDir: task.getProjectDir(),
            taskId: task.taskId,
            text: `${question.header} · ${question.question}`,
            subject: question.options.map(({ label, description }) => `${label}\n${description}`).join('\n\n'),
            defaultAnswer: 'n',
            answers: options,
            internal: true,
          });
          signal?.throwIfAborted();
          const answer = customAnswer?.trim() || options.find(({ shortkey }) => shortkey === selection)?.text;
          answers[question.id] = { answers: answer ? [answer] : [] };
        }
        return { answers };
      });
      pending = operation.catch(() => undefined);
      return operation;
    },
  });
};
