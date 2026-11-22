import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { createServer } from 'node:http';

import { chromium } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';

import { createComputerUseTools } from '../computer-use';
import { setHostExecutionWork, withRootHostExecutionWork } from '../host-execution';

vi.unmock('fs');
vi.unmock('path');
const testState = vi.hoisted(() => ({ title: '' }));
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null },
  dialog: {
    showMessageBox: async (options: { message: string }) => ({
      response:
        options.message.includes('Preparare Computer Use') || options.message.includes('Aprire un browser isolato') || options.message.includes(testState.title)
          ? 1
          : 0,
    }),
  },
}));
vi.mock('@/app', async (original) => ({ ...(await original<typeof import('@/app')>()), isElectron: () => false }));
vi.mock('@/constants', async (getOriginal) => ({
  ...(await getOriginal<typeof import('@/constants')>()),
  AIDER_DESK_BIN_DIR: process.env.AGENT_LAB_CUA_TEST_BIN,
}));

const enabled = process.platform === 'win32' && !!process.env.AGENT_LAB_CUA_TEST_BIN;
const opt = { toolCallId: 'local-probe', messages: [], context: {} };
const element = (body: string, role: string, label: string): number => {
  const line = body.split('\n').find((l) => l.includes('] ' + role + ' "' + label + '"'));
  const n = line?.match(/\[(\d+)\]/)?.[1];
  if (n === undefined) {
    throw new Error('Controllo assente: ' + label + '\n' + body.slice(0, 2000));
  }
  return Number(n);
};

describe.skipIf(!enabled)('Cua Driver in an isolated Windows desktop fixture', () => {
  it('navigates, types, clicks and then terminates its own private Chromium process on Stop', async () => {
    const title = 'CuaTest-' + randomUUID();
    const value = randomUUID();
    let saved = '';
    const server = createServer((req, res) => {
      if (req.url?.startsWith('/result?')) {
        saved = new URL(req.url, 'http://localhost').searchParams.get('value') ?? '';
        res.end('ok');
        return;
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(
        '<title>' +
          title +
          '</title><label>Messaggio<input></label><button>Salva</button><script>document.querySelector("button").onclick=()=>fetch("/result?value="+encodeURIComponent(document.querySelector("input").value))</script>',
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Porta del banco assente');
    }
    const project = { getTaskDir: () => process.cwd(), getProjectDir: () => process.cwd() } as never;
    const ctrl = new AbortController();
    let cleanup: (() => Promise<void>) | undefined;
    try {
      setHostExecutionWork(project, { id: title, objective: 'Verifica browser locale' });
      await withRootHostExecutionWork(project, async () => {
        const tools = createComputerUseTools(project, 'modello del banco', ctrl.signal, (fn) => {
          cleanup = fn;
        });
        const execute = tools['computer---browser'].execute;
        await execute({ request: { action: 'open' } }, opt);
        await execute({ request: { action: 'observe' } }, opt);
        await execute({ request: { action: 'navigate', url: 'http://127.0.0.1:' + address.port } }, opt);
        const find = async (role: string) => {
          const reply = await execute({ request: { action: 'observe' } }, opt);
          if (typeof reply !== 'string') {
            throw new Error('Formato osservazione');
          }
          const parsed = JSON.parse(reply) as { controls: Array<{ role: string; ref: string }> };
          return parsed.controls.find((el) => el.role === role)?.ref ?? '';
        };
        await execute({ request: { action: 'type', ref: await find('textbox'), text: value } }, opt);
        await execute({ request: { action: 'click', ref: await find('button') } }, opt);
        await vi.waitFor(() => expect(saved).toBe(value));
        const pid = Number(
          execFileSync(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', '(Get-Process | Where-Object { $_.MainWindowTitle -like ($env:AGENT_LAB_FIXTURE_TITLE + "*") }).Id'],
            { windowsHide: true, env: { ...process.env, AGENT_LAB_FIXTURE_TITLE: title }, encoding: 'utf8' },
          ).trim(),
        );
        expect(pid).toBeGreaterThan(0);
        ctrl.abort();
        await cleanup?.();
        await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow(), { timeout: 8000 });
        await expect(execute({ request: { action: 'tabs' } }, opt)).rejects.toThrow();
      });
    } finally {
      ctrl.abort();
      await cleanup?.();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 90_000);
  it.each(['winforms', 'edge'])(
    'operates a real %s window and verifies the effect outside the tool response',
    async (app) => {
      const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-lab-cua-'));
      const unique = 'AgentLab-' + randomUUID();
      const receipt = path.join(folder, 'receipt.txt');
      const ctrl = new AbortController();
      const task = { getProjectDir: () => folder, getTaskDir: () => folder } as never;
      let closeWindow: (() => Promise<unknown>) | undefined;
      testState.title = unique;
      try {
        let verifyEffect: () => Promise<string>;
        if (app === 'winforms') {
          const child = spawn(
            'powershell.exe',
            ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-File', path.resolve('lab/scripts/fixtures/computer-use-window.ps1')],
            { windowsHide: true, stdio: 'ignore', env: { ...process.env, AGENT_LAB_FIXTURE_TITLE: unique, AGENT_LAB_FIXTURE_RECEIPT: receipt } },
          );
          const exited = once(child, 'exit');
          closeWindow = async () => {
            child.kill();
            await exited;
          };
          verifyEffect = () => fs.readFile(receipt, 'utf8');
        } else {
          const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--force-renderer-accessibility'] });
          closeWindow = () => browser.close();
          const page = await browser.newPage();
          await page.setContent('<title>' + unique + '</title><label>Messaggio di prova<input></label><button>Registra valore</button><output></output>');
          await page.evaluate(() => {
            document.querySelector('button')!.onclick = () => {
              document.querySelector('output')!.textContent = document.querySelector('input')!.value;
            };
          });
          verifyEffect = () => page.locator('output').innerText();
        }
        setHostExecutionWork(task, { id: unique, objective: 'Qualifica con finestra sintetica' });
        await withRootHostExecutionWork(task, async () => {
          const tools = createComputerUseTools(task, 'fixture locale', ctrl.signal);
          const observe = async (pixels: boolean) => {
            const result = await tools['computer---observe'].execute({ screenshot: pixels }, opt);
            if (!('content' in result)) {
              throw new Error('Osservazione incompleta.');
            }
            if (pixels) {
              expect(result.content.some((part) => part.type === 'image' && part.data.length > 100)).toBe(true);
            }
            return result.content
              .filter((part) => part.type === 'text')
              .map((part) => part.text)
              .join('\n');
          };
          await vi.waitFor(
            async () => {
              const chosen = await tools['computer---select_window'].execute({ query: unique }, opt);
              expect(chosen).toContain('Finestra condivisa');
            },
            { timeout: 60_000, interval: 500 },
          );
          let state = await observe(true);
          const input = element(state, 'Edit', 'Messaggio di prova');
          await tools['computer---act'].execute({ gesture: { action: 'set_value', element: input, text: unique }, foreground: false }, opt);
          state = await observe(false);
          expect(state).toContain(unique);
          await tools['computer---act'].execute(
            { gesture: { action: 'click', target: { element: element(state, 'Button', 'Registra valore') } }, foreground: false },
            opt,
          );
          await vi.waitFor(async () => expect(await verifyEffect()).toBe(unique), { timeout: 5000 });
          await tools['computer---close'].execute({}, opt);
          await expect(tools['computer---observe'].execute({ screenshot: false }, opt)).rejects.toThrow('condividi');
        });
      } finally {
        ctrl.abort();
        await closeWindow?.();
        await fs.rm(folder, { recursive: true, force: true });
      }
    },
    100_000,
  );
});
