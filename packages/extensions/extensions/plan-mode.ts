/**
 * Plan Mode Extension
 *
 * Registers a 'plan' mode that enforces planning and analysis before coding.
 * When plan mode is active, system instructions require the agent to
 * create a detailed implementation plan before making any code changes.
 *
 * Usage:
 * 1. This extension automatically registers the 'plan' mode
 * 2. Select 'Plan' mode from the mode selector in AiderDesk
 * 3. Enter your request - the extension will apply planning instructions
 */

import type {
  Extension,
  ExtensionContext,
  ModeDefinition,
  AgentStartedEvent,
} from '@aiderdesk/extensions';

const PLAN_INSTRUCTIONS = `You are in planning mode. Before making any code changes, you must first create or update a detailed implementation plan in a file called plan.md.

**Planning Document Structure**:
1. **Goal**: Clearly state what we're trying to achieve
2. **Analysis**: Break down the request into actionable steps
3. **Files to Modify**: List all files that will need to be modified or created
4. **Dependencies**: Consider how changes might affect other parts of the codebase
5. **Implementation Steps**: Outline the specific changes for each file
6. **Risks & Considerations**: Note any potential issues or edge cases

**Important**:
- Create or edit the plan.md file with your analysis
- After presenting your plan, ask the user: "May I proceed with this plan?"
- Wait for user confirmation before making any code changes`;

export default class PlanModeExtension implements Extension {
  static metadata = {
    name: 'Plan Mode',
    version: '1.1.0',
    description: 'Adds a Plan mode that enforces planning and analysis before making code changes',
    author: 'wladimiiir',
    iconUrl: 'https://raw.githubusercontent.com/hotovo/aider-desk/refs/heads/main/packages/extensions/extensions/plan-mode.png',
    capabilities: ['modes'],
  };

  async onLoad(context: ExtensionContext) {
    context.log('Plan Mode Extension loaded', 'info');
  }

  getModes(): ModeDefinition[] {
    return [
      {
        name: 'plan',
        label: 'Plan',
        description: 'Plan and analyze before coding',
        icon: 'GoProjectRoadmap',
      },
    ];
  }

  async onAgentStarted(event: AgentStartedEvent, context: ExtensionContext): Promise<void | Partial<AgentStartedEvent>> {
    if (event.mode !== 'plan') {
      return undefined;
    }

    context.log('Plan mode active - applying planning instructions', 'info');
    return { systemPrompt: [event.systemPrompt, PLAN_INSTRUCTIONS].filter(Boolean).join('\n\n') };
  }
}
