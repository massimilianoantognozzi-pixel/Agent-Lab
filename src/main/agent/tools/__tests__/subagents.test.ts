import { describe, expect, it, vi } from 'vitest';

import { createSubagentsToolset } from '../subagents';

import type { WorkerRecord } from '@/agent/worker-checkpoint';

import { runSubagentTask } from '@/agent/subagent';

vi.mock('@/agent/subagent', () => ({
  getEnabledSubagents: (profiles: unknown[]) => profiles,
  findEnabledSubagent: (profiles: { name: string }[], id: string) => profiles.find((profile) => profile.name === id),
  runSubagentTask: vi.fn(),
}));

describe('subagent tool sessions', () => {
  it('recovers the result of a completed tool from a provider step that was interrupted', async () => {
    const workerId = '723449a0-83ec-4676-9f85-d77461069b8e';
    const turnId = '70860f16-66c2-4c91-801d-246c11014321';
    const alpha = { id: 'alpha', name: 'alpha', subagent: { invocationMode: 'on-demand', description: 'alpha' } };
    const messages = [{ id: turnId, role: 'user', content: 'Original task input' }];
    const receipt = { id: 'finished', name: 'power---bash', fingerprint: 'abc', input: '{"command":"node once.cjs"}', output: '{"exitCode":0}' };
    const record = { profileId: alpha.id, state: 'running', turnId, messages, unmergedReceipts: [receipt] };
    const task = {
      project: {},
      getTaskDir: () => '/fixture',
      readWorkerHistory: vi.fn(async () => record),
      saveWorkerHistory: vi.fn(),
      trackWorkerRun: vi.fn(),
      claimWorkerTurn: vi.fn(() => true),
      releaseWorkerTurn: vi.fn(),
    };
    vi.mocked(runSubagentTask).mockResolvedValue({ status: 'success', messages: [], promptContext: { id: turnId } });
    const tools = await createSubagentsToolset({} as never, task as never, { getProjectProfiles: () => [alpha] } as never, {} as never);
    await tools['subagents---resume_task'].execute!({ workerId }, {} as never);
    expect(runSubagentTask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        workerHistory: [
          messages[0],
          expect.objectContaining({ role: 'assistant', content: [expect.objectContaining({ toolCallId: 'finished', input: { command: 'node once.cjs' } })] }),
          expect.objectContaining({
            role: 'tool',
            content: [expect.objectContaining({ toolCallId: 'finished', output: { type: 'text', value: receipt.output } })],
          }),
        ],
        interruptedToolFingerprints: new Set(['abc']),
      }),
    );
  });

  it('resumes the recorded turn with no new prompt and refuses recovery from another checkout', async () => {
    const workerId = '723449a0-83ec-4676-9f85-d77461069b8e';
    const turnId = '70860f16-66c2-4c91-801d-246c11014321';
    const alpha = { id: 'alpha', name: 'alpha', subagent: { invocationMode: 'on-demand', description: 'alpha' } };
    const messages = [{ id: turnId, role: 'user', content: 'Original task input' }];
    const record = { profileId: alpha.id, directory: '/fixture', state: 'running', turnId, messages, pendingTools: [{ id: 'call', name: 'power---bash' }] };
    const snapshots: WorkerRecord[] = [];
    const task = {
      project: {},
      getTaskDir: vi.fn(() => '/foreign'),
      readWorkerHistory: vi.fn(async () => record),
      saveWorkerHistory: vi.fn((_id, value) => {
        snapshots.push(structuredClone(value));
      }),
      trackWorkerRun: vi.fn(),
      claimWorkerTurn: vi.fn(() => true),
      releaseWorkerTurn: vi.fn(),
    };
    const manager = { getProjectProfiles: () => [alpha] };
    vi.mocked(runSubagentTask)
      .mockClear()
      .mockResolvedValue({ status: 'success', messages: [], promptContext: { id: turnId } });
    const tools = await createSubagentsToolset({} as never, task as never, manager as never, {} as never);
    const recover = tools['subagents---resume_task'].execute!;
    await expect(recover({ workerId }, {} as never)).resolves.toHaveProperty('error');
    expect(runSubagentTask).not.toHaveBeenCalled();
    task.getTaskDir.mockReturnValue('/fixture');
    await expect(recover({ workerId }, {} as never)).resolves.toEqual({ workerId, turnId, status: 'running' });
    expect(runSubagentTask).toHaveBeenCalledOnce();
    expect(runSubagentTask).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: null, turnId, workerHistory: messages, recoveryInstructions: expect.stringContaining('power---bash') }),
    );
    expect(snapshots[0].messages).toEqual(messages);
    await expect(recover({ workerId }, {} as never)).resolves.toHaveProperty('error');
  });

  it('recovers an interrupted worker with the same ID and its last completed tool evidence', async () => {
    const workerId = '723449a0-83ec-4676-9f85-d77461069b8e';
    const alpha = { id: 'alpha', name: 'alpha', subagent: { invocationMode: 'on-demand', description: 'alpha' } };
    const messages = [{ id: 'completed', role: 'assistant', content: 'verified earlier tool result' }];
    const task = {
      project: {},
      getTaskDir: () => '/fixture',
      saveWorkerHistory: vi.fn(),
      trackWorkerRun: vi.fn(),
      claimWorkerTurn: vi.fn(() => true),
      releaseWorkerTurn: vi.fn(),
      readWorkerHistory: vi.fn(async () => ({
        profileId: alpha.id,
        directory: '/fixture',
        state: 'running',
        messages,
        pendingTools: [{ id: 'call', name: 'power---bash' }],
      })),
    };
    const manager = { getProjectProfiles: () => [alpha] };
    vi.mocked(runSubagentTask).mockResolvedValue({ status: 'success', messages: [], promptContext: { id: 'continued' } });
    const tools = await createSubagentsToolset({} as never, task as never, manager as never, {} as never);
    await expect(tools['subagents---wait_task'].execute!({ workerId, timeoutMs: 1000 }, {} as never)).resolves.toMatchObject({ status: 'interrupted' });
    await expect(tools['subagents---followup_task'].execute!({ workerId, prompt: 'reconcile' }, {} as never)).resolves.toEqual({ workerId, status: 'running' });
    expect(runSubagentTask).toHaveBeenLastCalledWith(expect.objectContaining({ workerHistory: messages, prompt: expect.stringContaining('power---bash') }));
    expect(task.saveWorkerHistory).toHaveBeenCalledWith(workerId, expect.objectContaining({ pendingTools: [{ id: 'call', name: 'power---bash' }] }));
  });

  it('delivers a durable terminal result without launching the worker again', async () => {
    const workerId = '723449a0-83ec-4676-9f85-d77461069b8e';
    const alpha = { id: 'alpha', name: 'alpha', subagent: { invocationMode: 'on-demand', description: 'alpha' } };
    const messages = [{ id: 'completed', role: 'assistant', content: 'durable result' }];
    const task = {
      project: {},
      getTaskDir: () => '/fixture',
      readWorkerHistory: vi.fn(async () => ({ profileId: alpha.id, directory: '/fixture', state: 'success', messages })),
    };
    const manager = { getProjectProfiles: () => [alpha] };
    vi.mocked(runSubagentTask).mockClear();
    const tools = await createSubagentsToolset({} as never, task as never, manager as never, {} as never);
    await expect(tools['subagents---wait_task'].execute!({ workerId, timeoutMs: 1000 }, {} as never)).resolves.toMatchObject({
      workerId,
      status: 'success',
      messages,
    });
    expect(runSubagentTask).not.toHaveBeenCalled();
  });

  it('returns two handles before either worker is finished and retrieves their separate results', async () => {
    const profiles = ['alpha', 'beta'].map((name) => ({ id: name, name, subagent: { invocationMode: 'on-demand', description: name } }));
    let epoch = 'initial';
    const task = {
      project: {},
      getTaskDir: () => '/fixture',
      workerEpoch: () => epoch,
      addToolMessage: vi.fn(),
      saveWorkerHistory: vi.fn(),
      trackWorkerRun: vi.fn(),
      claimWorkerTurn: vi.fn(() => true),
      releaseWorkerTurn: vi.fn(),
    };
    const manager = { getProjectProfiles: () => profiles };
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.mocked(runSubagentTask).mockImplementation(async ({ targetSubagent }) => {
      await gate;
      return { status: 'success', messages: [{ id: targetSubagent.name, role: 'assistant', content: targetSubagent.name }], promptContext: { id: 'prompt' } };
    });
    const tools = await createSubagentsToolset({} as never, task as never, manager as never, {} as never);
    const run = tools['subagents---run_task'].execute!;
    const pending = Promise.all(profiles.map(({ name }) => run({ subagentId: name, prompt: 'inspect', background: true }, { toolCallId: name } as never)));
    const workers = await Promise.race([pending, new Promise<undefined>((resolve) => setTimeout(resolve, 80))]);
    finish();
    expect(workers).toEqual([
      { workerId: expect.any(String), status: 'running' },
      { workerId: expect.any(String), status: 'running' },
    ]);
    const handles = workers as { workerId: string }[];
    const send = tools['subagents---send_message'].execute!;
    await expect(send({ workerId: handles[0].workerId, message: 'inspect another detail' }, {} as never)).resolves.toHaveProperty('status', 'queued');
    const launches = vi.mocked(runSubagentTask).mock.calls.slice(-2);
    expect(launches[0][0].takeSteering?.()).toEqual(['inspect another detail']);
    expect(launches[1][0].takeSteering?.()).toEqual([]);
    const wait = tools['subagents---wait_task'].execute!;
    const results = await Promise.all(handles.map(({ workerId }) => wait({ workerId, timeoutMs: 1000 }, {} as never)));
    expect(results).toMatchObject(profiles.map(({ name }) => ({ status: 'success', messages: [{ id: name, content: name }] })));
    expect(task.saveWorkerHistory).toHaveBeenCalledTimes(4);
    epoch = 'cleared';
    await expect(wait({ workerId: handles[0].workerId, timeoutMs: 1000 }, {} as never)).resolves.toMatchObject({ error: 'The task context has been cleared.' });
  });

  it('returns the first finished worker from a batch and leaves the other worker available', async () => {
    const profiles = ['fast', 'slow'].map((name) => ({ id: name, name, subagent: { invocationMode: 'on-demand', description: name } }));
    const finish = new Map<string, () => void>();
    const gates = new Map(profiles.map(({ name }) => [name, new Promise<void>((resolve) => finish.set(name, resolve))]));
    const task = {
      project: {},
      getTaskDir: () => '/fixture',
      saveWorkerHistory: vi.fn(),
      trackWorkerRun: vi.fn(),
      claimWorkerTurn: vi.fn(() => true),
      releaseWorkerTurn: vi.fn(),
    };
    vi.mocked(runSubagentTask).mockImplementation(async ({ targetSubagent, turnId }) => {
      await gates.get(targetSubagent.name);
      return {
        status: 'success',
        messages: [{ id: targetSubagent.name, role: 'assistant', content: targetSubagent.name }],
        promptContext: { id: turnId! },
      };
    });
    const tools = await createSubagentsToolset({} as never, task as never, { getProjectProfiles: () => profiles } as never, {} as never);
    const waitTool = tools['subagents---wait_task'];
    const run = tools['subagents---run_task'].execute!;
    const wait = waitTool.execute!;
    try {
      const [fast, slow] = (await Promise.all(profiles.map(({ name }) => run({ subagentId: name, prompt: 'inspect', background: true }, {} as never)))) as {
        workerId: string;
      }[];
      const request = { workerIds: [slow.workerId, fast.workerId], timeoutMs: 1 };
      expect((waitTool.inputSchema as { safeParse: (value: unknown) => { success: boolean } }).safeParse(request).success).toBe(true);
      await expect(wait(request, {} as never)).resolves.toEqual({ status: {}, timedOut: true });

      const batch = wait({ ...request, timeoutMs: 1000 }, {} as never);
      finish.get('fast')!();
      const first = (await batch) as { status: Record<string, unknown>; timedOut: boolean };
      expect(first).toMatchObject({
        status: { [fast.workerId]: { workerId: fast.workerId, status: 'success', messages: [{ content: 'fast' }] } },
        timedOut: false,
      });
      expect(Object.keys(first.status)).toEqual([fast.workerId]);
      expect(task.releaseWorkerTurn).toHaveBeenCalledTimes(1);
      await expect(tools['subagents---send_message'].execute!({ workerId: slow.workerId, message: 'keep working' }, {} as never)).resolves.toEqual({
        workerId: slow.workerId,
        status: 'queued',
      });

      finish.get('slow')!();
      await expect(wait({ workerId: slow.workerId, timeoutMs: 1000 }, {} as never)).resolves.toMatchObject({
        workerId: slow.workerId,
        status: 'success',
        messages: [{ content: 'slow' }],
      });
    } finally {
      for (const release of finish.values()) {
        release();
      }
    }
  });

  it('returns all already terminal workers without relaunching any of them', async () => {
    const ids = ['723449a0-83ec-4676-9f85-d77461069b8e', '70860f16-66c2-4c91-801d-246c11014321', '6dca1565-da83-44f3-8e0f-7a8e80fd1179'];
    const profile = { id: 'alpha', name: 'alpha', subagent: { invocationMode: 'on-demand', description: 'alpha' } };
    const messages = [{ id: 'complete', role: 'assistant', content: 'old result' }];
    const task = {
      project: {},
      getTaskDir: () => '/fixture',
      readWorkerHistory: vi.fn(async (id: string) => ({
        profileId: profile.id,
        directory: id === ids[2] ? '/another-checkout' : '/fixture',
        state: id === ids[1] ? 'running' : 'success',
        messages,
      })),
    };
    vi.mocked(runSubagentTask).mockClear();
    const tools = await createSubagentsToolset({} as never, task as never, { getProjectProfiles: () => [profile] } as never, {} as never);
    const wait = tools['subagents---wait_task'].execute!;
    await expect(wait({ workerIds: [...ids, ids[0]], timeoutMs: 1 }, {} as never)).resolves.toMatchObject({
      status: {
        [ids[0]]: { status: 'success', messages },
        [ids[1]]: { status: 'interrupted', messages },
        [ids[2]]: { status: 'not_found' },
      },
      timedOut: false,
    });
    expect(task.readWorkerHistory).toHaveBeenCalledTimes(3);
    expect(runSubagentTask).not.toHaveBeenCalled();
  });

  it.each(['single', 'batch'] as const)('cancels a pending %s wait without collecting the worker', async (mode) => {
    const profile = { id: 'alpha', name: 'alpha', subagent: { invocationMode: 'on-demand', description: 'alpha' } };
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const task = {
      project: {},
      getTaskDir: () => '/fixture',
      saveWorkerHistory: vi.fn(),
      trackWorkerRun: vi.fn(),
      claimWorkerTurn: vi.fn(() => true),
      releaseWorkerTurn: vi.fn(),
    };
    vi.mocked(runSubagentTask).mockImplementation(async () => {
      await gate;
      return { status: 'success', messages: [], promptContext: { id: 'finished' } };
    });
    const tools = await createSubagentsToolset({} as never, task as never, { getProjectProfiles: () => [profile] } as never, {} as never);
    const { workerId } = (await tools['subagents---run_task'].execute!({ subagentId: profile.name, prompt: 'inspect', background: true }, {} as never)) as {
      workerId: string;
    };
    const wait = tools['subagents---wait_task'].execute!;
    const controller = new AbortController();
    const pending = wait({ ...(mode === 'single' ? { workerId } : { workerIds: [workerId] }), timeoutMs: 1000 }, { abortSignal: controller.signal } as never);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    try {
      await Promise.resolve();
      controller.abort();
      await rejected;
      expect(task.releaseWorkerTurn).not.toHaveBeenCalled();
      finish();
      await expect(wait({ workerId }, {} as never)).resolves.toMatchObject({ workerId, status: 'success' });
    } finally {
      finish();
    }
  });

  it('returns a saved result alongside the error from a worker whose final write failed', async () => {
    const profiles = ['saved', 'failed'].map((name) => ({ id: name, name, subagent: { invocationMode: 'on-demand', description: name } }));
    const task = {
      project: {},
      getTaskDir: () => '/fixture',
      saveWorkerHistory: vi.fn(async (...[, record]: [string, WorkerRecord]) => {
        if (record.profileId === 'failed' && record.state === 'success') {
          throw new Error('fixture cannot save completed output');
        }
      }),
      trackWorkerRun: vi.fn<(promise: Promise<unknown>) => void>(),
      claimWorkerTurn: vi.fn(() => true),
      releaseWorkerTurn: vi.fn(),
    };
    vi.mocked(runSubagentTask).mockResolvedValue({ status: 'success', messages: [], promptContext: { id: 'finished' } });
    const tools = await createSubagentsToolset({} as never, task as never, { getProjectProfiles: () => profiles } as never, {} as never);
    const run = tools['subagents---run_task'].execute!;
    const [saved, failed] = (await Promise.all(profiles.map(({ name }) => run({ subagentId: name, prompt: 'inspect', background: true }, {} as never)))) as {
      workerId: string;
    }[];
    await Promise.allSettled(task.trackWorkerRun.mock.calls.map(([promise]) => promise));
    await expect(tools['subagents---wait_task'].execute!({ workerIds: [saved.workerId, failed.workerId] }, {} as never)).resolves.toMatchObject({
      status: {
        [saved.workerId]: { status: 'success' },
        [failed.workerId]: { status: 'error', error: 'fixture cannot save completed output' },
      },
      timedOut: false,
    });
  });

  it('waits for a worker resumed while its stored result is being read', async () => {
    const workerId = '723449a0-83ec-4676-9f85-d77461069b8e';
    const profile = { id: 'alpha', name: 'alpha', subagent: { invocationMode: 'on-demand', description: 'alpha' } };
    const record: WorkerRecord = { profileId: profile.id, directory: '/fixture', state: 'running', turnId: 'original', messages: [] };
    let releaseRead!: (record: WorkerRecord) => void;
    let finish!: () => void;
    const firstRead = new Promise<WorkerRecord>((resolve) => {
      releaseRead = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const task = {
      project: {},
      getTaskDir: () => '/fixture',
      readWorkerHistory: vi.fn(async () => record).mockReturnValueOnce(firstRead),
      saveWorkerHistory: vi.fn(),
      trackWorkerRun: vi.fn(),
      claimWorkerTurn: vi.fn(() => true),
      releaseWorkerTurn: vi.fn(),
    };
    vi.mocked(runSubagentTask).mockImplementation(async () => {
      await gate;
      return { status: 'success', messages: [], promptContext: { id: 'original' } };
    });
    const tools = await createSubagentsToolset({} as never, task as never, { getProjectProfiles: () => [profile] } as never, {} as never);
    const wait = tools['subagents---wait_task'].execute!;
    const pending = wait({ workerIds: [workerId], timeoutMs: 1 }, {} as never);
    try {
      await expect(tools['subagents---resume_task'].execute!({ workerId }, {} as never)).resolves.toMatchObject({ workerId, status: 'running' });
      releaseRead(record);
      await expect(pending).resolves.toEqual({ status: {}, timedOut: true });
      finish();
      await expect(wait({ workerId }, {} as never)).resolves.toMatchObject({ workerId, status: 'success' });
    } finally {
      releaseRead(record);
      finish();
    }
  });

  it('resumes only a worker whose successful result belongs to the current task history', async () => {
    const workerId = '723449a0-83ec-4676-9f85-d77461069b8e';
    const alpha = { name: 'alpha', subagent: { invocationMode: 'on-demand', description: 'alpha' } };
    const messages = [{ id: 'previous', role: 'assistant', content: 'observed evidence' }];
    const history = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolName: 'subagents---wait_task',
            output: { type: 'json', value: { workerId, subagentId: 'alpha', status: 'success', messages } },
          },
        ],
      },
    ];
    const task = {
      project: {},
      getTaskDir: () => '/fixture',
      readWorkerHistory: vi.fn(async () => undefined),
      saveWorkerHistory: vi.fn(),
      trackWorkerRun: vi.fn(),
      claimWorkerTurn: vi.fn(() => true),
      releaseWorkerTurn: vi.fn(),
    };
    const manager = { getProjectProfiles: () => [alpha] };
    vi.mocked(runSubagentTask).mockResolvedValue({ status: 'success', messages: [], promptContext: { id: 'continued' } });
    const tools = await createSubagentsToolset({} as never, task as never, manager as never, {} as never, undefined, history as never);
    const followup = tools['subagents---followup_task'].execute!;
    await expect(followup({ workerId, prompt: 'verify' }, {} as never)).resolves.toEqual({ workerId, status: 'running' });
    expect(runSubagentTask).toHaveBeenLastCalledWith(expect.objectContaining({ targetSubagent: alpha, workerHistory: messages, prompt: 'verify' }));
    await expect(followup({ workerId, prompt: 'duplicate' }, {} as never)).resolves.toHaveProperty('error');
    const otherTask = await createSubagentsToolset({} as never, task as never, manager as never, {} as never);
    await expect(otherTask['subagents---followup_task'].execute!({ workerId, prompt: 'foreign' }, {} as never)).resolves.toHaveProperty('error');
  });

  it('follows up from worker state after the parent conversation was compacted', async () => {
    const workerId = '723449a0-83ec-4676-9f85-d77461069b8e';
    const alpha = { id: 'profile-alpha', name: 'renamed alpha', subagent: { invocationMode: 'on-demand', description: 'alpha' } };
    const messages = [{ id: 'previous', role: 'assistant', content: 'retained evidence' }];
    const task = {
      project: {},
      getTaskDir: () => '/fixture',
      readWorkerHistory: vi.fn(async () => ({ profileId: alpha.id, messages })),
      saveWorkerHistory: vi.fn(),
      trackWorkerRun: vi.fn(),
      claimWorkerTurn: vi.fn(() => true),
      releaseWorkerTurn: vi.fn(),
    };
    const manager = { getProjectProfiles: () => [alpha] };
    vi.mocked(runSubagentTask).mockResolvedValue({ status: 'success', messages: [], promptContext: { id: 'continued' } });
    const tools = await createSubagentsToolset({} as never, task as never, manager as never, {} as never);
    await expect(tools['subagents---followup_task'].execute!({ workerId, prompt: 'verify' }, {} as never)).resolves.toEqual({ workerId, status: 'running' });
    expect(runSubagentTask).toHaveBeenLastCalledWith(expect.objectContaining({ targetSubagent: alpha, workerHistory: messages }));
  });
});
