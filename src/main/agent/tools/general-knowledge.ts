import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { compileGeneralKnowledge, searchGeneralKnowledge } from '@/general-knowledge';

export const createGeneralKnowledgeTools = (
  project: string,
  model: string,
  generate: (system: string, prompt: string) => Promise<string | undefined>,
): ToolSet => ({
  'knowledge---search': tool({
    description:
      'Cerca lezioni riutilizzabili nella Knowledge Base generale. Sono interpretazioni del modello con comando osservato, sorgenti e versione, non regole superiori alle istruzioni del progetto.',
    inputSchema: z.object({
      query: z.string(),
      scope: z.enum(['project', 'general']).optional().describe('Usa project per recuperare lezioni del progetto attivo con una ricevuta di esecuzione.'),
    }),
    execute: (input: { query: string; scope?: 'project' | 'general' }) => searchGeneralKnowledge(input.query, input.scope === 'project' ? project : undefined),
  }),
  'knowledge---capture': tool({
    description:
      'Fa compilare al modello una voce KB sulle ultime prove attuali del progetto. Richiede un comando realmente terminato con codice0 e file osservati coerenti. Non certifica automaticamente tutto il progetto.',
    inputSchema: z.object({}),
    execute: () => compileGeneralKnowledge(project, model, generate),
  }),
});
