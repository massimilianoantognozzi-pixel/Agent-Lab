const styles = String.raw`
:root {
  color-scheme: dark; font: 16px/1.45 Roboto, system-ui, sans-serif; background: #000; color: #f5f5f5;
  --surface: #303030; --border: #454545; --muted: #aeb0b5; --signal: #65bd77; --blue: #3563e9; --detail: #18181a;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; overflow: hidden; }
button, input, textarea { font: inherit; color: inherit; }
button { border: 0; padding: 0; background: transparent; cursor: pointer; }
button:disabled { opacity: .45; cursor: default; }
button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid #a7b8ff; outline-offset: 3px; }
h1, h2, h3, p, pre { margin: 0; }
svg { display: block; width: 20px; height: 20px; flex: none; stroke-width: 1.9; }
.sr-only, .symbols { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.app { position: relative; margin-inline: auto; width: min(100%, 680px); height: 100vh; height: 100dvh;
  height: var(--app-height, 100dvh); padding-top: env(safe-area-inset-top); overflow: hidden; }
.workspace, .screen, .pairing { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.app-bar { display: flex; align-items: center; gap: 8px; padding: 13px 14px 5px; min-height: 66px; flex: none; }
.round, .header-actions, .chat-heading { background: var(--surface); border: 1px solid var(--border); border-radius: 28px; }
.round, .bare-icon { width: 44px; height: 44px; flex: 0 0 44px; display: inline-grid; place-items: center; }
.bare-icon { color: var(--muted); }
.home-title { flex: 1; min-width: 0; text-align: center; font-size: 19px; font-weight: 650; }
.chat-heading { flex: 1; min-width: 0; padding: 5px 11px 6px; }
.chat-heading strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.meta { display: flex; align-items: center; gap: 4px; min-width: 0; font-size: 11px; color: var(--muted); white-space: nowrap; }
.meta span:not(.dot) { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.meta svg, .connection svg { width: 14px; height: 14px; }
.header-actions { display: flex; align-items: center; flex: none; }
.header-actions button { width: 43px; height: 44px; display: grid; place-items: center; }
.dot { width: 7px; height: 7px; flex: none; border-radius: 50%; background: var(--signal); }
.dot.offline { background: #b88752; }
.home-scroll, .chat-scroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
.filters { display: flex; align-items: center; gap: 14px; padding: 17px 16px 0; font-size: 13px; }
.selected-filter { padding: 6px 14px; border-radius: 20px; background: #383838; }
.connection { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
.home-content { padding: 33px 16px 16px; }
.home-content h2 { font-size: 18px; font-weight: 650; margin-bottom: 9px; }
.project-line { display: flex; align-items: center; gap: 6px; }
.project-name { display: flex; align-items: center; gap: 10px; min-height: 44px; min-width: 0; flex: 1; text-align: left; font-weight: 650; }
.project-name span { min-width: 0; overflow-wrap: anywhere; }
.project-name .chevron { margin-left: auto; color: var(--muted); }
.project-name[aria-expanded="false"] .chevron { transform: rotate(-90deg); }
.task-list { display: grid; padding-left: 30px; }
.task-link { display: flex; align-items: center; gap: 6px; min-height: 46px; text-align: left; padding-block: 7px; width: 100%; }
.task-link span { min-width: 0; overflow-wrap: anywhere; }
.task-link .dot { margin-left: auto; }
.empty-list { color: var(--muted); font-size: 14px; padding: 8px 0; }
.search-bar { padding: 8px 16px 0; }
.search-bar input, .pairing input {
  width: 100%; background: var(--detail); border: 1px solid var(--border); border-radius: 14px; padding: 10px 12px;
}
.pairing { justify-content: center; gap: 16px; padding: 24px; }
.pairing h1 { font-size: 25px; }
.pairing p, .sheet-note, .context-lines { color: var(--muted); }
.pair-form label { display: block; margin-bottom: 5px; }
.pair-form .primary { margin-top: 12px; }
.toast { position: absolute; top: max(env(safe-area-inset-top), 4px); left: 12px; right: 12px; z-index: 2;
  padding: 9px 12px; border: 1px solid #64533b; border-radius: 12px; color: #f4dbb3; background: #281e12; font-size: 13px; }
.toast:empty, .dialog-status:empty { display: none; }
.dialog-status { color: #f4dbb3; font-size: 13px; margin: 0 0 8px; }
.composer-wrap { flex: none; padding: 5px 10px max(10px, env(safe-area-inset-bottom)); }
.composer { display: flex; align-items: center; gap: 5px; min-height: 54px; padding: 3px 4px 3px 10px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 28px; min-width: 0; }
button.home-composer { width: 100%; color: var(--muted); text-align: left; }
.home-composer .composer-text { flex: 1; min-width: 0; padding-left: 5px; }
.blue-action { display: grid; place-items: center; background: var(--blue); color: white; border-radius: 50%;
  width: 44px; height: 44px; flex: none; }
.chat-composer { display: block; padding: 7px 7px 5px; border-radius: 25px; }
.chat-composer textarea { display: block; resize: none; width: 100%; min-height: 38px; max-height: 122px; padding: 6px 7px;
  background: transparent; border: 0; overflow: auto; }
.chat-composer textarea::placeholder { color: var(--muted); }
.chat-composer textarea:focus { outline-offset: -2px; border-radius: 12px; }
.composer-controls { display: flex; align-items: center; gap: 1px; min-width: 0; }
.composer-controls .bare-icon { flex-basis: 38px; width: 38px; color: #f5f5f5; }
.autonomy, .effort { min-height: 44px; display: flex; align-items: center; gap: 4px; min-width: 0; padding: 0 3px; }
.autonomy { flex: none; color: #ebc98f; font-size: 12px; font-weight: 650; }
.autonomy svg { width: 15px; height: 15px; }
.effort { flex: 1; justify-content: center; font-size: 12px; font-weight: 650; }
.effort span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.context-lines { flex: none; padding: 8px 22px 16px; display: grid; gap: 13px; }
.context-lines span { display: flex; align-items: center; gap: 8px; }
.context-lines svg { width: 16px; height: 16px; }
.conversation { padding: 25px 14px 14px; display: flex; flex-direction: column; gap: 18px; }
.message { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 100%; font-size: 15px; }
.bubble { align-self: flex-end; max-width: 86%; background: #101064; color: #f8f8ff; padding: 12px 14px; border-radius: 22px; }
.assistant-message { padding: 0 2px; }
.chat-events { display: grid; gap: 8px; padding: 0 14px 12px; }
.event { width: 100%; display: flex; align-items: center; text-align: left; gap: 9px; padding: 9px 11px; min-height: 54px;
  background: #111113; border: 1px solid #29292d; border-radius: 14px; }
.event-label { min-width: 0; flex: 1; }
.event-label strong, .event-label small { display: block; overflow-wrap: anywhere; }
.event-label strong { font-size: 14px; }
.event-label small { color: var(--muted); font-size: 12px; }
.verified { color: var(--signal); }
dialog { color: #f5f5f5; background: var(--detail); border: 1px solid #303034; margin: 0 auto; }
dialog::backdrop { background: rgb(0 0 0 / 56%); }
.sheet { position: fixed; inset: auto 0 0; width: min(100%, 680px); max-width: none; max-height: min(82vh, 640px);
  max-height: min(calc(var(--app-height, 100dvh) * .82), 640px); padding: 8px 16px max(18px, env(safe-area-inset-bottom));
  overflow: auto; overscroll-behavior: contain; border-radius: 24px 24px 0 0; }
.sheet-handle { display: block; width: 31px; height: 4px; border-radius: 3px; background: #55555d; margin: 0 auto 4px; }
.sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.sheet-head h2 { font-size: 18px; font-weight: 650; }
.sheet-note { font-size: 13px; margin: 0 0 8px; }
.sheet p, .sheet li, .sheet pre { overflow-wrap: anywhere; }
.mode-choice, .detail-row { display: flex; align-items: center; gap: 9px; min-height: 49px; padding: 5px 0; border-top: 1px solid #303034; }
.mode-choice { width: 100%; text-align: left; }
.mode-choice span, .detail-row span { display: block; min-width: 0; flex: 1; }
.mode-choice strong, .mode-choice small { display: block; }
.mode-choice small, .detail-row small { color: var(--muted); font-size: 12px; }
.detail-row svg { width: 17px; height: 17px; }
.detail-row small { text-align: right; overflow-wrap: anywhere; }
.primary, .sheet-action { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; width: 100%;
  padding: 5px 10px; border-radius: 13px; font-weight: 650; }
.primary { background: var(--blue); color: white; }
.sheet-action { margin-top: 8px; background: #303036; }
.sheet-action + .primary { margin-top: 8px; }
.sheet-copy { white-space: pre-wrap; font: inherit; font-size: 14px; margin-bottom: 8px; }
.patch { white-space: pre-wrap; font: 12px/1.5 ui-monospace, monospace; background: #101013; border-radius: 12px; padding: 10px; margin-top: 10px; }
.drawer { position: fixed; inset: 0 auto 0 max(0px, calc((100vw - 680px)/2)); margin: 0; max-width: none; max-height: none;
  width: min(80vw, 285px); height: var(--app-height, 100dvh); padding: max(14px, env(safe-area-inset-top)) 14px 16px; border-radius: 0 22px 22px 0; overflow: auto; }
.drawer .detail-row { margin: 7px 0; }
@media(max-width:360px) {
  .app-bar { gap: 6px; padding-inline: 10px; }
  .chat-heading { padding-inline: 8px; }
  .header-actions button { width: 35px; }
  .meta { gap: 3px; }
  .meta svg { width: 11px; height: 11px; }
  .composer-controls .bare-icon { flex-basis: 34px; width: 34px; }
  .autonomy, .effort { font-size: 11px; }
}
`;

const symbol = (name: string, body: string) => '<symbol id="icon-' + name + '" viewBox="0 0 24 24">' + body + '</symbol>';
const symbols = [
  symbol('menu', '<path d="M4 7h16M4 12h12M4 17h16"/>'),
  symbol('search', '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
  symbol('back', '<path d="m12 5-7 7 7 7M5 12h14"/>'),
  symbol('new', '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M16 4l4 4M9 15l1-4 9-9 4 4-9 9z"/>'),
  symbol('folder', '<path d="M3 6a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  symbol('laptop', '<path d="M6 5h12v11H6zM3 19h18l-3-3H6z"/>'),
  symbol('down', '<path d="m6 9 6 6 6-6"/>'),
  symbol('right', '<path d="m9 6 6 6-6 6"/>'),
  symbol('plus', '<path d="M12 5v14M5 12h14"/>'),
  symbol('up', '<path d="m5 12 7-7 7 7M12 5v14"/>'),
  symbol('shield', '<path d="M12 22s7-4 7-11V5l-7-3-7 3v6c0 7 7 11 7 11z"/>'),
  symbol('more', '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),
  symbol('close', '<path d="m6 6 12 12M18 6 6 18"/>'),
  symbol('file', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6"/>'),
  symbol('check', '<path d="m5 12 4 4L19 6"/>'),
  symbol('stop', '<rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none"/>'),
].join('');

const icon = (name: string, className = '') =>
  '<svg aria-hidden="true" class="' +
  className +
  '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><use href="#icon-' +
  name +
  '"></use></svg>';

const iconButton = (id: string, className: string, label: string, glyph: string, extra = '') =>
  '<button type="button" id="' + id + '" class="' + className + '" aria-label="' + label + '" ' + extra + '>' + icon(glyph) + '</button>';

const projectMeta =
  '<span class="meta">' +
  icon('folder') +
  '<span id="chat-project"></span>' +
  icon('laptop') +
  '<span class="dot" id="chat-dot" aria-hidden="true"></span><span>PC Agent-Lab</span></span>';

const markup = [
  '<svg class="symbols" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs>' + symbols + '</defs></svg>',
  '<div class="app" id="app"><p class="toast" id="status" role="status" aria-live="polite"></p>',
  '<main class="pairing" id="pairing"><h1>Agent-Lab remoto</h1><h2>Associa il dispositivo</h2><p>Inserisci il codice mostrato sul PC.</p>',
  '<form class="pair-form" id="pair-form"><label for="code">Codice di associazione</label><input id="code" autocomplete="one-time-code" autocapitalize="off" spellcheck="false" maxlength="80" required>',
  '<button class="primary" id="pair">Associa</button></form></main>',
  '<main class="workspace" id="workspace" hidden>',
  '<section class="screen" id="home" aria-label="Home"><header class="app-bar">',
  iconButton('menu', 'round', 'Apri menu', 'menu'),
  '<h1 class="home-title">Agent-Lab</h1>',
  iconButton('search-toggle', 'round', 'Cerca conversazioni', 'search', 'aria-expanded="false" aria-controls="search-bar"'),
  '</header><div class="search-bar" id="search-bar" hidden><label class="sr-only" for="search">Cerca conversazioni</label><input id="search" type="search" placeholder="Cerca nelle chat"></div>',
  '<div class="home-scroll"><div class="filters"><span class="selected-filter">Tutti</span><span class="connection"><span class="dot" id="home-dot" aria-hidden="true"></span>' +
    icon('laptop') +
    ' PC Agent-Lab</span></div><div class="home-content"><h2>Progetti</h2><div class="project-line">',
  '<button type="button" class="project-name" id="project-toggle" aria-expanded="true" aria-controls="tasks">' +
    icon('folder') +
    '<span id="project"></span>' +
    icon('down', 'chevron') +
    '</button>',
  iconButton('create', 'bare-icon', 'Nuova chat nel progetto', 'new'),
  '</div><div id="tasks" class="task-list" aria-label="Conversazioni del progetto"></div></div></div>',
  '<div class="composer-wrap"><button type="button" class="composer home-composer" id="home-compose">' +
    icon('plus') +
    '<span class="composer-text">Chiedi ad Agent-Lab</span><span class="blue-action">' +
    icon('up') +
    '</span></button></div></section>',
  '<section class="screen" id="chat" aria-label="Conversazione" hidden><header class="app-bar">',
  iconButton('back', 'round', 'Torna alla Home', 'back'),
  '<div class="chat-heading"><strong id="chat-title">Nuova chat</strong>' + projectMeta + '</div>',
  '<div class="header-actions" id="chat-actions" hidden>' +
    iconButton('another-chat', '', 'Nuova chat', 'new') +
    iconButton('task-details', '', 'Dettagli del task', 'more') +
    '</div></header>',
  '<div id="chat-scroll" class="chat-scroll"><div id="messages" class="conversation" role="log" aria-label="Messaggi"></div><div id="chat-events" class="chat-events"></div></div>',
  '<div id="new-context" class="context-lines" hidden><span>' +
    icon('laptop') +
    ' PC Agent-Lab</span><span>' +
    icon('folder') +
    '<span id="draft-project"></span></span></div>',
  '<div class="composer-wrap"><form id="composer" class="composer chat-composer">',
  '<label class="sr-only" for="prompt">Richiesta</label><textarea id="prompt" rows="1" maxlength="1400" placeholder="Cosa programmiamo adesso?"></textarea>',
  '<div class="composer-controls">' +
    iconButton('work-kind', 'bare-icon', 'Tipo di lavoro', 'plus') +
    '<button type="button" class="autonomy" id="autonomy">' +
    icon('shield') +
    '<span id="autonomy-label">Guidata</span></button>',
  '<button type="button" id="effort" class="effort" aria-label="Scegli livello di ragionamento"><span id="effort-label"></span></button>',
  '<button type="submit" id="run" class="blue-action" aria-label="Invia richiesta">' +
    icon('up') +
    '</button>' +
    iconButton('stop', 'blue-action', 'Interrompi', 'stop', 'hidden') +
    '</div></form></div></section></main>',
  '<dialog class="drawer" id="drawer" aria-labelledby="drawer-title"><div class="sheet-head"><h2 id="drawer-title">Agent-Lab</h2>' +
    iconButton('close-drawer', 'bare-icon', 'Chiudi menu', 'close') +
    '</div><p class="dialog-status" id="drawer-status" role="status"></p><div class="detail-row">' +
    icon('laptop') +
    '<span>PC Agent-Lab</span><small id="drawer-connection"></small></div><div class="detail-row">' +
    icon('shield') +
    '<span>Accesso al PC</span><small>Progetto associato</small></div>',
  '<button type="button" class="sheet-action" id="install" hidden>Installa Agent-Lab</button><button type="button" class="sheet-action" id="revoke">Disconnetti dispositivo</button></dialog>',
  '<dialog class="sheet" id="sheet" aria-labelledby="sheet-title"><div class="sheet-handle" aria-hidden="true"></div><div class="sheet-head"><h2 id="sheet-title"></h2>' +
    iconButton('close-sheet', 'bare-icon', 'Chiudi pannello', 'close') +
    '</div><p class="dialog-status" id="sheet-status" role="status"></p><div id="sheet-body"></div></dialog></div>',
].join('\n');

const script = String.raw`
'use strict';

const ui = id => document.getElementById(id);
const storage = sessionStorage;
const keys = { token: 'agentlab-remote', project: 'agentlab-project', task: 'agentlab-task' };
function takePairingCode() {
  const fragment = window.location.hash;
  if (!fragment.startsWith('#pair=')) return '';
  history.replaceState(history.state, '', window.location.pathname + window.location.search);
  return /^#pair=([a-f0-9]{32})$/i.exec(fragment)?.[1] || '';
}
let pairingCode = takePairingCode();
const labels = {
  autonomy: { manual: 'Manuale', guided: 'Guidata', autonomous: 'Autonoma' },
  reasoning: { default: 'Predefinito', low: 'Basso', medium: 'Medio', high: 'Alto', xhigh: 'Molto alto' },
  kind: { bug: 'Bug', change: 'Modifica', feature: 'Funzionalità' },
};
const autonomyHelp = {
  manual: 'Chiede conferma per strumenti e piano.',
  guided: 'Usa gli strumenti consentiti e chiede di approvare il piano.',
  autonomous: 'Procede con gli strumenti consentiti.',
};
let token = storage.getItem(keys.token) || '';
let authenticated = false;
let project = storage.getItem(keys.project) || '';
let selected = storage.getItem(keys.task) || '';
let view = 'pairing';
let current = null;
let tasks = [];
let projectSettings = { autonomyLocked: false, defaultAutonomy: 'guided', model: '' };
let draft = { autonomy: 'guided', reasoning: 'default' };
let kind = 'feature';
let busy = false;
let refreshing = false;
let generation = 0;
let installation;
let openedSheet = '';
let planAtOpen = '';
let deliveryAtOpen = '';
let renderedMessages = '';
let renderedTasks = '';
let renderedEvents = '';
let renderedSettings = '';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function glyph(name) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#icon-' + name);
  node.append(use);
  return node;
}

function button(text, className, handle) {
  const node = element('button', className, text);
  node.type = 'button';
  node.addEventListener('click', handle);
  return node;
}

function announce(message) {
  for (const id of ['status', 'sheet-status', 'drawer-status']) ui(id).textContent = '';
  const target = ui('sheet').open ? 'sheet-status' : ui('drawer').open ? 'drawer-status' : 'status';
  ui(target).textContent = message || '';
}

function connection(online) {
  for (const id of ['home-dot', 'chat-dot']) ui(id).classList.toggle('offline', !online);
  ui('home-dot').parentElement.setAttribute('aria-label', online ? 'PC Agent-Lab connesso' : 'PC Agent-Lab non raggiungibile');
  ui('drawer-connection').textContent = online ? 'Connesso' : 'Non raggiungibile';
}

function forgetSession() {
  authenticated = false;
  token = '';
  project = '';
  selected = '';
  current = null;
  tasks = [];
  renderedTasks = '';
  ui('tasks').replaceChildren();
  Object.values(keys).forEach(key => storage.removeItem(key));
  show('pairing');
}

async function request(route, body, probe = false) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(route, {
      method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
      credentials: 'same-origin', signal: probe ? AbortSignal.timeout(8000) : undefined,
    });
  } catch {
    connection(false);
    throw Error('PC Agent-Lab non raggiungibile.');
  }
  if (response.status === 401) {
    if (probe) return null;
    forgetSession();
  }
  if (response.status >= 500) {
    connection(false);
    throw Error('PC Agent-Lab non raggiungibile.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || 'Operazione non disponibile.');
  connection(true);
  return data;
}

const action = (name, values = {}) => request('/api/action', { action: name, ...values });

function closePanels() {
  for (const id of ['sheet', 'drawer']) if (ui(id).open) ui(id).close();
}

function show(next) {
  closePanels();
  view = next;
  generation += 1;
  ui('pairing').hidden = next !== 'pairing';
  ui('workspace').hidden = next === 'pairing';
  ui('home').hidden = next !== 'home';
  ui('chat').hidden = next !== 'new' && next !== 'chat';
  ui('new-context').hidden = next !== 'new';
  ui('chat-actions').hidden = next !== 'chat';
  if (next === 'chat' || next === 'new') {
    ui('prompt').value = '';
    renderedMessages = '';
    renderedEvents = '';
    ui('messages').replaceChildren();
    ui('chat-events').replaceChildren();
    renderChat();
  }
  if (next === 'home') {
    ui('project').textContent = project;
    renderTasks();
  }
}

function selectTask(id) {
  selected = id;
  current = null;
  storage.setItem(keys.task, id);
  show('chat');
  void refresh();
}

function newChat(focus) {
  selected = '';
  current = null;
  storage.removeItem(keys.task);
  draft = { autonomy: projectSettings.defaultAutonomy, reasoning: 'default' };
  kind = 'feature';
  show('new');
  if (focus) ui('prompt').focus({ preventScroll: true });
}

function fitPrompt() {
  const prompt = ui('prompt');
  prompt.style.height = 'auto';
  prompt.style.height = Math.min(prompt.scrollHeight, 122) + 'px';
  ui('run').disabled = !prompt.value.trim() || busy || Boolean(current?.running) || (view === 'chat' && !current);
}

function renderTasks() {
  const query = ui('search').value.trim().toLocaleLowerCase('it');
  const visible = tasks.filter(task => String(task.name || '').toLocaleLowerCase('it').includes(query));
  const key = JSON.stringify([query, visible.map(task => [task.id, task.name, task.state])]);
  if (key === renderedTasks) return;
  renderedTasks = key;
  const rows = visible.map(task => {
    const row = button('', 'task-link', () => selectTask(task.id));
    row.append(element('span', '', task.name || 'Conversazione'));
    if (task.state === 'IN_PROGRESS') row.append(element('span', 'dot'));
    return row;
  });
  if (!rows.length) rows.push(element('p', 'empty-list', query ? 'Nessuna conversazione trovata.' : 'Inizia una nuova chat.'));
  ui('tasks').replaceChildren(...rows);
}

function flowLabel(id) {
  const display = { syntax: 'Sintassi', 'regression-filter': 'Riproduzione del bug', labels: 'Etichette' };
  return Object.hasOwn(display, id) ? display[id] : id;
}

function messageNodes(messages) {
  return messages.filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => element('div', message.role === 'user' ? 'message bubble' : 'message assistant-message', message.text));
}

function eventCard(title, note, mark, handle) {
  const card = button('', 'event', handle);
  const label = element('span', 'event-label');
  label.append(element('strong', '', title), element('small', '', note));
  const leading = glyph(mark);
  if (mark === 'check') leading.classList.add('verified');
  card.append(leading, label, glyph('right'));
  return card;
}

function renderChat() {
  if (view !== 'chat' && view !== 'new') return;
  const settings = view === 'new' ? draft : current;
  const flow = current?.workflow;
  const autonomy = settings?.autonomy || projectSettings.defaultAutonomy;
  const effort = settings?.reasoning || 'default';
  const model = settings?.model || projectSettings.model;
  ui('chat-project').textContent = project;
  ui('draft-project').textContent = project;
  ui('chat-title').textContent = view === 'new' ? 'Nuova chat' : current?.name || 'Conversazione';
  ui('autonomy-label').textContent = labels.autonomy[autonomy] || labels.autonomy.guided;
  ui('autonomy').setAttribute('aria-label', 'Autonomia: ' + ui('autonomy-label').textContent + '. Accesso al PC');
  const modelLabel = model === 'gpt-6.1-sol' ? '6.1 Sol' : model || 'Ragionamento';
  ui('effort-label').textContent = modelLabel + ' · ' + (labels.reasoning[effort] || labels.reasoning.default);
  ui('work-kind').setAttribute('aria-label', 'Tipo di lavoro: ' + labels.kind[kind]);
  ui('prompt').placeholder = view === 'new' ? 'Cosa programmiamo adesso?' : 'Lavora su PC Agent-Lab';
  ui('run').hidden = Boolean(current?.running);
  ui('stop').hidden = !current?.running;

  const scroll = ui('chat-scroll');
  const atEnd = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 75;
  let changed = false;
  const messages = current?.messages || [];
  const messageKey = JSON.stringify(messages.map(item => [item.id, item.role, item.text]));
  if (renderedMessages !== messageKey) {
    renderedMessages = messageKey;
    ui('messages').replaceChildren(...messageNodes(messages));
    changed = true;
  }
  const eventKey = JSON.stringify([flow?.phase, flow?.revision, flow?.plan?.questions, current?.running, current?.failed, current?.state]);
  if (renderedEvents !== eventKey) {
    renderedEvents = eventKey;
    const events = [];
    if (current?.running) events.push(element('p', 'sheet-note', 'Task in corso'));
    if (flow?.phase === 'plan') events.push(eventCard(flow.plan?.questions?.length ? 'Piano da chiarire' : 'Piano da approvare',
      'Apri il piano', 'file', () => openSheet('plan')));
    if (flow?.phase === 'done') events.push(eventCard('Consegna pronta', 'Verifiche superate', 'check', () => openSheet('checks')));
    if (flow?.phase === 'approved' && !current?.running) {
      events.push(button('Riprendi il task', 'sheet-action', () => perform(async () => {
        await action('resume', { id: selected });
      })));
    }
    if ((current?.failed || current?.state === 'INTERRUPTED') && !current?.running) events.push(element('p', 'sheet-note', 'Operazione interrotta.'));
    ui('chat-events').replaceChildren(...events);
    if (openedSheet === 'plan' || (openedSheet === 'checks' && deliveryAtOpen !== flow?.revision)) renderSheet(openedSheet);
    changed = true;
  }
  if (changed && atEnd) scroll.scrollTop = scroll.scrollHeight;
  const settingsKey = JSON.stringify([selected, autonomy, effort, current?.autonomyLocked, current?.running]);
  if (renderedSettings !== settingsKey) {
    renderedSettings = settingsKey;
    if (openedSheet === 'autonomy' || openedSheet === 'reasoning') renderSheet(openedSheet);
  }
  fitPrompt();
}

function loadTaskList(data) {
  if (data.project && data.project !== project) {
    if (project) {
      selected = '';
      storage.removeItem(keys.task);
    }
    project = data.project;
    storage.setItem(keys.project, project);
    ui('project').textContent = project;
  }
  tasks = data.tasks || [];
  projectSettings = {
    autonomyLocked: Boolean(data.autonomyLocked),
    defaultAutonomy: Object.hasOwn(labels.autonomy, data.defaultAutonomy) ? data.defaultAutonomy : 'guided',
    model: data.model || '',
  };
}

function confirmPhoneReady() {
  requestAnimationFrame(() => {
    if (authenticated && !token) void action('device-ready').catch(() => {});
  });
}

async function restoreSession() {
  const pair = ui('pair');
  pair.disabled = true;
  let notice = '';
  try {
    let data = await request('/api/tasks', undefined, true);
    if (!data && token) {
      token = '';
      storage.removeItem(keys.token);
      data = await request('/api/tasks', undefined, true);
    }
    if (data) {
      authenticated = true;
      pairingCode = '';
      loadTaskList(data);
      if (tasks.some(task => task.id === selected)) {
        selectTask(selected);
      } else {
        selected = '';
        storage.removeItem(keys.task);
        show('home');
      }
      confirmPhoneReady();
    } else {
      forgetSession();
    }
  } catch (error) {
    show('pairing');
    notice = error.message;
  } finally {
    if (!authenticated && pairingCode) {
      ui('code').value = pairingCode;
      pairingCode = '';
      notice = ['Codice ricevuto dal QR. Premi Associa.', notice].filter(Boolean).join(' ');
    }
    if (notice) announce(notice);
    pair.disabled = false;
  }
}

async function refresh() {
  if (!authenticated || refreshing || busy || view === 'pairing' || view === 'new') return;
  refreshing = true;
  const snapshot = generation;
  try {
    if (view === 'home') {
      const data = await request('/api/tasks');
      if (snapshot !== generation) return;
      loadTaskList(data);
      renderTasks();
    } else if (selected) {
      const id = selected;
      const data = await request('/api/tasks/' + encodeURIComponent(id));
      if (snapshot !== generation || id !== selected) return;
      if (!current && Object.hasOwn(labels.kind, data.task?.workflow?.kind)) kind = data.task.workflow.kind;
      current = { ...data.task, failed: data.failed };
      renderChat();
    }
  } catch (error) {
    announce(error.message);
  } finally {
    refreshing = false;
    if (snapshot !== generation) void refresh();
  }
}

async function perform(handle) {
  if (busy) return;
  busy = true;
  generation += 1;
  announce('');
  fitPrompt();
  try {
    await handle();
  } catch (error) {
    announce(error.message);
  } finally {
    busy = false;
    fitPrompt();
    void refresh();
  }
}

function detail(label, value, mark) {
  const row = element('div', 'detail-row');
  const leading = glyph(mark);
  if (mark === 'check') leading.classList.add('verified');
  row.append(leading, element('span', '', label), element('small', '', value));
  return row;
}

function modeChoice(title, help, selectedValue, handle) {
  const option = button('', 'mode-choice', handle);
  option.setAttribute('aria-pressed', String(selectedValue));
  const text = element('span');
  text.append(element('strong', '', title));
  if (help) text.append(element('small', '', help));
  option.append(text);
  if (selectedValue) {
    const check = glyph('check');
    check.classList.add('verified');
    option.append(check);
  }
  return option;
}

function openSheet(name) {
  if (document.activeElement === ui('prompt')) ui('prompt').blur();
  openedSheet = name;
  planAtOpen = current?.workflow?.revision || '';
  deliveryAtOpen = current?.workflow?.revision || '';
  renderSheet(name);
  if (!ui('sheet').open) ui('sheet').showModal();
}

function settingsSheet(key, content) {
  const settings = view === 'new' ? draft : current;
  const locked = key === 'autonomy' && (view === 'new' ? projectSettings.autonomyLocked : current?.autonomyLocked);
  const active = settings?.[key] || (key === 'autonomy' ? projectSettings.defaultAutonomy : 'default');
  ui('sheet-title').textContent = key === 'autonomy' ? 'Autonomia del task' : 'Ragionamento';
  if (key === 'reasoning') content.append(element('p', 'sheet-note', current?.model || projectSettings.model));
  for (const [value, title] of Object.entries(labels[key])) {
    const choice = modeChoice(title, key === 'autonomy' ? autonomyHelp[value] : '', value === active, () => {
      if (view === 'new') {
        draft[key] = value;
        renderChat();
        return;
      }
      const id = selected;
      void perform(async () => {
        await action('settings', { id, [key]: value });
        if (selected !== id || !current) return;
        current = { ...current, [key]: value };
        renderChat();
      });
    });
    choice.disabled = Boolean(current?.running || locked) || (view === 'chat' && !current);
    content.append(choice);
  }
  if (key === 'autonomy') {
    if (locked) content.append(element('p', 'sheet-note', 'Autonomia bloccata sul PC.'));
    content.append(detail('Accesso al PC', 'Progetto associato', 'shield'));
    content.append(element('p', 'sheet-note', 'Il flusso governato richiede l’approvazione del piano in ogni modalità.'));
  }
}

function planSheet(flow, content) {
  const plan = flow?.plan;
  ui('sheet-title').textContent = plan?.questions?.length ? 'Piano da chiarire' : 'Piano';
  if (!plan) {
    content.append(element('p', 'sheet-note', 'Il piano non è ancora disponibile.'));
    return;
  }
  content.append(element('p', 'sheet-copy', plan.outcome));
  if (plan.delta) content.append(element('p', 'sheet-copy', plan.delta));
  for (const file of plan.files || []) content.append(detail('File coinvolto', file, 'file'));
  const steps = [
    ['Riuso', plan.reuse], ['Passi', plan.steps], ['Criteri', (plan.criteria || []).map(item => item.scenario + ' · ' + flowLabel(item.check))],
    ['Domande', plan.questions],
  ];
  for (const [title, items] of steps) {
    if (!items?.length) continue;
    content.append(element('h3', '', title));
    const list = element('ul');
    for (const item of items) list.append(element('li', '', item));
    content.append(list);
  }
  if (flow.revision && flow.revision !== planAtOpen) {
    content.append(element('p', 'sheet-note', 'È arrivata una nuova versione. Chiudi e riapri il piano per rivederla.'));
  } else if (flow.phase === 'plan' && planAtOpen && !plan.questions?.length) {
    const id = selected;
    const revision = planAtOpen;
    const approve = button('Approva il piano', 'primary', () => perform(async () => {
      await action('approve', { id, revision });
      if (ui('sheet').open) ui('sheet').close();
    }));
    approve.disabled = Boolean(current?.running);
    content.append(approve);
  }
}

function checksSheet(flow, content) {
  ui('sheet-title').textContent = 'Verifiche';
  if (flow?.phase !== 'done' || flow.revision !== deliveryAtOpen) {
    content.append(element('p', 'sheet-note', 'La consegna visualizzata non è più disponibile. Riapri le verifiche per aggiornarle.'));
    return;
  }
  content.append(element('p', 'sheet-note', current.name || 'Consegna'));
  for (const check of flow.checks || []) content.append(detail(flowLabel(check.id), check.passed ? 'Superato' : 'Fallito', check.passed ? 'check' : 'close'));
  for (const file of flow.files || []) content.append(detail('File modificato', file, 'file'));
  if (!deliveryAtOpen || !flow.files?.length) return;
  const id = selected;
  const revision = deliveryAtOpen;
  const patchButton = button('Vedi patch', 'sheet-action', async () => {
    patchButton.disabled = true;
    try {
      const data = await action('patch', { id, revision });
      if (openedSheet === 'checks' && selected === id && current?.workflow?.phase === 'done' && current.workflow.revision === revision) {
        patchButton.replaceWith(element('pre', 'patch', data.patch));
      }
    } catch (error) {
      patchButton.disabled = false;
      announce(error.message);
    }
  });
  content.append(patchButton);
}

function renderSheet(name) {
  const content = ui('sheet-body');
  const flow = current?.workflow;
  content.replaceChildren();
  if (name === 'autonomy' || name === 'reasoning') {
    settingsSheet(name, content);
  } else if (name === 'kind') {
    ui('sheet-title').textContent = 'Tipo di lavoro';
    for (const [value, title] of Object.entries(labels.kind)) {
      content.append(modeChoice(title, '', value === kind, () => {
        kind = value;
        renderChat();
        renderSheet(name);
      }));
    }
  } else if (name === 'plan') {
    planSheet(flow, content);
  } else if (name === 'checks') {
    checksSheet(flow, content);
  } else {
    ui('sheet-title').textContent = 'Dettagli del task';
    if (flow?.plan) content.append(button('Piano', 'sheet-action', () => openSheet('plan')));
    if (flow?.phase === 'done') content.append(button('Verifiche', 'sheet-action', () => openSheet('checks')));
    content.append(button('Autonomia e accesso al PC', 'sheet-action', () => openSheet('autonomy')));
  }
}

ui('pair-form').addEventListener('submit', event => {
  event.preventDefault();
  if (ui('pair').disabled) return;
  void perform(async () => {
    await request('/api/pair', { code: ui('code').value, client: 'web' });
    token = '';
    storage.removeItem(keys.token);
    const data = await request('/api/tasks', undefined, true);
    if (!data) {
      throw Error('Il browser non ha conservato l’associazione. Riapri Agent-Lab dall’indirizzo HTTPS e usa un nuovo QR.');
    }
    authenticated = true;
    selected = '';
    storage.removeItem(keys.task);
    loadTaskList(data);
    ui('code').value = '';
    show('home');
    confirmPhoneReady();
  });
});
ui('menu').addEventListener('click', () => ui('drawer').showModal());
ui('close-drawer').addEventListener('click', () => ui('drawer').close());
ui('close-sheet').addEventListener('click', () => ui('sheet').close());
ui('sheet').addEventListener('close', () => { openedSheet = ''; });
ui('revoke').addEventListener('click', () => void perform(async () => {
  await request('/api/revoke', {});
  forgetSession();
  announce('Dispositivo disconnesso.');
}));
ui('search-toggle').addEventListener('click', () => {
  const bar = ui('search-bar');
  bar.hidden = !bar.hidden;
  ui('search-toggle').setAttribute('aria-expanded', String(!bar.hidden));
  if (bar.hidden) {
    ui('search').value = '';
    renderTasks();
  } else {
    ui('tasks').hidden = false;
    ui('project-toggle').setAttribute('aria-expanded', 'true');
    ui('search').focus();
  }
});
ui('search').addEventListener('input', renderTasks);
ui('project-toggle').addEventListener('click', () => {
  ui('tasks').hidden = !ui('tasks').hidden;
  ui('project-toggle').setAttribute('aria-expanded', String(!ui('tasks').hidden));
});
for (const id of ['create', 'home-compose', 'another-chat']) ui(id).addEventListener('click', () => newChat(id === 'home-compose'));
ui('back').addEventListener('click', () => {
  selected = '';
  current = null;
  storage.removeItem(keys.task);
  show('home');
  void refresh();
});
ui('task-details').addEventListener('click', () => openSheet('details'));
ui('work-kind').addEventListener('click', () => openSheet('kind'));
ui('autonomy').addEventListener('click', () => openSheet('autonomy'));
ui('effort').addEventListener('click', () => openSheet('reasoning'));
ui('prompt').addEventListener('input', fitPrompt);
ui('composer').addEventListener('submit', event => {
  event.preventDefault();
  const text = ui('prompt').value.trim();
  if (!text || current?.running || (view === 'chat' && !current)) return;
  void perform(async () => {
    const origin = generation;
    const isNew = view === 'new';
    const workKind = kind;
    const options = { reasoning: draft.reasoning };
    if (!projectSettings.autonomyLocked) options.autonomy = draft.autonomy;
    const id = isNew ? (await action('create', options)).id : selected;
    await action('run', { id, prompt: '/workflow ' + workKind + ' ' + text });
    if (generation !== origin) return;
    if (isNew) selectTask(id);
    ui('prompt').value = '';
    ui('prompt').blur();
    fitPrompt();
  });
});
ui('stop').addEventListener('click', () => void perform(async () => { await action('stop', { id: selected }); }));

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installation = event;
  ui('install').hidden = false;
});
ui('install').addEventListener('click', async () => {
  if (!installation) return;
  const prompt = installation;
  installation = undefined;
  ui('install').hidden = true;
  try { await prompt.prompt(); } catch { announce('Apri il menu del browser per installare Agent-Lab.'); }
});
window.addEventListener('appinstalled', () => { ui('install').hidden = true; });
if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/remote-sw.js').catch(() => {});
if (window.visualViewport) {
  const fitViewport = () => {
    if (window.visualViewport.scale < 1.02) ui('app').style.setProperty('--app-height', window.visualViewport.height + 'px');
  };
  window.visualViewport.addEventListener('resize', fitViewport);
  fitViewport();
}
window.addEventListener('hashchange', () => {
  const code = takePairingCode();
  if (!code || authenticated) return;
  if (ui('pair').disabled) {
    pairingCode = code;
  } else {
    ui('code').value = code;
    announce('Codice ricevuto dal QR. Premi Associa.');
  }
});
void restoreSession();
window.addEventListener('online', () => void refresh());
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
setInterval(() => { if (!document.hidden) void refresh(); }, 2500);
`;

export const workflowRemotePage = (nonce: string) =>
  '<!doctype html><html lang="it"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">' +
  '<title>Agent-Lab remoto</title><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icon-192.png">' +
  '<meta name="theme-color" content="#000000"><meta name="apple-mobile-web-app-capable" content="yes"><style>' +
  styles +
  '</style></head><body>' +
  markup +
  '<script nonce="' +
  nonce +
  '">' +
  script +
  '</script></body></html>';
