/// <reference types="vite/client" />
import { newWorkRequestPattern } from '@common/work-commands';

import start from '../../../lab/commands/inizia.md?raw';
import resume from '../../../lab/commands/riprendi.md?raw';
import close from '../../../lab/commands/chiudi.md?raw';

const templates = { '/inizia': start, '/riprendi': resume, '/chiudi': close };

export const sessionPrompt = (command: string): string | undefined => {
  const request = newWorkRequestPattern.exec(command.trim())?.[1].trim();
  const key = request ? '/inizia' : command.trim().toLowerCase();
  if (!Object.hasOwn(templates, key)) {
    return undefined;
  }
  const body = templates[key as keyof typeof templates].replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
  return request ? body + '\n\nRichiesta specifica dell’utente\n' + request : body;
};
