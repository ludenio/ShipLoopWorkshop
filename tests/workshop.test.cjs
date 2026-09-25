const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { build } = require('../docs/export.js');

test('guided example retains valid connections after separating it from the shared palette', () => {
  const source = fs.readFileSync(require.resolve('../docs/app.js'), 'utf8');
  const definitions = source.slice(0, source.indexOf('const MIN_ZOOM'));
  const steps = source.slice(source.indexOf('function edge('), source.indexOf("$('#export').onclick"));
  const next = {};
  let sequence = 0;
  const context = vm.createContext({
    ShipLoopBlocks: require('../docs/blocks.js'),
    document: { querySelector(selector) { return selector === '#next' ? next : null; } },
    CSS: { escape: (value) => value },
    state: { cards: [], edges: [], stage: 0 },
    uid: () => `edge-${++sequence}`,
    checkpoint() {}, render() {},
    clearTimeout() {},
    setTimeout() {},
    performance: { now: () => 0 },
    pendingPan: false,
    stepMarks: { added: new Set(), changed: new Set() },
    stepEdgeKeys: new Set(),
    removedGhosts: [],
    stepNote: '',
    stepMarkTimer: 0,
    edgeDrawStart: 0,
    movedFrom: new Map(),
    moveStart: 0,
    phaseDelay: 0,
    MOVE_MS: 600,
  });
  vm.runInContext(definitions + steps, context);
  const intersects = (a, b) => a.x < b.x + 252 && a.x + 252 > b.x && a.y < b.y + 220 && a.y + 220 > b.y;
  let previous = [];
  let previousEdgeKeys = [];
  for (let stage = 1; stage <= 27; stage++) {
    next.onclick();
    const state = JSON.parse(JSON.stringify(context.state));
    assert.equal(state.stage, stage);
    const cards = new Map(state.cards.map((card) => [card.id, card]));
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
    assert.ok(removed.length <= (stage === 4 ? 2 : 1), `stage ${stage}: removes ${removed.length} nodes`);
    const previousEdges = new Set(previousEdgeKeys);
    const newEdges = state.edges.filter((item) => !previousEdges.has([item.from, item.fromPin, item.to, item.toPin].join('|')));
    if (added.length) {
      if (stage !== 4) for (const item of newEdges) assert.ok(item.from === added[0].id || item.to === added[0].id, `stage ${stage}: ${item.from} → ${item.to} connects existing nodes in a step that adds ${added[0].id}`);
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
    const snapshot = JSON.parse(build(state, { format: 'json' }).files[0].content);
    assert.deepEqual(snapshot.cards, state.cards);
    assert.deepEqual(snapshot.edges, state.edges);
  }
  assert.equal(context.state.cards.length, 21);
  assert.equal(context.state.edges.length, 52);
  assert.equal(context.state.cards.find((card) => card.id === 'pr').title, 'Create Pull Request');
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
