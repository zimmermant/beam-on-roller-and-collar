import test from 'node:test';
import assert from 'node:assert/strict';
import { stubElement } from './stub-dom.js';
import { attachDrag, viewPoint, handleSpot } from '../src/interact.js';
import { createState } from '../src/state.js';
import { VB, PANELS, HANDLE_HIT, FORCE_U, loadArrow, beamPoints } from '../src/layout.js';
import { DEFAULTS } from '../src/state.js';
import { fieldByKey } from '../src/fields.js';

// A stand-in for the figure: the stub DOM has no layout, so the one thing the drag needs from a real
// browser -- where the svg sits on the screen -- is supplied here. The figure is placed at (100, 50)
// and drawn at exactly one screen pixel per viewBox unit, so a client point maps to itself minus the
// offset and the arithmetic in the tests stays readable.
const OFFSET = { x: 100, y: 50 };
function figure(scale = 1) {
  const el = stubElement('svg');
  el.getBoundingClientRect = () => ({ left: OFFSET.x, top: OFFSET.y, width: VB.w * scale, height: VB.h * scale });
  return el;
}
const at = (p) => ({ clientX: OFFSET.x + p.x, clientY: OFFSET.y + p.y, pointerId: 1, isPrimary: true, button: 0 });

function rig() {
  const svg = figure();
  const state = createState();
  const detach = attachDrag(svg, state);
  return { svg, state, detach, read: () => state.getState() };
}

test('viewPoint turns a client point into viewBox units, and refuses a figure with no size', () => {
  const svg = figure();
  assert.deepEqual(viewPoint(svg, at({ x: 226, y: 152 })), { x: 226, y: 152 });
  const half = figure(0.5);
  assert.deepEqual(viewPoint(half, { clientX: OFFSET.x + 113, clientY: OFFSET.y + 76 }), { x: 226, y: 152 });
  assert.equal(viewPoint(svg, { clientX: NaN, clientY: 0 }), null);
  const flat = stubElement('svg');
  flat.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
  assert.equal(viewPoint(flat, at({ x: 1, y: 1 })), null);
});

test('the figure keeps its aspect ratio, so a wide box leaves the figure centred in the slack', () => {
  const wide = stubElement('svg');
  wide.getBoundingClientRect = () => ({ left: 0, top: 0, width: VB.w + 200, height: VB.h });
  // scale is the smaller ratio (1), and the extra 200 px is split either side
  assert.deepEqual(viewPoint(wide, { clientX: 100 + 226, clientY: 152 }), { x: 226, y: 152 });
});

test('the handle sits on the load arrow\'s tail, and parks above B when there is no load', () => {
  const s = { f: 50, dir: 270 };
  assert.deepEqual(handleSpot(s), loadArrow(s).tail);
  const rest = handleSpot({ f: 0, dir: 270 });
  assert.equal(rest.x, beamPoints(PANELS.space.baseY, PANELS.space.baseX).B.x);
  assert.ok(rest.y < PANELS.space.baseY, 'it parks above the beam, where the arrow would come from');
});

test('a drag on the handle sets both the magnitude and the direction, snapped to the sliders\' steps', () => {
  const { svg, state, read } = rig();
  const start = handleSpot(read());
  svg.fire('pointerdown', { ...at(start), target: null });
  // straight up from B: the load then points DOWN the screen, and 50 N of it
  const B = beamPoints(PANELS.space.baseY, PANELS.space.baseX).B;
  const up = { x: B.x, y: B.y - 50 * FORCE_U };
  svg.fire('pointermove', { ...at(up) });
  svg.fire('pointerup', { ...at(up) });
  assert.equal(read().f, 50);
  assert.equal(read().dir, 270);

  // now swing it to the right of B: the load then points LEFT, along the beam
  const right = { x: B.x + 60 * FORCE_U, y: B.y };
  svg.fire('pointerdown', { ...at(handleSpot(read())), target: null });
  svg.fire('pointermove', { ...at(right) });
  svg.fire('pointerup', { ...at(right) });
  assert.equal(read().dir, 180);
  assert.equal(read().f, 60);
});

test('a press that lands nowhere near the handle changes nothing', () => {
  const { svg, read } = rig();
  const before = read();
  svg.fire('pointerdown', { ...at({ x: 10, y: 600 }), target: null });
  svg.fire('pointermove', { ...at({ x: 400, y: 300 }) });
  svg.fire('pointerup', { ...at({ x: 400, y: 300 }) });
  assert.deepEqual(read(), before);
});

test('a press just inside the hit radius counts as grabbing the handle, just outside does not', () => {
  for (const [offset, grabbed] of [[HANDLE_HIT - 2, true], [HANDLE_HIT + 6, false]]) {
    const { svg, read } = rig();
    const spot = handleSpot(read());
    svg.fire('pointerdown', { ...at({ x: spot.x + offset, y: spot.y }), target: null });
    svg.fire('pointermove', { ...at({ x: spot.x + offset + 60, y: spot.y + 60 }) });
    svg.fire('pointerup', { ...at({ x: spot.x + offset + 60, y: spot.y + 60 }) });
    assert.equal(read().dir !== DEFAULTS.dir || read().f !== DEFAULTS.f, grabbed, `offset ${offset}`);
  }
});

test('a press that barely moves is a click, not a drag: the store is never even written to', () => {
  // Checking the VALUES is not enough: a one-pixel drag snaps back to the same slider positions, so a
  // missing click threshold would look exactly like a click. Count the writes instead.
  const { svg, state, read } = rig();
  let writes = 0;
  state.subscribe(() => { writes++; });
  // The move has to be one a drag WOULD act on, or the test passes for the wrong reason: straight out
  // along the load by 2.9 units is under the 3-unit threshold, and yet 50 + 2.9 = 52.9 snaps to 55.
  const spot = handleSpot(read());
  const nearly = { x: spot.x, y: spot.y - 2.9 };
  assert.equal(fieldByKey('f').step, 5, 'the arithmetic below assumes a 5 N step');
  svg.fire('pointerdown', { ...at(spot), target: null });
  for (const p of [{ x: spot.x, y: spot.y - 1 }, { x: spot.x, y: spot.y - 2 }, nearly]) svg.fire('pointermove', { ...at(p) });
  svg.fire('pointerup', { ...at(nearly) });
  assert.equal(writes, 0, 'a click wrote to the store');
  assert.deepEqual(read(), DEFAULTS);

  // and a real drag does write
  svg.fire('pointerdown', { ...at(handleSpot(read())), target: null });
  svg.fire('pointermove', { ...at({ x: spot.x + 60, y: spot.y + 30 }) });
  svg.fire('pointerup', { ...at({ x: spot.x + 60, y: spot.y + 30 }) });
  assert.ok(writes > 0, 'a real drag wrote nothing');
});

test('an abandoned drag puts the load back where it started', () => {
  const { svg, read } = rig();
  const spot = handleSpot(read());
  svg.fire('pointerdown', { ...at(spot), target: null });
  svg.fire('pointermove', { ...at({ x: spot.x + 80, y: spot.y + 40 }) });
  assert.notDeepEqual(read(), DEFAULTS, 'the drag did change something first');
  svg.fire('pointercancel', { pointerId: 1 });
  assert.deepEqual(read(), DEFAULTS);
});

test('a pointer position that is not a pair of numbers is dropped before it can reach the store', () => {
  const { svg, state, read } = rig();
  let writes = 0;
  state.subscribe(() => { writes++; });
  const spot = handleSpot(read());
  svg.fire('pointerdown', { ...at(spot), target: null });
  svg.fire('pointermove', { clientX: NaN, clientY: NaN, pointerId: 1 });
  svg.fire('pointermove', { clientX: Infinity, clientY: 0, pointerId: 1 });
  svg.fire('pointerup', { clientX: NaN, clientY: NaN, pointerId: 1 });
  assert.equal(writes, 0);
  assert.deepEqual(read(), DEFAULTS);
  // viewPoint is where that is refused, so nothing downstream has to check again
  assert.equal(viewPoint(svg, { clientX: NaN, clientY: 3 }), null);
  assert.equal(viewPoint(svg, { clientX: Infinity, clientY: 3 }), null);
});

test('the keyboard swings the load and changes its strength, by the sliders\' own steps', () => {
  const fF = fieldByKey('f'), fDir = fieldByKey('dir');
  const { svg, read } = rig();
  const handle = stubElement('circle');
  handle.closest = (sel) => (sel === '.load-handle' ? handle : null);
  const press = (key) => svg.fire('keydown', { key, target: handle, preventDefault() {} });

  press('ArrowRight');
  assert.equal(read().dir, 270 + fDir.step);
  press('ArrowLeft'); press('ArrowLeft');
  assert.equal(read().dir, 270 - fDir.step);
  press('ArrowUp');
  assert.equal(read().f, 50 + fF.step);
  press('ArrowDown'); press('ArrowDown');
  assert.equal(read().f, 50 - fF.step);
  press('End');
  assert.equal(read().f, 0, 'End drops the load');
  press('Home');
  assert.equal(read().f, fF.max, 'Home is the hardest pull');
  assert.equal(read().dir, 270, 'and straight down');
});

test('the direction wraps the short way round instead of sticking at an end', () => {
  const { svg, state, read } = rig();
  const handle = stubElement('circle');
  handle.closest = (sel) => (sel === '.load-handle' ? handle : null);
  const press = (key) => svg.fire('keydown', { key, target: handle, preventDefault() {} });
  state.set({ dir: 0 });
  press('ArrowLeft');
  assert.equal(read().dir, 355, 'stepping back from 0 degrees lands just under a full turn');
  state.set({ dir: 355 });
  press('ArrowRight');
  assert.equal(read().dir, 0, 'and forward again wraps to zero');
});

test('a modified key is the browser\'s, not ours, and an unknown key does nothing', () => {
  const { svg, read } = rig();
  const handle = stubElement('circle');
  handle.closest = (sel) => (sel === '.load-handle' ? handle : null);
  svg.fire('keydown', { key: 'ArrowRight', target: handle, ctrlKey: true, preventDefault() {} });
  svg.fire('keydown', { key: 'q', target: handle, preventDefault() {} });
  svg.fire('keydown', { key: 'ArrowRight', target: stubElement('rect'), preventDefault() {} });
  assert.deepEqual(read(), DEFAULTS);
});

test('detach stops the listeners, and detaching twice is harmless', () => {
  const { svg, state, detach, read } = rig();
  detach();
  detach();
  const spot = handleSpot(read());
  svg.fire('pointerdown', { ...at(spot), target: null });
  svg.fire('pointermove', { ...at({ x: spot.x + 80, y: spot.y + 40 }) });
  svg.fire('pointerup', { ...at({ x: spot.x + 80, y: spot.y + 40 }) });
  assert.deepEqual(read(), DEFAULTS);
  state.set({ f: 20 });
  assert.equal(read().f, 20, 'the store itself still works');
});
