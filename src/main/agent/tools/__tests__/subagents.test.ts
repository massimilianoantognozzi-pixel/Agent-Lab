import { describe, expect, it, vi } from 'vitest';

import { createSubagentsToolset } from '../subagents';

import { runSubagentTask } from '@/agent/subagent';

vi.mock('@/agent/subagent', () => ({
  getEnabledSubagents: (profiles: unknown[]) => profiles,
  findEnabledSubagent: (profiles: { name: string }[], id: string) => profiles.find((profile) => profile.name === id),
  runSubagentTask: vi.fn(),
}));

describe('subagent tool sessions', () => {
  it('returns two handles before either worker is finished and retrieves their separate results', async () => {
    const profiles = ['alpha', 'beta'].map((name) => ({ id: name, name, subagent: { invocationMode: 'on-demand', description: name } }));
    const task = { project: {}, addToolMessage: vi.fn(), saveWorkerHistory: vi.fn() };
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
    expect(task.saveWorkerHistory).toHaveBeenCalledTimes(2);
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
    const task = { project: {}, readWorkerHistory: vi.fn(async () => undefined) };
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
    const task = { project: {}, readWorkerHistory: vi.fn(async () => ({ profileId: alpha.id, messages })) };
    const manager = { getProjectProfiles: () => [alpha] };
    vi.mocked(runSubagentTask).mockResolvedValue({ status: 'success', messages: [], promptContext: { id: 'continued' } });
    const tools = await createSubagentsToolset({} as never, task as never, manager as never, {} as never);
    await expect(tools['subagents---followup_task'].execute!({ workerId, prompt: 'verify' }, {} as never)).resolves.toEqual({ workerId, status: 'running' });
    expect(runSubagentTask).toHaveBeenLastCalledWith(expect.objectContaining({ targetSubagent: alpha, workerHistory: messages }));
  });
});
