import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import YAML from 'yaml';
import { homeDir, dataDir, labRoot, workspaceRoot, serenaDir, laboratoryEnvironment } from './prepare.mjs';
import { localBaseModel, localFallbackModel } from './local-fallback.mjs';

export const atomicProfileWrite=(file,text)=>{
  const next=file+'.next-'+randomUUID();
  try{fs.writeFileSync(next,text,{flag:'wx'});fs.renameSync(next,file);}
  finally{if(fs.existsSync(next))fs.unlinkSync(next);}
};

export const restoreGeneralSerenaTools=({file=path.join(serenaDir,'serena_config.yml'),marker=path.join(labRoot,'profile','general-serena-v1.json')}={})=>{
  if(fs.existsSync(marker))return;
  const document=YAML.parseDocument(fs.readFileSync(file,'utf8'));
  if(document.errors.length)throw new Error('Configurazione Serena privata da verificare.');
  const excluded=document.get('excluded_tools')?.toJSON?.()??[];
  if(!Array.isArray(excluded))throw new Error('Formato excluded_tools Serena non valido.');
  if(excluded.includes('execute_shell_command')){
    document.set('excluded_tools',excluded.filter(name=>name!=='execute_shell_command'));
    atomicProfileWrite(file,document.toString());
  }
  atomicProfileWrite(marker,JSON.stringify({configuredAt:new Date().toISOString(),decision:'Remove the shell exclusion introduced by the initial laboratory'}));
};

export const generalEnvironment = ({ testRun = false, inherited = process.env } = {}) => {
  // Keep the user's development toolchain. Never forward Codex's private IPC or runtime controls.
  const env = testRun ? laboratoryEnvironment() : Object.fromEntries(Object.entries(inherited).filter(([key]) => !/^CODEX_|^ELECTRON_RUN_AS_NODE$/i.test(key)));
  Object.assign(env,{NODE_ENV:'production',AIDER_DESK_GENERAL_MODE:'true',AIDER_DESK_LAB_MODE:'false',AIDER_DESK_LAB_LOCAL_MODEL:'devstral-coding',AIDER_DESK_DATA_DIR:dataDir,AIDER_DESK_HOME_DIR:homeDir,AIDER_DESK_DIR:'.aider-desk',AIDER_DESK_PORT:'24338',SERENA_HOME:serenaDir,OTEL_SDK_DISABLED:'true',POSTHOG_PUBLIC_API_KEY:'',UV_CACHE_DIR:path.join(labRoot,'profile','uv-cache'),UV_PYTHON_INSTALL_DIR:path.join(labRoot,'profile','uv-python'),UV_TOOL_DIR:path.join(labRoot,'profile','uv-tools'),UV_TOOL_BIN_DIR:path.join(labRoot,'profile','uv-bin')});
  if(testRun){
    delete env.GIT_CEILING_DIRECTORIES;
    env.AIDER_DESK_AIDER_VERSION='0.86.2';env.AIDER_DESK_NO_UPDATES='true';
    env.PATH=path.join(dataDir,'python-venv','Scripts')+path.delimiter+(env.PATH??env.Path??'');delete env.Path;
  }
  env.NPM_CONFIG_CACHE=path.join(labRoot,'profile','npm-cache');env.PIP_CACHE_DIR=path.join(labRoot,'profile','pip-cache');
  return env;
};
const configureGeneralGuiV2 = () => {
  const marker = path.join(labRoot,'profile','general-gui-v2.json');
  if(fs.existsSync(marker))return;
  const profileFile=path.join(homeDir,'agents','lab-checkpoint','config.json');
  const profile=JSON.parse(fs.readFileSync(profileFile,'utf8'));
  Object.assign(profile,{
    name:'AiderDesk - sviluppo generale',provider:'lab-local-devstral',model:'devstral-small-2:24b-instruct-2512-q4_K_M',maxIterations:0,
    usePowerTools:true,useAiderTools:true,useTodoTools:true,useSubagents:true,useTaskTools:true,
    useSkillsTools:true,useExtensionTools:true,useMemoryTools:false,enabledServers:['serena'],
    toolApprovals:{},
    autoCompactThresholdPercentage:75,autoCompactThresholdTokens:0,autoCompactionType:'smart',
    customInstructions:`Rispondi in italiano. Sei un agente di sviluppo generale su AiderDesk. L utente decide quali progetti, linguaggi, dimensioni e tipi di software realizzare. Usa gli strumenti nativi completi: lettura, ricerca, modifica, terminale/comandi, test, debug, Aider, skill e Serena quando pertinenti. I template web sono esempi facoltativi. Rispetta AGENTS e le decisioni approvate del progetto. Non inventare il contenuto dei file: leggi prima di modificarli. Verifica con comandi e risultati reali. Non dichiarare riuscito un controllo fallito o non eseguito. Le conoscenze riutilizzabili devono essere compilate dal modello su prove effettive, con ambito/versione, e non sostituiscono le istruzioni dell utente. Usa solo il provider/modello esplicitamente scelto; nessun cambio automatico a servizi pagati.`,
  });
  const atomic=atomicProfileWrite;
  atomic(profileFile,JSON.stringify(profile,null,2));
  atomic(path.join(homeDir,'rules','01-lab.md'),'# AiderDesk - sviluppo generale\n\nDecisione esplicita utente: progetto completo per sviluppare qualsiasi cosa scelga. Strumenti e funzioni native disponibili, nessun vincolo a siti, linguaggi, template o dimensioni. Il banco web e storico. Costo0: nessun abbonamento o fallback pagato automatico. L utente decide il progetto; rispettare i suoi AGENTS e il perimetro del lavoro.\n');
  const configFile=path.join(dataDir,'config.json');const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
  config.settings.taskSettings={...config.settings.taskSettings,contextCompactingThreshold:{percentage:75,tokens:0},contextCompactionType:'smart'};
  if(!(config.providers??[]).some(provider=>provider.id==='lab-local-devstral'))config.providers=[...(config.providers??[]),{id:'lab-local-devstral',name:'Devstral locale - fallback',provider:{name:'ollama',baseUrl:'http://127.0.0.1:11435'}}];
  for(const project of config.openProjects??[]) if(project.settings&&!project.settings.mainModel)project.settings.mainModel='lab-local-devstral/'+localFallbackModel;
  for(const project of config.openProjects??[]){
    const root=path.resolve(project.baseDir);
    if(!root.startsWith(path.resolve(workspaceRoot)+path.sep))continue;
    const source=path.join(root,'.agent-lab'),target=path.join(root,'.aider-desk');
    if(fs.existsSync(source)&&!fs.existsSync(target))fs.cpSync(source,target,{recursive:true,force:false,errorOnExist:true});
  }
  atomic(configFile,JSON.stringify(config,null,2));
  const mcpFile=path.join(homeDir,'mcp-servers.json');
  if(fs.existsSync(mcpFile)){
    const mcp=JSON.parse(fs.readFileSync(mcpFile,'utf8'));const server=mcp.mcpServers?.serena ?? mcp.serena;
    if(server?.args){const index=server.args.indexOf('--project');if(index>=0)server.args[index+1]='${taskDir}';server.env={...server.env,XDG_CACHE_HOME:path.join(labRoot,'profile','serena-cache'),UV_CACHE_DIR:path.join(labRoot,'profile','uv-cache'),UV_PYTHON_INSTALL_DIR:path.join(labRoot,'profile','uv-python'),UV_TOOL_DIR:path.join(labRoot,'profile','uv-tools'),UV_TOOL_BIN_DIR:path.join(labRoot,'profile','uv-bin'),NPM_CONFIG_CACHE:path.join(labRoot,'profile','npm-cache')};atomic(mcpFile,JSON.stringify(mcp,null,2));}
  }
  fs.writeFileSync(marker,JSON.stringify({version:1,configuredAt:new Date().toISOString(),decision:'Full AiderDesk; all imposed product restrictions removed'}),{flag:'wx'});
};

export const configureGeneralGui = () => {
  configureGeneralGuiV2();
  restoreGeneralSerenaTools();
  const marker=path.join(labRoot,'profile','general-gui-v3.json');
  if(fs.existsSync(marker))return;
  const atomic=(file,value)=>atomicProfileWrite(file,JSON.stringify(value,null,2));
  const profileFile=path.join(homeDir,'agents','lab-checkpoint','config.json');
  const profile=JSON.parse(fs.readFileSync(profileFile,'utf8'));
  if(profile.provider==='lab-local-devstral'&&profile.model===localBaseModel)profile.model=localFallbackModel;
  atomic(profileFile,profile);
  const configFile=path.join(dataDir,'config.json');const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
  for(const project of config.openProjects??[]){if(project.settings?.mainModel==='lab-local-devstral/'+localBaseModel)project.settings.mainModel='lab-local-devstral/'+localFallbackModel;}
  atomic(configFile,config);
  const modelsFile=path.join(dataDir,'models.json');const overrides=fs.existsSync(modelsFile)?JSON.parse(fs.readFileSync(modelsFile,'utf8')):{version:1,models:[]};
  for(const id of [localBaseModel,localFallbackModel])if(!overrides.models.some(model=>model.providerId==='lab-local-devstral'&&model.id===id))overrides.models.push({id,providerId:'lab-local-devstral',maxInputTokens:32768,maxOutputTokens:4096,inputCostPerToken:0,outputCostPerToken:0,supportsTools:true});
  atomic(modelsFile,overrides);
  atomic(marker,{version:3,configuredAt:new Date().toISOString(),decision:'Native development environment; qualified local fallback; preserve user model choices'});
};
