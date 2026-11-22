import { describe, expect, it } from 'vitest';

import { isWorkflowKind, projectComponentInstructions, WORKFLOW_SKILL_SOURCES, workflowSkills, type WorkflowStage } from '../workflow-skills';

describe('procedure del workflow', () => {
  it('riconosce soltanto le tre categorie esplicite', () => {
    expect(['bug', 'change', 'feature'].every(isWorkflowKind)).toBe(true);
    expect([undefined, 'BUG', 'design', {}].some(isWorkflowKind)).toBe(false);
  });

  it('cambia la pianificazione in base alla natura del lavoro', () => {
    expect(workflowSkills('bug', 'plan')).toContain('caso di riproduzione');
    expect(workflowSkills('change', 'plan')).toContain('aspettative di compatibilità');
    expect(workflowSkills('feature', 'plan')).toContain('flusso utente');
    expect(workflowSkills('feature', 'plan')).toContain('criteri di accettazione osservabili');
    expect(workflowSkills('feature', 'plan')).toContain('decisioni approvate');
  });

  it('mantiene distinti implementazione, diagnosi, verifica e apprendimento', () => {
    expect(workflowSkills('feature', 'implement')).toContain('riusa le interfacce');
    expect(workflowSkills('bug', 'debug')).toContain('evidenze della causa');
    expect(workflowSkills('change', 'review')).toContain('verifica mancante');
    expect(workflowSkills('bug', 'learn')).toContain('riferimento alla prova');
    expect(Object.keys(WORKFLOW_SKILL_SOURCES)).toEqual(
      expect.arrayContaining([
        'brainstorming',
        'writingPlans',
        'systematicDebugging',
        'verificationBeforeCompletion',
        'specKit',
        'openSpec',
        'compoundEngineering',
      ]),
    );
  });

  it('trasmette la regola dei componenti dal piano alle revisioni anche durante una correzione', () => {
    const stages: WorkflowStage[] = ['plan', 'design', 'implement', 'debug', 'review', 'design-review'];
    for (const stage of stages) {
      expect(workflowSkills('change', stage)).toContain(projectComponentInstructions);
    }
    expect(workflowSkills('change', 'design-review')).toContain('una copia che elude la correzione richiesta');
  });
});
