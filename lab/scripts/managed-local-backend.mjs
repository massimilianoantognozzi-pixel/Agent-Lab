import fs from 'node:fs';
import path from 'node:path';
import { fork, execFileSync } from 'node:child_process';
import { labRoot, laboratoryEnvironment } from './prepare.mjs';
import { ensureLocalFallback } from './local-fallback.mjs';

const boundedWait = async (promise, milliseconds) => {
  let timer;
  try { return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(null), milliseconds); })]); }
  finally { clearTimeout(timer); }
};

export const startLocalBackend = async () => {
  const log = fs.openSync(path.join(labRoot, 'work', `gui-backend-${Date.now()}.log`), 'wx');
  const child = fork(path.join(labRoot, 'scripts', 'local-ollama.mjs'), ['serve'], {
    env: laboratoryEnvironment(), windowsHide: true, stdio: ['ignore', log, log, 'ipc'],
  });
  let closed = false;
  let logClosed = false;
  const closeLog = () => { if (!logClosed) { fs.closeSync(log); logClosed = true; } };
  let stopPromise;
  const exited = new Promise(resolve => {
    child.once('exit', (code, signal) => { closed = true; closeLog(); resolve({ code, signal }); });
    child.once('error', () => { closed = true; closeLog(); resolve({ code: -1, signal: null }); });
  });
  const stop = () => stopPromise ??= (async () => {
    if (!closed && child.connected) child.send({ type: 'stop-local-backend' });
    let result = await boundedWait(exited, 15000);
    if (!result && !closed && child.pid) {
      execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'pipe' });
      result = await boundedWait(exited, 5000);
      throw new Error('Agent Lab: backend locale arrestato forzatamente dopo timeout.');
    }
    if (result?.code !== 0) throw new Error('Agent Lab: chiusura del backend locale non regolare.');
  })();
  try {
    const ready = await boundedWait(
      new Promise((resolve, reject) => {
        child.on('message', message => { if (message?.type === 'local-backend-ready') resolve(message); });
        child.once('error', reject);
        exited.then(() => reject(new Error('Agent Lab: il backend locale non e partito.')));
      }), 35000);
    if (!ready) throw new Error('Agent Lab: avvio backend locale scaduto.');
    const fallback=await ensureLocalFallback();
    return { ready:{...ready,fallback}, stop };
  } catch (error) {
    await stop().catch(() => {});
    throw error;
  }
};
