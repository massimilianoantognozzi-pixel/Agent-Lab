import fs from 'node:fs';
import path from 'node:path';
import {repoRoot,labRoot} from './prepare.mjs';

const out=path.join(repoRoot,'out');
const source=path.join(labRoot,'work/locale-it/build');
const backup=path.join(labRoot,'work/locale-it','out-before-italian-'+Date.now());
const candidate=path.join(labRoot,'work/locale-it','out-deploy-'+Date.now());
const canonicalRoot=fs.realpathSync(repoRoot);
const check=target=>{
  const resolved=fs.existsSync(target)?fs.realpathSync(target):path.resolve(fs.realpathSync(path.dirname(target)),path.basename(target));
  const relative=path.relative(canonicalRoot,resolved);
  if(!relative||path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))throw new Error('Percorso di distribuzione fuori dal laboratorio.');
  return resolved;
};
for(const target of [out,source,backup,candidate])check(target);
if(fs.existsSync(path.join(labRoot,'work/gui-launch.json')))throw new Error('Chiudere AiderDesk prima di applicare la traduzione.');
const proof=JSON.parse(fs.readFileSync(path.join(labRoot,'work/locale-it/gui-proof.json'),'utf8'));
const budget=JSON.parse(fs.readFileSync(path.join(labRoot,'work/locale-it/bundle-graph-after.json'),'utf8'));
if(proof.pass!==true||budget.pass!==true)throw new Error('Verifiche della versione italiana non superate.');
fs.cpSync(source,candidate,{recursive:true,force:false,errorOnExist:true});
fs.renameSync(out,backup);
try{fs.renameSync(candidate,out);}catch(error){fs.renameSync(backup,out);throw error;}
const report={deployedAt:new Date().toISOString(),backup:path.relative(repoRoot,backup),source:path.relative(repoRoot,source),italianUiVerified:true};
fs.writeFileSync(path.join(labRoot,'work/locale-it/deployment.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
