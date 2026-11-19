import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SuggestionMode } from '@common/types';
import { afterEach, expect, it, vi } from 'vitest';

import { PromptField } from '../PromptField';

import type { ComponentProps, ReactNode } from 'react';

import { registerAction, unregisterAction } from '@/stores/actionsStore';

vi.mock('@uiw/react-codemirror', async (original) => ({
  ...(await original<typeof import('@uiw/react-codemirror')>()),
  default: ({ value, onChange }: { value: string; onChange: (text: string) => void }) => (
    <textarea value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));
vi.mock('@/components/ui/Tooltip', () => ({
  Tooltip: ({ content, children }: { content: string; children: ReactNode }) => <div data-testid={content}>{children}</div>,
}));
vi.mock('@/contexts/AgentsContext', () => ({
  useAgents: () => ({ getProfiles: () => [] }),
}));
vi.mock('@/contexts/ApiContext', () => ({ useApi: () => window.api }));
vi.mock('@/hooks/useCommands', () => ({ useCommands: () => [[], []] }));
vi.mock('@/hooks/useSkills', () => ({ useSkills: () => [] }));
vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({ stopRecording: vi.fn() }),
}));
vi.mock('../usePromptFieldText', () => ({
  usePromptFieldText: () => ({ setText: vi.fn() }),
}));

afterEach(() => {
  unregisterAction('task.new');
  unregisterAction('task.resumeWork');
});

it('dispatches project work only on submit and sends an initial objective to the newly created task', async () => {
  const start = vi.fn();
  const resume = vi.fn();
  registerAction('task.new', start);
  registerAction('task.resumeWork', resume);
  const create = vi.spyOn(window.api, 'createNewTask').mockResolvedValue({ id: 'new-task' } as never);
  const send = vi.spyOn(window.api, 'runPrompt');
  const runPrompt = vi.fn();
  const props: ComponentProps<typeof PromptField> = {
    baseDir: '/project',
    taskId: 'old-task',
    mode: 'agent',
    processing: false,
    isActive: true,
    onModeChanged: vi.fn(),
    savePrompt: vi.fn(),
    showFileDialog: vi.fn(),
    clearMessages: vi.fn(),
    scrapeWeb: vi.fn(),
    answerQuestion: vi.fn(),
    interruptResponse: vi.fn(),
    runCommand: vi.fn(),
    runTests: vi.fn(),
    redoLastUserPrompt: vi.fn(),
    editUserMessage: vi.fn(),
    clearLogMessages: vi.fn(),
    promptBehavior: {
      suggestionMode: SuggestionMode.OnTab,
      suggestionDelay: 0,
      requireCommandConfirmation: { add: false, readOnly: false, model: false, modeSwitching: false },
      useVimBindings: false,
    },
    runPrompt,
  };
  const { rerender } = render(<PromptField {...props} />);
  const type = (value: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value } });
  const submit = () => fireEvent.click(screen.getByTestId('promptField.sendMessage').querySelector('button')!);
  type('/inizia');
  expect(start).not.toHaveBeenCalled();
  submit();
  expect(runPrompt).toHaveBeenCalledWith('/inizia');
  type('/riprendi');
  expect(resume).not.toHaveBeenCalled();
  submit();
  expect(resume).toHaveBeenCalledOnce();
  rerender(<PromptField {...props} processing />);
  type('/chiudi');
  fireEvent.click(screen.getByTestId('commands.chiudi').querySelector('button')!);
  expect(runPrompt).toHaveBeenCalledWith('/chiudi');
  rerender(<PromptField {...props} />);
  type('/inizia Controlla il filtro');
  submit();
  await waitFor(() => expect(send).toHaveBeenCalledWith('/project', 'new-task', '/inizia Controlla il filtro', 'agent', undefined));
  expect(create).toHaveBeenCalledOnce();
  expect(runPrompt).toHaveBeenCalledTimes(2);
});
