const fs = require('node:fs');
const vm = require('node:vm');
const snapshot = (value) => JSON.parse(JSON.stringify(value));

const source = fs.readFileSync(require.resolve('../../docs/app.js'), 'utf8');
const definitions = source.slice(0, source.indexOf('let state ='));
const steps = source.slice(source.indexOf('function edge('), source.indexOf("$('#export').onclick"));
const checkpoint = source.slice(source.indexOf('function checkpoint('), source.indexOf('function save('));
const undoHandler = source.slice(source.indexOf("$('#undo').onclick"), source.indexOf("$('#reset').onclick"));

function workshop(state) {
  const next = {};
  const undo = {};
  let sequence = 0;
  const context = vm.createContext({
    ShipLoopBlocks: require('../../docs/blocks.js'),
    document: { querySelector(selector) { return selector === '#next' ? next : selector === '#undo' ? undo : null; } },
    CSS: { escape: (value) => value },
    state: structuredClone(state),
    uid: () => `edge-${++sequence}`,
    history: [], linkDrag: null,
    render() {}, clearHighlights() {},
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
  vm.runInContext(definitions + checkpoint + steps + undoHandler, context);
  if (!state) context.state = context.emptyBoard();
  context.resetStepMarks = () => {};
  return { context, next, undo, lastStage: vm.runInContext('LAST_STAGE', context) };
}

function currentBoard(stage) {
  const { context, next } = workshop();
  for (let index = 0; index < stage; index++) next.onclick();
  return snapshot(context.state);
}
module.exports = { workshop, snapshot, currentBoard };
