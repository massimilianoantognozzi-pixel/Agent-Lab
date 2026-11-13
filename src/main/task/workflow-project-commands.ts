export const projectWorkflowCommandPattern =
  /^(?:(?:avvia|riprendi) il lavoro|riprendi le validazioni|conferma passaggio [a-z0-9-]+ [1-9][0-9]*|registra esito [a-z0-9-]+ (?:superata|fallita)(?:\s+[\s\S]+)?)[.!]?$/i;

export const parseProjectWorkflowCommand = (prompt: string) => {
  const text = prompt.trim();
  if (!projectWorkflowCommandPattern.test(text)) {
    return undefined;
  }
  if (/^(?:avvia|riprendi) il lavoro[.!]?$/i.test(text)) {
    return { kind: 'start' } as const;
  }
  if (/^riprendi le validazioni[.!]?$/i.test(text)) {
    return { kind: 'resume-validation' } as const;
  }
  const step = /^conferma passaggio ([a-z0-9-]+) ([1-9][0-9]*)[.!]?$/i.exec(text);
  if (step) {
    return { kind: 'confirm-step', id: step[1].toUpperCase(), step: Number(step[2]) } as const;
  }
  const result = /^registra esito ([a-z0-9-]+) (superata|fallita)\b(?:\s+([\s\S]+))?[.!]?$/i.exec(text);
  if (result) {
    return { kind: 'record-result', id: result[1].toUpperCase(), passed: result[2].toLowerCase() === 'superata', notes: result[3]?.trim() } as const;
  }
  return undefined;
};
