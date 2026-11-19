import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  beginDesktopWork,
  closeDesktopCheckout,
  recordDesktopWrite,
  recordDesktopIntegration,
  withDesktopBranch,
  type DesktopCloseEvidence,
} from '../desktop-close';

import { DesktopStopBoundary } from '@/agent/desktop-stop';
import { EventsHandler } from '@/events-handler';

vi.unmock('node:fs/promises');
vi.unmock('node:fs');
vi.unmock('fs');
vi.unmock('path');
vi.unmock('node:path');

describe('desktop close publication', () => {
  let tmp: string, root: string, remote: string, data: string;
  const git = (dir: string, ...args: string[]) =>
    execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const evidence: DesktopCloseEvidence = {
    taskId: 'saved-task',
    name: 'Correzione del filtro',
    state: 'INTERRUPTED',
    checkpoint: 'saved-turn',
    messages: 'Modificato il filtro; manca il test.',
    files: ['filter.txt'],
    exactWrites: {},
    commits: [],
  };
  const plan = vi.fn(async () =>
    JSON.stringify({
      summary: 'Salva filtro e ripresa',
      files: ['filter.txt'],
      updates: [{ path: 'docs/handoff.md', note: 'Filtro corretto. Domani eseguire il test del filtro.' }],
    }),
  );
  const close = () => closeDesktopCheckout({ root, data, evidence, plan });
  beforeEach(async () => {
    tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-close-')));
    root = path.join(tmp, 'repo');
    remote = path.join(tmp, 'remote.git');
    data = path.join(tmp, 'data');
    vi.stubEnv('AIDER_DESK_DATA_DIR', data);
    await fs.mkdir(path.join(root, 'docs'), { recursive: true });
    await fs.mkdir(remote);
    git(remote, 'init', '--bare', '-b', 'dev');
    git(root, 'init', '-b', 'dev');
    git(root, 'config', 'user.name', 'Test Agent-Lab');
    git(root, 'config', 'user.email', 'test@example.invalid');
    git(root, 'config', 'core.autocrlf', 'false');
    git(root, 'config', 'commit.gpgsign', 'false');
    await fs.writeFile(path.join(root, 'docs/handoff.md'), '# Ripresa\n');
    await fs.writeFile(path.join(root, 'filter.txt'), 'prima\n');
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'base');
    git(root, 'remote', 'add', 'origin', remote);
    git(root, 'push', '-u', 'origin', 'dev');
    await fs.writeFile(path.join(root, 'altrui.txt'), 'lavoro altrui');
    git(root, 'add', 'altrui.txt');
    await beginDesktopWork(root, evidence.taskId, data);
    await fs.writeFile(path.join(root, 'filter.txt'), 'dopo\n');
    await recordDesktopWrite(root, evidence.taskId, data, 'filter.txt', Buffer.from('prima\n'), Buffer.from('dopo\n'));
    plan.mockClear();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
  });

  it('publishes only the owned changes, updates the handoff and preserves unrelated staging; repeated close is a no-op', async () => {
    const first = await close();
    expect(git(remote, 'rev-parse', 'refs/heads/dev')).toBe(first.commit);
    expect(git(root, 'diff', '--cached', '--name-only')).toBe('altrui.txt');
    expect(git(remote, 'show', 'dev:filter.txt')).toBe('dopo');
    expect(git(remote, 'show', 'dev:docs/handoff.md')).toContain('Domani eseguire il test');
    expect(first.remaining).toEqual(['altrui.txt']);
    expect((await close()).commit).toBe(first.commit);
    expect(plan).toHaveBeenCalledOnce();
  }, 30000);

  it('keeps a rejected commit and retries that same SHA after the remote accepts it', async () => {
    const hook = path.join(remote, 'hooks/pre-receive');
    await fs.writeFile(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    await expect(close()).rejects.toThrow(/Push rifiutato/);
    const local = git(root, 'rev-parse', 'HEAD');
    expect(git(remote, 'rev-parse', 'dev')).not.toBe(local);
    await fs.unlink(hook);
    expect((await close()).commit).toBe(local);
    expect(git(remote, 'rev-parse', 'dev')).toBe(local);
  }, 30000);

  it('refuses changed file contents and an unrelated outgoing commit', async () => {
    await fs.writeFile(path.join(root, 'filter.txt'), 'modifica esterna\n');
    await expect(close()).rejects.toThrow('non attribuite');
    await fs.writeFile(path.join(root, 'filter.txt'), 'dopo\n');
    git(root, 'commit', '-m', 'Estraneo');
    const remoteTip = git(remote, 'rev-parse', 'dev');
    await expect(close()).rejects.toThrow('non attribuito');
    expect(git(remote, 'rev-parse', 'dev')).toBe(remoteTip);
  }, 30000);

  it('submits immediately through the desktop, coalesces repeated submissions and publishes only after the checkpoint is safe', async () => {
    const safe = Promise.withResolvers<void>();
    const log = vi.fn();
    const source = {
      task: { id: evidence.taskId },
      getTaskDir: () => root,
      addLogMessage: log,
      stopForDesktopClose: vi.fn(() => safe.promise),
      finishDesktopClose: vi.fn(),
      desktopCloseEvidence: async () => evidence,
      getTaskAgentProfile: async () => ({ model: 'mock', provider: 'mock' }),
      generateText: plan,
    };
    const project = { getTask: () => source, getTasks: async () => [{ id: evidence.taskId }] };
    const handler = Object.create(EventsHandler.prototype) as EventsHandler;
    Object.assign(handler, { projectManager: { getProject: () => project }, desktopClosures: new Map(), desktopCloseGeneration: new Map() });
    const before = git(remote, 'rev-parse', 'dev');
    const a = handler.runDesktopPrompt(root, evidence.taskId, '/chiudi');
    const b = handler.runDesktopPrompt(root, evidence.taskId, '/chiudi');
    expect(source.stopForDesktopClose).toHaveBeenCalledOnce();
    expect(plan).not.toHaveBeenCalled();
    expect(git(remote, 'rev-parse', 'dev')).toBe(before);
    safe.resolve();
    await Promise.all([a, b]);
    expect(source.finishDesktopClose).toHaveBeenCalledOnce();
    expect(plan).toHaveBeenCalledOnce();
    expect(git(remote, 'rev-parse', 'dev')).not.toBe(before);
    expect(log).toHaveBeenCalledWith('info', expect.stringContaining('Chiusura verificata'), true);
  }, 30000);

  it('commits only the new note when the handoff has other unstaged text', async () => {
    await fs.appendFile(path.join(root, 'docs/handoff.md'), 'Nota personale non pertinente.\n');
    await close();
    expect(git(remote, 'show', 'dev:docs/handoff.md')).not.toContain('Nota personale');
    expect(git(root, 'diff', '--', 'docs/handoff.md')).toContain('Nota personale');
  }, 30000);

  it('publishes a verified governed development branch while the user has main open', async () => {
    git(root, 'branch', 'main');
    git(root, 'switch', 'main');
    const original = git(root, 'rev-parse', 'HEAD');
    const source = { ...evidence, taskId: 'governed', checkpoint: 'queue', files: [] };
    await beginDesktopWork(root, source.taskId, data, 'dev');
    const work = path.join(tmp, 'governed-integration');
    git(root, 'worktree', 'add', work, 'dev');
    await fs.writeFile(path.join(work, 'filter.txt'), 'lavoro governato\n');
    git(work, 'add', 'filter.txt');
    git(work, 'commit', '-m', 'Task governata verificata');
    await recordDesktopIntegration(root, source.taskId, data, git(work, 'rev-parse', 'HEAD'));
    git(root, 'worktree', 'remove', work);
    const result = await withDesktopBranch(root, data, 'dev', (dir) =>
      closeDesktopCheckout({
        root: dir,
        journalRoot: root,
        data,
        evidence: source,
        documents: ['docs/handoff.md'],
        plan: async () =>
          JSON.stringify({
            summary: 'Salva lo stato del ramo di sviluppo',
            updates: [{ path: 'docs/handoff.md', note: 'Proseguire la task successiva.' }],
            files: [],
          }),
      }),
    );
    expect(git(root, 'rev-parse', 'HEAD')).toBe(original);
    expect(git(root, 'diff', '--cached', '--name-only')).toBe('altrui.txt');
    expect(git(remote, 'rev-parse', 'dev')).toBe(result.commit);
    expect(git(remote, 'show', 'dev:filter.txt')).toBe('lavoro governato');
  }, 30000);

  it('creates the first commit and publishes to the only configured remote of a new repository', async () => {
    const fresh = path.join(tmp, 'fresh');
    const empty = path.join(tmp, 'empty.git');
    await fs.mkdir(fresh);
    await fs.mkdir(empty);
    git(fresh, 'init', '-b', 'dev');
    git(empty, 'init', '--bare', '-b', 'dev');
    git(fresh, 'config', 'user.name', 'Test');
    git(fresh, 'config', 'user.email', 'test@example.invalid');
    git(fresh, 'remote', 'add', 'origin', empty);
    await beginDesktopWork(fresh, 'initial', data);
    await fs.writeFile(path.join(fresh, 'a.txt'), 'nuovo\n');
    await recordDesktopWrite(fresh, 'initial', data, 'a.txt', null, Buffer.from('nuovo\n'));
    const result = await closeDesktopCheckout({
      root: fresh,
      data,
      evidence: { ...evidence, taskId: 'initial', files: [] },
      plan: async () => JSON.stringify({ summary: 'Prima task', updates: [{ path: 'docs/SESSION_HANDOFF.md', note: 'Verificare il risultato.' }], files: [] }),
    });
    expect(git(empty, 'rev-parse', 'dev')).toBe(result.commit);
    expect(git(empty, 'show', 'dev:a.txt')).toBe('nuovo');
  }, 30000);
});

it('closes admission immediately but waits for an already admitted write', async () => {
  const barrier = new DesktopStopBoundary();
  const finish = Promise.withResolvers<void>();
  const write = barrier.run(() => finish.promise, true);
  barrier.request();
  const next = vi.fn();
  await expect(barrier.run(next, true)).rejects.toThrow('chiusura');
  expect(next).not.toHaveBeenCalled();
  const complete = vi.fn();
  const drain = barrier.drain().then(complete);
  await Promise.resolve();
  expect(complete).not.toHaveBeenCalled();
  finish.resolve();
  await Promise.all([write, drain]);
  expect(complete).toHaveBeenCalledOnce();
});
