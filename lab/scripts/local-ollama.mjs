// Controlled local-model proof. Model output is saved for review, never executed here.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import { laboratoryEnvironment, labRoot } from './prepare.mjs';

const runtime = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe');
const baseURL = 'http://127.0.0.1:11435';
const model = 'devstral-small-2:24b-instruct-2512-q4_K_M';
const expectedModelDigest = '24277f07f62db8f9cb68e9dfc679ea1818a7fbac47a50eff0a701d3f645b63c8';
// Runtime provenance verified 2026-11-10: Ollama 0.40.15, Valid Authenticode publisher Ollama Inc.
const expectedRuntimeDigest = '544216ca2082b8bc19b4ba94b513f0098fa06774b232f3c140090e3449e322a5';
const home = path.join(labRoot, 'profile', 'ollama-local-home');
const modelDir = path.join(labRoot, 'profile', 'local-models');
const artifactRoot = path.join(labRoot, 'artifacts', 'local-devstral');
const runId = `${Date.now()}-${process.pid}`;
const artifacts = path.join(artifactRoot, runId);
const work = path.join(labRoot, 'work', 'local-devstral');
for (const dir of [home, modelDir, artifacts, work, path.join(home, 'AppData', 'Local'), path.join(home, 'AppData', 'Roaming')]) {
  fs.mkdirSync(dir, { recursive: true });
}
const mode = process.argv[2];
if (!['pull', 'probe', 'code', 'fix', 'serve'].includes(mode)) throw new Error('Use pull, probe, code, fix or serve.');
if (!fs.existsSync(runtime)) throw new Error('Existing signed Ollama runtime not found. No installer will be run.');
if (createHash('sha256').update(fs.readFileSync(runtime)).digest('hex') !== expectedRuntimeDigest) {
  throw new Error('Ollama binary changed since signature verification; recheck provenance before running.');
}
const runLog = path.join(work, `server-${Date.now()}-${process.pid}.log`);
const env = {
  ...laboratoryEnvironment(),
  USERPROFILE: home, HOME: home, HOMEDRIVE: path.parse(home).root.slice(0, 2), HOMEPATH: home.slice(2),
  APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
  OLLAMA_HOST: '127.0.0.1:11435', OLLAMA_MODELS: modelDir, OLLAMA_NO_CLOUD: '1',
  OLLAMA_NUM_PARALLEL: '1', OLLAMA_MAX_LOADED_MODELS: '1', OLLAMA_CONTEXT_LENGTH: '32768',
  OLLAMA_MAX_QUEUE: '1', OLLAMA_KEEP_ALIVE: '5m',
};
const report = { startedAt: new Date().toISOString(), runId, artifactDir: artifacts, mode, model, baseURL, cloudDisabled: true, calls: [], proposals: [], failures: [] };
let child;
let childExited = false;
let childIdentity;
let stoppingChild = false;
let log;
let cleanupPromise;
let cancelled = false;
let serveStopped = false;
let resolveServe;
const stopServing = () => { serveStopped = true; resolveServe?.(); };
process.on('disconnect', stopServing);
process.on('message', message => { if (message?.type === 'stop-local-backend') stopServing(); });

const processAlive = pid => {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
};
const readChildIdentity = () => {
  if (!child?.pid) return null;
  const command = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${child.pid}'; if($p){[PSCustomObject]@{Parent=$p.ParentProcessId;Path=$p.ExecutablePath;Created=$p.CreationDate.ToUniversalTime().ToString('O')}|ConvertTo-Json -Compress}`;
  const text = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, encoding: 'utf8', timeout: 8000 }).trim();
  return text ? JSON.parse(text) : null;
};
const sameIdentity = identity => Boolean(identity && childIdentity && identity.Parent === process.pid &&
  path.normalize(identity.Path ?? '').toLowerCase() === path.normalize(runtime).toLowerCase() && identity.Created === childIdentity.Created);
const cleanup = () => {
  if (!child?.pid) { report.ownProcessStopped = true; return Promise.resolve(); }
  return cleanupPromise ??= (async () => {
  stoppingChild = true;
  if (!childExited && processAlive(child.pid)) {
    let identity;
    try { identity = readChildIdentity(); } catch { report.failures.push('Cannot verify owned server identity during shutdown.'); process.exitCode = 1; }
    if (!sameIdentity(identity)) {
      if (childIdentity && identity) { report.ownProcessStopped = true; return; }
      child.kill();
    } else {
    try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'pipe' }); }
    catch { /* OS liveness below decides, rather than the taskkill exit alone. */ }
    }
  }
  const until = Date.now() + 5000;
  while (!childExited && processAlive(child.pid) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 100));
  report.ownProcessStopped = childExited || !processAlive(child.pid);
  if (!report.ownProcessStopped) { report.failures.push('Own local server cleanup not confirmed.'); process.exitCode = 1; }
  })();
};
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  cancelled = true;
  report.failures.push(`Interrupted by ${signal}`); process.exitCode = 1;
  await cleanup();
});
const assertListenerOwned = () => {
  const owner = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '(Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort 11435 -ErrorAction Stop).OwningProcess'], { windowsHide: true, encoding: 'utf8', timeout: 8000 }).trim();
  if (owner !== String(child.pid) || !processAlive(child.pid)) throw new Error('Dedicated listener does not belong to the server started by this proof.');
};

const api = async (route, payload, timeout = 15000) => {
  if (cancelled) throw new Error('Local proof cancelled.');
  if (route === '/api/pull' || route === '/api/chat') assertListenerOwned();
  const response = await fetch(baseURL + route, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(timeout), redirect: 'error',
  });
  if (!response.ok) throw new Error(`Local Ollama ${route}: HTTP ${response.status}`);
  return response;
};

const lines = async (response, onObject) => {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
      if (line) onObject(JSON.parse(line));
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) onObject(JSON.parse(buffer));
};

const chat = async (name, messages, tools, maxOutput = 1024) => {
  // Conservative guard for this fixed synthetic harness, not a general tokenizer.
  const inputUpperEstimate = Buffer.byteLength(JSON.stringify({ messages, tools }), 'utf8') + 4096;
  if (inputUpperEstimate + maxOutput > 32768) throw new Error('Input refused before inference: preserve output room.');
  const start = performance.now();
  let first;
  let content = '';
  const toolCalls = [];
  let final;
  const response = await api('/api/chat', {
    model, messages, ...(tools ? { tools } : {}), stream: true, keep_alive: '5m',
    options: { num_ctx: 32768, num_predict: maxOutput, temperature: 0.1, seed: 7 },
  }, 120000);
  await lines(response, (item) => {
    if (item.error) throw new Error(String(item.error));
    if (item.message?.content || item.message?.tool_calls?.length) first ??= performance.now();
    content += item.message?.content ?? '';
    toolCalls.push(...(item.message?.tool_calls ?? []));
    if (item.done) final = item;
  });
  if (!final) throw new Error('Incomplete local response stream.');
  const measurement = {
    name, firstContentMs: first === undefined ? null : Math.round(first - start), elapsedMs: Math.round(performance.now() - start),
    finish: final.done_reason, promptTokens: final.prompt_eval_count, cachedPromptTokens: final.prompt_eval_cached_count,
    outputTokens: final.eval_count, tokensPerSecond: final.eval_duration ? +(final.eval_count / (final.eval_duration / 1e9)).toFixed(2) : null,
    content, toolCalls,
  };
  report.calls.push(measurement);
  fs.writeFileSync(path.join(artifacts, `${name}.json`), JSON.stringify(measurement, null, 2));
  console.log(JSON.stringify({ ...measurement, content: undefined, toolCalls: toolCalls.map(call => call.function?.name) }));
  if (final.done_reason !== 'stop') throw new Error(`${name}: finish=${final.done_reason}; proof FAIL, no blind continuations.`);
  return { role: 'assistant', content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) };
};

const proposedCode = (message, name) => {
  const calls = message.tool_calls ?? [];
  const call = calls[0]?.function;
  const args = call?.arguments;
  if (calls.length !== 1 || call.name !== 'write_file' || args?.file !== 'quote.py' || typeof args.content !== 'string' || !args.content.trim() || args.content.length > 16000) {
    throw new Error(`${name}: expected one bounded write_file proposal for quote.py.`);
  }
  const file = path.join(artifacts, `${name}.py`);
  fs.writeFileSync(file, args.content, { flag: 'wx' });
  report.proposals.push({ name, file, sha256: createHash('sha256').update(args.content).digest('hex') });
  return args.content;
};

try {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 11435 });
    socket.setTimeout(1500);
    socket.once('connect', () => { socket.destroy(); reject(new Error('Dedicated lab port occupied; existing server will not be reused.')); });
    socket.once('error', error => { socket.destroy(); error.code === 'ECONNREFUSED' ? resolve() : reject(error); });
    socket.once('timeout', () => { socket.destroy(); reject(new Error('Cannot establish whether lab port is free.')); });
  });
  if (cancelled) throw new Error('Local proof cancelled before server launch.');
  log = fs.openSync(runLog, 'wx');
  child = spawn(runtime, ['serve'], { env, cwd: work, windowsHide: true, stdio: ['ignore', log, log] });
  child.once('exit', () => {
    childExited = true;
    if (mode === 'serve' && !serveStopped && !stoppingChild) { report.failures.push('Owned model server exited unexpectedly.'); process.exitCode = 1; stopServing(); }
  });
  childIdentity = readChildIdentity();
  if (!sameIdentity(childIdentity)) throw new Error('Cannot confirm the model server belongs to this run.');
  fs.writeFileSync(path.join(work, 'owned-process.json'), JSON.stringify({ pid: child.pid, parent: process.pid, runtime, port: 11435, runLog, startedAt: report.startedAt }));
  let launchError;
  child.on('error', error => { launchError = error; });
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    if (launchError) throw launchError;
    if (child.exitCode !== null) throw new Error('Local server stopped during startup.');
    try { report.runtimeVersion = (await (await api('/api/version')).json()).version; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!report.runtimeVersion) throw new Error('Local server was not ready.');
  assertListenerOwned();
  const logText = fs.readFileSync(runLog, 'utf8');
  if (!/Ollama cloud disabled:\s*true/i.test(logText)) throw new Error('Cloud-disabled startup confirmation missing.');
  console.log(`Local server ${report.runtimeVersion}; cloud disabled; independent model folder.`);
  if (mode === 'pull') {
    let latest;
    let lastPrint = 0;
    await lines(await api('/api/pull', { model, stream: true }, 3600000), (item) => {
      if (item.error) throw new Error(String(item.error));
      latest = item;
      if (Date.now() - lastPrint > 10000 || item.status === 'success') {
        console.log(JSON.stringify({ status: item.status, completed: item.completed, total: item.total })); lastPrint = Date.now();
      }
    });
    if (latest?.status !== 'success') throw new Error('Model pull did not confirm success.');
    report.installed = (await (await api('/api/tags')).json()).models.map(entry => ({ name: entry.name, digest: entry.digest, size: entry.size, details: entry.details }));
    if (!report.installed.some(entry => entry.name === model && entry.digest.replace(/^sha256:/, '') === expectedModelDigest)) throw new Error('Installed model manifest differs from the verified official digest.');
  } else {
    const inventory = await (await api('/api/tags')).json();
    if (!inventory.models.some(entry => entry.name === model && entry.digest.replace(/^sha256:/, '') === expectedModelDigest)) throw new Error('Verified model absent from dedicated lab cache; run pull first.');
    report.before = await (await api('/api/ps')).json();
    if (mode === 'serve') {
      if (!process.send || !process.connected || serveStopped) throw new Error('Managed backend requires its parent IPC connection.');
      process.send({ type: 'local-backend-ready', serverPid: child.pid, model, runId });
      await new Promise(resolve => { resolveServe = resolve; if (serveStopped || !process.connected) resolve(); });
    } else if (mode === 'probe') {
      const messages = [{ role: 'system', content: 'Rispondi in italiano, brevemente. Questa è una prova locale sintetica.' }];
      for (let i = 1; i <= 3; i++) {
        messages.push({ role: 'user', content: `Messaggio di prova ${i}: rispondi soltanto "Prova ${i} completata".` });
        const answer = await chat(`probe-${i}`, messages, undefined, 128);
        if (answer.content.replace(/[".\u00ab\u00bb]/g, '').trim() !== `Prova ${i} completata`) throw new Error(`Probe ${i}: expected response not received.`);
        messages.push(answer);
      }
    } else {
      const tools = [{ type: 'function', function: { name: 'write_file', description: 'Propose the complete contents of the one synthetic file quote.py. This only stages code for review.', parameters: { type: 'object', properties: { file: { type: 'string', enum: ['quote.py'] }, content: { type: 'string' } }, required: ['file', 'content'], additionalProperties: false } } }];
      if (mode === 'fix') {
        const pointer = JSON.parse(fs.readFileSync(path.join(artifactRoot, 'latest-code.json'), 'utf8'));
        const oldReportPath = path.resolve(process.argv[3] || pointer.reportFile);
        if (!oldReportPath.startsWith(artifactRoot + path.sep)) throw new Error('Previous proposal report outside artifacts.');
        const previous = JSON.parse(fs.readFileSync(oldReportPath, 'utf8'));
        const proposal = previous.proposals?.findLast(entry => /^code-v[2-4]$/.test(entry.name));
        if (!previous.pass || !proposal || path.dirname(path.resolve(proposal.file)) !== path.dirname(oldReportPath)) throw new Error('Previous proposal is not bound to its report.');
        const source = fs.readFileSync(proposal.file, 'utf8');
        if (createHash('sha256').update(source).digest('hex') !== proposal.sha256) throw new Error('Previous proposal hash mismatch.');
        const testFile = path.join(path.dirname(oldReportPath), 'functional-tests.json');
        const failedTest = JSON.parse(fs.readFileSync(testFile, 'utf8'));
        if (failedTest.pass || failedTest.runId !== previous.runId) throw new Error('Repair requires a failing deterministic test bound to the parent run.');
        const nextName = `code-v${Number(proposal.name.split('-v')[1]) + 1}`;
        const messages = [
          { role: 'system', content: 'Correct the synthetic Python function using the failing test. No imports, file I/O, network or commands. Propose the complete corrected quote.py with write_file; keep it short.' },
          { role: 'user', content: `Current proposed source:\n${source}\n\nFailing test: items=[{"quantity":2,"unit_price":100},{"quantity":1,"unit_price":50}], vat_rate=0.22, discount_rate=0.1. Expected exactly {"subtotal":225,"vat":49.5,"total":274.5}. The returned subtotal field MUST be the subtotal AFTER discount. Test failure: ${failedTest.error}. Correct all three returned amounts, applying the discount exactly once. Preserve negative-input checks, discount range [0,1], default arguments, empty input and two-decimal outputs. Use write_file once.` },
        ];
        proposedCode(await chat(nextName, messages, tools, 2048), nextName);
        report.parentRunId = previous.runId;
      } else {
      const messages = [
        { role: 'system', content: 'You are a Python coding assistant. Work only on the requested synthetic pure calculation. No imports, file I/O, network or command execution. Use write_file to propose code and finish the tool call. Keep the file short.' },
        { role: 'user', content: 'Create quote.py with calculate_quote(items, vat_rate=0.22). items is a list of dicts with quantity and unit_price. Reject negative quantity, unit_price or vat_rate with ValueError. Return a dict with subtotal, vat and total, each rounded to two decimals. Empty list returns zeros. Use the write_file tool once.' },
      ];
      const first = await chat('code-v1', messages, tools, 2048);
      const source = proposedCode(first, 'code-v1');
      messages.push(first, { role: 'tool', tool_name: 'write_file', content: JSON.stringify({ status: 'staged_for_review', file: 'quote.py', content: source }) });
      messages.push({ role: 'user', content: 'Modify that proposed code: add discount_rate=0.0 as the last argument, allowing values from 0 through 1 inclusive and rejecting others with ValueError. Apply the discount to subtotal before calculating VAT. Keep the same return keys, rounding and validation. Call write_file once with the complete updated file.' });
      proposedCode(await chat('code-v2', messages, tools, 2048), 'code-v2');
      }
      report.proposalStagePass = true;
      report.functionalTestsPending = true;
    }
    report.loaded = await (await api('/api/ps')).json();
  }
  report.protocolPass = true;
} catch (error) {
  report.failures.push(error.stack ?? String(error)); process.exitCode = 1; console.error(error.message);
} finally {
  await cleanup();
  if (log !== undefined) fs.closeSync(log);
  report.pass = report.protocolPass === true && report.ownProcessStopped === true && report.failures.length === 0;
  report.completedAt = new Date().toISOString();
  const reportFile = path.join(artifacts, `${mode}-report.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(artifactRoot, `latest-${mode}.json`), JSON.stringify({ runId, reportFile, pass: report.pass }));
  if (mode === 'serve' && process.connected) process.disconnect();
}
