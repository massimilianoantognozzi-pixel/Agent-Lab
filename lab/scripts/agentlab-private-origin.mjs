import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const container = 'agentlab-remote-tailnet';
const query = async (...args) => {
  const output = await run('docker', ['exec', container, 'tailscale', ...args], { windowsHide: true, timeout: 3500, maxBuffer: 300_000 });
  return JSON.parse(output.stdout);
};

export const agentLabPrivateOrigin = async () => {
  try {
    const status = await query('status', '--json');
    const name = status.Self?.DNSName?.replace(/\.$/, '');
    if (status.BackendState !== 'Running' || !/^agent-lab(?:-[0-9]+)?\.[a-z0-9-]+\.ts\.net$/.test(name ?? '')) {
      return undefined;
    }
    const serve = await query('serve', 'status', '--json');
    const route = name + ':443';
    if (Object.values(serve.AllowFunnel ?? {}).some(Boolean) ||
      serve.Web?.[route]?.Handlers?.['/']?.Proxy !== 'http://127.0.0.1:8080') {
      return undefined;
    }
    return 'https://' + name;
  } catch {
    return undefined;
  }
};
