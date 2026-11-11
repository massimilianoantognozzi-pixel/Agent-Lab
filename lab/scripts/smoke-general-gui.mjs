import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { prepare,repoRoot,labRoot,homeDir,dataDir } from './prepare.mjs';
import { configureGeneralGui,generalEnvironment } from './configure-general-gui.mjs';
import { startLocalBackend } from './managed-local-backend.mjs';

const require=createRequire(path.join(repoRoot,'package.json'));const {_electron}=require('playwright');
prepare();configureGeneralGui();
const cloud=process.argv.includes('--cloud');
const noStream=cloud&&process.argv.includes('--no-stream');
const providerId=cloud?'zai-standard-free-candidate':'lab-local-devstral';
const codeOnly=process.argv.includes('--code-only');
const typescript=process.argv.includes('--typescript')||(codeOnly&&!cloud);
const priorProof=codeOnly?JSON.parse(fs.readFileSync(path.join(labRoot,'work',cloud?'zai-4.5-aiderdesk-proof.json':'general-typescript-proof.json'),'utf8')):null;
const testEnv=()=>generalEnvironment({testRun:true});
const selectedModel=cloud?(process.argv.find(arg=>arg.startsWith('--cloud-model='))?.slice('--cloud-model='.length)??'glm-4.7-flash'):'devstral-aiderdesk:24b';
if(cloud&&!['glm-4.7-flash','glm-4.5-flash'].includes(selectedModel))throw new Error('La prova cloud usa solo le due varianti Flash gratuite verificate.');
const modelsFile=path.join(dataDir,'models.json');const overrides=fs.existsSync(modelsFile)?JSON.parse(fs.readFileSync(modelsFile,'utf8')):{version:1,models:[]};
for(const id of ['devstral-small-2:24b-instruct-2512-q4_K_M','devstral-aiderdesk:24b'])if(!overrides.models.some(model=>model.providerId==='lab-local-devstral'&&model.id===id))overrides.models.push({id,providerId:'lab-local-devstral',maxInputTokens:32768,maxOutputTokens:4096,inputCostPerToken:0,outputCostPerToken:0,supportsTools:true});
if(cloud){let model=overrides.models.find(model=>model.providerId===providerId&&model.id===selectedModel);if(!model&&selectedModel==='glm-4.5-flash'){model={id:selectedModel,providerId,maxInputTokens:128000,maxOutputTokens:4096,inputCostPerToken:0,outputCostPerToken:0,supportsTools:true};overrides.models.push(model);}if(!model)throw new Error('Metadata del modello gratuito mancanti.');model.isCustom=true;model.providerOverrides={...model.providerOverrides,disableStreaming:noStream};}
fs.writeFileSync(modelsFile,JSON.stringify(overrides,null,2));
const directory=priorProof?.directory??path.join(labRoot,'work',cloud?'general-cloud-python-'+Date.now():typescript?'general-typescript-'+Date.now():'general-python-project');fs.mkdirSync(directory,{recursive:true});
const initial={
  'calculator.py':'def discounted_total(total, percent):\n    """Return the final total after a percentage discount."""\n    if total < 0 or not 0 <= percent <= 100:\n        raise ValueError("invalid input")\n    return round(total * percent / 100, 2)\n',
  'test_calculator.py':'import unittest\nfrom calculator import discounted_total\n\nclass CalculatorTests(unittest.TestCase):\n    def test_ten_percent(self): self.assertEqual(discounted_total(100, 10), 90)\n    def test_zero(self): self.assertEqual(discounted_total(100, 0), 100)\n    def test_full(self): self.assertEqual(discounted_total(100, 100), 0)\n    def test_decimal(self): self.assertEqual(discounted_total(19.99, 15), 16.99)\n    def test_invalid(self):\n        for total, percent in [(-1, 5), (100, -1), (100, 101)]:\n            with self.subTest(total=total, percent=percent):\n                with self.assertRaises(ValueError): discounted_total(total, percent)\n\nif __name__ == "__main__": unittest.main()\n',
  '.gitignore':'.aider-desk/\n.serena/\n__pycache__/\n.env*\n',
};
if(typescript){
  delete initial['calculator.py'];delete initial['test_calculator.py'];
  initial['slug.ts']='export function slugify(value: string): string {\n  throw new Error("TODO");\n}\n';
  initial['package.json']=JSON.stringify({name:'general-typescript-proof',private:true,type:'module',scripts:{test:'node --test slug.test.mjs'}},null,2)+'\n';
  initial['slug.test.mjs']='import {test} from "node:test";\nimport assert from "node:assert/strict";\nimport {slugify} from "./slug.ts";\ntest("spaces and case",()=>assert.equal(slugify(" Hello World "),"hello-world"));\ntest("accents",()=>assert.equal(slugify("Caffè già pronto"),"caffe-gia-pronto"));\ntest("punctuation",()=>assert.equal(slugify("A & B! / C"),"a-b-c"));\ntest("empty",()=>assert.equal(slugify("  !!!  "),""));\ntest("repeated separators",()=>assert.equal(slugify("a---b__c"),"a-b-c"));\n';
}
for(const [file,content]of Object.entries(initial))if(!fs.existsSync(path.join(directory,file)))fs.writeFileSync(path.join(directory,file),content,{flag:'wx'});
if(!fs.existsSync(path.join(directory,'.git'))){execFileSync('git',['init',directory],{env:testEnv(),windowsHide:true,stdio:'ignore'});execFileSync('git',['-C',directory,'add',...Object.keys(initial)],{env:testEnv(),windowsHide:true,stdio:'ignore'});execFileSync('git',['-C',directory,'-c','user.name=AgentLab Test','-c','user.email=agentlab-test@localhost','commit','-m','Fixture sintetica iniziale'],{env:testEnv(),windowsHide:true,stdio:'ignore'});}
const report={startedAt:new Date().toISOString(),directory,phases:[],errors:[],pageErrors:[]};
let app,backend,page;const reportFile=path.join(labRoot,'work',cloud&&codeOnly?'zai-4.5-code-proof.json':cloud&&selectedModel==='glm-4.5-flash'?'zai-4.5-aiderdesk-proof.json':noStream?'zai-aiderdesk-nonstream-proof.json':cloud?'zai-aiderdesk-proof.json':codeOnly?'general-aider-code-proof.json':typescript?'general-typescript-proof.json':'general-gui-proof.json');
const save=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
const wait=async(predicate,timeout=(noStream||selectedModel==='glm-4.5-flash')?180000:600000)=>{const until=Date.now()+timeout;while(Date.now()<until){const value=await predicate();if(value)return value;await new Promise(resolve=>setTimeout(resolve,500));}throw new Error('Verifica generale oltre il tempo previsto.');};
try{
  if(!cloud){backend=await startLocalBackend();report.backend=backend.ready;}
  app=await _electron.launch({executablePath:require('electron'),args:[repoRoot],cwd:repoRoot,env:{...testEnv(),AIDER_DESK_SYNTHETIC_RESPONSE_TRACE:path.join(labRoot,'work','ollama-response-metadata')},timeout:60000});
  for(const stream of [app.process().stdout,app.process().stderr])stream.on('data',chunk=>fs.appendFileSync(path.join(labRoot,'work','general-electron.log'),chunk));
  page=await wait(async()=>{for(const window of app.windows())if(await window.evaluate(()=>Boolean(window.api)).catch(()=>false))return window;},60000);page.on('pageerror',error=>report.pageErrors.push(error.message));
  report.profile=JSON.parse(fs.readFileSync(path.join(homeDir,'agents','lab-checkpoint','config.json'),'utf8'));
  if(report.profile.maxIterations!==0||!report.profile.usePowerTools||!report.profile.useAiderTools||!report.profile.useExtensionTools)throw new Error('Profilo generale incompleto.');
  report.setup=await wait(async()=>{const status=await page.evaluate(()=>window.api.getAiderConnectorStatus());report.setupStatus=status;save();if(status.state==='failed')throw new Error('Setup Python: '+status.error);return status.state==='ready'?status:null;},900000);
  report.task=await page.evaluate(async({dir,model,id,provider})=>{await window.api.addOpenProject(dir);await window.api.patchProjectSettings(dir,{mainModel:model,weakModel:model,currentMode:'agent'});const task=await window.api.createNewTask(dir,{name:'Verifica generale',activate:true,mainModel:model,weakModel:model,provider,model:id,...(provider==='zai-standard-free-candidate'?{autonomyMode:'autonomous'}:{})});await window.api.loadTask(dir,task.id);window.__generalProof={completed:[],logs:[],questions:[]};window.api.addResponseCompletedListener(dir,task.id,value=>window.__generalProof.completed.push(value));window.api.addLogListener(dir,task.id,value=>window.__generalProof.logs.push(value));window.api.addAskQuestionListener(dir,task.id,value=>{window.__generalProof.questions.push(value);if(value.baseDir===dir&&value.taskId===task.id&&window.__generalProof.requestedMode==='code'&&/^Do you accept the changes\?$/i.test(value.text??''))window.api.answerQuestion(dir,task.id,'y');else window.__generalProof.unexpectedQuestion=value;});return task;},{dir:directory,model:providerId+'/'+selectedModel,id:selectedModel,provider:providerId});save();
  const ask=async(prompt,mode='agent')=>{
    const before=await page.evaluate(()=>({ids:window.__generalProof.completed.map(message=>message.messageId),logs:window.__generalProof.logs.length}));const start=Date.now();
    await page.evaluate(({dir,id,prompt,mode})=>{window.__generalProof.requestedMode=mode;window.__generalProof.requestError=null;void Promise.resolve(window.api.runPrompt(dir,id,prompt,mode)).catch(error=>{window.__generalProof.requestError=error.message??String(error);});},{dir:directory,id:report.task.id,prompt,mode});
    const phase=await wait(()=>page.evaluate(async({dir,id,before,start})=>{if(window.__generalProof.requestError)throw new Error(window.__generalProof.requestError);if(window.__generalProof.unexpectedQuestion)throw new Error('Domanda da verificare: '+JSON.stringify(window.__generalProof.unexpectedQuestion));const task=(await window.api.getTasks(dir)).find(task=>task.id===id);const errors=window.__generalProof.logs.slice(before.logs).filter(log=>log.level==='error');if(errors.length)throw new Error(errors.map(log=>log.message).join('\n'));const completed=window.__generalProof.completed.filter(message=>!before.ids.includes(message.messageId)&&(!message.timestamp||message.timestamp>=start));if(task?.state==='INTERRUPTED'&&Date.parse(task.interruptedAt??task.updatedAt)>=start)throw new Error('Richiesta interrotta senza completamento.');if(task?.state!=='IN_PROGRESS'&&Date.parse(task?.completedAt)>=start)return{elapsedMs:Date.now()-start,state:task?.state,completed};return null;},{dir:directory,id:report.task.id,before,start}));const finalState=await page.evaluate(({dir,id})=>window.api.loadTask(dir,id),{dir:directory,id:report.task.id});phase.messages=finalState.messages;report.phases.push(phase);save();return phase;
  };
  if(!codeOnly){
    await ask('Senza usare strumenti rispondi esattamente: AiderDesk generale collegato');
    await ask(typescript?'Questo e un progetto TypeScript con Node 24 e nessuna dipendenza. Prima usa Serena get_symbols_overview o find_symbol su slug.ts per individuare la funzione nel progetto attivo. Poi leggi slug.test.mjs e implementa slugify in slug.ts: minuscolo, rimuovere accenti, sostituire ogni gruppo di caratteri non ASCII alfanumerici con un solo trattino, togliere trattini iniziali/finali. Usa gli strumenti nativi. Esegui npm test e correggi fino a PASS. Non modificare slug.test.mjs e package.json. Non installare pacchetti. Riporta esito reale.':'Questo e un progetto Python esistente, fuori dalla vecchia cartella workspace web. Usa gli strumenti nativi Power (lettura, ricerca, modifica e terminale) per leggere calculator.py e test_calculator.py, eseguire python -m unittest -v, diagnosticare e correggere il difetto nella funzione. Non modificare i test. Riesegui i test dopo la correzione e riporta l esito effettivo. Puoi lavorare su progetti generali: nessun template web e richiesto.');
  }
  report.events=await page.evaluate(()=>window.__generalProof);report.files=await page.evaluate(({dir,id})=>window.api.getAllFiles(dir,id),{dir:directory,id:report.task.id});report.updated=await page.evaluate(({dir,id})=>window.api.getUpdatedFiles(dir,id),{dir:directory,id:report.task.id});
  const source=typescript?'slug.ts':'calculator.py',testFile=typescript?'slug.test.mjs':'test_calculator.py';
  const executable=typescript?process.execPath:path.join(dataDir,'python-venv','Scripts','python.exe');
  report.independentTests=execFileSync(executable,typescript?['--test',testFile]:['-m','unittest','-v'],{cwd:directory,env:testEnv(),windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  report.testFileUnchanged=fs.readFileSync(path.join(directory,testFile),'utf8')===initial[testFile];
  report.serenaUsed=report.phases.flatMap(phase=>phase.messages??[]).some(message=>message.type==='tool'&&message.serverName==='serena'&&['find_symbol','get_symbols_overview'].includes(message.toolName)&&message.finished&&!message.isError);
  await page.screenshot({path:path.join(labRoot,'artifacts',typescript?'aiderdesk-general-typescript.png':'aiderdesk-general-python.png')});
  report.packageUnchanged=!typescript||fs.readFileSync(path.join(directory,'package.json'),'utf8')===initial['package.json'];
  report.pass=report.testFileUnchanged&&report.packageUnchanged&&report.files.includes(source)&&report.updated.some(file=>file.path===source)&&report.pageErrors.length===0&&(!typescript||codeOnly||report.serenaUsed);
  if((typescript||(cloud&&codeOnly))&&report.pass){
    report.agentPass=true;save();
    await page.evaluate(({dir,id,model,source,testFile})=>{window.api.updateMainModel(dir,id,model);window.api.updateWeakModel(dir,id,model);window.api.addFile(dir,id,source);window.api.addFile(dir,id,testFile,true);},{dir:directory,id:report.task.id,model:providerId+'/'+selectedModel,source,testFile});
    await ask(typescript?'Modifica solo slug.ts: aggiungi immediatamente prima della funzione esportata il commento JSDoc /** Convert text to a URL-friendly slug. */. Conserva identico il comportamento. Non modificare i test e non installare nulla. Esegui questa modifica al file, non limitarti a descriverla.':'Modifica solo calculator.py: sostituisci la docstring della funzione con il testo esatto "Return the final discounted total; cloud Code mode verified.". Conserva identico il comportamento e non modificare i test. Applica realmente la modifica al file.','code');
    report.codeModeModified=fs.readFileSync(path.join(directory,source),'utf8').includes(typescript?'/** Convert text to a URL-friendly slug. */':'Return the final discounted total; cloud Code mode verified.');
    report.codeModeTests=execFileSync(executable,typescript?['--test',testFile]:['-m','unittest','-v'],{cwd:directory,env:testEnv(),windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']});
    report.testFileUnchanged=fs.readFileSync(path.join(directory,testFile),'utf8')===initial[testFile];
    report.pass=report.pass&&report.codeModeModified&&report.testFileUnchanged;
  }
}catch(error){report.errors.push(error.stack??String(error));report.pass=false;}
finally{save();if(app){const child=app.process();await app.close().then(()=>{report.appClosed=true;report.appExitCode=child.exitCode;}).catch(error=>report.errors.push(String(error)));}if(backend)await backend.stop().then(()=>report.backendClosed=true).catch(error=>report.errors.push(String(error)));save();console.log(JSON.stringify({pass:report.pass,setup:report.setupStatus,errors:report.errors,phases:report.phases.map(phase=>({elapsedMs:phase.elapsedMs,state:phase.state}))}));}
if(!report.pass)process.exitCode=1;
