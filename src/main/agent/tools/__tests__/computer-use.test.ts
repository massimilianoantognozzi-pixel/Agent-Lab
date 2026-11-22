import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createComputerUseTools } from '../computer-use';

const mock = vi.hoisted(() => ({ consent: vi.fn(), open: vi.fn(), call: vi.fn(), close: vi.fn(), identity: { objective: 'Controlla la finestra scelta' } }));
vi.mock('../computer-driver', () => ({ openComputerDriver: mock.open }));
vi.mock('../host-execution', () => ({ currentComputerWork: () => mock.identity }));
vi.mock('electron', () => ({ BrowserWindow: { getFocusedWindow: () => null }, dialog: { showMessageBox: mock.consent } }));

const task = { getTaskDir: () => process.cwd(), getProjectDir: () => process.cwd() } as never;
const opt = { toolCallId: 'test', messages: [], context: {} };
const win = { pid: 121, window_id: 80, app_name: 'Demo', title: 'Finestra di prova' };
const other = { pid: 150, window_id: 30, app_name: 'Privata', title: 'Titolo non condiviso' };
const text = (s: string) => [{ type: 'text', text: s }];

describe('computer use scoped to a desktop turn', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.consent.mockResolvedValue({ response: 1 });
    mock.open.mockResolvedValue({ callTool: mock.call, close: mock.close });
    mock.call.mockImplementation(async ({ name }) => {
      if (name === 'list_windows') {
        return { content: text(''), structuredContent: { windows: [win, other] } };
      }
      if (name === 'get_window_state') {
        return { content: text('Controllo [1]'), structuredContent: { ...win, snapshot_id: 's7', window_bounds: { width: 400, height: 250 } } };
      }
      return { content: text(''), structuredContent: { effect: 'confirmed' } };
    });
  });

  it('sends only to the selected window and consumes the observation after each action', async () => {
    const ctrl = new AbortController();
    const tools = createComputerUseTools(task, 'test', ctrl.signal);
    const choose = await tools['computer---select_window'].execute({ query: 'di prova' }, opt);
    expect(choose).not.toContain(other.title);
    await tools['computer---observe'].execute({ screenshot: false }, opt);
    const click = { gesture: { action: 'click' as const, target: { element: 1 } }, foreground: false };
    await tools['computer---act'].execute(click, opt);
    expect(mock.call).toHaveBeenCalledWith(
      { name: 'click', arguments: { target: { kind: 'window', pid: 121, window_id: 80 }, delivery_mode: 'background', element_token: 's7:1' } },
      expect.anything(),
      expect.anything(),
    );
    await expect(tools['computer---act'].execute(click, opt)).rejects.toThrow('osservazione');
    await tools['computer---observe'].execute({ screenshot: false }, opt);
    await expect(tools['computer---act'].execute({ ...click, foreground: true }, opt)).rejects.toThrow('primo piano');
    await expect(tools['computer---act'].execute({ gesture: { action: 'click', target: { x: 10, y: 5 } }, foreground: false }, opt)).rejects.toThrow(
      'immagine',
    );
    mock.identity = { objective: 'Nuovo incarico' };
    await expect(tools['computer---observe'].execute({ screenshot: false }, opt)).rejects.toThrow('condividi');
    ctrl.abort();
    await vi.waitFor(() => expect(mock.close).toHaveBeenCalledOnce());
  });

  it('does not start the driver after refusal or after stop while the dialog is open', async () => {
    const ctrl = new AbortController();
    const tools = createComputerUseTools(task, 'test', ctrl.signal);
    mock.consent.mockResolvedValueOnce({ response: 0 });
    expect(await tools['computer---select_window'].execute({ query: 'Demo' }, opt)).toContain('annullato');
    const answer = Promise.withResolvers<{ response: number }>();
    mock.consent.mockReturnValueOnce(answer.promise);
    const choose = tools['computer---select_window'].execute({ query: 'Demo' }, opt);
    await vi.waitFor(() => expect(mock.consent).toHaveBeenCalledTimes(2));
    ctrl.abort();
    answer.resolve({ response: 1 });
    await expect(choose).rejects.toThrow();
    expect(mock.open).not.toHaveBeenCalled();
  });

  it('binds pixel clicks to the last image and uses the driver click contract for a double or secondary click', async () => {
    const controller = new AbortController();
    const tools = createComputerUseTools(task, 'test', controller.signal);
    await tools['computer---select_window'].execute({ query: win.title }, opt);
    const fallback = mock.call.getMockImplementation()!;
    mock.call.mockImplementation(async (request, ...rest) =>
      request.name === 'get_window_state'
        ? {
            content: [{ type: 'image', mimeType: 'image/png', data: 'AQID' }],
            structuredContent: { ...win, snapshot_id: 's8', capture_id: 'capture-8', screenshot_width: 20, screenshot_height: 30 },
          }
        : fallback(request, ...rest),
    );
    for (const [button, double] of [
      ['left', true],
      ['right', false],
    ] as const) {
      await tools['computer---observe'].execute({ screenshot: true }, opt);
      await tools['computer---act'].execute({ gesture: { action: 'click', target: { x: 5, y: 6 }, button, double }, foreground: false }, opt);
      expect(mock.call).toHaveBeenLastCalledWith(
        {
          name: 'click',
          arguments: {
            target: { kind: 'window', pid: win.pid, window_id: win.window_id },
            x: 5,
            y: 6,
            delivery_mode: 'background',
            capture_id: 'capture-8',
            ...(double ? { count: 2 } : { button: 'right' }),
          },
        },
        expect.anything(),
        expect.anything(),
      );
    }
    controller.abort();
  });

  it('keeps an unclosed browser session owned until cleanup and surfaces an in-band shutdown refusal', async () => {
    const ctrl = new AbortController();
    let release: (() => Promise<void>) | undefined;
    const tools = createComputerUseTools(task, 'test', ctrl.signal, (cleanup) => {
      release = cleanup;
    });
    mock.call.mockImplementation(async ({ name }) => ({
      content: text(''),
      structuredContent: name === 'start_session' ? {} : { status: 'refused' },
    }));
    await expect(tools['computer---browser'].execute({ request: { action: 'open' } }, opt)).rejects.toThrow();
    await expect(tools['computer---browser'].execute({ request: { action: 'open' } }, opt)).rejects.toThrow('Chiudi');
    ctrl.abort();
    await expect(release?.()).rejects.toThrow();
    expect(mock.close).toHaveBeenCalledOnce();
    expect(mock.call.mock.calls.filter(([value]) => value.name === 'start_session')).toHaveLength(1);
  });
});
