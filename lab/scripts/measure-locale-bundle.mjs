import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {repoRoot,labRoot} from './prepare.mjs';

const require=createRequire(path.join(repoRoot,'package.json'));
const {init,parse}=require('es-module-lexer');await init;
const root=path.resolve(repoRoot,process.argv[3]??'out/renderer');
const assets=path.join(root,'assets');
const rows=fs.readdirSync(assets).filter(name=>name.endsWith('.js')).map(name=>{const bytes=fs.readFileSync(path.join(assets,name));return{name,bytes:bytes.length,gzip:zlib.gzipSync(bytes).length};});
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const entry=html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1];
if(!entry)throw new Error('Entrypoint di produzione non individuato.');
const visited=new Set();
const visit=file=>{
  if(visited.has(file))return;visited.add(file);
  const [imports]=parse(fs.readFileSync(file,'utf8'));
  for(const item of imports){if(item.d===-1&&item.n?.startsWith('.')&&item.n.endsWith('.js')){
    const next=path.resolve(path.dirname(file),item.n);
    if(!next.startsWith(root+path.sep)||!fs.existsSync(next))throw new Error('Import statico non verificabile: '+item.n);
    visit(next);
  }}
};visit(path.resolve(root,entry));
const sum=list=>({files:list.length,raw:list.reduce((n,item)=>n+item.bytes,0),gzip:list.reduce((n,item)=>n+item.gzip,0)});
const report={createdAt:new Date().toISOString(),unit:'JS production bytes and gzip bytes; CSS and media excluded',entry,initialStatic:sum(rows.filter(row=>visited.has(path.join(assets,row.name)))),otherChunks:sum(rows.filter(row=>!visited.has(path.join(assets,row.name)))),total:sum(rows)};
const stage=process.argv[2];if(!['before','after'].includes(stage))throw new Error('Specificare before/after.');
const target=path.join(labRoot,'work/locale-it','bundle-graph-'+stage+'.json');
if(stage==='after'){
  const before=JSON.parse(fs.readFileSync(path.join(labRoot,'work/locale-it/bundle-graph-before.json'),'utf8'));
  report.delta={initialRaw:report.initialStatic.raw-before.initialStatic.raw,initialGzip:report.initialStatic.gzip-before.initialStatic.gzip,totalRaw:report.total.raw-before.total.raw,totalGzip:report.total.gzip-before.total.gzip};
  report.budget={raw:220*1024,gzip:40*1024};
  report.pass=report.delta.initialRaw<=report.budget.raw&&report.delta.initialGzip<=report.budget.gzip&&report.delta.totalRaw<=report.budget.raw&&report.delta.totalGzip<=report.budget.gzip;
}
fs.writeFileSync(target,JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.pass===false)process.exitCode=1;
