const $ = (selector) => document.querySelector(selector);

const types = {
  trigger: { icon: 'ϟ', label: 'Trigger', category: 'execution' },
  agent: { icon: '✳', label: 'Agent', category: 'execution' },
  human: { icon: '◎', label: 'Human', category: 'execution' },
  context: { icon: '▤', label: 'Context', category: 'data' },
  feedback: { icon: '⌁', label: 'Feedback', category: 'data' },
  task: { icon: '▣', label: 'Task', category: 'data' },
};
const flowTypes = ['trigger', 'agent', 'human'];
const dataTypes = ['context', 'feedback', 'task'];
const TYPE_ALIASES = { artifact: 'context', text: 'context', review: 'feedback', prompt: 'agent', action: 'agent' };
const DATA_ALIASES = { artifact: 'context', text: 'context', review: 'feedback', bool: 'context', issue: 'task' };
const variableTypes = {
  context: { label: 'Context', color: 'var(--context)' },
  feedback: { label: 'Feedback', color: 'var(--feedback)' },
  task: { label: 'Task', color: 'var(--task)' },
  artifact: { label: 'Context', color: 'var(--context)' },
  review: { label: 'Feedback', color: 'var(--feedback)' },
  text: { label: 'Context', color: 'var(--context)' },
  bool: { label: 'Context', color: 'var(--context)' },
  issue: { label: 'Task', color: 'var(--task)' },
};
const canonicalType = (type) => TYPE_ALIASES[type] || type;
const canonicalDataType = (type) => DATA_ALIASES[type] || type;
const LAST_STAGE = 8;
const stages = [
  ['Start with an empty board', 'Begin with the smallest system that could work. We will grow it together.', 'Give the task to an agent →'],
  ['The task goes to an agent', '0–8 min · A task, and an agent told to complete it. That is the whole system.', 'Put a person in the loop →'],
  ['A person asks through a terminal', '8–16 min · Someone takes the task and types the ask. The agent no longer receives the task by itself.', 'Start it without typing →'],
  ['The ask can start itself', '16–24 min · The same work begins when the task is there. A person does not have to type it in.', 'Add implement and cleanup →'],
  ['Implementation, then a fresh cleanup', '24–32 min · One writable turn, a local commit, then a new agent amends and pushes.', 'Add review, tests, ready →'],
  ['Review, tests, and ready', '32–42 min · Cleanup already pushed. Review and tests judge that commit, then the PR is marked ready.', 'Add the attempt loop →'],
  ['Rejection is feedback', '42–50 min · A P0/P1 or a test failure rejects the attempt. Problems return to implement.', 'Add implement stops →'],
  ['Stops from implement', '50–55 min · A question is needinfo. Giving up or changing nothing closes an empty PR.', 'Add the attempt budget →'],
  ['Three attempts, then a draft', '55–60 min · Another attempt needs tries and 75 minutes left. Otherwise the PR stays a draft.', 'Workshop complete ✓'],
];
const starterPositions = [[60, 70], [320, 70], [580, 70], [840, 70], [1100, 70], [1360, 70]];
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const GRID = 32;
const GRID_MAJOR = 160;
const defaultView = () => ({ x: 48, y: 48, zoom: 1 });

let state = { cards: [], edges: [], stage: 0, view: defaultView() };
let history = [];
let pendingEdge = null;
let dragMoved = false;
let pendingFit = false;
let spaceHeld = false;
let pointerDrag = null;
let canvasPan = null;
let linkDrag = null;
let pinch = null;
const activePointers = new Map();
let saveTimer = 0;
let animateTimer = 0;

try {
  const saved = JSON.parse(localStorage.getItem('ship-loop-board-v1'));
  if (saved && Array.isArray(saved.cards) && Array.isArray(saved.edges)) {
    const hadView = saved.view && Number.isFinite(saved.view.zoom) && Number.isFinite(saved.view.x) && Number.isFinite(saved.view.y);
    state = saved;
    pendingFit = !hadView && saved.cards.length > 0;
  }
} catch {}

const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const cssTheme = (type) => `--color:var(--${canonicalType(type)})`;
const categoryFor = (card) => card.category || types[canonicalType(card.type)]?.category || 'execution';
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const viewport = $('#viewport');
const board = $('#board');
const isEditingField = (el) => el?.closest?.('input, textarea, select, [contenteditable="true"]');

function defaultPins(type) {
  if (type === 'trigger') return { inputs: [], outputs: [{ id: 'exec', kind: 'exec', name: '' }] };
  if (dataTypes.includes(type)) {
    const name = types[type].label;
    return {
      inputs: [{ id: 'value', kind: 'data', name, dataType: type }],
      outputs: [{ id: 'value-out', kind: 'data', name, dataType: type }],
    };
  }
  return {
    inputs: [{ id: 'exec', kind: 'exec', name: '' }],
    outputs: [{ id: 'exec', kind: 'exec', name: '' }],
  };
}
function execName(pin) {
  const name = pin?.name || '';
  return name === 'Then' ? '' : name;
}
function pinColor(pin) {
  if (!pin || pin.kind === 'exec') return 'var(--exec)';
  return variableTypes[pin.dataType]?.color || 'var(--data)';
}
function ensureCardPins(card) {
  if (!card.pins || !Array.isArray(card.pins.inputs) || !Array.isArray(card.pins.outputs)) card.pins = defaultPins(card.type);
  const clean = (pin) => pin && pin.id && (pin.kind === 'exec' || pin.kind === 'data');
  card.pins.inputs = card.pins.inputs.filter(clean);
  card.pins.outputs = card.pins.outputs.filter(clean);
}
function listPins(card, dir) {
  ensureCardPins(card);
  return dir === 'in' ? card.pins.inputs : card.pins.outputs;
}
function findPin(card, pinId, dir) {
  return listPins(card, dir).find((pin) => pin.id === pinId) || null;
}
function firstPin(card, dir, kind) {
  return listPins(card, dir).find((pin) => pin.kind === kind) || null;
}
function addPin(card, dir, pin) {
  ensureCardPins(card);
  const list = dir === 'in' ? card.pins.inputs : card.pins.outputs;
  const existing = list.find((item) => item.id === pin.id) || list.find((item) => item.kind === pin.kind && item.kind === 'data' && item.name === pin.name);
  if (existing) return existing;
  list.push(pin);
  return pin;
}
function pinLinked(cardId, pinId, dir) {
  return state.edges.some((edge) => (dir === 'out' ? edge.from === cardId && edge.fromPin === pinId : edge.to === cardId && edge.toPin === pinId));
}
function convertCardToData(card, type) {
  card.type = type;
  card.category = 'data';
  const dataIn = (card.pins?.inputs || []).filter((pin) => pin.kind === 'data');
  const dataOut = (card.pins?.outputs || []).filter((pin) => pin.kind === 'data');
  const defaults = defaultPins(type);
  card.pins = {
    inputs: dataIn.length ? dataIn : defaults.inputs,
    outputs: dataOut.length ? dataOut : defaults.outputs,
  };
}
function bypassExecNode(id) {
  const incoming = state.edges.filter((item) => item.to === id && item.kind === 'execution');
  const outgoing = state.edges.filter((item) => item.from === id && item.kind === 'execution');
  incoming.forEach((inc) => {
    outgoing.forEach((out) => {
      if (state.edges.some((item) => item.from === inc.from && item.to === out.to && item.fromPin === inc.fromPin && item.toPin === out.toPin && item.kind === 'execution')) return;
      state.edges.push({ id: uid(), from: inc.from, to: out.to, fromPin: inc.fromPin, toPin: out.toPin, kind: 'execution', label: out.label || inc.label || '' });
    });
    const fromCard = state.cards.find((item) => item.id === inc.from);
    const toCard = state.cards.find((item) => item.id === id);
    if (!fromCard || !toCard || state.edges.some((item) => item.from === inc.from && item.to === id && item.kind === 'variable')) return;
    const outPin = addPin(fromCard, 'out', { id, kind: 'data', name: toCard.title, dataType: dataTypes.includes(toCard.type) ? toCard.type : 'context' });
    const inPin = firstPin(toCard, 'in', 'data') || addPin(toCard, 'in', { id: 'value', kind: 'data', name: toCard.title, dataType: toCard.type });
    state.edges.push({ id: uid(), from: inc.from, to: id, fromPin: outPin.id, toPin: inPin.id, kind: 'variable', label: '' });
  });
  state.edges = state.edges.filter((item) => !((item.from === id || item.to === id) && item.kind === 'execution'));
}

function migrateWorkshop() {
  const renamePin = (pin) => {
    if (!pin) return;
    if (pin.id === 'issue') pin.id = 'task';
    if (pin.dataType === 'issue') pin.dataType = 'task';
    if (pin.name === 'Issue') pin.name = 'Task';
    if (pin.kind === 'exec' && pin.name === 'Then') pin.name = '';
    if (pin.dataType) pin.dataType = canonicalDataType(pin.dataType);
    if (pin.name === 'Artifact' || pin.name === 'Text' || pin.name === 'Bool') pin.name = 'Context';
    if (pin.name === 'Review' || pin.name === 'Review result') pin.name = 'Feedback';
  };
  const hadOldLoop = !state.workshopV3 && state.cards.some((card) => card.id === 'implement' || card.id === 'issue');
  state.cards.forEach((card) => {
    if (card.id === 'issue') card.id = 'task';
    if (card.title === 'Issue created') card.title = 'Task created';
    if (card.title === 'Implement the issue') card.title = 'Implement the task';
    if (card.id === 'implement' && card.title === '5. Implement the change') card.title = '5. Implementation';
    ensureCardPins(card);
    card.pins.inputs.forEach(renamePin);
    card.pins.outputs.forEach(renamePin);
  });
  state.edges.forEach((edge) => {
    if (edge.from === 'issue') edge.from = 'task';
    if (edge.to === 'issue') edge.to = 'task';
    if (edge.fromPin === 'issue') edge.fromPin = 'task';
    if (edge.toPin === 'issue') edge.toPin = 'task';
    if (edge.label === 'New issue') edge.label = 'New task';
  });
  if (hadOldLoop && Number.isInteger(state.stage) && state.stage >= 1 && state.stage <= 7) state.stage += 1;
  state.workshopV3 = true;
  if (!state.workshopV4) {
    const toData = [];
    state.cards.forEach((card) => {
      if (card.id === 'report' && (card.type === 'prompt' || card.type === 'action')) {
        if (card.title === 'Report completion') card.title = 'Completion report';
        convertCardToData(card, 'context');
        if (card.y < 200) { card.x = 750; card.y = 250; }
        toData.push(card.id);
      } else if (card.id === 'pr' && (card.type === 'prompt' || card.type === 'action')) {
        if (card.title === 'Open a ready PR') card.title = 'Ready pull request';
        convertCardToData(card, 'context');
        if (card.y < 200) { card.x = 1350; card.y = 250; }
        toData.push(card.id);
      } else if (card.type === 'prompt' || card.type === 'action') {
        card.type = 'agent';
        card.category = 'execution';
      }
    });
    toData.forEach(bypassExecNode);
    const human = state.cards.find((item) => item.id === 'human');
    const pr = state.cards.find((item) => item.id === 'pr');
    if (human && pr) {
      const prIn = addPin(human, 'in', { id: 'pr', kind: 'data', name: 'Ready PR', dataType: 'context' });
      const prOut = firstPin(pr, 'out', 'data');
      if (prOut && !state.edges.some((item) => item.from === 'pr' && item.to === 'human' && item.kind === 'variable')) {
        state.edges.push({ id: uid(), from: 'pr', to: 'human', fromPin: prOut.id, toPin: prIn.id, kind: 'variable', label: '' });
      }
    }
    state.workshopV4 = true;
  }
  state.cards.forEach((card) => {
    if (card.type === 'artifact' || card.type === 'text') {
      if (card.title === 'Run artifact') card.title = 'Run context';
      convertCardToData(card, 'context');
    } else if (card.type === 'review') {
      convertCardToData(card, 'feedback');
    }
    card.type = canonicalType(card.type);
  });
  if (!state.workshopV5) {
    const task = state.cards.find((item) => item.id === 'task');
    if (task && (task.type === 'trigger' || task.category === 'execution')) {
      task.type = 'task';
      task.category = 'data';
      ensureCardPins(task);
      task.pins.inputs = task.pins.inputs.filter((pin) => pin.kind === 'data');
      task.pins.outputs = task.pins.outputs.filter((pin) => pin.kind === 'data');
      const out = firstPin(task, 'out', 'data') || addPin(task, 'out', { id: 'task', kind: 'data', name: 'Task', dataType: 'task' });
      out.id = 'task';
      out.name = 'Task';
      out.dataType = 'task';
      if (task.title === 'Issue created') task.title = 'Task created';
      state.edges = state.edges.filter((item) => !(item.kind === 'execution' && (item.from === 'task' || item.to === 'task')));
      state.edges.forEach((item) => {
        if (item.from === 'task' && item.kind === 'variable') item.fromPin = 'task';
      });
    }
    const followup = state.cards.find((item) => item.id === 'followup');
    if (followup && task) {
      const out = addPin(followup, 'out', { id: 'task', kind: 'data', name: 'New task', dataType: 'task' });
      const inn = addPin(task, 'in', { id: 'task', kind: 'data', name: 'Task', dataType: 'task' });
      if (!state.edges.some((item) => item.from === 'followup' && item.to === 'task' && item.kind === 'variable')) {
        state.edges.push({ id: uid(), from: 'followup', to: 'task', fromPin: out.id, toPin: inn.id, kind: 'variable', label: '' });
      }
    }
    state.workshopV5 = true;
  }
  if (!state.workshopV6) {
    const obsolete = new Set(['executor', 'doctor', 'mention', 'retry', 'cleanup', 'followup', 'report', 'pr', 'artifact']);
    if (state.cards.some((item) => obsolete.has(item.id))) {
      state.cards = [];
      state.edges = [];
      state.stage = 0;
      state.view = defaultView();
    }
    state.workshopV6 = true;
  }
  if (!state.workshopV7) {
    const obsolete = new Set(['preflight', 'understand', 'needinfo', 'nothing', 'baseline', 'branch', 'draft', 'reviewer', 'ready', 'budget', 'leftover', 'empty', 'executor']);
    if (state.cards.some((item) => obsolete.has(item.id) || /^[0-9]+\. /.test(item.title || ''))) {
      state.cards = [];
      state.edges = [];
      state.stage = 0;
      state.view = defaultView();
    }
    state.workshopV7 = true;
  }
}
function normalizeState() {
  migrateWorkshop();
  const rows = [];
  state.cards.forEach((card, index) => {
    card.type = types[card.type] ? card.type : 'agent';
    card.category = categoryFor(card);
    if (!Number.isFinite(card.x) || !Number.isFinite(card.y)) {
      const column = Number.isInteger(card.lane) ? card.lane : index % 5;
      const row = rows[column] || 0;
      rows[column] = row + 1;
      card.x = 40 + column * 280;
      card.y = 50 + row * 180;
    }
    ensureCardPins(card);
  });
  state.edges.forEach((edge) => {
    if (edge.kind === 'normal' || edge.kind === 'retry') edge.kind = 'execution';
    if (edge.kind !== 'variable') edge.kind = 'execution';
    const fromCard = state.cards.find((card) => card.id === edge.from);
    const toCard = state.cards.find((card) => card.id === edge.to);
    if (!fromCard || !toCard) return;
    const kind = edge.kind === 'variable' ? 'data' : 'exec';
    if (!edge.fromPin) {
      let pin = firstPin(fromCard, 'out', kind);
      if (!pin && kind === 'data') pin = addPin(fromCard, 'out', { id: uid(), kind: 'data', name: edge.label || 'Value', dataType: dataTypes.includes(fromCard.type) ? fromCard.type : 'context' });
      if (!pin && kind === 'exec') pin = addPin(fromCard, 'out', { id: 'exec', kind: 'exec', name: '' });
      edge.fromPin = pin?.id;
    }
    if (!edge.toPin) {
      let pin = firstPin(toCard, 'in', kind);
      if (!pin && kind === 'data') pin = addPin(toCard, 'in', { id: uid(), kind: 'data', name: edge.label || 'Value', dataType: dataTypes.includes(fromCard.type) ? fromCard.type : 'context' });
      if (!pin && kind === 'exec') pin = addPin(toCard, 'in', { id: 'exec', kind: 'exec', name: '' });
      edge.toPin = pin?.id;
    }
  });
  state.stage = Math.max(0, Math.min(LAST_STAGE, Number.isInteger(state.stage) ? state.stage : 0));
  const view = state.view || {};
  state.view = {
    x: Number.isFinite(view.x) ? view.x : 48,
    y: Number.isFinite(view.y) ? view.y : 48,
    zoom: clamp(Number.isFinite(view.zoom) ? view.zoom : 1, MIN_ZOOM, MAX_ZOOM),
  };
}
normalizeState();

function checkpoint() { history.push(JSON.stringify({ cards: state.cards, edges: state.edges, stage: state.stage })); if (history.length > 30) history.shift(); }
function save() { try { localStorage.setItem('ship-loop-board-v1', JSON.stringify(state)); $('#saved').textContent = 'Saved on this device'; } catch { $('#saved').textContent = 'Storage unavailable · export to save'; } }
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }

function clientToViewport(clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top, width: rect.width, height: rect.height };
}
function clientToWorld(clientX, clientY) {
  const point = clientToViewport(clientX, clientY);
  return { x: (point.x - state.view.x) / state.view.zoom, y: (point.y - state.view.y) / state.view.zoom };
}
function viewportCenter() {
  const rect = viewport.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2, width: rect.width, height: rect.height };
}
function updateGrid() {
  const { x, y, zoom } = state.view;
  const minor = GRID * zoom;
  const major = GRID_MAJOR * zoom;
  const showMinor = minor >= 10;
  viewport.style.backgroundImage = showMinor
    ? 'linear-gradient(var(--grid-major) 1px,transparent 1px),linear-gradient(90deg,var(--grid-major) 1px,transparent 1px),linear-gradient(var(--grid-minor) 1px,transparent 1px),linear-gradient(90deg,var(--grid-minor) 1px,transparent 1px)'
    : 'linear-gradient(var(--grid-major) 1px,transparent 1px),linear-gradient(90deg,var(--grid-major) 1px,transparent 1px)';
  viewport.style.backgroundSize = showMinor ? `${major}px ${major}px,${major}px ${major}px,${minor}px ${minor}px,${minor}px ${minor}px` : `${major}px ${major}px,${major}px ${major}px`;
  viewport.style.backgroundPosition = `${x}px ${y}px`;
}
function applyView({ animate = false } = {}) {
  board.classList.toggle('is-animating', animate);
  board.style.transform = `translate3d(${state.view.x}px, ${state.view.y}px, 0) scale(${state.view.zoom})`;
  if (animate) {
    clearTimeout(animateTimer);
    animateTimer = setTimeout(() => board.classList.remove('is-animating'), 220);
  }
  updateGrid();
  $('#zoom-reset').textContent = `${Math.round(state.view.zoom * 100)}%`;
  saveSoon();
}
function zoomAt(screenX, screenY, nextZoom) {
  nextZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const worldX = (screenX - state.view.x) / state.view.zoom;
  const worldY = (screenY - state.view.y) / state.view.zoom;
  state.view.zoom = nextZoom;
  state.view.x = screenX - worldX * nextZoom;
  state.view.y = screenY - worldY * nextZoom;
  applyView();
}
function zoomBy(factor) {
  const center = viewportCenter();
  zoomAt(center.x, center.y, state.view.zoom * factor);
}
function contentBounds() {
  if (!state.cards.length) return { x: 0, y: 0, w: 640, h: 400 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  state.cards.forEach((card) => {
    const node = document.querySelector(`[data-id="${CSS.escape(card.id)}"]`);
    const width = node?.offsetWidth || 252;
    const height = node?.offsetHeight || 128;
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + width);
    maxY = Math.max(maxY, card.y + height);
  });
  return { x: minX, y: minY, w: Math.max(80, maxX - minX), h: Math.max(80, maxY - minY) };
}
function fitView({ animate = true } = {}) {
  const { width, height } = viewport.getBoundingClientRect();
  if (width < 40 || height < 40) return;
  const bounds = contentBounds();
  const padding = 72;
  const zoom = clamp(Math.min((width - padding * 2) / bounds.w, (height - padding * 2) / bounds.h), MIN_ZOOM, 1.15);
  state.view.zoom = zoom;
  state.view.x = (width - bounds.w * zoom) / 2 - bounds.x * zoom;
  state.view.y = (height - bounds.h * zoom) / 2 - bounds.y * zoom;
  applyView({ animate });
}
function revealContent({ animate = true } = {}) {
  const { width, height } = viewport.getBoundingClientRect();
  if (width < 40 || height < 40 || !state.cards.length) return;
  const bounds = contentBounds();
  const zoom = state.view.zoom;
  const pad = 56;
  const viewW = width / zoom;
  const viewH = height / zoom;
  const fits = bounds.w <= viewW - (pad * 2) / zoom && bounds.h <= viewH - (pad * 2) / zoom;
  if (fits) {
    state.view.x = (width - bounds.w * zoom) / 2 - bounds.x * zoom;
    state.view.y = (height - bounds.h * zoom) / 2 - bounds.y * zoom;
  } else {
    state.view.x = pad - bounds.x * zoom;
    state.view.y = Math.max(pad - bounds.y * zoom, (height - bounds.h * zoom) / 2 - bounds.y * zoom);
  }
  applyView({ animate });
}

function palette(typesToShow) {
  return typesToShow.map((type) => `<button class="library-item" data-type="${type}" style="${cssTheme(type)}"><span class="type-icon">${types[type].icon}</span><strong>${types[type].label}</strong><span class="plus">+</span></button>`).join('');
}
function pinSlotMarkup(card, pin, dir) {
  const linked = pinLinked(card.id, pin.id, dir);
  const color = pinColor(pin);
  const label = pin.kind === 'exec' ? execName(pin) : pin.name;
  const labelHtml = label ? `<span class="pin-label">${escape(label)}</span>` : '';
  return `<div class="pin-slot pin-slot-${pin.kind}${linked ? ' is-linked' : ''}" data-pin-node="${card.id}" data-pin-id="${pin.id}" data-pin-kind="${pin.kind}" data-pin-dir="${dir}" data-pin-type="${pin.dataType || 'exec'}"><button type="button" class="pin pin-${pin.kind}${linked ? ' is-linked' : ''}" style="--pin:${color}" aria-label="${dir === 'out' ? 'Output' : 'Input'} ${escape(label || (pin.kind === 'exec' ? 'control flow' : 'variable'))}"></button>${labelHtml}</div>`;
}
function nodeMarkup(card) {
  const type = types[card.type];
  ensureCardPins(card);
  const source = linkDrag && linkDrag.card.id === card.id;
  const execIn = card.pins.inputs.filter((pin) => pin.kind === 'exec');
  const execOut = card.pins.outputs.filter((pin) => pin.kind === 'exec');
  const dataIn = card.pins.inputs.filter((pin) => pin.kind === 'data');
  const dataOut = card.pins.outputs.filter((pin) => pin.kind === 'data');
  const dataCols = dataIn.length || dataOut.length
    ? `<div class="pin-columns"><div class="pin-col pin-col-in">${dataIn.map((pin) => pinSlotMarkup(card, pin, 'in')).join('')}</div><div class="pin-col pin-col-out">${dataOut.map((pin) => pinSlotMarkup(card, pin, 'out')).join('')}</div></div>`
    : '';
  return `<article class="node card ${source ? 'selected' : ''}" tabindex="0" role="button" aria-label="Edit ${escape(card.title)}" data-id="${card.id}" data-category="${categoryFor(card)}" style="left:${card.x}px;top:${card.y}px;${cssTheme(card.type)}"><div class="node-header"><div class="pin-col pin-col-in pin-col-exec">${execIn.map((pin) => pinSlotMarkup(card, pin, 'in')).join('')}</div><div class="node-kind">${type.icon} ${type.label}</div><div class="pin-col pin-col-out pin-col-exec">${execOut.map((pin) => pinSlotMarkup(card, pin, 'out')).join('')}</div></div><h3>${escape(card.title)}</h3><p>${escape(card.body)}</p>${dataCols}</article>`;
}
function render() {
  save();
  $('#flow-library').innerHTML = palette(flowTypes);
  $('#data-library').innerHTML = palette(dataTypes);
  $('#nodes').innerHTML = state.cards.map(nodeMarkup).join('');
  const stage = stages[state.stage];
  $('#step-number').textContent = `0${state.stage} / 0${LAST_STAGE}`;
  $('#step-title').textContent = stage[0];
  $('#step-description').textContent = stage[1];
  $('#next').textContent = stage[2];
  $('#next').disabled = state.stage === LAST_STAGE;
  $('#progress').innerHTML = stages.slice(1).map((_, index) => `<div class="progress-segment ${index < state.stage ? 'active' : ''}"></div>`).join('');
  $('#count').textContent = `${state.cards.length} nodes · ${state.edges.length} connections`;
  $('#undo').disabled = !history.length;
  $('#connection-hint').classList.toggle('active', !!linkDrag);
  $('#connection-hint').textContent = linkDrag
    ? (linkDrag.pin.kind === 'exec' ? 'Drop on a white control pin or a node.' : 'Drop on a node to give it this variable.')
    : 'Drag ▷ for control flow · Drag ● to pass a variable';
  requestAnimationFrame(() => {
    drawEdges();
    if (pendingFit) {
      pendingFit = false;
      fitView({ animate: false });
    }
  });
}
function nodeBox(card, el) {
  const width = el?.offsetWidth || 252;
  const height = el?.offsetHeight || 128;
  return { left: card.x, top: card.y, right: card.x + width, width, height };
}
function pinAnchor(card, pinId, dir) {
  const pinEl = document.querySelector(`[data-pin-node="${CSS.escape(card.id)}"][data-pin-id="${CSS.escape(pinId)}"][data-pin-dir="${dir}"] .pin`);
  if (pinEl) {
    const rect = pinEl.getBoundingClientRect();
    const base = viewport.getBoundingClientRect();
    return {
      x: (rect.left + rect.width / 2 - base.left - state.view.x) / state.view.zoom,
      y: (rect.top + rect.height / 2 - base.top - state.view.y) / state.view.zoom,
    };
  }
  const box = nodeBox(card, document.querySelector(`[data-id="${CSS.escape(card.id)}"]`));
  return { x: dir === 'out' ? box.right : box.left, y: box.top + 36 };
}
function splinePath(sx, sy, tx, ty) {
  const bend = Math.max(48, Math.abs(tx - sx) * 0.5);
  return `M${sx},${sy} C${sx + bend},${sy} ${tx - bend},${ty} ${tx},${ty}`;
}
function drawEdges() {
  const svg = $('#arrows');
  const paths = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  state.edges.forEach((edge) => {
    const fromCard = state.cards.find((card) => card.id === edge.from);
    const toCard = state.cards.find((card) => card.id === edge.to);
    if (!fromCard || !toCard) return;
    const start = pinAnchor(fromCard, edge.fromPin, 'out');
    const end = pinAnchor(toCard, edge.toPin, 'in');
    const data = edge.kind === 'variable';
    const fromPin = findPin(fromCard, edge.fromPin, 'out');
    const path = splinePath(start.x, start.y, end.x, end.y);
    const lx = (start.x + end.x) / 2;
    const ly = (start.y + end.y) / 2 - (data ? 0 : 10);
    const width = Math.max(34, (edge.label || '').length * 5.8 + 14);
    include(start.x, start.y);
    include(end.x, end.y);
    include(start.x + 48, start.y);
    include(end.x - 48, end.y);
    if (!data && edge.label) {
      include(lx - width / 2, ly - 12);
      include(lx + width / 2, ly + 12);
    }
    paths.push({ edge, data, path, lx, ly, width, color: data ? pinColor(fromPin) : 'var(--exec)' });
  });
  if (linkDrag) {
    const path = splinePath(linkDrag.start.x, linkDrag.start.y, linkDrag.current.x, linkDrag.current.y);
    include(linkDrag.start.x, linkDrag.start.y);
    include(linkDrag.current.x, linkDrag.current.y);
    paths.push({ preview: true, data: linkDrag.pin.kind === 'data', path, color: pinColor(linkDrag.pin) });
  }
  if (!paths.length) {
    svg.removeAttribute('viewBox');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.left = '0';
    svg.style.top = '0';
    svg.innerHTML = '';
    return;
  }
  const pad = 80;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.left = `${minX}px`;
  svg.style.top = `${minY}px`;
  let result = '';
  paths.forEach((item) => {
    if (item.preview) {
      result += `<path class="edge-spline preview-spline ${item.data ? 'data-spline' : 'execution-spline'}" d="${item.path}" style="--pin:${item.color}" stroke="${item.color}" stroke-width="${item.data ? 2 : 2.6}"/>`;
      return;
    }
    result += `<path class="edge-hit" data-edge="${item.edge.id}" d="${item.path}" stroke-width="18"/>`;
    result += `<path class="edge-spline ${item.data ? 'data-spline' : 'execution-spline'}" d="${item.path}" style="--pin:${item.color}" stroke="${item.color}" stroke-width="${item.data ? 2 : 2.6}"/>`;
    if (!item.data && item.edge.label) result += `<g class="edge-label" data-edge="${item.edge.id}" role="button" tabindex="0" aria-label="Edit connection ${escape(item.edge.label)}"><rect x="${item.lx - item.width / 2}" y="${item.ly - 9}" width="${item.width}" height="18" rx="4"/><text x="${item.lx}" y="${item.ly + 3}" text-anchor="middle" font-size="10">${escape(item.edge.label)}</text></g>`;
  });
  svg.innerHTML = result;
}
function nextPosition() {
  const i = state.cards.length;
  const center = viewportCenter();
  const worldX = (center.x - state.view.x) / state.view.zoom;
  const worldY = (center.y - state.view.y) / state.view.zoom;
  return { x: worldX - 126 + (i % 3) * 28, y: worldY - 64 + Math.floor(i / 3) * 20 };
}
function variableTypeOptions(selected) {
  return dataTypes.map((key) => `<option value="${key}" ${key === canonicalDataType(selected) ? 'selected' : ''}>${variableTypes[key].label}</option>`).join('');
}
function pinEditorRow(pin, dir) {
  if (pin.kind === 'exec') return `<div class="pin-edit-row" data-pin-dir="${dir}" data-pin-id="${pin.id}" data-pin-kind="exec"><span class="pin-dot exec"></span><input value="${escape(execName(pin))}" maxlength="40" data-pin-name placeholder="Optional label"><span class="muted">flow</span></div>`;
  return `<div class="pin-edit-row" data-pin-dir="${dir}" data-pin-id="${pin.id}" data-pin-kind="data"><span class="pin-dot" style="--pin:${pinColor(pin)}"></span><input value="${escape(pin.name)}" maxlength="40" data-pin-name placeholder="Variable name"><select data-pin-type>${variableTypeOptions(pin.dataType || 'context')}</select><button type="button" data-remove-pin>Remove</button></div>`;
}
function readPinsFromEditor(dir) {
  return [...document.querySelectorAll(`.pin-edit-row[data-pin-dir="${dir}"]`)].map((row) => {
    const kind = row.dataset.pinKind;
    const pin = { id: row.dataset.pinId, kind, name: row.querySelector('[data-pin-name]').value.trim() };
    if (kind === 'data') pin.dataType = row.querySelector('[data-pin-type]').value;
    return pin;
  });
}
function openCard(id, type = 'agent') {
  const card = state.cards.find((item) => item.id === id);
  $('#card-id').value = card?.id || '';
  $('#card-title').value = card?.title || '';
  $('#card-body').value = card?.body || '';
  $('#card-type').innerHTML = Object.entries(types).map(([key, value]) => `<option value="${key}">${value.label}</option>`).join('');
  $('#card-type').value = card?.type || type;
  $('#card-category').value = card?.category || types[type]?.category || 'execution';
  $('#delete').hidden = !card;
  const pins = card ? (ensureCardPins(card), card.pins) : defaultPins(type);
  $('#pin-inputs').innerHTML = pins.inputs.map((pin) => pinEditorRow(pin, 'in')).join('');
  $('#pin-outputs').innerHTML = pins.outputs.map((pin) => pinEditorRow(pin, 'out')).join('');
  $('#card-connections').innerHTML = card ? state.edges.filter((edge) => edge.from === id || edge.to === id).map((edge) => `<div class="connection-row"><span>${edge.from === id ? '→' : '←'} ${escape(state.cards.find((item) => item.id === (edge.from === id ? edge.to : edge.from))?.title || '')} · ${escape(edge.label || (edge.kind === 'variable' ? 'variable' : 'flow'))}</span><button type="button" data-remove-edge="${edge.id}">Remove</button></div>`).join('') : '';
  $('#editor').showModal();
}
function openEdge(edge) {
  pendingEdge = { ...edge };
  const from = state.cards.find((card) => card.id === edge.from);
  const to = state.cards.find((card) => card.id === edge.to);
  const fromPin = from ? findPin(from, edge.fromPin, 'out') : null;
  const toPin = to ? findPin(to, edge.toPin, 'in') : null;
  $('#edge-summary').textContent = `${from?.title || ''} ${fromPin?.name ? `(${fromPin.name})` : ''} → ${to?.title || ''} ${toPin?.name ? `(${toPin.name})` : ''}`;
  $('#edge-label').value = edge.label || '';
  $('#edge-kind').value = edge.kind || 'execution';
  $('#edge-label-row').hidden = edge.kind === 'variable';
  $('#edge-editor').showModal();
}

function slotFromEvent(event) {
  return event.target.closest?.('.pin-slot') || document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.pin-slot') || null;
}
function pinFromSlot(slot) {
  if (!slot) return null;
  const card = state.cards.find((item) => item.id === slot.dataset.pinNode);
  if (!card) return null;
  const pin = findPin(card, slot.dataset.pinId, slot.dataset.pinDir);
  if (!pin) return null;
  return { card, pin, dir: slot.dataset.pinDir, slot };
}
function highlightDrops(source) {
  document.querySelectorAll('.pin-slot').forEach((slot) => {
    const target = pinFromSlot(slot);
    const ok = target && target.card.id !== source.card.id && target.dir !== source.dir && target.pin.kind === source.pin.kind;
    slot.classList.toggle('is-compatible', !!ok);
    slot.classList.remove('is-target');
  });
  document.querySelectorAll('.node').forEach((node) => node.classList.remove('is-drop-target'));
}
function clearHighlights() {
  document.querySelectorAll('.pin-slot').forEach((slot) => slot.classList.remove('is-compatible', 'is-target'));
  document.querySelectorAll('.node').forEach((node) => node.classList.remove('is-drop-target', 'selected'));
  viewport.classList.remove('is-linking');
}
function acceptPin(targetCard, source) {
  if (source.pin.kind === 'exec') {
    return firstPin(targetCard, 'in', 'exec') || addPin(targetCard, 'in', { id: 'exec', kind: 'exec', name: '' });
  }
  const match = listPins(targetCard, 'in').find((pin) => pin.kind === 'data' && (pin.id === source.pin.id || pin.name === source.pin.name || pin.dataType === source.pin.dataType && pin.name === source.pin.name));
  if (match) return match;
  const named = listPins(targetCard, 'in').find((pin) => pin.kind === 'data' && pin.name === source.pin.name);
  if (named) return named;
  return addPin(targetCard, 'in', { id: uid(), kind: 'data', name: source.pin.name || 'Value', dataType: canonicalDataType(source.pin.dataType || 'context') });
}
function connectPins(source, target) {
  if (!source || !target || source.card.id === target.card.id) return;
  let out = source.dir === 'out' ? source : target;
  let inn = source.dir === 'in' ? source : target;
  if (out.dir !== 'out' || inn.dir !== 'in') {
    if (source.dir === 'out' && target.card) {
      inn = { card: target.card, pin: acceptPin(target.card, source), dir: 'in' };
      out = source;
    } else return;
  }
  if (!inn.pin && inn.card && out.pin) inn.pin = acceptPin(inn.card, out);
  if (!out.pin && out.card && inn.pin) out.pin = firstPin(out.card, 'out', inn.pin.kind);
  if (!out.pin || !inn.pin || out.pin.kind !== inn.pin.kind) return;
  if (state.edges.some((edge) => edge.from === out.card.id && edge.to === inn.card.id && edge.fromPin === out.pin.id && edge.toPin === inn.pin.id)) return;
  checkpoint();
  if (inn.pin.kind === 'exec') state.edges = state.edges.filter((edge) => !(edge.to === inn.card.id && edge.toPin === inn.pin.id && edge.kind === 'execution'));
  if (inn.pin.kind === 'data') state.edges = state.edges.filter((edge) => !(edge.to === inn.card.id && edge.toPin === inn.pin.id && edge.kind === 'variable'));
  state.edges.push({
    id: uid(),
    from: out.card.id,
    to: inn.card.id,
    fromPin: out.pin.id,
    toPin: inn.pin.id,
    kind: out.pin.kind === 'data' ? 'variable' : 'execution',
    label: out.pin.kind === 'exec' ? execName(out.pin) : '',
  });
  render();
}
function dropLink(event, source) {
  const slot = slotFromEvent(event);
  const targetPin = pinFromSlot(slot);
  if (targetPin && targetPin.card.id !== source.card.id) {
    if (targetPin.pin.kind !== source.pin.kind) return;
    connectPins(source, targetPin);
    return;
  }
  const node = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.node');
  if (!node) return;
  const card = state.cards.find((item) => item.id === node.dataset.id);
  if (!card || card.id === source.card.id) return;
  connectPins(source, { card, dir: 'in' });
}

document.addEventListener('click', (event) => {
  const close = event.target.closest('.close');
  if (close) {
    close.closest('dialog').close();
    return;
  }
  const library = event.target.closest('[data-type]');
  if (library) return openCard(null, library.dataset.type);
  const edge = event.target.closest('[data-edge]');
  if (edge) return openEdge(state.edges.find((item) => item.id === edge.dataset.edge));
  const remove = event.target.closest('[data-remove-edge]');
  if (remove) { checkpoint(); state.edges = state.edges.filter((item) => item.id !== remove.dataset.removeEdge); return render(); }
  const removePin = event.target.closest('[data-remove-pin]');
  if (removePin) { removePin.closest('.pin-edit-row').remove(); return; }
  if (event.target.closest('.pin-slot, .pin')) return;
  const card = event.target.closest('.node');
  if (card && !dragMoved) chooseCard(card.dataset.id);
  dragMoved = false;
});
function chooseCard(id) { openCard(id); }
document.addEventListener('keydown', (event) => {
  if (event.target.matches('.node') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); chooseCard(event.target.dataset.id); return; }
  if (event.target.matches('.edge-label') && event.key === 'Enter') { openEdge(state.edges.find((item) => item.id === event.target.dataset.edge)); return; }
  if (event.key === 'Escape') { linkDrag = null; clearHighlights(); render(); }
  if (isEditingField(event.target) || event.target.closest('dialog, button, a')) return;
  if (event.code === 'Space' && !event.repeat) {
    event.preventDefault();
    spaceHeld = true;
    viewport.classList.add('is-space');
  }
  if (event.key === '=' || event.key === '+') { event.preventDefault(); zoomBy(1.2); }
  if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomBy(1 / 1.2); }
  if (event.key === '0') { event.preventDefault(); const center = viewportCenter(); zoomAt(center.x, center.y, 1); }
  if (event.key === '1' || event.key === 'f' || event.key === 'F') { event.preventDefault(); fitView(); }
});
document.addEventListener('keyup', (event) => {
  if (event.code === 'Space') {
    spaceHeld = false;
    viewport.classList.remove('is-space');
  }
});
window.addEventListener('blur', () => {
  spaceHeld = false;
  viewport.classList.remove('is-space');
});
$('#card-type').addEventListener('change', (event) => {
  $('#card-category').value = types[event.target.value].category;
  if (!$('#card-id').value) {
    const pins = defaultPins(event.target.value);
    $('#pin-inputs').innerHTML = pins.inputs.map((pin) => pinEditorRow(pin, 'in')).join('');
    $('#pin-outputs').innerHTML = pins.outputs.map((pin) => pinEditorRow(pin, 'out')).join('');
  }
});
$('#add-input').onclick = () => { $('#pin-inputs').insertAdjacentHTML('beforeend', pinEditorRow({ id: uid(), kind: 'data', name: 'Value', dataType: 'context' }, 'in')); };
$('#add-output').onclick = () => { $('#pin-outputs').insertAdjacentHTML('beforeend', pinEditorRow({ id: uid(), kind: 'data', name: 'Value', dataType: 'context' }, 'out')); };
$('#card-form').onsubmit = (event) => {
  event.preventDefault();
  if (!$('#card-title').value.trim()) return;
  checkpoint();
  const id = $('#card-id').value;
  const previous = state.cards.find((card) => card.id === id);
  const position = previous || nextPosition();
  const type = $('#card-type').value;
  const pins = { inputs: readPinsFromEditor('in'), outputs: readPinsFromEditor('out') };
  if (categoryFor({ type, category: $('#card-category').value }) === 'data') {
    pins.outputs.filter((pin) => pin.kind === 'data').forEach((pin) => { if (!pin.name) pin.name = $('#card-title').value.trim(); });
  }
  const card = { id: id || uid(), title: $('#card-title').value.trim(), body: $('#card-body').value, type, category: $('#card-category').value, x: position.x, y: position.y, pins };
  if (id) {
    const kept = new Set([...pins.inputs, ...pins.outputs].map((pin) => pin.id));
    state.edges = state.edges.filter((edge) => {
      if (edge.from === id && !kept.has(edge.fromPin)) return false;
      if (edge.to === id && !kept.has(edge.toPin)) return false;
      return true;
    });
    state.cards[state.cards.findIndex((item) => item.id === id)] = card;
  } else state.cards.push(card);
  $('#editor').close(); render();
};
$('#delete').onclick = () => { checkpoint(); const id = $('#card-id').value; state.cards = state.cards.filter((card) => card.id !== id); state.edges = state.edges.filter((edge) => edge.from !== id && edge.to !== id); $('#editor').close(); render(); };
$('#edge-form').onsubmit = (event) => { event.preventDefault(); checkpoint(); const edge = { ...pendingEdge, label: $('#edge-label').value.trim(), kind: pendingEdge.kind }; const index = state.edges.findIndex((item) => item.id === edge.id); if (index >= 0) state.edges[index] = edge; $('#edge-editor').close(); render(); };
$('#delete-edge').onclick = () => { if (!pendingEdge) return; checkpoint(); state.edges = state.edges.filter((item) => item.id !== pendingEdge.id); $('#edge-editor').close(); render(); };
$('#undo').onclick = () => { if (!history.length) return; const previous = JSON.parse(history.pop()); state.cards = previous.cards; state.edges = previous.edges; state.stage = previous.stage; linkDrag = null; clearHighlights(); render(); };
$('#reset').onclick = () => $('#reset-dialog').showModal();
$('#confirm-reset').onclick = () => { checkpoint(); state = { cards: [], edges: [], stage: 0, view: defaultView(), workshopV3: true, workshopV4: true, workshopV5: true, workshopV6: true, workshopV7: true }; linkDrag = null; clearHighlights(); $('#reset-dialog').close(); applyView(); render(); };
$('#zoom-in').onclick = () => zoomBy(1.2);
$('#zoom-out').onclick = () => zoomBy(1 / 1.2);
$('#zoom-reset').onclick = () => { const center = viewportCenter(); zoomAt(center.x, center.y, 1); };
$('#zoom-fit').onclick = () => fitView();

function beginPinch() {
  if (activePointers.size < 2) return;
  const points = [...activePointers.values()];
  const mid = clientToViewport((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
  pinch = {
    dist: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1,
    zoom: state.view.zoom,
    worldX: (mid.x - state.view.x) / state.view.zoom,
    worldY: (mid.y - state.view.y) / state.view.zoom,
  };
  pointerDrag = null;
  canvasPan = null;
  linkDrag = null;
  viewport.classList.add('is-panning');
}
function onPointerDown(event) {
  if (event.target.closest('dialog, aside, header, .board-toolbar, .lesson, footer')) return;
  if (!viewport.contains(event.target) && event.target !== viewport) return;
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 2) {
    event.preventDefault();
    beginPinch();
    return;
  }
  const slot = event.target.closest('.pin-slot, .pin')?.closest('.pin-slot');
  if (slot && !spaceHeld && event.button === 0) {
    const source = pinFromSlot(slot);
    if (!source) return;
    event.preventDefault();
    const start = pinAnchor(source.card, source.pin.id, source.dir);
    linkDrag = { ...source, start, current: clientToWorld(event.clientX, event.clientY), moved: false, sx: event.clientX, sy: event.clientY };
    viewport.classList.add('is-linking');
    highlightDrops(source);
    try { viewport.setPointerCapture(event.pointerId); } catch {}
    drawEdges();
    return;
  }
  const node = event.target.closest('.node');
  const onHandle = event.target.closest('button, [data-edge], a, input, textarea, select');
  const panButton = event.button === 1 || event.button === 2;
  if (node && !onHandle && !spaceHeld && event.button === 0) {
    event.preventDefault();
    const card = state.cards.find((item) => item.id === node.dataset.id);
    if (!card) return;
    pointerDrag = { node, card, startX: event.clientX, startY: event.clientY, originX: card.x, originY: card.y, moved: false };
    try { node.setPointerCapture(event.pointerId); } catch {}
    return;
  }
  if (onHandle && !spaceHeld && !panButton) return;
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
  event.preventDefault();
  canvasPan = { startX: event.clientX, startY: event.clientY, originX: state.view.x, originY: state.view.y, moved: false };
  viewport.classList.add('is-panning');
  try { viewport.setPointerCapture(event.pointerId); } catch {}
}
function onPointerMove(event) {
  if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pinch && activePointers.size >= 2) {
    event.preventDefault();
    const points = [...activePointers.values()];
    const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1;
    const mid = clientToViewport((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
    const nextZoom = clamp(pinch.zoom * (dist / pinch.dist), MIN_ZOOM, MAX_ZOOM);
    state.view.zoom = nextZoom;
    state.view.x = mid.x - pinch.worldX * nextZoom;
    state.view.y = mid.y - pinch.worldY * nextZoom;
    applyView();
    return;
  }
  if (linkDrag) {
    event.preventDefault();
    linkDrag.current = clientToWorld(event.clientX, event.clientY);
    if (!linkDrag.moved && Math.hypot(event.clientX - linkDrag.sx, event.clientY - linkDrag.sy) > 3) linkDrag.moved = true;
    const slot = slotFromEvent(event);
    document.querySelectorAll('.pin-slot.is-target').forEach((el) => el.classList.remove('is-target'));
    document.querySelectorAll('.node.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
    if (slot?.classList.contains('is-compatible')) slot.classList.add('is-target');
    else {
      const node = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.node');
      if (node && node.dataset.id !== linkDrag.card.id) node.classList.add('is-drop-target');
    }
    drawEdges();
    return;
  }
  if (pointerDrag) {
    const dx = (event.clientX - pointerDrag.startX) / state.view.zoom;
    const dy = (event.clientY - pointerDrag.startY) / state.view.zoom;
    if (!pointerDrag.moved && Math.hypot(dx, dy) * state.view.zoom < 4) return;
    if (!pointerDrag.moved) { checkpoint(); pointerDrag.moved = true; }
    event.preventDefault();
    pointerDrag.card.x = pointerDrag.originX + dx;
    pointerDrag.card.y = pointerDrag.originY + dy;
    pointerDrag.node.style.left = `${pointerDrag.card.x}px`;
    pointerDrag.node.style.top = `${pointerDrag.card.y}px`;
    drawEdges();
    return;
  }
  if (canvasPan) {
    const dx = event.clientX - canvasPan.startX;
    const dy = event.clientY - canvasPan.startY;
    if (!canvasPan.moved && Math.hypot(dx, dy) < 3) return;
    canvasPan.moved = true;
    event.preventDefault();
    state.view.x = canvasPan.originX + dx;
    state.view.y = canvasPan.originY + dy;
    applyView();
  }
}
function endPointer(event) {
  activePointers.delete(event.pointerId);
  if (activePointers.size < 2) pinch = null;
  if (linkDrag) {
    if (linkDrag.moved) {
      dropLink(event, linkDrag);
      dragMoved = true;
    }
    linkDrag = null;
    clearHighlights();
    render();
  }
  if (pointerDrag) {
    if (pointerDrag.moved) { dragMoved = true; render(); }
    pointerDrag = null;
  }
  if (canvasPan) {
    if (canvasPan.moved) dragMoved = true;
    canvasPan = null;
  }
  if (!canvasPan && !pinch) viewport.classList.remove('is-panning');
}
document.addEventListener('pointerdown', onPointerDown);
document.addEventListener('pointermove', onPointerMove);
document.addEventListener('pointerup', endPointer);
document.addEventListener('pointercancel', endPointer);
document.addEventListener('contextmenu', (event) => {
  if (viewport.contains(event.target) || event.target === viewport) event.preventDefault();
});
viewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  const point = clientToViewport(event.clientX, event.clientY);
  const deltaX = event.deltaMode === 1 ? event.deltaX * 16 : event.deltaX;
  const deltaY = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
  const zoomGesture = event.ctrlKey || event.metaKey || event.altKey || !deltaX;
  if (!zoomGesture) {
    state.view.x -= deltaX;
    state.view.y -= deltaY;
    applyView();
    return;
  }
  zoomAt(point.x, point.y, state.view.zoom * Math.exp(-deltaY * 0.0018));
}, { passive: false });
viewport.addEventListener('dblclick', (event) => {
  if (event.target.closest('.node, button, [data-edge]')) return;
  fitView();
});
['gesturestart', 'gesturechange', 'gestureend'].forEach((name) => {
  viewport.addEventListener(name, (event) => event.preventDefault());
});

function card(id, title, type, x, y, body, category, pins) {
  if (state.cards.some((item) => item.id === id)) return;
  state.cards.push({ id, title, type, x, y, body, category: category || types[type].category, pins: pins || defaultPins(type) });
}
function addNodePin(id, dir, pin) {
  const item = state.cards.find((cardItem) => cardItem.id === id);
  if (item) addPin(item, dir, pin);
}
function edge(from, to, label = '', kind = 'execution', fromPin, toPin) {
  const fromCard = state.cards.find((cardItem) => cardItem.id === from);
  const toCard = state.cards.find((cardItem) => cardItem.id === to);
  if (!fromCard || !toCard) return;
  const pinKind = kind === 'variable' ? 'data' : 'exec';
  fromPin = fromPin || firstPin(fromCard, 'out', pinKind)?.id;
  toPin = toPin || firstPin(toCard, 'in', pinKind)?.id || acceptPin(toCard, { pin: findPin(fromCard, fromPin, 'out') || { kind: pinKind, name: label, dataType: 'context' } }).id;
  if (!fromPin || !toPin) return;
  if (state.edges.some((item) => item.from === from && item.to === to && item.fromPin === fromPin && item.toPin === toPin)) return;
  state.edges.push({ id: uid(), from, to, label, kind, fromPin, toPin });
}
function unlink(from, to) { state.edges = state.edges.filter((edgeItem) => edgeItem.from !== from || edgeItem.to !== to); }
function moveCard(id, x, y) {
  const item = state.cards.find((cardItem) => cardItem.id === id);
  if (!item) return;
  item.x = x;
  item.y = y;
}
function setCardText(id, title, body) {
  const item = state.cards.find((cardItem) => cardItem.id === id);
  if (!item) return;
  if (title) item.title = title;
  if (body) item.body = body;
}

$('#next').onclick = () => {
  if (state.stage >= LAST_STAGE) return;
  checkpoint(); state.stage += 1;
  switch (state.stage) {
    case 1:
      card('task', 'Task', 'task', 50, 80, 'What should be done.', 'data', {
        inputs: [],
        outputs: [{ id: 'task', kind: 'data', name: 'Task', dataType: 'task' }],
      });
      card('agent', 'Complete this task', 'agent', 360, 80, 'The task is given to the agent. That is the whole system.', 'execution', {
        inputs: [
          { id: 'exec', kind: 'exec', name: '' },
          { id: 'task', kind: 'data', name: 'Task', dataType: 'task' },
        ],
        outputs: [{ id: 'exec', kind: 'exec', name: '' }],
      });
      edge('task', 'agent', '', 'variable', 'task', 'task');
      break;
    case 2:
      moveCard('agent', 680, 80);
      addNodePin('agent', 'in', { id: 'ask', kind: 'data', name: 'Ask', dataType: 'context' });
      setCardText('agent', 'Complete this task', 'The agent now hears the ask from a terminal, not the task itself.');
      card('person', 'A person', 'human', 360, 80, 'Takes the task and types the ask in a terminal.', 'execution', {
        inputs: [
          { id: 'exec', kind: 'exec', name: '' },
          { id: 'task', kind: 'data', name: 'Task', dataType: 'task' },
        ],
        outputs: [
          { id: 'exec', kind: 'exec', name: '' },
          { id: 'ask', kind: 'data', name: 'Ask', dataType: 'context' },
        ],
      });
      card('terminal', 'Terminal', 'context', 360, 280, 'Complete this task.', 'data', {
        inputs: [{ id: 'ask', kind: 'data', name: 'Ask', dataType: 'context' }],
        outputs: [{ id: 'ask-out', kind: 'data', name: 'Ask', dataType: 'context' }],
      });
      unlink('task', 'agent');
      edge('task', 'person', '', 'variable', 'task', 'task');
      edge('person', 'agent', '', 'execution', 'exec', 'exec');
      edge('person', 'terminal', '', 'variable', 'ask', 'ask');
      edge('terminal', 'agent', '', 'variable', 'ask-out', 'ask');
      break;
    case 3:
      moveCard('person', 360, 340);
      moveCard('terminal', 680, 340);
      card('start', 'When a task is waiting', 'trigger', 50, 260, 'The same work begins without anyone opening a terminal.', 'execution');
      setCardText('agent', 'Complete this task', 'The task reaches the agent on its own. A person no longer has to type the ask.');
      unlink('person', 'agent');
      unlink('terminal', 'agent');
      unlink('task', 'person');
      edge('start', 'agent', '', 'execution', 'exec', 'exec');
      edge('task', 'agent', '', 'variable', 'task', 'task');
      break;
  }
  render();
  requestAnimationFrame(() => revealContent());
};
$('#export').onclick = () => { const blob = new Blob([JSON.stringify({ format: 'ship-loop-blueprint-v2', ...state }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'ship-loop-blueprint.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
new ResizeObserver(() => { applyView(); drawEdges(); }).observe(viewport);
window.addEventListener('resize', () => { applyView(); drawEdges(); });
applyView({ animate: false });
render();

function updateThemeButton() { const dark = document.documentElement.dataset.theme === 'dark'; $('#theme-toggle').textContent = dark ? '☼ Light' : '☾ Dark'; $('#theme-toggle').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme'); }
$('#theme-toggle').onclick = () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; try { localStorage.setItem('ship-loop-theme', theme); } catch {} updateThemeButton(); };
updateThemeButton();
