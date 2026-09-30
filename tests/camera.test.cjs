const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function camera({ width = 1000, height = 700, reduced = false } = {}) {
  const source = fs.readFileSync(require.resolve('../docs/app.js'), 'utf8');
  const frames = new Map();
  const board = { style: {} };
  const viewport = { style: {}, getBoundingClientRect: () => ({ width, height }) };
  let now = 0;
  let sequence = 0;
  const button = { setAttribute() {} };
  const context = vm.createContext({
    state: { view: { x: 48, y: 48, zoom: 1 }, cards: [], edges: [] },
    board, viewport, autoCamera: true, animateTimer: 0, laneExtent: null,
    MIN_ZOOM: 0.15, MAX_ZOOM: 3, GRID: 32, GRID_MAJOR: 160,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    $: () => button,
    CSS: { escape: value => value },
    document: { querySelector: () => ({ offsetWidth: 252, offsetHeight: 220 }) },
    window: { matchMedia: () => ({ matches: reduced }) },
    localStorage: { setItem() {} },
    performance: { now: () => now },
    requestAnimationFrame(callback) { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame(id) { frames.delete(id); },
    saveSoon() {},
  });
  vm.runInContext(source.slice(source.indexOf('function viewportCenter('), source.indexOf('function palette(')), context);
  context.applyView();
  const advance = (time) => {
    now = time;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(now));
  };
  const painted = () => board.style.transform;
  const view = () => JSON.parse(JSON.stringify(context.state.view));
  return { context, advance, painted, view, frames };
}

test('auto camera moves continuously, including when another step interrupts its motion', () => {
  const { context, advance, painted, view } = camera();
  context.state.cards = [{ id: 'start', x: 40, y: 48 }, { id: 'new', x: 1700, y: 900 }];
  const initial = painted();
  context.keepAllInView();
  assert.equal(painted(), initial, 'scheduling a camera move must not snap to its destination');
  advance(0);
  assert.equal(painted(), initial);
  const start = view();
  advance(90);
  const intermediate = view();
  assert.ok(intermediate.zoom < start.zoom && intermediate.zoom > 0.15);
  assert.notEqual(painted(), initial);
  const interrupted = painted();
  context.state.cards.push({ id: 'next', x: 2300, y: 1400 });
  context.keepAllInView();
  assert.equal(painted(), interrupted, 'retarget from the currently painted position');
  assert.deepEqual(view(), intermediate);
  advance(90);
  assert.equal(painted(), interrupted);
  advance(450);
  const final = view();
  assert.ok(final.zoom < intermediate.zoom);
  const bounds = context.contentBounds();
  assert.ok(bounds.x * final.zoom + final.x >= 55.99);
  assert.ok(bounds.y * final.zoom + final.y >= 55.99);
  assert.ok((bounds.x + bounds.w) * final.zoom + final.x <= 944.01);
  assert.ok((bounds.y + bounds.h) * final.zoom + final.y <= 644.01);
});

test('removing Human Implementation leaves the camera still when the remaining diagram fits', () => {
  const { context, advance, painted, view, frames } = camera();
  context.state.cards = [{ id: 'human', x: 40, y: 48 }, { id: 'agent', x: 800, y: 48 }];
  context.keepAllInView();
  advance(360);
  const before = view();
  const transform = painted();
  context.state.cards = context.state.cards.filter(card => card.id !== 'human');
  context.keepAllInView();
  assert.deepEqual(view(), before);
  assert.equal(painted(), transform);
  assert.equal(frames.size, 0, 'removal must not cause a zoom-in or recenter');
});

test('an added node near the viewport edge causes only the pan needed to reveal it', () => {
  const { context, advance, view } = camera();
  context.state.cards = [{ id: 'task', x: 500, y: 50 }, { id: 'human', x: 700, y: 50 }];
  context.keepAllInView();
  advance(360);
  assert.deepEqual(view(), { x: -8, y: 48, zoom: 1 });
});

test('manual zoom disables auto camera and cancels its current motion', () => {
  const { context, advance, painted, view, frames } = camera();
  context.state.cards = [{ id: 'agent', x: 1700, y: 900 }];
  context.keepAllInView();
  advance(90);
  context.zoomAt(500, 350, 0.8, { animate: false });
  const manual = view();
  const transform = painted();
  assert.equal(context.autoCamera, false);
  assert.equal(frames.size, 0);
  advance(500);
  assert.deepEqual(view(), manual);
  assert.equal(painted(), transform);
});

test('reduced-motion preference applies the final camera position without an animation', () => {
  const { context, frames, view } = camera({ reduced: true });
  context.state.cards = [{ id: 'agent', x: 1700, y: 900 }];
  context.keepAllInView();
  assert.equal(frames.size, 0);
  assert.notEqual(view().x, 48);
});
