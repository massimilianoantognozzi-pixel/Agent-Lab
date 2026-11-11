import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Extension, ExtensionContext, UIComponentDefinition, AgentStartedEvent, Reasoning, TaskCreatedEvent } from '@aiderdesk/extensions';

const METADATA_KEY = 'reasoningEffort';

const REASONING_OPTIONS = [
  { value: '', label: 'Use default' },
  { value: 'none', label: 'None' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'xHigh' },
];

const SOL_REASONING_OPTIONS = [
  { value: '', label: 'Predefinito' },
  { value: 'low', label: 'Basso' },
  { value: 'medium', label: 'Medio' },
  { value: 'high', label: 'Alto' },
  { value: 'xhigh', label: 'Molto alto' },
];

const isCodexSol = (provider?: string, model?: string) => provider === 'openai-codex' && model === 'gpt-6.1-sol';
const reasoningOptions = (provider?: string, model?: string) => isCodexSol(provider, model) ? SOL_REASONING_OPTIONS : REASONING_OPTIONS;

const resolveTaskModel = (task: TaskCreatedEvent['task'], context: ExtensionContext): { provider?: string; model?: string } => {
  if (task.provider && task.model) return { provider: task.provider, model: task.model };
  const project = context.getProjectContext();
  const profileId = task.agentProfileId ?? project.getProjectSettings().agentProfileId;
  return project.getAgentProfiles().find(profile => profile.id === profileId) ?? {};
};

const AIDER_MODES = ['code', 'ask', 'architect', 'context'];

const selectorJsx = readFileSync(join(__dirname, './ReasoningSelector.jsx'), 'utf-8');

export default class ReasoningSelectorExtension implements Extension {
  static metadata = {
    name: 'Reasoning Selector',
    version: '1.1.0',
    description: 'Adds a reasoning effort selector dropdown next to the model selector in agent mode',
    author: 'wladimiiir',
    iconUrl: 'https://raw.githubusercontent.com/hotovo/aider-desk/refs/heads/main/packages/extensions/extensions/reasoning-selector/icon.png',
    capabilities: ['ui'],
  };

  async onLoad(context: ExtensionContext): Promise<void> {
    context.log('Reasoning Selector extension loaded', 'info');
  }

  async onUnload(): Promise<void> {}

  async onTaskCreated(
    event: TaskCreatedEvent,
    context: ExtensionContext,
  ): Promise<void | Partial<TaskCreatedEvent>> {
    const metadata = event.task.metadata ?? {};
    if (METADATA_KEY in metadata) {
      return undefined;
    }

    const projectContext = context.getProjectContext();
    const { provider, model } = resolveTaskModel(event.task, context);
    if (!provider || !model) {
      return undefined;
    }

    const matchingTask = (await projectContext.getTasks())
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
      .slice(0, 10)
      .find((task) => task.provider === provider && task.model === model);
    const reasoningEffort = matchingTask?.metadata?.[METADATA_KEY];
    if (typeof reasoningEffort !== 'string' || !reasoningEffort || !reasoningOptions(provider, model).some(option => option.value === reasoningEffort)) {
      return undefined;
    }

    return {
      task: {
        ...event.task,
        metadata: {
          ...metadata,
          [METADATA_KEY]: reasoningEffort,
        },
      },
    };
  }

  getUIComponents(_context: ExtensionContext): UIComponentDefinition[] {
    return [
      {
        id: 'reasoning-selector',
        placement: 'task-top-bar-left',
        jsx: selectorJsx,
        loadData: true,
      },
    ];
  }

  async getUIExtensionData(componentId: string, context: ExtensionContext): Promise<unknown> {
    if (componentId !== 'reasoning-selector') {
      return undefined;
    }

    const taskContext = context.getTaskContext();
    if (!taskContext) {
      return { reasoningEffort: '', options: REASONING_OPTIONS, isAgentMode: false };
    }

    const { provider, model } = (await taskContext.getTaskAgentProfile()) ?? {};
    const mode = taskContext.data.currentMode ?? context.getProjectContext().getProjectSettings().currentMode;
    const isAgentMode = !!mode && !AIDER_MODES.includes(mode);
    const options = reasoningOptions(provider, model);
    const selected = taskContext.data.metadata?.[METADATA_KEY];
    const reasoningEffort = options.find(option => option.value === selected)?.value ?? '';

    return { reasoningEffort, options, isAgentMode, label: isCodexSol(provider, model) ? 'Ragionamento' : 'Reasoning' };
  }

  async executeUIExtensionAction(
    _componentId: string,
    action: string,
    args: unknown[],
    context: ExtensionContext,
  ): Promise<unknown> {
    if (action === 'set-reasoning') {
      const taskContext = context.getTaskContext();
      if (!taskContext) return undefined;

      const value = args[0];
      const { provider, model } = (await taskContext.getTaskAgentProfile()) ?? {};
      if (typeof value !== 'string' || !reasoningOptions(provider, model).some(option => option.value === value)) return undefined;
      const existingMetadata = { ...taskContext.data.metadata };
      if (value) {
        existingMetadata[METADATA_KEY] = value;
      } else {
        delete existingMetadata[METADATA_KEY];
      }

      await taskContext.updateTask({ metadata: existingMetadata });
      context.triggerUIDataRefresh('reasoning-selector');
    }

    return undefined;
  }

  async onAgentStarted(
    event: AgentStartedEvent,
    context: ExtensionContext,
  ): Promise<void | Partial<AgentStartedEvent>> {
    const taskContext = context.getTaskContext();
    if (!taskContext) {
      return undefined;
    }

    const reasoningEffort = taskContext.data.metadata?.[METADATA_KEY];
    if (typeof reasoningEffort !== 'string' || !reasoningEffort || !reasoningOptions(event.providerProfile.id, event.model).some(option => option.value === reasoningEffort)) {
      return undefined;
    }

    context.log(`Reasoning Selector: overriding reasoning to '${reasoningEffort}'`, 'info');

    return {
      modelCallSettings: {
        reasoning: reasoningEffort as Reasoning,
      },
    };
  }
}
