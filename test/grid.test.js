import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, fieldSnap } from '../src/fields.js';
import { GRID_MAX, gridValues, VALUES, STATES } from './grid.js';

// The helper that builds the grid of states the lints walk through (test/grid.js) is checked once here, so a broken
// grid cannot make every lint quietly look at fewer states.
test('grid: every input contributes sorted, distinct, on-the-slider-grid values including both ends and the default', () => {
  for (const f of FIELDS) {
    const v = gridValues(f);
    assert.deepEqual(v, [...new Set(v)].sort((a, b) => a - b), f.key);
    assert.ok(v.includes(f.min) && v.includes(f.max) && v.includes(f.default), f.key);
    for (const x of v) assert.equal(fieldSnap(f, x), x, `${f.key}: ${x} is not a slider position`);
    if (f.snap) for (const x of [0, f.snap.jump, -f.snap.jump]) assert.ok(v.includes(x), `${f.key}: ${x}`);
    if (f.mark) assert.ok(v.includes(f.mark.value), `${f.key}: the marked value`);
    assert.deepEqual(VALUES[f.key], v);
  }
});

test('grid: a long range is sampled down to about GRID_MAX values, a short one is taken whole', () => {
  const short = { key: 's', min: 0, max: 1, step: 0.25, decimals: 2, default: 0.5 };
  assert.deepEqual(gridValues(short), [0, 0.25, 0.5, 0.75, 1]);
  const long = { key: 'l', min: 0, max: 1000, step: 1, decimals: 0, default: 500 };
  const v = gridValues(long);
  assert.ok(v.length <= GRID_MAX + 1 && v.length >= GRID_MAX, `${v.length} values`);
  assert.equal(v[0], 0);
  assert.equal(v.at(-1), 1000);
});

test('grid: the states are the cartesian product of the inputs\' values', () => {
  assert.equal(STATES.length, FIELDS.reduce((n, f) => n * VALUES[f.key].length, 1));
  assert.equal(new Set(STATES.map(s => JSON.stringify(s))).size, STATES.length, 'no duplicate states');
  assert.ok(STATES.length >= 20, 'a grid too small to lint anything');
  for (const s of STATES) assert.deepEqual(Object.keys(s).sort(), FIELDS.map(f => f.key).sort());
});
