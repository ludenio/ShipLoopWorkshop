const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { presets } = require('../docs/blocks.js');
const { build } = require('../docs/export.js');

const types = { trigger: 'flow', agent: 'flow', human: 'flow', context: 'data', task: 'data' };
const byId = Object.fromEntries(presets.map((preset) => [preset.id, preset]));
const board = (cards, edges = []) => ({ cards, edges, stage: 0, view: { x: 48, y: 48, zoom: 1 } });
const node = (presetId, id = presetId, changes = {}) => {
  const preset = structuredClone(byId[presetId]);
  assert.ok(preset, 'Unknown preset: ' + presetId);
  return { ...preset, id, category: preset.group === 'data' ? 'data' : 'execution', x: 0, y: 0, ...changes };
};
const link = (id, from, fromPin, to, toPin, kind = 'execution') => ({ id, from, fromPin, to, toPin, kind, label: '' });

function assertCompatibleGraph(state) {
  for (const edge of state.edges) {
    const source = state.cards.find((card) => card.id === edge.from)?.pins.outputs.find((pin) => pin.id === edge.fromPin);
    const target = state.cards.find((card) => card.id === edge.to)?.pins.inputs.find((pin) => pin.id === edge.toPin);
    assert.ok(source, 'Missing source for ' + edge.id);
    assert.ok(target, 'Missing target for ' + edge.id);
    assert.equal(source.kind, edge.kind === 'execution' ? 'exec' : 'data');
    assert.equal(target.kind, source.kind);
    if (source.kind === 'data') assert.equal(source.dataType, target.dataType, edge.id);
  }
}

test('catalog has only agent, trigger, human, task, and context blocks with valid execution and data contracts', () => {
  assert.deepEqual(presets.map((preset) => preset.title), ['Start on an event', 'Agent', 'Human', 'Task', 'Context']);
  assert.equal(new Set(presets.map((preset) => preset.id)).size, presets.length);
  assert.deepEqual(new Set(presets.map((preset) => preset.type)), new Set(Object.keys(types)));
  for (const preset of presets) {
    assert.match(preset.id, /^[a-z][a-z0-9-]*$/);
    assert.equal(types[preset.type], preset.group, preset.id);
    for (const field of ['title', 'hint', 'body']) assert.ok(preset[field]?.trim(), preset.id + ': ' + field);
    for (const direction of ['inputs', 'outputs']) {
      const pins = preset.pins[direction];
      assert.ok(Array.isArray(pins));
      assert.equal(new Set(pins.map((pin) => pin.id)).size, pins.length, preset.id + ': ' + direction);
      for (const pin of pins) {
        assert.match(pin.id, /^[a-z][a-z0-9-]*$/);
        assert.equal(typeof pin.name, 'string');
        assert.ok(['exec', 'data'].includes(pin.kind));
        if (pin.kind === 'data') assert.ok(['task', 'context', 'feedback'].includes(pin.dataType));
        else assert.equal(pin.dataType, undefined);
        if (preset.group === 'data') assert.equal(pin.kind, 'data');
      }
    }
    if (preset.group === 'data') {
      assert.ok(preset.pins.inputs.length && preset.pins.outputs.length, preset.id);
    } else {
      if (preset.type !== 'trigger') assert.ok(preset.pins.inputs.some((pin) => pin.kind === 'exec'), preset.id);
      assert.ok(preset.pins.outputs.some((pin) => pin.kind === 'exec'), preset.id);
    }
  }
});

test('published catalog is identical and works as a dependency-free browser script', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/blocks.js'), 'utf8');
  assert.equal(fs.readFileSync(path.join(__dirname, '../dist/blocks.js'), 'utf8'), source);
  const browser = {};
  vm.runInNewContext(source, browser);
  assert.deepEqual(JSON.parse(JSON.stringify(browser.ShipLoopBlocks)), { presets });
});

test('every catalog contract survives all export formats without changing the board', () => {
  const state = board(presets.map((preset, index) => node(preset.id, preset.id, { x: index * 30, y: index ? index * -15 : 0 })));
  const original = structuredClone(state);
  for (const format of ['agent', 'actions-prompt']) {
    const content = build(state, { format, context: 'Participant-defined company and scenario' }).files[0].content;
    for (const card of state.cards) {
      assert.ok(content.includes(card.body), card.id);
      assert.ok(content.includes('ID: ' + JSON.stringify(card.id)), card.id);
    }
    assert.ok(content.includes(JSON.stringify({ schemaVersion: 1, context: 'Participant-defined company and scenario', diagram: state }, null, 2)));
  }
  const files = build(state, { format: 'actions' }).files;
  const exported = JSON.parse(files.find((file) => file.path === '.ship-loop/graph.json').content);
  assert.deepEqual(exported.diagram, state);
  const adapters = JSON.parse(files.find((file) => file.path === '.ship-loop/adapters.json').content);
  assert.deepEqual(Object.keys(adapters.commands), state.cards.filter((card) => card.category === 'execution' && card.type !== 'human').map((card) => card.id));
  assert.deepEqual(Object.keys(adapters.dataBindings), state.cards.filter((card) => card.category === 'data').map((card) => card.id));
  const backup = JSON.parse(build(state, { format: 'json' }).files[0].content);
  const { format, ...restored } = backup;
  assert.equal(format, 'ship-loop-blueprint-v2');
  assert.deepEqual(restored, state);
  assert.deepEqual(state, original);
});

test('a content loop connects a trigger, agent work, human review, and a retry with feedback', () => {
  const cards = [
    node('start-trigger', 'weekly-start', { body: 'Start on Monday at 09:00 for the next customer newsletter. Deduplicate by edition.' }),
    node('agent-task', 'write', { title: 'Draft a newsletter', body: 'Write an accessible customer newsletter from the supplied brief and approved facts. Produce a versioned draft.' }),
    node('context', 'quality', { title: 'Acceptance criteria', body: 'Require accurate source links, accessible text, and one approved offer.' }),
    node('human', 'review', { title: 'Editor review' }),
  ];
  const edges = [
    link('begin', 'weekly-start', 'started', 'write', 'exec'),
    link('task-value', 'weekly-start', 'task', 'write', 'task', 'variable'),
    link('criteria-value', 'quality', 'context', 'write', 'context', 'variable'),
    link('drafted', 'write', 'done', 'review', 'exec'),
    link('draft-value', 'write', 'result', 'review', 'context', 'variable'),
    link('changes', 'review', 'rejected', 'write', 'again'),
    link('findings', 'review', 'response', 'write', 'context', 'variable'),
  ];
  // A partial template keeps unresolved routes explicit in its export.
  const state = board(cards, edges);
  assertCompatibleGraph(state);
  const content = build(state, { format: 'agent', context: 'A community publisher delivering weekly customer newsletters.' }).files[0].content;
  for (const edge of edges) assert.ok(content.includes('Edge ID ' + JSON.stringify(edge.id)), edge.id);
  assert.ok(content.includes('none (unconnected)'));
  assert.ok(content.includes(cards[1].body));
  const actions = build(state, { format: 'actions' }).files;
  const roundtrip = JSON.parse(actions.find((file) => file.path === '.ship-loop/graph.json').content).diagram;
  assert.deepEqual(roundtrip, state);
  const instructions = actions.find((file) => file.path === 'IMPLEMENTATION-PROMPT.md').content;
  assert.ok(instructions.includes(JSON.stringify({ schemaVersion: 1, context: '', diagram: state }, null, 2)));
});
