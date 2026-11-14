import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { projectStartupFor, startProjectEnvironment } from '../project-startup';
import { ensureWorkflowDocker, WorkflowServiceUnavailable } from '../workflow-docker';

vi.unmock('fs');
vi.unmock('path');
vi.mock('../workflow-docker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../workflow-docker')>()),
  assertLocalWorkflowDocker: vi.fn(async () => undefined),
  ensureWorkflowDocker: vi.fn(async () => undefined),
}));

describe('startup for the project selected in AiderDesk', () => {
  let tmp: string;
  let root: string;

  beforeEach(async () => {
    tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aiderdesk-startup-')));
    root = path.join(tmp, 'Edilas');
    await fs.mkdir(root);
    vi.stubEnv('AIDER_DESK_PROJECT_STARTUP_NODE', process.execPath);
    vi.stubEnv('AIDER_DESK_PROJECT_STARTUP_SCRIPT', path.join(tmp, 'start.mjs'));
    vi.stubEnv('AIDER_DESK_AGENTLAB_STARTUP_SCRIPT', path.join(tmp, 'start-agentlab.mjs'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('passes the selected checkout to startup for either work command', async () => {
    const other = path.join(tmp, 'other', 'Edilas');
    await fs.mkdir(other, { recursive: true });

    expect(projectStartupFor(root, 'Avvia il lavoro')?.root).toBe(root);
    expect(projectStartupFor(root, 'Riprendi il lavoro.')?.root).toBe(root);
    expect(projectStartupFor(root, 'Riprendi le validazioni')).toBeUndefined();
    expect(projectStartupFor(other, 'Avvia il lavoro')?.root).toBe(other);
  });

  it('waits for Docker and starts the selected services once across concurrent chats', async () => {
    const startup = projectStartupFor(root, 'Avvia il lavoro')!;
    const marker = path.join(tmp, 'started.txt');
    const append = (value: string) => `import { appendFileSync } from 'node:fs'; appendFileSync(${JSON.stringify(marker)}, ${JSON.stringify(value)});`;
    await fs.writeFile(startup.agentLabScript, append('agentlab\n'));
    await fs.writeFile(startup.script, append('project\n'));
    const controller = new AbortController();
    const progress = vi.fn();

    await Promise.all([startProjectEnvironment(startup, controller.signal, progress), startProjectEnvironment(startup, controller.signal, progress)]);

    expect(ensureWorkflowDocker).toHaveBeenCalledWith(controller.signal, progress);
    expect(await fs.readFile(marker, 'utf8')).toBe('agentlab\nproject\n');
    expect(progress).toHaveBeenLastCalledWith('Ambiente di Edilas pronto.');
  });

  it('does not reuse an in-flight start prepared from different project documents', async () => {
    const startup = projectStartupFor(root, 'Avvia il lavoro')!;
    await fs.writeFile(startup.agentLabScript, '');
    await fs.writeFile(startup.script, 'await new Promise((resolve) => setTimeout(resolve, 75));');
    const signal = new AbortController().signal;
    const progress = vi.fn();
    const first = startProjectEnvironment(startup, signal, progress, { 'docs/agentlab-services.json': 'first' });
    const next = { 'docs/agentlab-services.json': 'second' };

    await expect(startProjectEnvironment(startup, signal, progress, next)).rejects.toBeInstanceOf(WorkflowServiceUnavailable);
    await first;
    await expect(startProjectEnvironment(startup, signal, progress, next)).resolves.toBeUndefined();
  });
});
