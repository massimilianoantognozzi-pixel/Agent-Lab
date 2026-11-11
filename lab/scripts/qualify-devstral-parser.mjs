import fs from 'node:fs';
import path from 'node:path';
import { labRoot } from './prepare.mjs';
import { startLocalBackend } from './managed-local-backend.mjs';

const base='devstral-small-2:24b-instruct-2512-q4_K_M';
const alias='devstral-aiderdesk:24b';const url='http://127.0.0.1:11435';
const report={createdAt:new Date().toISOString(),base,alias,results:[],errors:[]};
const post=async(endpoint,body)=>{const response=await fetch(url+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});if(!response.ok)throw new Error(endpoint+' HTTP'+response.status+' '+(await response.text()).slice(0,400));return response.json();};
let backend;
try{
  backend=await startLocalBackend();
  report.created=await post('/api/create',{model:alias,from:base,parser:'ministral',parameters:{num_ctx:32768},stream:false});
  const manifestRoot=path.join(labRoot,'profile','local-models','manifests','registry.ollama.ai','library');
  const original=JSON.parse(fs.readFileSync(path.join(manifestRoot,'devstral-small-2','24b-instruct-2512-q4_K_M'),'utf8'));
  const baseShow=await post('/api/show',{model:base});const aliasShow=await post('/api/show',{model:alias});
  report.baseFrom=baseShow.modelfile?.match(/^FROM\s+(.+)$/m)?.[1];report.aliasFrom=aliasShow.modelfile?.match(/^FROM\s+(.+)$/m)?.[1];report.aliasModelfile=aliasShow.modelfile;
  const derivedPath=path.join(manifestRoot,'devstral-aiderdesk','24b');const derived=fs.existsSync(derivedPath)?JSON.parse(fs.readFileSync(derivedPath,'utf8')):null;
  const weights=manifest=>manifest.layers.filter(layer=>/image\.(?:model|adapter|projector)$/.test(layer.mediaType)).map(layer=>layer.digest).sort();
  report.weightsIdentical=derived?JSON.stringify(weights(original))===JSON.stringify(weights(derived)):Boolean(report.baseFrom&&report.baseFrom===report.aliasFrom);if(!report.weightsIdentical)throw new Error('Riferimenti ai pesi non verificati: variante non usata.');
  const body={stream:false,messages:[{role:'system',content:'You are a coding agent. Use the file-edit function to correct the code. Do not just describe the fix.'},{role:'user',content:'calculator.py contains: return round(total * percent / 100, 2). It must return the final total after a percentage discount. Tests report: discounted_total(100,10) returned10 but expected90. Call power---file_edit on calculator.py to replace the incorrect line with the correct calculation.'}],tools:[{type:'function',function:{name:'power---file_edit',description:'Replace one exact string in a file',parameters:{type:'object',properties:{filePath:{type:'string'},searchTerm:{type:'string'},replacementText:{type:'string'},isRegex:{type:'boolean'},replaceAll:{type:'boolean'}},required:['filePath','searchTerm','replacementText']}}}],options:{num_ctx:32768,num_predict:1024,temperature:0},keep_alive:'5m'};
  for(const model of [base,alias]){const started=Date.now();const response=await post('/api/chat',{...body,model});report.results.push({model,elapsedMs:Date.now()-started,doneReason:response.done_reason,inputTokens:response.prompt_eval_count,outputTokens:response.eval_count,content:response.message?.content,thinking:response.message?.thinking,toolCalls:response.message?.tool_calls});}
  report.pass=report.weightsIdentical&&(report.results.find(result=>result.model===alias)?.toolCalls??[]).some(call=>call.function?.name==='power---file_edit');
}catch(error){report.errors.push(error.stack??String(error));report.pass=false;}
finally{if(backend)await backend.stop().catch(error=>report.errors.push(String(error)));fs.writeFileSync(path.join(labRoot,'work','devstral-parser-proof.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
if(!report.pass)process.exitCode=1;
