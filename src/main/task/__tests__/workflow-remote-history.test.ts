import { describe, expect, it } from 'vitest';

import { remoteReasoning, remoteWorkflowMessages, remoteWorkflowTitle } from '../workflow-remote-history';

import type { ContextMessage } from '@common/types';

const user = (id: string, content: string): ContextMessage => ({ id, role: 'user', content, promptContext: { id } });
const assistant = (id: string, request: string, text: string): ContextMessage => ({
  id,
  role: 'assistant',
  content: [{ type: 'text', text }],
  promptContext: { id: request },
});

describe('remote workflow history', () => {
  it('keeps the conversation and summarizes workflow results without exposing host paths', () => {
    const messages = remoteWorkflowMessages([
      user('one', '/workflow bug Correggi il filtro.'),
      assistant('two', 'one', '## Correzione\n\nMostrare solo i turni attivi.\n\nVersione: 123'),
      user('three', '/workflow status'),
      assistant('four', 'three', '## Correzione\n\nMostrare solo i turni attivi.'),
      user('five', '/workflow approve 123'),
      assistant('six', 'five', '## Consegna verificata\nPatch: C:\\Users\\private\\result.patch'),
    ]);
    expect(messages).toEqual([
      { id: 'one', role: 'user', text: 'Correggi il filtro.' },
      { id: 'two', role: 'assistant', text: 'Mostrare solo i turni attivi.' },
      { id: 'six', role: 'assistant', text: 'Ho completato le verifiche e preparato la patch.' },
    ]);
  });

  it('omits unrelated conversations and rejects secret-like titles or requests', () => {
    const fakeSecret = 'sk-' + 'a'.repeat(32);
    const messages = remoteWorkflowMessages([
      user('one', 'Una conversazione ordinaria precedente'),
      assistant('two', 'one', '## Correzione\n\nUna risposta ordinaria'),
      user('three', '/workflow feature Usa ' + fakeSecret),
    ]);
    expect(messages).toEqual([]);
    expect(remoteWorkflowTitle('/workflow feature Usa ' + fakeSecret)).toBeUndefined();
    expect(remoteWorkflowTitle('/workflow feature Un titolo\nsu due righe')).toBe('Un titolo su due righe');
    expect(remoteWorkflowTitle('/workflow feature Apri C:\\Users\\private\\src')).toBeUndefined();
    expect(remoteWorkflowMessages([user('path', '/workflow bug Apri C:\\Users\\private\\src')])).toEqual([
      { id: 'path', role: 'user', text: 'Richiesta con riferimento a un percorso locale.' },
    ]);
    expect(remoteReasoning('max')).toBe('default');
  });
});
