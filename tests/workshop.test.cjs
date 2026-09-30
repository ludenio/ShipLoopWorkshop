const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { build } = require('../docs/export.js');

const { workshop, snapshot, currentBoard } = require('./helpers/workshop.cjs');

test('current boards save and resume while old board storage starts fresh', () => {
  const source = fs.readFileSync(require.resolve('../docs/app.js'), 'utf8');
  const load = source.slice(source.indexOf('try {\n  const saved'), source.indexOf('const uid ='));
  const save = source.slice(source.indexOf('function save()'), source.indexOf('function saveSoon()'));
  const setup = (stored) => {
    const lesson = workshop();
    const { context } = lesson;
    const badge = {};
    const query = context.document.querySelector;
    context.document.querySelector = selector => selector === '#saved' ? badge : query(selector);
    context.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
    vm.runInContext(load + save, context);
    return { ...lesson, badge };
  };
  const old = new Map([['ship-loop-board-v1', JSON.stringify(currentBoard(33))]]);
  assert.deepEqual(snapshot(setup(old).context.state), { cards: [], edges: [], stage: 0, view: { x: 48, y: 48, zoom: 1 } });
  for (const stage of [0, 10, 13, 21, 33]) {
    const stored = new Map();
    const board = currentBoard(stage);
    if (board.cards.length) board.cards[0].body = 'Participant instructions.';
    board.view = { x: -100, y: 22, zoom: 0.8 };
    const writer = setup(stored);
    writer.context.state = board;
    writer.context.save();
    assert.equal(writer.badge.textContent, 'Saved on this device');
    const resumed = setup(stored);
    assert.deepEqual(snapshot(resumed.context.state), board);
    while (resumed.context.state.stage < resumed.lastStage) resumed.next.onclick();
    assert.equal(resumed.context.state.cards.length, 25);
    assert.equal(resumed.context.state.edges.length, 67);
  }
});

test('guided example retains valid connections through every step, including human review and task updates', () => {
  const { context, next, lastStage } = workshop();
  const intersects = (a, b) => a.x < b.x + 252 && a.x + 252 > b.x && a.y < b.y + 220 && a.y + 220 > b.y;
  let previous = [];
  let previousEdgeKeys = [];
  for (let stage = 1; stage <= lastStage; stage++) {
    next.onclick();
    const state = snapshot(context.state);
    assert.equal(state.stage, stage);
    const cards = new Map(state.cards.map((card) => [card.id, card]));
    const hasEdge = (from, fromPin, to, toPin) => state.edges.some((edge) => edge.from === from && edge.fromPin === fromPin && edge.to === to && edge.toPin === toPin);
    assert.equal(cards.has('person'), false, 'Human Request is not part of the walkthrough');
    if (stage >= 2 && stage <= 8) assert.equal(cards.get('humanimplement').type, 'human');
    if (stage >= 8) assert.equal(cards.get('implement').type, 'agent');
    if (stage === 8) {
      assert.ok(hasEdge('humanimplement', 'exec', 'implement', 'exec'));
      assert.ok(hasEdge('humanimplement', 'changes', 'implement', 'context'));
      assert.equal(hasEdge('task', 'task', 'implement', 'context'), false, 'the human hands the work to the agent first');
      assert.ok(hasEdge('implement', 'exec', 'pr', 'exec'));
    }
    if (stage >= 9) {
      assert.equal(cards.has('humanimplement'), false, 'human implementation is removed in its own step');
      assert.ok(hasEdge(cards.has('created') ? 'created' : 'task', 'task', 'implement', 'context'));
    }
    if (stage <= 7) assert.equal(state.cards.some((card) => card.type === 'agent'), false, 'complete both human review branches before introducing any agents');
    if (stage >= 3) assert.equal(cards.get('pr').type, 'human', 'the human creates the PR after the implementation');
    if (stage === 3) {
      assert.ok(hasEdge('task', 'task', 'humanimplement', 'context'));
      assert.ok(hasEdge('humanimplement', 'exec', 'pr', 'exec'));
      assert.equal(cards.has('tests'), false, 'show the PR handoff before checks');
    }
    if (stage === 4) {
      assert.equal(cards.get('prvar').title, 'Draft Pull Request');
      assert.ok(hasEdge('pr', 'pr', 'prvar', 'pr'));
      assert.equal(cards.has('humanreview'), false, 'create the draft variable before Human Merge');
    }
    if (stage >= 5) {
      assert.equal(cards.get('humanreview').type, 'human');
      assert.equal(cards.get('humanreview').title, 'Human Review');
      assert.deepEqual(cards.get('humanreview').pins.outputs.filter((pin) => pin.kind === 'exec').map((pin) => pin.name), ['Approved', 'Asked for changes']);
      assert.equal(cards.get('humanreview').pins.outputs.find((pin) => pin.id === 'task').name, 'Changes Request');
      assert.equal(cards.get('humanreview').pins.inputs.find((pin) => pin.id === 'pr').name, 'Draft Pull Request');
      assert.equal(cards.get('humanreview').executionMode, 'independent');
      assert.equal(cards.get('humanreview').pins.inputs.some((pin) => pin.kind === 'exec'), false);
      assert.equal(state.edges.some((edge) => edge.kind === 'execution' && edge.to === 'humanreview'), false);
      assert.ok(cards.get('humanreview').y > cards.get('pr').y, 'human review stays below the main control flow');
      assert.ok(hasEdge('prvar', 'pr', 'humanreview', 'pr'));
      assert.equal(hasEdge('pr', 'pr', 'humanreview', 'context'), false);
      if (stage === 5) {
        assert.equal(cards.has('updated'), false, 'the trigger gets its own next step');
        assert.equal(cards.has('created'), false, 'show human prompt and merge before triggers');
        assert.ok(hasEdge('task', 'task', 'humanreview', 'context'));
        assert.equal(state.cards.some((card) => card.type === 'agent'), false, 'show human delivery and review before adding the agent');
      }
    }
    if (stage < 21) assert.equal(cards.has('updated'), false, 'Task Updated is introduced after cleanup');
    if (stage >= 6) {
      assert.ok(hasEdge('humanreview', 'merged', 'mergepr', 'exec'));
      assert.ok(hasEdge('prvar', 'pr', 'mergepr', 'pr'));
      assert.equal(cards.get('mergepr').pins.outputs.length, 0, 'merging completes the review branch');
    }
    if (stage >= 7) {
      assert.ok(hasEdge('humanreview', 'changes', 'commentpr', 'exec'));
      assert.ok(hasEdge('humanreview', 'task', 'commentpr', 'task'));
      assert.ok(hasEdge('prvar', 'pr', 'commentpr', 'pr'));
    }
    if (stage >= 21) {
      assert.equal(cards.get('updated').title, 'Task Updated');
      assert.equal(cards.get('updated').x, cards.get('created').x, 'entry triggers stay in the same column');
      assert.ok(cards.get('updated').y < cards.get('created').y, 'Task Updated stays near Task Created');
      assert.ok(hasEdge('commentpr', 'exec', 'updated', 'again'));
      assert.ok(hasEdge('commentpr', 'task', 'updated', 'task'));
      assert.equal(hasEdge('humanreview', 'changes', 'updated', 'again'), false, 'post the PR comment before restarting');
      assert.ok(hasEdge('updated', 'exec', 'baseline', 'exec'));
      for (const target of ['classify', 'implement', 'needhuman', 'humanreview', 'explainer']) {
        if (cards.has(target)) assert.ok(hasEdge('updated', 'task', target, 'context'));
      }
    }
    if (stage === 10) {
      assert.ok(hasEdge('created', 'exec', 'implement', 'exec'));
      assert.equal(cards.has('baseline'), false, 'reveal the trigger before the tests');
    }
    if (stage >= 11) {
      assert.ok(hasEdge('created', 'exec', 'baseline', 'exec'));
      assert.equal(hasEdge('created', 'exec', 'classify', 'exec'), false);
      if (stage <= 15) {
        assert.equal(cards.has('classify'), false);
        assert.ok(hasEdge('baseline', 'passed', 'implement', 'exec'));
      } else {
        assert.ok(hasEdge('baseline', 'passed', 'classify', 'exec'));
        assert.ok(hasEdge('classify', 'clear', 'implement', 'exec'));
        assert.ok(cards.get('baseline').x < cards.get('classify').x);
      }
      if (stage >= 12) assert.ok(hasEdge('baseline', 'failed', 'needhuman', 'exec'));
      if (stage >= 17) assert.ok(hasEdge('classify', 'unclear', 'needhuman', 'exec'));
      if (stage === 16) assert.equal(hasEdge('classify', 'unclear', 'needhuman', 'exec'), false, 'reveal the unclear branch separately');
    }
    if (stage === 13) {
      assert.equal(cards.has('classify'), false, 'introduce both test runs before classification');
      assert.equal(hasEdge('implement', 'exec', 'pr', 'exec'), false);
      assert.ok(hasEdge('implement', 'exec', 'tests', 'exec'));
      assert.ok(hasEdge('tests', 'passed', 'pr', 'exec'));
    }
    assert.equal(hasEdge('tests', 'failed', 'implement', 'again'), stage >= 14, 'reveal the failed retry immediately after the second test run');
    assert.equal(hasEdge('tests', 'report', 'implement', 'context'), stage >= 15, 'reveal the failure report immediately after the failed retry');
    if (cards.has('doctor')) {
      assert.ok(hasEdge('pr', 'exec', 'doctor', 'exec'));
      assert.equal(hasEdge('humanreview', 'merged', 'doctor', 'exec'), false);
      assert.equal(cards.get('doctor').y, cards.get('pr').y, 'the Doctor continues on the main row');
    }
    for (const edge of state.edges) {
      const from = cards.get(edge.from);
      const to = cards.get(edge.to);
      assert.ok(from && to, `stage ${stage}: edge must connect existing nodes`);
      const output = from.pins.outputs.find((pin) => pin.id === edge.fromPin);
      const input = to.pins.inputs.find((pin) => pin.id === edge.toPin);
      assert.ok(output && input, `stage ${stage}: edge must connect existing pins`);
      const kind = edge.kind === 'execution' ? 'exec' : 'data';
      assert.equal(output.kind, kind);
      assert.equal(input.kind, kind);
      if (kind === 'data' && !input.multi) assert.equal(output.dataType, input.dataType);
      if (kind === 'exec' && edge.toPin !== 'again') assert.ok(to.x > from.x, `stage ${stage}: ${edge.from} → ${edge.to} must flow left to right`);
    }
    const added = state.cards.filter((card) => !previous.some((item) => item.id === card.id));
    const removed = previous.filter((item) => !state.cards.some((card) => card.id === item.id));
    assert.ok(added.length <= 1, `stage ${stage}: adds ${added.length} nodes`);
    assert.ok(removed.length <= 1, `stage ${stage}: removes ${removed.length} nodes`);
    const previousEdges = new Set(previousEdgeKeys);
    const newEdges = state.edges.filter((item) => !previousEdges.has([item.from, item.fromPin, item.to, item.toPin].join('|')));
    if (added.length) {
      if (stage !== 10) for (const item of newEdges) assert.ok(item.from === added[0].id || item.to === added[0].id, `stage ${stage}: ${item.from} → ${item.to} connects existing nodes in a step that adds ${added[0].id}`);
    } else if (stage === 9) {
      assert.deepEqual(removed.map((card) => card.id), ['humanimplement']);
      assert.equal(newEdges.length, 1, 'removing Human Implementation connects the task directly to the agent');
    } else {
      assert.equal(newEdges.length, 1, `stage ${stage}: a step without a new node adds exactly one connection`);
    }
    previousEdgeKeys = state.edges.map((item) => [item.from, item.fromPin, item.to, item.toPin].join('|'));
    for (let index = 0; index < state.cards.length; index += 1) {
      for (let other = index + 1; other < state.cards.length; other += 1) {
        assert.equal(intersects(state.cards[index], state.cards[other]), false, `stage ${stage}: ${state.cards[index].id} overlaps ${state.cards[other].id}`);
      }
    }
    for (const card of added) {
      for (const gone of removed) {
        assert.equal(intersects(card, gone), false, `stage ${stage}: ${card.id} overlaps removed ${gone.id}`);
      }
    }
    previous = state.cards.map((card) => ({ id: card.id, x: card.x, y: card.y }));
    const exported = JSON.parse(build(state, { format: 'json' }).files[0].content);
    assert.deepEqual(exported.cards, state.cards);
    assert.deepEqual(exported.edges, state.edges);
  }
  assert.equal(context.state.cards.length, 25);
  assert.equal(context.state.edges.length, 67);
  assert.equal(context.state.cards.find((card) => card.id === 'pr').title, 'Create Draft Pull Request');
});

test('trigger and baseline tests reveal separately and can be undone', () => {
  const { context, next, undo } = workshop(currentBoard(10));
  const trigger = snapshot(context.state);
  assert.ok(trigger.cards.some(card => card.id === 'created'));
  assert.equal(trigger.cards.some(card => card.id === 'baseline'), false);
  next.onclick();
  assert.equal(context.state.stage, 11);
  assert.ok(context.state.cards.some(card => card.id === 'baseline'));
  assert.equal(context.state.cards.some(card => card.id === 'needhuman'), false);
  undo.onclick();
  assert.deepEqual(snapshot(context.state), trigger);
  next.onclick();
  next.onclick();
  assert.equal(context.state.stage, 12);
  assert.ok(context.state.edges.some(edge => edge.from === 'baseline' && edge.fromPin === 'failed' && edge.to === 'needhuman'));
});

test('failed retry follows the second test reveal and can be undone', () => {
  const { context, next, undo } = workshop(currentBoard(13));
  const before = snapshot(context.state);
  next.onclick();
  assert.equal(context.state.stage, 14);
  assert.equal(context.state.cards.some(card => card.id === 'classify'), false);
  assert.equal(context.state.edges.length, before.edges.length + 1);
  assert.ok(context.state.edges.some(edge => edge.from === 'tests' && edge.fromPin === 'failed' && edge.to === 'implement' && edge.toPin === 'again'));
  undo.onclick();
  assert.deepEqual(snapshot(context.state), before);
});

test('human-to-agent handoff and removal can be undone without losing the human work', () => {
  const { context, next, undo } = workshop(currentBoard(7));
  const human = context.state.cards.find((card) => card.id === 'humanimplement');
  human.body = 'Custom human implementation instructions.';
  const before = snapshot(context.state);
  next.onclick();
  const handoff = snapshot(context.state);
  assert.equal(handoff.cards.find((card) => card.id === 'implement').title, 'Agent Implementation');
  next.onclick();
  assert.equal(context.state.cards.some((card) => card.id === 'humanimplement'), false);
  undo.onclick();
  assert.deepEqual(snapshot(context.state), handoff);
  undo.onclick();
  assert.deepEqual(snapshot(context.state), before);
});

test('a fast next step resumes unfinished node slides from their visible position', () => {
  const { context, next } = workshop(currentBoard(8));
  const pr = context.state.cards.find((card) => card.id === 'pr');
  const human = context.state.cards.find((card) => card.id === 'humanimplement');
  context.state.view = { x: -40, y: 30, zoom: 0.5 };
  context.viewport = { clientLeft: 1, clientTop: 1, getBoundingClientRect: () => ({ left: 300, top: 200 }) };
  context.document.querySelector = (selector) => {
    const card = selector.includes('data-id="pr"') ? pr : selector.includes('data-id="humanimplement"') ? human : null;
    if (!card) return null;
    const offset = card === pr ? 200 : 40;
    return { offsetWidth: 252, offsetHeight: 220, getBoundingClientRect: () => ({ left: 301 - 40 + (card.x - offset) * 0.5, top: 201 + 30 + card.y * 0.5 }) };
  };
  next.onclick();
  assert.equal(context.state.stage, 9);
  assert.equal(context.movedFrom.get('pr').dx, -200, 'the PR continues from its current slide instead of snapping to its last destination');
  assert.equal(context.removedGhosts.find((card) => card.id === 'humanimplement').x, human.x - 40, 'the removed node fades out at its current position');
});

test('connecting alternative routes preserves earlier flow while replacing a variable source', () => {
  const source = fs.readFileSync(require.resolve('../docs/app.js'), 'utf8');
  const connect = source.slice(source.indexOf('function connectPins('), source.indexOf('function dropLink('));
  let sequence = 0;
  const context = vm.createContext({
    state: { edges: [] },
    uid: () => `edge-${++sequence}`,
    checkpoint() {}, render() {},
    execName: (pin) => pin.name,
  });
  vm.runInContext(connect, context);
  const pin = (id, dir, kind) => ({ card: { id }, dir, pin: { id: 'port', kind, name: id } });
  const target = pin('work', 'in', 'exec');
  context.connectPins(pin('initial', 'out', 'exec'), target);
  context.connectPins(pin('retry', 'out', 'exec'), target);
  context.connectPins(pin('retry', 'out', 'exec'), target);
  assert.equal(context.state.edges.length, 2, 'both incoming alternatives survive, without duplicates');
  assert.deepEqual(Array.from(context.state.edges, (edge) => edge.from), ['initial', 'retry']);

  const variable = pin('context', 'in', 'data');
  context.connectPins(pin('old-source', 'out', 'data'), variable);
  context.connectPins(pin('new-source', 'out', 'data'), variable);
  assert.equal(context.state.edges.length, 3);
  assert.equal(context.state.edges.find((edge) => edge.kind === 'variable').from, 'new-source');
});
