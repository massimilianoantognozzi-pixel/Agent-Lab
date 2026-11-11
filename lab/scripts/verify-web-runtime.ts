import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prepareWebProject } from '../../src/main/lab-projects/templates';
import { writeProjectFile, restoreRevision } from '../../src/main/lab-projects/files';
import { runProjectChecks, exportProject, previewProject, stopProjectServices } from '../../src/main/lab-projects/runtime';
import { updateKnowledge } from '../../src/main/lab-projects/knowledge';
import { controlRoot } from '../../src/main/lab-projects/policy';
import { dockerRead, runContainer, NODE_IMAGE } from '../../src/main/lab-projects/containers';

const result: any = { startedAt: new Date().toISOString(), stacks: {}, errors: [] };
const text = 'Piccolo sito dimostrativo. Soluzioni curate per raccontare il tuo lavoro con chiarezza. Informazioni complete, navigazione semplice e contenuti disponibili anche da telefono. Ogni dettaglio e pensato per una consultazione pratica e accessibile.';
const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prova controlli</title><link rel="icon" href="data:,"></head><body><main><h1>Prova dei controlli</h1><p>${text}</p><button id="toggle" type="button" onclick="this.textContent='Attivato'">Attiva</button></main></body></html>`;
try {
  const existingContainers = async () => (await dockerRead(['ps', '-a', '--format', '{{.ID}} {{.Names}}'])).split(/\r?\n/).filter(line => line && !line.includes(' agentlab-')).sort();
  result.containersBefore = await existingContainers();
  for (const stack of ['vanilla', 'react-vite', 'astro'] as const) {
    const root = path.join(process.env.AIDER_DESK_LAB_WORKSPACE_ROOT!, 'runtime-proof-' + stack + '-' + randomUUID().slice(0, 8)); await fs.mkdir(root);
    await prepareWebProject(root, stack, 'Runtime ' + stack);
    if (stack === 'vanilla') await writeProjectFile(root, 'index.html', html);
    if (stack === 'react-vite') await writeProjectFile(root, 'src/App.tsx', `export default function App(){return <main><h1>Prova dei controlli</h1><p>${text}</p><button type="button">Attiva</button></main>;}`);
    if (stack === 'astro') await writeProjectFile(root, 'src/pages/index.astro', html);
    result.stacks[stack] = await runProjectChecks(root);
    if (!result.stacks[stack].pass) throw new Error(stack + ': ' + result.stacks[stack].errors.join('\n'));
    if (stack === 'vanilla') {
      const revision = await writeProjectFile(root, 'app.js', 'document.body.dataset.prova="ok";'); await restoreRevision(root, revision.id);
      result.preview = await previewProject(root); result.previewStatus = (await fetch(result.preview.url)).status;
      result.hiddenStatus = (await fetch(result.preview.url + '.env')).status;
      result.export = await exportProject(root);
      try { await updateKnowledge(root, async () => '{invalid'); throw new Error('Invalid KB was accepted'); } catch (error) { result.kbInvalidDenied = error instanceof SyntaxError; }
    }
  }
  const job = path.join(controlRoot(), 'jobs', randomUUID()); await fs.mkdir(job, { recursive: true });
  const boundary = await runContainer({ image: NODE_IMAGE, command: ['/usr/local/bin/node','-e',`const fs=require('fs');const net=require('net');if(process.getuid()===0||fs.existsSync('/var/run/docker.sock')||fs.existsSync('/host')||Object.keys(process.env).some(k=>/API_KEY|SECRET|TOKEN/.test(k)))process.exit(2);const s=net.connect({host:'1.1.1.1',port:443,timeout:1500});s.once('connect',()=>process.exit(3));s.once('error',()=>process.exit(0));s.once('timeout',()=>process.exit(0));`], mounts: [], cwd:'/tmp',logFile:path.join(job,'boundary.log') });
  result.containerBoundary = boundary.code === 0 && boundary.cleanupConfirmed;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 2500);
  try { await runContainer({ image: NODE_IMAGE, command: ['/usr/local/bin/node', '-e', 'setTimeout(()=>{},60000)'], mounts: [], cwd: '/tmp', signal: controller.signal, logFile: path.join(job, 'cancel.log') }); throw new Error('Cancel failed'); }
  catch (error) { result.cancelled = (error as Error).name === 'AbortError'; } finally { clearTimeout(timer); }
  const closingJob = runContainer({image:NODE_IMAGE,command:['/usr/local/bin/node','-e','setTimeout(()=>{},60000)'],mounts:[],cwd:'/tmp',logFile:path.join(job,'close-active.log')}).then(()=>false,error=>(error as Error).name==='AbortError');
  await new Promise(resolve=>setTimeout(resolve,800)); const closeStarted=Date.now(); await stopProjectServices();
  result.closeWhileRunning = await closingJob; result.closeElapsedMs=Date.now()-closeStarted;
  result.containersAfter = await existingContainers();
  result.pass = result.previewStatus === 200 && result.hiddenStatus === 403 && result.kbInvalidDenied && result.cancelled && result.closeWhileRunning && result.containerBoundary && JSON.stringify(result.containersBefore) === JSON.stringify(result.containersAfter);
} catch (error) { result.errors.push(String(error)); result.pass = false; }
finally { await stopProjectServices(); await fs.writeFile(path.resolve('lab/work/freelance-runtime-proof.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2)); }
if (!result.pass) process.exitCode = 1;
