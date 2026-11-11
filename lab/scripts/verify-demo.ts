import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { controlRoot, digest, labScriptsRoot, manifestDigest, sourceManifest } from '../../src/main/lab-projects/policy';
import { requireCurrentProof } from '../../src/main/lab-projects/runtime';
import { runContainer } from '../../src/main/lab-projects/containers';

const root=path.join(process.env.AIDER_DESK_LAB_WORKSPACE_ROOT!,'studio-lume-demo');
const proof=await requireCurrentProof(root); const id=randomUUID(); const job=path.join(controlRoot(),'jobs',id);
const config=path.join(job,'config'); const out=path.join(job,'out'); const negative=path.join(job,'negative');
for(const folder of [job,config,out,negative])await fs.mkdir(folder,{recursive:true});
const checks: object[]=[];
const fill=(value:string)=>checks.push({type:'fill',selector:'#pagine',value});
const click=(selector='#calcola')=>checks.push({type:'click',selector});
const text=(selector:string,value:string)=>checks.push({type:'text',selector,value});
fill('2');click();text('#totale','540');click('#seo');click();text('#totale','720');
fill('3');checks.push({type:'press',selector:'#pagine',value:'Enter'});text('#totale','840');click('#seo');
fill('1');click();text('#totale','420');fill('10');click();text('#totale','1500');
for(const invalid of ['','0','11','2.5','-1']){fill(invalid);click();text('#errore','intero');}
text('body','Progetto dimostrativo');text('body','demo@studiolume.example');
const checker=path.join(path.dirname(controlRoot()),'web-checker');
for(const file of ['web-checker.mjs','public-web-server.mjs'])await fs.copyFile(path.join(labScriptsRoot(),file),path.join(checker,'scripts',file));
if(digest(await fs.readFile(path.join(checker,'browser-seccomp.json')))!=='908338e22e0ac4035e0bc49da7252be3abe70699dcb776895c383e8bf40b6d07')throw new Error('Profilo browser diverso dalla verifica.');
const run=async(acceptance:object[],output:string,label:string)=>{
  await fs.writeFile(path.join(config,'input.json'),JSON.stringify({publicRoot:'/workspace',acceptance}));
  return runContainer({image:'mcr.microsoft.com/playwright@sha256:9bd26ad900bb5e0f4dee75839e957a89ae89c2b7ab1e76050e559790e946b948',command:['/usr/bin/node','/tool/scripts/web-checker.mjs','/job/input.json'],cwd:'/workspace',mounts:[{source:proof.publicRoot,target:'/workspace',readonly:true},{source:config,target:'/job',readonly:true},{source:output,target:'/out'},{source:checker,target:'/tool',readonly:true}],environment:{AGENTLAB_CONTAINER_CHECKER:'1',PLAYWRIGHT_BROWSERS_PATH:'/ms-playwright'},seccomp:path.join(checker,'browser-seccomp.json'),logFile:path.join(job,label+'.log')});
};
const positive=await run(checks,out,'independent');const wrong=await run([{type:'text',selector:'#totale',value:'999999'}],negative,'negative-oracle');
const web=JSON.parse(await fs.readFile(path.join(out,'web-report.json'),'utf8'));
const result={createdAt:new Date().toISOString(),originalProofId:proof.id,sourceDigest:proof.sourceDigest,sourceUnchanged:manifestDigest(sourceManifest(root))===proof.sourceDigest,job,assertions:checks.length,pass:positive.code===0&&positive.cleanupConfirmed&&web.pass,negativeOracleDenied:wrong.code!==0&&wrong.cleanupConfirmed,web};
result.pass=result.pass&&result.sourceUnchanged&&result.negativeOracleDenied;
await fs.writeFile(path.resolve('lab/work/demo-independent-proof.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;
