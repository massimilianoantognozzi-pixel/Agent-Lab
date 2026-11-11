import fs from 'node:fs';
import path from 'node:path';
import {repoRoot,labRoot} from './prepare.mjs';

const locales=path.join(repoRoot,'packages/common/src/locales');
const en=JSON.parse(fs.readFileSync(path.join(locales,'en.json'),'utf8'));
const parts=[1,2,3].map(index=>JSON.parse(fs.readFileSync(path.join(labRoot,'work/locale-it','part-'+index+'.json'),'utf8')));
const it={};
for(const key of Object.keys(en)){
  if(key==='nativeMenu')continue;
  const owners=parts.filter(part=>Object.hasOwn(part,key));
  if(owners.length!==1)throw new Error('Sezione traduzione mancante/duplicata: '+key);
  it[key]=owners[0][key];
}
en.languages.it='Italian';it.languages.it='Italiano';
en.modelSelector.customModelHint='Press Enter to use this custom model name';
it.modelSelector.customModelHint='Premi Invio per usare questo nome di modello personalizzato';
en.promptField.dragToReorder='Drag to reorder';it.promptField.dragToReorder='Trascina per riordinare';
en.contextFiles.uncommitted='UNCOMMITTED';it.contextFiles.uncommitted='MODIFICHE NON COMMITTATE';
en.settings.memory.localProvider='Local';it.settings.memory.localProvider='Locale';
en.settings.memory.localModels={miniLabel:'MiniLM-L6 (Fast, ~90MB)',miniDescription:'Fast and lightweight model',smallLabel:'BGE-Small (Good, ~130MB)',smallDescription:'Good balance of speed and quality',baseLabel:'BGE-Base (Better, ~400MB)',baseDescription:'Better quality for complex tasks'};
it.settings.memory.localModels={miniLabel:'MiniLM-L6 (veloce, ~90MB)',miniDescription:'Modello rapido e leggero',smallLabel:'BGE-Small (bilanciato, ~130MB)',smallDescription:'Buon equilibrio tra velocità e qualità',baseLabel:'BGE-Base (qualità superiore, ~400MB)',baseDescription:'Qualità migliore per attività complesse'};
const statuses={reflecting:['Reflecting message...','Preparazione dell’autocorrezione…'],editingFiles:['Editing files...','Modifica dei file…'],processingRequest:['Processing request...','Elaborazione della richiesta…'],linting:['Linting...','Controllo del codice…'],generatingCommit:['Generating commit message...','Generazione del messaggio di commit…'],committing:['Committing changes...','Creazione del commit…'],filesUpdated:['Files have been updated.','I file sono stati aggiornati.'],fileUpdated:['File has been updated.','Il file è stato aggiornato.'],noRepoMap:['No repo map available.','Nessuna mappa del repository disponibile.'],repoMapRefreshed:['The repo map has been refreshed.','La mappa del repository è stata aggiornata.'],agentIterationLimit:['The agent has reached the maximum number of allowed iterations ({{limit}}). To allow more iterations, open Settings → Agents → Parameters and increase Max Iterations.','L’agente ha raggiunto il numero massimo di iterazioni consentite ({{limit}}). Per consentire altre iterazioni, apri Impostazioni → Agenti → Parametri e aumenta «Iterazioni massime».']};
for(const [key,[english,italian]]of Object.entries(statuses)){en.messages[key]=english;it.messages[key]=italian;}
it.reflectedMessage.title='Messaggio di autocorrezione';
const refinements={
  'settings.tabs.hotkeys':'Scorciatoie',
  'settings.messages.title':'Messaggi',
  'settings.promptBehavior.title':'Richieste',
  'settings.fontSize':'Dimensione testo',
  'modelLibrary.selectedCount':'Selezione: {{count}}',
  'modelLibrary.showingAllModels':'Modelli visualizzati: {{count}} · Tutti i provider',
  'modelLibrary.showingModelsFromProviders':'Modelli visualizzati: {{modelCount}} · Provider: {{providerCount}}',
  'fileEditor.savedAll':'File salvati: {{count}}',
  'contextFiles.selectedFilesToCommit':'Selezione per il commit: {{count}} file su {{total}}',
  'contextFiles.largeDiffMessage':'Righe modificate in questo file: {{count}}. Il caricamento del confronto completo potrebbe essere lento.',
  'mcp.serverToolStatus':'Strumenti abilitati: {{enabledCount}} su {{count}}',
  'toolMessage.power.glob.foundFiles':'File trovati: {{count}}',
  'toolMessage.power.grep.foundMatches':'Corrispondenze trovate: {{count}}',
  'toolMessage.power.grep.contextLines':'(righe di contesto: {{count}})',
  'toolMessage.power.grep.matchesCount':'(corrispondenze: {{count}})',
  'toolMessage.power.semanticSearch.foundMatches':'Corrispondenze trovate: {{count}}',
  'toolMessage.memory.foundMemories':'Memorie trovate: {{count}}.',
  'toolMessage.memory.listedMemories':'Memorie elencate: {{count}}.',
  'promptField.queuedPromptImages':'Immagini allegate: {{count}}',
  'workingMode.confirmWorktreeMessage':'File senza commit nella cartella del progetto: {{count}}.',
  'multiselect.someSelected':'Selezione: {{count}}',
  'usageDashboard.charts.andMore':'(altri elementi: +{{count}})',
  'usageDashboard.charts.moreItems':'Altri elementi: +{{count}}',
  'taskSidebar.selectedCount':'Attività selezionate: {{count}}',
  'taskSidebar.deleteSelectedConfirm':'Vuoi davvero eliminare le attività selezionate ({{count}})?',
  'taskSidebar.archiveSelectedConfirm':'Vuoi davvero archiviare le attività selezionate ({{count}})?',
  'taskSidebar.unarchiveSelectedConfirm':'Vuoi davvero ripristinare dall’archivio le attività selezionate ({{count}})?',
  'messages.agentIterationLimit':'L’agente ha raggiunto il numero massimo di iterazioni consentite ({{limit}}). Per consentire altre iterazioni, apri Impostazioni → Agenti → Parametri e aumenta «Numero massimo di iterazioni».',
};
for(const [key,value]of Object.entries(refinements)){const parts=key.split('.');const last=parts.pop();const parent=parts.reduce((node,part)=>node[part],it);parent[last]=value;}
it.nativeMenu={'File':'File','New Window':'Nuova finestra','Quit':'Esci','Edit':'Modifica','Undo':'Annulla','Redo':'Ripeti','Cut':'Taglia','Copy':'Copia','Paste':'Incolla','Select All':'Seleziona tutto','View':'Visualizza','Reload':'Ricarica','Toggle Developer Tools':'Mostra/nascondi strumenti per sviluppatori','Reset Zoom':'Reimposta zoom','Zoom In':'Aumenta zoom','Zoom Out':'Riduci zoom','Toggle Full Screen':'Attiva/disattiva schermo intero','Show Logs':'Mostra log','Settings':'Impostazioni','General':'Generali','Aider':'Aider','Agent':'Agente','Server':'Server','About':'Informazioni'};
en.nativeMenu=Object.fromEntries(Object.keys(it.nativeMenu).map(key=>[key,key]));
for(const [lang,label] of Object.entries({zh:'意大利语',ru:'Итальянский',ko:'이탈리아어'})){
  const file=path.join(locales,lang+'.json');const content=JSON.parse(fs.readFileSync(file,'utf8'));content.languages.it=label;fs.writeFileSync(file,JSON.stringify(content,null,2)+'\n');
}
fs.writeFileSync(path.join(locales,'en.json'),JSON.stringify(en,null,2)+'\n');
fs.writeFileSync(path.join(locales,'it.json'),JSON.stringify(it,null,2)+'\n');
console.log('Catalogo italiano assemblato e lingua aggiunta.');
