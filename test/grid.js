import { FIELDS, fieldSnap } from '../src/fields.js';

// A test helper (not a test file): the grid of states the lints and the rounding test walk through. Built from FIELDS,
// so a new input or a new range needs no edit here.
//
// Per input: every slider position if there are at most GRID_MAX of them, otherwise GRID_MAX positions spread over
// the range, always including both ends, the default and (for a field with `snap`) zero and the two jump values, and (for a field with `mark`) the marked value.
// Positions inside a snap zone collapse to 0 (the slider cannot stop there). The states are the cartesian product, so
// the count multiplies: the toy's 17 and 10 values give 170 states; three inputs with 21 values each give 9,261. Lower GRID_MAX if the suite becomes slow.
// Lowered from the kit's 21 because this simulation has THREE inputs, not two: the grid is their
// cartesian product, so 21 each would be about 9,000 states and the unit lint draws the whole figure
// for every one of them. Eleven each keeps the suite a few seconds while still walking both ends,
// the default, zero and both snap jumps of every input.
export const GRID_MAX = 11;

export function gridValues(f) {
  const n = Math.round((f.max - f.min) / f.step);
  const at = (i) => Number((f.min + i * f.step).toFixed(f.decimals));
  const idx = [];
  if (n + 1 <= GRID_MAX) for (let i = 0; i <= n; i++) idx.push(i);
  else for (let j = 0; j < GRID_MAX; j++) idx.push(Math.round(j * n / (GRID_MAX - 1)));
  const values = new Set(idx.map(i => fieldSnap(f, at(i))));      // a position inside a snap zone IS 0: the slider cannot stop there
  values.add(f.default);
  if (f.snap) for (const v of [0, f.snap.jump, -f.snap.jump]) values.add(v);      // only values the slider can really reach
  if (f.mark) values.add(f.mark.value);                                          // and the marked value
  return [...values].sort((a, b) => a - b);
}

export const VALUES = Object.fromEntries(FIELDS.map(f => [f.key, gridValues(f)]));

// The cartesian product: [{ x: -0.5, k: 10 }, ...]
export const STATES = FIELDS.reduce(
  (acc, f) => acc.flatMap(s => VALUES[f.key].map(v => ({ ...s, [f.key]: v }))), [{}]);
