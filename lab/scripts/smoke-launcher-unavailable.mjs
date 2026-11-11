import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {labRoot,repoRoot} from './prepare.mjs';

// Occupy ONLY the lab's private port to prove that a missing fallback cannot block the GUI.
const report={startedAt:new Date().toISOString(),port:11435,errors:[]};
const file=path.join(labRoot,'work','launcher-unavailable-proof.json');
const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
const server=http.createServer((_request,response)=>{response.writeHead(503,{'Content-Type':'application/json'});response.end('{"error":"synthetic fallback unavailable"}');});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(11435,'127.0.0.1',resolve);});
let child;
try{
  child=spawn(process.execPath,[path.join(labRoot,'scripts','launch.mjs')],{cwd:repoRoot,windowsHide:true,stdio:'ignore'});
  report.launcherPid=child.pid;save();
  const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
  report.exit=exit;report.pass=exit.code===0;save();
}catch(error){report.errors.push(error.message);report.pass=false;save();}
finally{await new Promise(resolve=>server.close(resolve));report.portReleased=true;save();}
console.log(JSON.stringify(report));
if(!report.pass)process.exitCode=1;
