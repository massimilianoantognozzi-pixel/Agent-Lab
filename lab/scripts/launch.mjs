import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { prepare, repoRoot, labRoot, homeDir } from './prepare.mjs';
import { configureGeneralGui, generalEnvironment } from './configure-general-gui.mjs';
import { startLocalBackend } from './managed-local-backend.mjs';
import { prepareOpenCodeRoles } from './opencode-roles.mjs';
import { projectStartupEnvironment } from './project-startup.mjs';
import { installReasoningSelector } from './install-reasoning-selector.mjs';

const lockFile = path.join(labRoot, 'work', 'gui-launch.json');
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } };
const quotePS = value => "'" + value.replace(/'/g, "''") + "'";
const isOwnLauncher = pid => {
  if (!Number.isSafeInteger(pid) || pid <= 0 || !alive(pid)) return false;
  const script = path.join(labRoot, 'scripts', 'launch.mjs');
  const command = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if($p.ExecutablePath -eq ${quotePS(process.execPath)} -and $p.CommandLine.IndexOf(${quotePS(script)},[StringComparison]::OrdinalIgnoreCase) -ge 0){'owned'}`;
  return execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, encoding: 'utf8' }).trim() === 'owned';
};
const focus = pid => {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  const expected = path.join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  const command = `$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if($p -and $p.Path -eq ${quotePS(expected)} -and $p.MainWindowHandle -ne 0) { Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class LabFocus { [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h,int n); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }'; [LabFocus]::ShowWindowAsync($p.MainWindowHandle,9)|Out-Null; [LabFocus]::SetForegroundWindow($p.MainWindowHandle)|Out-Null }`;
  execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command], { windowsHide: true, stdio: 'ignore' });
};
let backend;
let child;
let log;
let ownLock = false;
try {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  if (fs.existsSync(lockFile)) {
    const previous = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    if (isOwnLauncher(previous.launcherPid)) {
      focus(previous.electronPid); process.exit(0);
    }
    fs.unlinkSync(lockFile);
  }
  fs.writeFileSync(lockFile, JSON.stringify({ launcherPid: process.pid }), { flag: 'wx' }); ownLock = true;
  prepare(); configureGeneralGui();
  installReasoningSelector();
  prepareOpenCodeRoles(homeDir, path.join(homeDir, 'agents', 'lab-checkpoint', 'config.json'));
  const require = createRequire(path.join(repoRoot, 'package.json'));
  if (!fs.existsSync(path.join(repoRoot, 'out/main/index.js'))) throw new Error('Build del laboratorio non presente.');
  try { backend = await startLocalBackend(); }
  catch(error) { fs.appendFileSync(path.join(labRoot,'work','launcher-warnings.log'),`${new Date().toISOString()} Modello locale non disponibile: ${error.message}. AiderDesk resta utilizzabile con il provider scelto.\n`); }
  log = fs.openSync(path.join(labRoot, 'work', 'app-launch.log'), 'a');
  child = spawn(require('electron'), [repoRoot], { cwd: repoRoot, env: { ...generalEnvironment(), ...projectStartupEnvironment() }, windowsHide: false, stdio: ['ignore', log, log] });
  fs.writeFileSync(lockFile, JSON.stringify({ launcherPid: process.pid, electronPid: child.pid }));
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => { process.exitCode = code ?? 1; resolve(); }); });
} catch (error) {
  process.exitCode = 1;
  fs.appendFileSync(path.join(labRoot, 'work', 'launcher-errors.log'), `${new Date().toISOString()} ${error.message}\n`);
  const message = 'Avvio di Agent-Lab non riuscito. I dettagli sono in ' + path.join(labRoot, 'work', 'launcher-errors.log');
  execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show(${quotePS(message)},'Agent-Lab')|Out-Null`], { windowsHide: true, stdio: 'ignore' });
} finally {
  await backend?.stop().catch(error => { process.exitCode = 1; fs.appendFileSync(path.join(labRoot, 'work', 'launcher-errors.log'), error.message + '\n'); });
  if (log !== undefined) fs.closeSync(log);
  if (ownLock && fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
}
