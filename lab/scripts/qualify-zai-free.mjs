import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {dataDir,labRoot} from './prepare.mjs';

const providerId='zai-standard-free-candidate';
const profile=JSON.parse(fs.readFileSync(path.join(dataDir,'config.json'),'utf8')).providers.find(item=>item.id===providerId);
if(!profile||profile.disabled||!profile.provider.apiKey)throw new Error('Provider Standard non ancora pronto.');
const base='https://api.z.ai/api/paas/v4';
if(profile.provider.name!=='openai-compatible'||profile.provider.baseUrl!==base)throw new Error('Destinazione Standard diversa dalla configurazione verificata.');
const model=process.argv.find(arg=>arg.startsWith('--model='))?.slice('--model='.length)??'glm-4.7-flash';
if(!['glm-4.7-flash','glm-4.5-flash'].includes(model))throw new Error('Questa verifica ammette soltanto le due righe gratuite controllate nel listino ufficiale.');
const report={createdAt:new Date().toISOString(),providerId,model,calls:[],errors:[],accountBalanceNotRead:true};
const file=path.join(labRoot,'work',model==='glm-4.7-flash'?'zai-free-api-proof.json':'zai-4.5-flash-api-proof.json');
if(fs.existsSync(file))fs.copyFileSync(file,file+'.previous-'+Date.now());
const post=async(label,body)=>{
  const start=performance.now();
  const response=await fetch(base+'/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(90000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+profile.provider.apiKey},body:JSON.stringify({model,stream:false,thinking:{type:'disabled'},...body})});
  const value=await response.json();
  const record={label,httpStatus:response.status,elapsedMs:Math.round(performance.now()-start),retryAfter:response.headers.get('retry-after'),model:value.model,finish:value.choices?.[0]?.finish_reason,content:value.choices?.[0]?.message?.content,toolCalls:value.choices?.[0]?.message?.tool_calls,usage:value.usage,error:value.error};
  // Never retain a provider echo of a key, even on an error path.
  const safe=JSON.parse(JSON.stringify(record).split(profile.provider.apiKey).join('[REDACTED]'));
  report.calls.push(safe);fs.writeFileSync(file,JSON.stringify(report,null,2));
  if(!response.ok)throw new Error('Z.AI Standard HTTP '+response.status+'; code '+(value.error?.code??'unknown')+'; '+(safe.error?.message??''));
  return value;
};
try{
  const catalog=await fetch(base+'/models',{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+profile.provider.apiKey}});
  const listing=await catalog.json();report.catalogStatus=catalog.status;report.catalogModels=(listing.data??[]).map(item=>item.id);report.catalogContainsTarget=report.catalogModels.includes(model);
  const first=await post('simple-response',{max_tokens:32,temperature:0,messages:[{role:'user',content:'Reply exactly with ZAI_FREE_READY'}]});
  if(!first.choices?.[0]?.message?.content?.includes('ZAI_FREE_READY'))throw new Error('Risposta semplice non conforme.');
  const tool=await post('coding-tool',{max_tokens:800,temperature:0,messages:[{role:'system',content:'Use the provided function to propose the code correction. This is a synthetic fixture.'},{role:'user',content:'calculator.py has return round(total * percent / 100, 2), but discounted_total(100,10) must return90. Call propose_patch to supply the corrected Python return line. Do not change tests.'}],tools:[{type:'function',function:{name:'propose_patch',description:'Propose one exact source replacement in the synthetic calculator',parameters:{type:'object',properties:{file:{type:'string',enum:['calculator.py']},replacement:{type:'string'}},required:['file','replacement'],additionalProperties:false}}}],tool_choice:'auto'});
  const call=tool.choices?.[0]?.message?.tool_calls?.find(call=>call.function?.name==='propose_patch');
  if(!call)throw new Error('Il modello non ha restituito la chiamata allo strumento.');
  const args=JSON.parse(call.function.arguments);report.patchProposed=args.file==='calculator.py'&&typeof args.replacement==='string';
  report.transportAndToolCallingPass=report.patchProposed;
  if(report.patchProposed){
    // Validate the proposed expression, never execute arbitrary generated statements.
    const validator=`import ast,json,sys\nline=sys.argv[1]\nassert len(line)<1000 and '\\n' not in line and line.startswith('return ')\ntree=ast.parse('def candidate(total, percent):\\n    '+line)\nallowed=(ast.Module,ast.FunctionDef,ast.arguments,ast.arg,ast.Return,ast.BinOp,ast.UnaryOp,ast.Add,ast.Sub,ast.Mult,ast.Div,ast.Mod,ast.USub,ast.UAdd,ast.Name,ast.Load,ast.Constant,ast.Call)\nassert all(isinstance(node,allowed) for node in ast.walk(tree))\nassert all(node.id in ('total','percent','round') for node in ast.walk(tree) if isinstance(node,ast.Name))\nassert all(isinstance(node.func,ast.Name) and node.func.id=='round' for node in ast.walk(tree) if isinstance(node,ast.Call))\nns={}\nexec(compile(tree,'<synthetic-return>','exec'),{'__builtins__':{},'round':round},ns)\ncases=[(100,10,90),(100,0,100),(100,100,0),(19.99,15,16.99),(0,50,0)]\nresults=[{'input':[a,b],'expected':c,'actual':ns['candidate'](a,b)} for a,b,c in cases]\nprint(json.dumps({'pass':all(x['actual']==x['expected'] for x in results),'cases':results}))\n`;
    const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
    report.semanticValidation=JSON.parse(execFileSync(path.join(dataDir,'python-venv','Scripts','python.exe'),['-I','-c',validator,args.replacement],{cwd:path.join(labRoot,'work'),windowsHide:true,encoding:'utf8',env,timeout:10000}));
  }
  report.patchSemanticPass=report.semanticValidation?.pass===true;
  report.pass=report.transportAndToolCallingPass&&report.patchSemanticPass;
}catch(error){report.errors.push(error.message.split(profile.provider.apiKey).join('[REDACTED]'));report.pass=false;}
finally{fs.writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,model,calls:report.calls.map(call=>({label:call.label,status:call.httpStatus,ms:call.elapsedMs,error:call.error})),errors:report.errors}));}
if(!report.pass)process.exitCode=1;
