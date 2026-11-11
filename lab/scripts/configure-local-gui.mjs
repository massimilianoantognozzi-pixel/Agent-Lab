import fs from 'node:fs';
import path from 'node:path';
import { homeDir, dataDir, labRoot, laboratoryEnvironment } from './prepare.mjs';

export const localModelEnvironment = () => ({
  ...laboratoryEnvironment(), AIDER_DESK_LAB_LOCAL_MODEL: 'devstral-readonly',
  AIDER_DESK_LAB_TOKENIZER_DIR: path.join(labRoot, 'profile', 'local-tokenizer'),
});

export const configureLocalGui = () => {
  const marker = path.join(labRoot, 'profile', 'local-gui-config-v1.json');
  if (fs.existsSync(marker)) return;
  const file = path.join(dataDir, 'config.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if ((config.providers ?? []).some(provider => provider.id !== 'lab-local-devstral')) throw new Error('Provider del laboratorio da verificare prima di configurare il locale.');
  config.providers = [{ id: 'lab-local-devstral', name: 'Devstral Small 2 sul PC', provider: { name: 'ollama', baseUrl: 'http://127.0.0.1:11435' } }];
  config.settings.taskSettings = { ...config.settings.taskSettings, contextCompactingThreshold: { percentage: 75, tokens: 18000 }, contextCompactionType: 'smart' };
  config.settings.promptBehavior = { ...config.settings.promptBehavior, suggestionMode: 'onTab' };
  const profileFile = path.join(homeDir, 'agents', 'lab-checkpoint', 'config.json');
  const profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
  Object.assign(profile, {
    name: 'Devstral locale - lettura', provider: 'lab-local-devstral', model: 'devstral-small-2:24b-instruct-2512-q4_K_M',
    maxIterations: 12, maxTokens: 4096, autoCompactThresholdPercentage: 75, autoCompactThresholdTokens: 18000, autoCompactionType: 'smart',
    customInstructions: 'Rispondi in italiano. Usi il modello Devstral sul PC. Lavora soltanto sul progetto sintetico attivo. Sono abilitate le letture; proponi il codice in chat e non dichiarare di aver scritto file o eseguito test.',
  });
  const atomic = (target, content) => {
    fs.writeFileSync(target + '.local-next', content, { flag: 'wx' });
    fs.renameSync(target + '.local-next', target);
  };
  atomic(file, JSON.stringify(config, null, 2));
  atomic(profileFile, JSON.stringify(profile, null, 2));
  atomic(path.join(homeDir, 'rules', '01-lab.md'), '# Agent Lab locale\n\nModello Devstral sul PC, nessun provider cloud. Solo progetti sintetici del laboratorio.\nSono consentite letture e proposte di codice; scrittura, shell e rete sono disabilitate.\nNon fingere di avere modificato file o eseguito test.\n');
  fs.writeFileSync(marker, JSON.stringify({ version: 1, configuredAt: new Date().toISOString() }), { flag: 'wx' });
};
