import fs from 'node:fs';
import path from 'node:path';
import {homeDir,dataDir,labRoot} from './prepare.mjs';
import {atomicProfileWrite} from './configure-general-gui.mjs';

const providerId='zai-standard-free-candidate',modelId='glm-4.5-flash';
for(const name of ['zai-4.5-aiderdesk-proof.json','zai-4.5-code-proof.json']){
  const proof=JSON.parse(fs.readFileSync(path.join(labRoot,'work',name),'utf8'));
  if(proof.pass!==true||proof.task?.provider!==providerId||proof.task?.model!==modelId)throw new Error('Qualificazione non completata: '+name);
}
const profileFile=path.join(homeDir,'agents','lab-checkpoint','config.json');
const profile=JSON.parse(fs.readFileSync(profileFile,'utf8'));
if(!['lab-local-devstral',providerId].includes(profile.provider))throw new Error('Il profilo generale e stato modificato dall utente: scelta conservata.');
if(profile.provider==='lab-local-devstral'&&!['devstral-aiderdesk:24b','devstral-small-2:24b-instruct-2512-q4_K_M'].includes(profile.model))throw new Error('Modello locale scelto dall utente: non sovrascritto.');
if(profile.provider===providerId&&!['glm-4.5-flash','glm-4.7-flash'].includes(profile.model))throw new Error('Modello cloud scelto dall utente: non sovrascritto.');
const fallbackDir=path.join(homeDir,'agents','local-fallback');fs.mkdirSync(fallbackDir,{recursive:true});
const fallbackFile=path.join(fallbackDir,'config.json');
if(!fs.existsSync(fallbackFile)){
  fs.writeFileSync(fallbackFile,JSON.stringify({...profile,id:'local-fallback',name:'Devstral locale - riserva',provider:'lab-local-devstral',model:'devstral-aiderdesk:24b'},null,2),{flag:'wx'});
}
profile.provider=providerId;profile.model=modelId;
atomicProfileWrite(profileFile,JSON.stringify(profile,null,2));
const modelsFile=path.join(dataDir,'models.json');const models=JSON.parse(fs.readFileSync(modelsFile,'utf8'));
for(const model of models.models){if(model.providerId===providerId&&model.id==='glm-4.7-flash'&&model.providerOverrides?.disableStreaming===true)model.providerOverrides.disableStreaming=false;}
atomicProfileWrite(modelsFile,JSON.stringify(models,null,2));
console.log(JSON.stringify({primary:providerId+'/'+modelId,fallback:'lab-local-devstral/devstral-aiderdesk:24b',automaticPaidFallback:false,dailyQuotaNotGuaranteed:true}));
