const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { build } = require('../docs/export.js');

const execPin = (id) => ({ id, name: id, kind: 'exec' });
const dataPin = (id) => ({ id, name: id, kind: 'data', dataType: 'context' });
const card = (id, { type = 'agent', inputs = [], outputs = [], body = 'Work on ' + id } = {}) => ({
  id, type, title: 'Title ' + id, body, x: -25.5, y: 91,
  category: type === 'context' ? 'data' : 'execution', pins: { inputs, outputs },
});
const edge = (id, from, fromPin, to, toPin, kind = 'execution') => ({ id, from, fromPin, to, toPin, kind, label: 'Condition ' + id });
const graph = (cards = [], edges = []) => ({ cards, edges, stage: 5, view: { x: -100, y: 22, zoom: 0.8 }, workshopV8: true });
const completed = { outputPin: null, outputs: {}, outcome: 'completed' };
const python = process.env.PYTHON || 'python3';

function harness(t, state, configure = () => {}, responses = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-loop-export-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of build(state, { format: 'actions', context: 'My game' }).files) {
    const target = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
  const configPath = path.join(dir, '.ship-loop/adapters.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  fs.writeFileSync(path.join(dir, 'responses.json'), JSON.stringify(responses));
  fs.writeFileSync(path.join(dir, 'adapter.py'), [
    'import json, sys',
    'request = json.load(sys.stdin)',
    'with open("responses.json") as f: responses = json.load(f)',
    'with open("requests.jsonl", "a") as f: f.write(json.dumps(request) + "\\n")',
    'response = responses[request["node"]["id"]]',
    'print(json.dumps(response))',
  ].join('\n'));
  for (const id of Object.keys(config.commands)) config.commands[id] = [python, 'adapter.py'];
  configure(config);
  fs.writeFileSync(configPath, JSON.stringify(config));
  return {
    dir,
    write(name, value) { fs.writeFileSync(path.join(dir, name), JSON.stringify(value)); },
    run(args = [], env = {}) {
      const run = spawnSync(python, ['.ship-loop/run.py', ...args], { cwd: dir, encoding: 'utf8', timeout: 15000, env: { ...process.env, ...env } });
      assert.equal(run.error, undefined);
      assert.equal(run.stderr, '', run.stderr);
      return { code: run.status, result: JSON.parse(fs.readFileSync(path.join(dir, 'ship-loop-run/result.json'), 'utf8')) };
    },
    requests() { return fs.readFileSync(path.join(dir, 'requests.jsonl'), 'utf8').trim().split('\n').map(JSON.parse); },
  };
}

test('all formats preserve every field and explain every element and edge', () => {
  const fence = String.fromCharCode(96).repeat(3);
  const state = graph([
    card('source', { type: 'trigger', body: 'Unicode 🎮\n' + fence + '\n$' + '{{ malicious }}\n$(touch /tmp/no)\n' + fence, outputs: [execPin('yes'), dataPin('value')] }),
    card('target', { inputs: [execPin('arrive'), dataPin('input')], body: 'Custom terminal body' }),
    card('isolated', { type: 'human', outputs: [execPin('unused')] }),
  ], [edge('flow-edge', 'source', 'yes', 'target', 'arrive'), edge('data-edge', 'source', 'value', 'target', 'input', 'variable')]);
  state.cards[0].extra = { untouched: true };
  const before = structuredClone(state);
  for (const format of ['agent', 'actions-prompt']) {
    const result = build(state, { format, context: 'Acme game' });
    const text = result.files[0].content;
    assert.ok(text.includes(JSON.stringify({ schemaVersion: 1, context: 'Acme game', diagram: state }, null, 2)));
    for (const value of ['source', 'target', 'isolated', 'flow-edge', 'data-edge', 'unused', 'Custom terminal body', 'disconnected', 'variable', 'human', 'company, game, or product']) assert.ok(text.includes(value), value);
    assert.deepEqual(build(state, { format, context: 'Acme game' }), result);
  }
  assert.deepEqual(state, before);
  const bundle = build(state, { format: 'actions' }).files;
  assert.equal(bundle.length, 8);
  assert.deepEqual(JSON.parse(bundle.find((file) => file.path.endsWith('graph.json')).content).diagram, state);
  const workflows = bundle.filter((file) => file.path.endsWith('.yml'));
  assert.equal(workflows.length, 2);
  for (const workflow of workflows) {
    assert.ok(workflow.content.includes('contents: read'));
    assert.ok(!workflow.content.includes('malicious'));
    assert.ok(!workflow.content.includes('Custom terminal body'));
  }
  assert.ok(workflows[1].content.includes('$' + '{{ inputs.start_node }}'));
  const backup = build(state, { format: 'json' }).files[0];
  assert.equal(backup.path, 'ship-loop-blueprint.json');
  assert.deepEqual(JSON.parse(backup.content), { format: 'ship-loop-blueprint-v2', ...state });
});

test('empty and disconnected boards remain complete, with no invented loop', () => {
  const text = build(graph(), { format: 'agent' }).files[0].content;
  assert.match(text, /board contains no elements/);
  assert.match(text, /There are no connections/);
  assert.throws(() => build({}), /current board/);
  assert.throws(() => build(graph(), { format: 'wat' }), /Unknown export/);
});

test('controller fails explicitly on an empty graph and missing adapters', (t) => {
  assert.equal(harness(t, graph()).run().code, 2);
  const run = harness(t, graph([card('work')]), (config) => { config.commands.work = []; }).run();
  assert.equal(run.code, 2);
  assert.match(run.result.message, /Implement and configure/);
  assert.equal(run.result.steps, 0);
});

test('controller branches by output pin and propagates variables through explicit bindings', (t) => {
  const state = graph([
    card('start', { type: 'trigger', outputs: [execPin('yes'), execPin('no'), dataPin('value')] }),
    card('value', { type: 'context', inputs: [dataPin('in')], outputs: [dataPin('out')] }),
    card('finish', { inputs: [execPin('go'), dataPin('input')] }),
    card('other', { inputs: [execPin('go')] }),
  ], [
    edge('selected', 'start', 'yes', 'finish', 'go'), edge('not-selected', 'start', 'no', 'other', 'go'),
    edge('producer', 'start', 'value', 'value', 'in', 'variable'), edge('consumer', 'value', 'out', 'finish', 'input', 'variable'),
  ]);
  const h = harness(t, state, (config) => { config.dataBindings.value.out = { input: 'in' }; }, {
    start: { outputPin: 'yes', outputs: { value: { revision: 'sha123', data: 'actual result' } } }, finish: completed,
  });
  const run = h.run();
  assert.equal(run.code, 0);
  assert.equal(run.result.status, 'completed');
  assert.deepEqual(run.result.history.map((item) => item.nodeId), ['start', 'finish']);
  assert.equal(run.result.history[0].edgeId, 'selected');
  assert.deepEqual(h.requests()[1].inputs.input, { revision: 'sha123', data: 'actual result' });
  assert.equal(h.requests()[1].inputPin, 'go');
  assert.deepEqual(h.requests()[1].snapshot.diagram, state);
  assert.equal(h.requests()[1].limits.stepsRemaining, 99);
  assert.ok(h.requests()[1].limits.activeSecondsRemaining > 0);
  assert.deepEqual(h.requests()[1].history.map((item) => item.nodeId), ['start']);
});

test('a multi Context input gathers every connected value; a plain input still rejects two sources', (t) => {
  const context = { id: 'context', name: 'Context', kind: 'data', dataType: 'context', multi: true };
  const state = graph([
    card('start', { type: 'trigger', outputs: [execPin('go'), { id: 'task', name: 'Task', kind: 'data', dataType: 'task' }, { id: 'report', name: 'Report', kind: 'data', dataType: 'feedback' }] }),
    card('agent', { inputs: [execPin('go'), context] }),
  ], [
    edge('flow', 'start', 'go', 'agent', 'go'),
    edge('task-in', 'start', 'task', 'agent', 'context', 'variable'),
    edge('report-in', 'start', 'report', 'agent', 'context', 'variable'),
  ]);
  const h = harness(t, state, () => {}, { start: { outputPin: 'go', outputs: { task: 'fix login', report: 'tests failed' } }, agent: completed });
  assert.equal(h.run().code, 0);
  assert.deepEqual(h.requests()[1].inputs.context, { 'start.task': 'fix login', 'start.report': 'tests failed' });

  const plain = structuredClone(state);
  plain.cards[1].pins.inputs[1] = { id: 'context', name: 'Context', kind: 'data', dataType: 'context' };
  plain.cards[0].pins.outputs[1].dataType = 'context';
  plain.cards[0].pins.outputs[2].dataType = 'context';
  const rejected = harness(t, plain, () => {}, { start: { outputPin: 'go', outputs: { task: 'a', report: 'b' } }, agent: completed }).run();
  assert.equal(rejected.code, 2);
  assert.match(rejected.result.message, /Multiple values target one input/);
});

test('cycles require a selected entry and stop at the configured step budget', (t) => {
  const state = graph([card('loop', { inputs: [execPin('again')], outputs: [execPin('retry')] })], [edge('back', 'loop', 'retry', 'loop', 'again')]);
  const h = harness(t, state, () => {}, { loop: { outputPin: 'retry', outputs: {} } });
  assert.equal(h.run().code, 2);
  const run = h.run(['--start', 'loop', '--max-steps', '3']);
  assert.equal(run.code, 4);
  assert.equal(run.result.status, 'limit_reached');
  assert.equal(run.result.steps, 3);
  assert.equal(run.result.history.length, 3);
});

test('human state pauses and resumes only with an explicit matching decision', (t) => {
  const state = graph([
    card('approve', { type: 'human', outputs: [execPin('approved'), dataPin('decision')] }),
    card('finish', { inputs: [execPin('go'), dataPin('input')] }),
  ], [edge('approved', 'approve', 'approved', 'finish', 'go'), edge('decision', 'approve', 'decision', 'finish', 'input', 'variable')]);
  const h = harness(t, state, () => {}, { finish: completed });
  const paused = h.run();
  assert.equal(paused.code, 3);
  assert.equal(paused.result.status, 'waiting_for_human');
  assert.equal(paused.result.steps, 0);
  assert.ok(fs.existsSync(path.join(h.dir, 'ship-loop-run/human-request.json')));
  h.write('checkpoint.json', paused.result);
  h.write('bad-decision.json', { nodeId: 'someone-else', outputPin: 'approved', outputs: {} });
  assert.equal(h.run(['--resume', 'checkpoint.json', '--human-result', 'bad-decision.json']).code, 2);
  h.write('decision.json', { nodeId: 'approve', outputPin: 'approved', outputs: { decision: 'Human approved' } });
  const resumed = h.run(['--resume', 'checkpoint.json', '--human-result', 'decision.json']);
  assert.equal(resumed.code, 0);
  assert.equal(resumed.result.steps, 2);
  assert.equal(h.requests()[0].inputs.input, 'Human approved');
});

test('terminal human still requires the action and an explicit completion outcome', (t) => {
  const h = harness(t, graph([card('merge', { type: 'human' })]));
  const paused = h.run();
  assert.equal(paused.code, 3);
  h.write('checkpoint.json', paused.result);
  h.write('decision.json', { nodeId: 'merge', ...completed });
  assert.equal(h.run(['--resume', 'checkpoint.json', '--human-result', 'decision.json']).code, 0);
});

test('terminal outcomes distinguish completion, stopping, failure, and missing setup', (t) => {
  for (const [outcome, expected] of [['completed', 0], ['stopped', 4], ['failed', 2], [undefined, 2]]) {
    const run = harness(t, graph([card('stop')]), () => {}, { stop: { outputPin: null, outputs: {}, outcome } }).run();
    assert.equal(run.code, expected);
    if (outcome) assert.equal(run.result.status, outcome);
  }
});

test('invalid numeric workflow input records a diagnostic artifact', (t) => {
  const h = harness(t, graph([card('work')]));
  const run = h.run([], { SHIP_LOOP_MAX_STEPS: '1.5' });
  assert.equal(run.code, 2);
  assert.equal(run.result.status, 'setup_or_execution_failed');
  assert.equal(run.result.steps, 0);
});

test('unconnected outputs and ambiguous fan-out never report success', (t) => {
  const start = card('start', { outputs: [execPin('next')] });
  const result = { start: { outputPin: 'next', outputs: {} } };
  const noRoute = harness(t, graph([start]), () => {}, result).run();
  assert.equal(noRoute.code, 4);
  assert.equal(noRoute.result.status, 'incomplete');
  const state = graph([start, card('a', { inputs: [execPin('go')] }), card('b', { inputs: [execPin('go')] })], [
    edge('one', 'start', 'next', 'a', 'go'), edge('two', 'start', 'next', 'b', 'go'),
  ]);
  const ambiguous = harness(t, state, () => {}, result).run();
  assert.equal(ambiguous.code, 2);
  assert.match(ambiguous.result.message, /multiple routes/);
});

test('partial graph is exported but fails executable validation', (t) => {
  const state = graph([card('start', { outputs: [execPin('next')] })], [edge('dangling', 'start', 'next', 'removed', 'missing')]);
  assert.match(build(state).files[0].content, /Incomplete endpoint/);
  const run = harness(t, state).run();
  assert.equal(run.code, 2);
  assert.match(run.result.message, /Missing or incompatible endpoint/);
});

test('invalid output cannot advance and revisited nodes cannot retain omitted stale outputs', (t) => {
  const state = graph([card('start', { outputs: [execPin('go')] })]);
  const run = harness(t, state, () => {}, { start: { outputPin: null, outputs: {} } }).run();
  assert.equal(run.code, 2);
  assert.equal(run.result.steps, 0);
  const terminal = graph([card('stop', { outputs: [dataPin('value')] })]);
  const h = harness(t, terminal, () => {}, { stop: completed });
  h.write('inputs.json', { stop: { value: 'old' } });
  const valid = h.run(['--inputs', 'inputs.json']);
  assert.equal(valid.code, 0);
  assert.deepEqual(valid.result.values.stop, {});
});

test('browser and CommonJS exports are identical and served copies match', () => {
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '../docs/export.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context);
  assert.equal(typeof context.ShipLoopExport.build, 'function');
  assert.equal(context.ShipLoopExport.build(graph()).files[0].content, build(graph()).files[0].content);
  assert.equal(fs.readFileSync(path.join(__dirname, '../dist/export.js'), 'utf8'), source);
});
