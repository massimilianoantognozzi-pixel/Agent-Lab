import { describe, expect, it, vi } from 'vitest';

import { EventsHandler } from '../events-handler';

import type { AgentProfileManager } from '@/agent';
import type { Store } from '@/store';
import type { ModelManager } from '@/models';
import type { TelemetryManager } from '@/telemetry';
import type { ProjectData } from '@common/types';

describe('EventsHandler', () => {
  it('keeps the interrupted checkpoint intact when closing an ordinary session', async () => {
    const data = { state: 'INTERRUPTED', name: 'Lavoro', metadata: { recoverableRootTurn: 'saved-turn' } };
    const source = { task: data, waitForIdle: vi.fn(), isPromptRunning: () => false, workListData: async () => data, runPrompt: vi.fn() };
    const closure = { runPrompt: vi.fn().mockResolvedValue([]) };
    const project = { getTask: (id: string) => (id === 'original' ? source : closure), createNewTask: vi.fn().mockResolvedValue({ id: 'closure' }) };
    const handler = Object.create(EventsHandler.prototype) as EventsHandler;
    Object.assign(handler, {
      projectManager: { getProject: () => project },
      modelManager: { waitForInit: vi.fn() },
      extensionManager: { waitForInit: vi.fn() },
    });
    await handler.runPrompt('/project', 'original', '/chiudi');
    expect(source.runPrompt).not.toHaveBeenCalled();
    expect(project.createNewTask).toHaveBeenCalledWith(expect.objectContaining({ parentId: 'original' }));
    expect(closure.runPrompt.mock.calls[0][0]).toContain('saved-turn');
    expect(closure.runPrompt.mock.calls[0][0]).toContain('push');
  });

  it('retains a resume request received before the project and model registry are ready', async () => {
    const ready = Promise.withResolvers<void>();
    const resume = vi.fn(async () => {});
    let started = false;
    const project = {
      start: vi.fn(async () => {
        await ready.promise;
        started = true;
      }),
      getTask: vi.fn(() => (started ? { resumeTask: resume } : null)),
    };
    const eventsHandler = new EventsHandler(
      { getProject: () => project } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { waitForInit: () => ready.promise } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { waitForInit: () => ready.promise } as never,
      {} as never,
      {} as never,
    );

    const request = eventsHandler.resumeTask('/project', 'recoverable-task');
    expect(resume).not.toHaveBeenCalled();
    ready.resolve();
    await request;
    expect(project.getTask).toHaveBeenCalledExactlyOnceWith('recoverable-task');
    expect(resume).toHaveBeenCalledOnce();
  });

  it('uses the default agent profile when the active project profile is scoped to another project', async () => {
    const activeProject = {
      baseDir: '/previous-project',
      active: true,
      settings: {
        agentProfileId: 'previous-project-profile',
      },
    } as unknown as ProjectData;
    const store = {
      getOpenProjects: vi.fn(() => [activeProject]),
      setOpenProjects: vi.fn(),
    } as unknown as Store;
    const modelManager = {
      getProviderModels: vi.fn().mockResolvedValue({ models: [] }),
    } as unknown as ModelManager;
    const telemetryManager = {
      captureProjectOpened: vi.fn(),
    } as unknown as TelemetryManager;
    const agentProfileManager = {
      getDefaultAgentProfileId: vi.fn(() => 'default-profile'),
      getProfile: vi.fn(() => ({ id: 'previous-project-profile', projectDir: '/previous-project' })),
    } as unknown as AgentProfileManager;
    const eventsHandler = new EventsHandler(
      {} as never,
      store,
      {} as never,
      {} as never,
      {} as never,
      modelManager,
      telemetryManager,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      agentProfileManager,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await eventsHandler.addOpenProject('/new-project');

    expect(store.setOpenProjects).toHaveBeenCalledWith([
      { ...activeProject, active: false },
      expect.objectContaining({
        baseDir: '/new-project',
        active: true,
        settings: expect.objectContaining({ agentProfileId: 'default-profile' }),
      }),
    ]);
  });
});
