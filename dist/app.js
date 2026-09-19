const $ = (selector) => document.querySelector(selector);

const types = {
  trigger: { icon: 'ϟ', label: 'Trigger', category: 'execution' },
  agent: { icon: '✳', label: 'Agent', category: 'execution' },
  prompt: { icon: '≡', label: 'Prompt', category: 'execution' },
  action: { icon: '↗', label: 'Action', category: 'execution' },
  human: { icon: '◎', label: 'Human', category: 'execution' },
  feedback: { icon: '⌁', label: 'Feedback', category: 'data' },
  artifact: { icon: '▤', label: 'Artifact', category: 'data' },
  review: { icon: '◌', label: 'Review result', category: 'data' },
};
const flowTypes = ['trigger', 'agent', 'prompt', 'action', 'human'];
const dataTypes = ['feedback', 'artifact', 'review'];
const stages = [
  ['Start with an empty board', 'Decide what starts the work, who does it, and what “done” means.', 'Add the basic loop →'],
  ['The smallest useful loop', '0–15 min · An issue starts an executor. An agent implements it, reports, and opens a PR for a human.', 'Add test feedback →'],
  ['Make failure a loop', '15–25 min · Test before opening a PR. Send failures back with a bounded retry budget.', 'Add cleanup →'],
  ['Keep the change simple', '25–32 min · Simplify the diff without changing behavior, then test the final result.', 'Add code review →'],
  ['A second pair of eyes', '32–40 min · An independent agent reviews the diff. Findings return to the implementer.', 'Add mention triggers →'],
  ['Let agents hand off work', '40–47 min · A trusted @ship-loop mention resumes the executor on the same branch.', 'Add artifacts →'],
  ['Capture the unexpected', '47–53 min · Record obstacles, attempted fixes, and evidence—even when a run fails.', 'Add Doctor →'],
  ['Close the learning loop', '53–60 min · Doctor reads the evidence and proposes a focused follow-up issue for another pass.', 'Workshop complete ✓'],
];
const starterPositions = [[60, 70], [320, 70], [580, 70], [840, 70], [1100, 70], [1360, 70]];
let state = { cards: [], edges: [], stage: 0 };
let history = [];
let connecting = false;
let source = null;
let pendingEdge = null;
let dragMoved = false;

try {
  const saved = JSON.parse(localStorage.getItem('ship-loop-board-v1'));
  if (saved && Array.isArray(saved.cards) && Array.isArray(saved.edges)) state = saved;
} catch {}

const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const cssTheme = (type) => `--color:var(--${type})`;
const categoryFor = (card) => card.category || types[card.type]?.category || (card.type === 'artifact' ? 'data' : 'execution');

function normalizeState() {
  const rows = [];
  state.cards.forEach((card, index) => {
    card.type = types[card.type] ? card.type : 'prompt';
    card.category = categoryFor(card);
    if (!Number.isFinite(card.x) || !Number.isFinite(card.y)) {
      const column = Number.isInteger(card.lane) ? card.lane : index % 5;
      const row = rows[column] || 0;
      rows[column] = row + 1;
      card.x = 40 + column * 280;
      card.y = 50 + row * 180;
    }
  });
  state.edges.forEach((edge) => {
    if (edge.kind === 'normal' || edge.kind === 'retry') edge.kind = 'execution';
    if (edge.kind !== 'variable') edge.kind = 'execution';
  });
  state.stage = Math.max(0, Math.min(7, Number.isInteger(state.stage) ? state.stage : 0));
}
normalizeState();

function checkpoint() { history.push(JSON.stringify(state)); if (history.length > 30) history.shift(); }
function save() { try { localStorage.setItem('ship-loop-board-v1', JSON.stringify(state)); $('#saved').textContent = 'Saved on this device'; } catch { $('#saved').textContent = 'Storage unavailable · export to save'; } }
function palette(typesToShow) {
  return typesToShow.map((type) => `<button class="library-item" data-type="${type}" style="${cssTheme(type)}"><span class="type-icon">${types[type].icon}</span><strong>${types[type].label}</strong><span class="plus">+</span></button>`).join('');
}
function nodeMarkup(card) {
  const type = types[card.type];
  return `<article class="node card ${source === card.id ? 'selected' : ''}" tabindex="0" role="button" aria-label="Edit ${escape(card.title)}" data-id="${card.id}" data-category="${categoryFor(card)}" style="left:${card.x}px;top:${card.y}px;${cssTheme(card.type)}"><div class="card-type node-drag-handle"><span>${type.icon} ${type.label}</span><button class="node-port output-port" data-link="${card.id}" aria-label="Start connection from ${escape(card.title)}" title="Start connection">●</button></div><h3>${escape(card.title)}</h3><p>${escape(card.body)}</p><div class="card-bottom"><span class="node-hint">DRAG TO MOVE</span><button data-link="${card.id}" aria-label="Connect ${escape(card.title)}">⊕</button></div><span class="node-port input-port" aria-hidden="true">●</span></article>`;
}
function render() {
  save();
  $('#flow-library').innerHTML = palette(flowTypes);
  $('#data-library').innerHTML = palette(dataTypes);
  $('#nodes').innerHTML = state.cards.map(nodeMarkup).join('');
  const stage = stages[state.stage];
  $('#step-number').textContent = `0${state.stage} / 07`;
  $('#step-title').textContent = stage[0];
  $('#step-description').textContent = stage[1];
  $('#next').textContent = stage[2];
  $('#next').disabled = state.stage === 7;
  $('#progress').innerHTML = stages.slice(1).map((_, index) => `<div class="progress-segment ${index < state.stage ? 'active' : ''}"></div>`).join('');
  $('#count').textContent = `${state.cards.length} nodes · ${state.edges.length} connections`;
  $('#undo').disabled = !history.length;
  $('#connect').textContent = connecting ? 'Cancel connection' : '↗ Connect nodes';
  $('#connection-hint').classList.toggle('active', connecting);
  $('#connection-hint').textContent = connecting ? (source ? 'Choose the destination node.' : 'Choose the starting node.') : 'Drag nodes freely · Click to edit · Connect to link';
  requestAnimationFrame(drawEdges);
}
function drawEdges() {
  const board = $('#board');
  const base = board.getBoundingClientRect();
  const svg = $('#arrows');
  svg.setAttribute('viewBox', `0 0 ${board.offsetWidth} ${board.offsetHeight}`);
  let result = '<defs><marker id="exec-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8"/></marker><marker id="data-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8"/></marker></defs>';
  state.edges.forEach((edge, index) => {
    const from = document.querySelector(`[data-id="${CSS.escape(edge.from)}"]`);
    const to = document.querySelector(`[data-id="${CSS.escape(edge.to)}"]`);
    if (!from || !to) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const data = edge.kind === 'variable';
    const rightward = b.left >= a.right - 20;
    const sx = (rightward ? a.right : a.left) - base.left;
    const tx = (rightward ? b.left : b.right) - base.left;
    const sy = a.top - base.top + a.height / 2;
    const ty = b.top - base.top + b.height / 2;
    const bend = Math.max(60, Math.abs(tx - sx) * 0.45);
    const path = rightward ? `M${sx},${sy} C${sx + bend},${sy} ${tx - bend},${ty} ${tx},${ty}` : `M${sx},${sy} C${sx - bend},${sy} ${tx + bend},${ty} ${tx},${ty}`;
    const lx = (sx + tx) / 2;
    const ly = (sy + ty) / 2 + (index % 2 ? 13 : -9);
    const width = Math.max(34, (edge.label || '').length * 5.8 + 14);
    result += `<path class="edge-hit" data-edge="${edge.id}" d="${path}" fill="none" stroke="transparent" stroke-width="18" pointer-events="stroke"/>`;
    result += `<path class="edge-spline ${data ? 'data-spline' : 'execution-spline'}" d="${path}" fill="none" stroke-width="${data ? 2 : 2.5}" stroke-linecap="round" ${data ? 'stroke-dasharray="6 5"' : ''} marker-end="url(#${data ? 'data' : 'exec'}-arrow)"/>`;
    if (edge.label) result += `<g class="edge-label" data-edge="${edge.id}" role="button" tabindex="0" aria-label="Edit connection ${escape(edge.label)}"><rect x="${lx - width / 2}" y="${ly - 9}" width="${width}" height="18" rx="4"/><text x="${lx}" y="${ly + 3}" text-anchor="middle" font-size="10">${escape(edge.label)}</text></g>`;
  });
  svg.innerHTML = result;
}
function nextPosition() { const i = state.cards.length; return { x: 50 + (i % 5) * 270, y: 50 + Math.floor(i / 5) * 180 }; }
function openCard(id, type = 'prompt') {
  const card = state.cards.find((item) => item.id === id);
  $('#card-id').value = card?.id || '';
  $('#card-title').value = card?.title || '';
  $('#card-body').value = card?.body || '';
  $('#card-type').innerHTML = Object.entries(types).map(([key, value]) => `<option value="${key}">${value.label}</option>`).join('');
  $('#card-type').value = card?.type || type;
  $('#card-category').value = card?.category || types[type]?.category || 'execution';
  $('#delete').hidden = !card;
  $('#card-connections').innerHTML = card ? state.edges.filter((edge) => edge.from === id || edge.to === id).map((edge) => `<div class="connection-row"><span>${edge.from === id ? '→' : '←'} ${escape(state.cards.find((item) => item.id === (edge.from === id ? edge.to : edge.from))?.title || '')} · ${escape(edge.label)} · ${edge.kind === 'variable' ? 'data' : 'execution'}</span><button type="button" data-remove-edge="${edge.id}">Remove</button></div>`).join('') : '';
  $('#editor').showModal();
}
function openEdge(edge) { pendingEdge = { ...edge }; $('#edge-summary').textContent = `${state.cards.find((card) => card.id === edge.from)?.title} → ${state.cards.find((card) => card.id === edge.to)?.title}`; $('#edge-label').value = edge.label || ''; $('#edge-kind').value = edge.kind || 'execution'; $('#edge-editor').showModal(); }
function chooseCard(id) { if (!connecting) return openCard(id); if (!source) { source = id; return render(); } if (source === id) return; if (state.edges.some((edge) => edge.from === source && edge.to === id)) return; openEdge({ id: uid(), from: source, to: id, label: 'Next', kind: 'execution' }); }

document.addEventListener('click', (event) => {
  const close = event.target.closest('.close');
  if (close) {
    const dialog = close.closest('dialog');
    dialog.close();
    if (dialog.id === 'edge-editor') { connecting = false; source = null; render(); }
    return;
  }
  const library = event.target.closest('[data-type]');
  if (library) return openCard(null, library.dataset.type);
  const link = event.target.closest('[data-link]');
  if (link) { connecting = true; source = link.dataset.link; return render(); }
  const edge = event.target.closest('[data-edge]');
  if (edge) return openEdge(state.edges.find((item) => item.id === edge.dataset.edge));
  const remove = event.target.closest('[data-remove-edge]');
  if (remove) { checkpoint(); state.edges = state.edges.filter((item) => item.id !== remove.dataset.removeEdge); return render(); }
  const card = event.target.closest('.node');
  if (card && !dragMoved) chooseCard(card.dataset.id);
  dragMoved = false;
});
document.addEventListener('keydown', (event) => {
  if (event.target.matches('.node') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); chooseCard(event.target.dataset.id); }
  if (event.target.matches('.edge-label') && event.key === 'Enter') openEdge(state.edges.find((item) => item.id === event.target.dataset.edge));
  if (event.key === 'Escape') { connecting = false; source = null; render(); }
});
$('#card-type').addEventListener('change', (event) => { $('#card-category').value = types[event.target.value].category; });
$('#card-form').onsubmit = (event) => {
  event.preventDefault();
  if (!$('#card-title').value.trim()) return;
  checkpoint();
  const id = $('#card-id').value;
  const previous = state.cards.find((card) => card.id === id);
  const position = previous || nextPosition();
  const card = { id: id || uid(), title: $('#card-title').value.trim(), body: $('#card-body').value, type: $('#card-type').value, category: $('#card-category').value, x: position.x, y: position.y };
  if (id) state.cards[state.cards.findIndex((item) => item.id === id)] = card; else state.cards.push(card);
  $('#editor').close(); render();
};
$('#delete').onclick = () => { checkpoint(); const id = $('#card-id').value; state.cards = state.cards.filter((card) => card.id !== id); state.edges = state.edges.filter((edge) => edge.from !== id && edge.to !== id); $('#editor').close(); render(); };
$('#edge-form').onsubmit = (event) => { event.preventDefault(); checkpoint(); const edge = { ...pendingEdge, label: $('#edge-label').value.trim() || 'Next', kind: $('#edge-kind').value }; const index = state.edges.findIndex((item) => item.id === edge.id); if (index >= 0) state.edges[index] = edge; else state.edges.push(edge); connecting = false; source = null; $('#edge-editor').close(); render(); };
$('#connect').onclick = () => { connecting = !connecting; source = null; render(); };
$('#undo').onclick = () => { if (!history.length) return; state = JSON.parse(history.pop()); connecting = false; source = null; render(); };
$('#reset').onclick = () => $('#reset-dialog').showModal();
$('#confirm-reset').onclick = () => { checkpoint(); state = { cards: [], edges: [], stage: 0 }; connecting = false; source = null; $('#reset-dialog').close(); render(); };

let pointerDrag = null;
document.addEventListener('pointerdown', (event) => {
  const node = event.target.closest('.node');
  if (!node || event.target.closest('button')) return;
  event.preventDefault();
  const card = state.cards.find((item) => item.id === node.dataset.id);
  if (!card) return;
  pointerDrag = { node, card, startX: event.clientX, startY: event.clientY, originX: card.x, originY: card.y, moved: false };
  node.setPointerCapture?.(event.pointerId);
});
document.addEventListener('pointermove', (event) => {
  if (!pointerDrag) return;
  const dx = event.clientX - pointerDrag.startX;
  const dy = event.clientY - pointerDrag.startY;
  if (!pointerDrag.moved && Math.hypot(dx, dy) < 4) return;
  if (!pointerDrag.moved) { checkpoint(); pointerDrag.moved = true; }
  event.preventDefault();
  pointerDrag.card.x = Math.max(16, Math.min(1270, pointerDrag.originX + dx));
  pointerDrag.card.y = Math.max(16, Math.min(650, pointerDrag.originY + dy));
  pointerDrag.node.style.left = `${pointerDrag.card.x}px`;
  pointerDrag.node.style.top = `${pointerDrag.card.y}px`;
  drawEdges();
});
document.addEventListener('pointerup', () => {
  if (!pointerDrag) return;
  if (pointerDrag.moved) { dragMoved = true; render(); }
  pointerDrag = null;
});
document.addEventListener('pointercancel', () => { pointerDrag = null; });

function card(id, title, type, x, y, body, category) { if (!state.cards.some((item) => item.id === id)) state.cards.push({ id, title, type, x, y, body, category: category || types[type].category }); }
function edge(from, to, label = 'Next', kind = 'execution') { if (state.cards.some((cardItem) => cardItem.id === from) && state.cards.some((cardItem) => cardItem.id === to) && !state.edges.some((item) => item.from === from && item.to === to)) state.edges.push({ id: uid(), from, to, label, kind }); }
function unlink(from, to) { state.edges = state.edges.filter((edgeItem) => edgeItem.from !== from || edgeItem.to !== to); }
function ensureBlueprintVariables() {
  if (state.stage >= 2 && !state.cards.some((cardItem) => cardItem.id === 'feedback')) {
    card('feedback', 'Test failure report', 'feedback', 550, 310, 'The failure output passed back to the agent. This is a variable, not a step.');
    edge('tests', 'feedback', 'Failure report', 'variable');
    edge('feedback', 'retry', 'Input', 'variable');
  }
  if (state.stage >= 4 && !state.cards.some((cardItem) => cardItem.id === 'review_result')) {
    card('review_result', 'Review findings', 'review', 1300, 310, 'Review result passed to the implementer and executor.');
    edge('review', 'review_result', 'Findings', 'variable');
    edge('review_result', 'implement', 'Fix findings', 'variable');
  }
}
ensureBlueprintVariables();

$('#next').onclick = () => {
  if (state.stage >= 7) return;
  checkpoint(); state.stage += 1;
  switch (state.stage) {
    case 1:
      card('issue', 'Issue created', 'trigger', 50, 80, 'A person creates an issue with the desired behavior and acceptance criteria. Event: issues.opened.');
      card('executor', 'Launch the agent', 'action', 300, 80, 'The executor checks out an issue branch, loads the issue, and launches the coding agent.');
      card('implement', 'Implement the issue', 'agent', 550, 80, 'Implement the task described in the issue. Follow repository instructions and make the smallest complete change.');
      card('report', 'Report completion', 'prompt', 800, 80, 'Report what changed, why it solves the issue, and how it was verified.');
      card('pr', 'Open a ready PR', 'action', 1050, 80, 'Create a pull request and mark it ready for review after required checks pass.');
      card('human', 'Review & merge', 'human', 1300, 80, 'A person reviews the final diff and evidence, then merges the pull request.');
      edge('issue', 'executor', 'Opened'); edge('executor', 'implement', 'Prompt'); edge('implement', 'report', 'Done'); edge('report', 'pr', 'Complete'); edge('pr', 'human', 'Ready'); break;
    case 2:
      card('tests', 'Run the tests', 'action', 800, 310, 'Run the project tests and capture exit status plus failure output.');
      card('feedback', 'Test failure report', 'feedback', 550, 310, 'The failure output passed back to the agent. This is a variable, not a step.');
      card('retry', 'Try again', 'prompt', 300, 310, 'Read the failure report, fix the cause, and try again on the same branch. Maximum 3 attempts.');
      unlink('report', 'pr'); edge('report', 'tests', 'Check'); edge('tests', 'pr', 'Passed'); edge('tests', 'feedback', 'Failure report', 'variable'); edge('feedback', 'retry', 'Input', 'variable'); edge('retry', 'implement', 'Retry ≤ 3'); break;
    case 3:
      card('cleanup', 'Simplify & clean up', 'agent', 800, 540, 'Remove unused code and unnecessary complexity. Keep behavior unchanged, then run tests again.');
      unlink('report', 'tests'); edge('report', 'cleanup', 'Simplify'); edge('cleanup', 'tests', 'Retest'); break;
    case 4:
      card('reviewer', 'Review the code', 'agent', 1050, 310, 'Independently review the final diff and report actionable defects with file, line, condition, and priority.');
      card('review', 'Review findings', 'review', 1300, 310, 'Review result passed to the implementer and executor.');
      unlink('tests', 'pr'); edge('tests', 'reviewer', 'Passed'); edge('reviewer', 'review', 'Findings', 'variable'); edge('review', 'implement', 'Fix findings', 'variable'); edge('reviewer', 'pr', 'No blockers'); break;
    case 5:
      card('mention', '@ship-loop mentioned', 'trigger', 50, 310, 'An authorized person or trusted reviewer mentions @ship-loop to resume the same issue branch.');
      edge('mention', 'executor', 'Resume'); unlink('review', 'implement'); edge('review', 'mention', '@ship-loop fix'); break;
    case 6:
      card('artifact', 'Run artifact', 'artifact', 1050, 540, 'Persist struggles.json with the issue, run, stage, attempted fixes, evidence, and outcome.');
      edge('implement', 'artifact', 'Observations', 'variable'); edge('tests', 'artifact', 'Test evidence', 'variable'); edge('review', 'artifact', 'Findings', 'variable'); break;
    case 7:
      card('doctor', 'Doctor: learn & improve', 'agent', 1050, 720, 'Read the run artifact, identify recurring obstacles, and propose one focused improvement backed by evidence.');
      card('followup', 'Approve a follow-up', 'human', 1300, 720, 'A person approves Doctor’s proposal and creates a focused issue for another pass.');
      edge('artifact', 'doctor', 'Run ended', 'variable'); edge('doctor', 'followup', 'Proposal'); edge('followup', 'issue', 'New issue'); break;
  }
  render();
};
$('#export').onclick = () => { const blob = new Blob([JSON.stringify({ format: 'ship-loop-blueprint-v1', ...state }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'ship-loop-blueprint.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
new ResizeObserver(drawEdges).observe($('#board'));
window.addEventListener('resize', drawEdges);
render();

function updateThemeButton() { const dark = document.documentElement.dataset.theme === 'dark'; $('#theme-toggle').textContent = dark ? '☼ Light' : '☾ Dark'; $('#theme-toggle').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme'); }
$('#theme-toggle').onclick = () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; try { localStorage.setItem('ship-loop-theme', theme); } catch {} updateThemeButton(); };
updateThemeButton();
