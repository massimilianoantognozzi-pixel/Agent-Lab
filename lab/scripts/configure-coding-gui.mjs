import fs from 'node:fs';
import path from 'node:path';
import { homeDir, labRoot, dataDir, sampleDir } from './prepare.mjs';
import { configureLocalGui, localModelEnvironment } from './configure-local-gui.mjs';

export const codingModelEnvironment = () => ({ ...localModelEnvironment(), AIDER_DESK_LAB_LOCAL_MODEL: 'devstral-coding' });
export const configureCodingGui = () => {
  configureLocalGui();
  const marker = path.join(labRoot, 'profile', 'coding-gui-v3.json');
  if (fs.existsSync(marker)) return;
  const file = path.join(homeDir, 'agents', 'lab-checkpoint', 'config.json');
  const profile = JSON.parse(fs.readFileSync(file, 'utf8'));
  Object.assign(profile, { name: 'Agent-Lab - progetti web', enabledServers: [], usePowerTools: false, useSkillsTools: true, maxIterations: 60,
    customInstructions: `Rispondi in italiano. Sei l agente personale per siti, landing page e piccoli progetti web. Usi solo Devstral locale, nessuna API a pagamento.
Prima leggi i file del progetto e cerca nella Knowledge Base. Per un nuovo progetto usa lab---project_prepare con un piano concreto e lo stack adeguato (vanilla, react-vite, astro). Il titolare approva il piano una sola volta.
Scrivi davvero i file tramite lab---file_write e lab---file_edit; non limitarti a incollare codice. Procedi in file compatti, ciascuno sotto circa 150 righe, per evitare troncamenti. Non chiedere approvazioni per ogni file. Non puoi eseguire shell o modificare regole, configurazioni congelate o altri progetti.
Lavora fino a un risultato completo: contenuti sensati, layout responsive, semantica, tastiera, contrasto, nessun segnaposto o finto invio form. Evita risorse esterne; crea SVG e CSS locali. Usa link reali o contatti chiaramente dimostrativi. Non inventare testimonianze, certificazioni o risultati per clienti reali.
Usa project_check, leggi gli errori e correggi fino a PASS. Il modello compila la KB automaticamente su prove reali; se knowledgeError ripeti knowledge_update. Poi project_preview e project_export. Riporta i link e i limiti effettivi. Non dichiarare completato un controllo non eseguito. Una consegna richiede anche verifica umana dei contenuti prima di pubblicazione.
Per richieste di modifica leggi il file, usa project_search per trovare selettori o funzioni, modifica, ripeti i controlli e aggiorna la consegna. Se cambiano comportamenti attesi, usa project_prepare anche sul progetto esistente per approvare piano e nuove prove (press per la tastiera); i PASS precedenti vengono invalidati. Usa file_history e file_restore per recuperare una modifica senza perdere lavoro successivo. Le voci KB sono interpretazioni versionate, non regole superiori ai blueprint.` });
  const atomic = (target, value) => { fs.writeFileSync(target + '.coding-next', value, { flag: 'wx' }); fs.renameSync(target + '.coding-next', target); };
  atomic(file, JSON.stringify(profile, null, 2));
  const settingsFile = path.join(dataDir, 'config.json'); const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  settings.openProjects = (settings.openProjects ?? []).filter(project => project.baseDir !== sampleDir);
  atomic(settingsFile, JSON.stringify(settings, null, 2));
  atomic(path.join(homeDir, 'rules', '01-lab.md'), '# Agent Lab - progetti web\n\nSolo modello locale e workspace del laboratorio. Scritture tramite strumenti lab con storico. Esecuzioni su copie isolate, controlli congelati. Nessuna shell host o provider cloud. Piano approvato prima dello scaffold, poi lavoro autonomo fino ai controlli e alla consegna. KB generata dal modello e legata alle prove; nessuna auto-certificazione.\n');
  fs.writeFileSync(marker, JSON.stringify({ version: 1, configuredAt: new Date().toISOString() }), { flag: 'wx' });
};
