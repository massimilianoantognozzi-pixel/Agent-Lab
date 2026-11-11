import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { repoRoot,labRoot } from './prepare.mjs';
import { codingModelEnvironment } from './configure-coding-gui.mjs';
const require=createRequire(path.join(repoRoot,'package.json'));const output=path.join(labRoot,'work','verify-demo.mjs');
await require('esbuild').build({entryPoints:[path.join(labRoot,'scripts','verify-demo.ts')],outfile:output,bundle:true,packages:'external',platform:'node',format:'esm',target:'node24',tsconfig:path.join(repoRoot,'tsconfig.node.json')});
const child=spawn(process.execPath,[output],{cwd:repoRoot,env:codingModelEnvironment(),stdio:'inherit',windowsHide:true});
await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code??1;resolve();});});
