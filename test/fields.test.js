import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, UNIT_JOIN, fieldByKey, fieldDefaults, fieldSnap, fieldNext, fieldShow, fieldText, unitText } from '../src/fields.js';
import { UNITS, UNIT_WORDS, bareNumbers, plainSpaceNumbers } from './unit-rule.js';
import { nb } from './nb.js';
import { J } from './join.js';
import { NEEDS_SNAP, NEEDS_MARK } from './snap.js';

// Two kinds of test in this file.
//  1. The TABLE: invariants every FIELDS entry must satisfy (so a mistyped entry fails here, in words, not as a
//     strange failure somewhere else). These read the real FIELDS.
//  2. The RULES (fieldSnap, fieldNext): checked on every real field AND on three synthetic ones: one with a snap
//     zone, one without, and one without whose range crosses 0 (where -0 could appear). So both cases are tested
//     whatever your table holds (delete `snap` from every entry and the snap rules still run, on the synthetic field).
const SYNTH_SNAP = { key: 'q', id: 'q', label: 'Q', symbol: 'q', min: -2, max: 2, step: 0.5, unit: 'm', unitWord: 'metres',
  default: 1, decimals: 1, snap: { zone: 0.5, jump: 1 } };
const SYNTH_PLAIN = { key: 'p', id: 'p', label: 'P', symbol: 'p', min: 3, max: 12, step: 3, unit: 'm', unitWord: 'metres',
  default: 6, decimals: 0 };
const SYNTH_NEG = { key: 'n', id: 'n', label: 'N', symbol: 'n', min: -1, max: 1, step: 0.5, unit: 'm', unitWord: 'metres',
  default: 0.5, decimals: 1 };   // a range through 0 WITHOUT a snap zone: where -0 could otherwise appear
const CASES = [...FIELDS, SYNTH_SNAP, SYNTH_PLAIN, SYNTH_NEG];

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const whole = (x) => near(x, Math.round(x), 1e-6);

// ---- the table ------------------------------------------------------------------------------------
test('table: at least one input; keys and ids are unique; keys are short lower-case words', () => {
  assert.ok(FIELDS.length >= 1);
  assert.equal(new Set(FIELDS.map(f => f.key)).size, FIELDS.length, 'duplicate key');
  assert.equal(new Set(FIELDS.map(f => f.id)).size, FIELDS.length, 'duplicate id');
  for (const f of FIELDS) {
    assert.match(f.key, /^[a-z]+$/, `key ${f.key}`);
    assert.match(f.id, /^[a-z][a-z0-9]*$/, `id ${f.id}`);
    for (const p of ['label', 'symbol', 'unit', 'unitWord']) assert.ok(typeof f[p] === 'string' && f[p].length > 0, `${f.key}.${p}`);
  }
});

test('table: range, step and decimals agree (min and max are whole steps; step is whole in the last printed decimal)', () => {
  for (const f of FIELDS) {
    assert.ok(f.min < f.max && f.step > 0, f.key);
    assert.ok(Number.isInteger(f.decimals) && f.decimals >= 0, `${f.key}.decimals`);
    assert.ok(whole(f.step * 10 ** f.decimals), `${f.key}: step ${f.step} needs more than ${f.decimals} decimals`);
    assert.ok(whole(f.min / f.step) && whole(f.max / f.step), `${f.key}: min and max must be whole multiples of step`);
    assert.ok(f.default >= f.min && f.default <= f.max && whole(f.default / f.step), `${f.key}: default must be on the grid`);
    assert.equal(fieldSnap(f, f.default), f.default, `${f.key}: the default must survive its own snapping`);
  }
});

test('table: snap, where present, is symmetric about 0 with its zone on the grid and its jump just past it', NEEDS_SNAP, () => {
  for (const f of FIELDS.filter(g => g.snap)) {
    const { zone, jump } = f.snap;
    assert.ok(f.min < 0 && f.max > 0, `${f.key}: a snap zone is around 0, so the range must contain 0`);
    assert.ok(zone > 0 && whole(zone / f.step), `${f.key}: zone must be a whole multiple of step`);
    assert.ok(jump > zone && jump <= f.max && whole(jump / f.step), `${f.key}: jump must be on the grid, beyond the zone, in range`);
    assert.equal(fieldSnap(f, jump), jump, `${f.key}: the jump must not snap back to 0`);
    assert.equal(fieldSnap(f, -jump), -jump);
  }
});

test('table: symbols carry no ASCII digit (use subscripts), units are in the unit lint\'s list, unit words too', () => {
  for (const f of FIELDS) {
    assert.ok(!/[0-9]/.test(f.symbol), `${f.key}: symbol "${f.symbol}" has an ASCII digit; write R₁, not R1`);
    assert.ok(!/[0-9]/.test(f.unitWord), `${f.key}: unitWord "${f.unitWord}" has a digit; spell it as a word`);
    for (const [what, unit] of [['unit', f.unit], ['unitWord', f.unitWord]]) {
      const sample = `1 ${unit}`.replace(' ', nb('~'));
      assert.deepEqual(bareNumbers(sample), [], `${f.key}.${what} "${unit}" is not in UNITS (test/unit-rule.js: ${UNITS.join(', ')})`);
      assert.deepEqual(plainSpaceNumbers(sample), [], f.key);
    }
  }
});

test('table: every unit is tied to its word (UNIT_WORDS), and the word is plain words', () => {
  for (const f of FIELDS) {
    assert.equal(UNIT_WORDS[f.unit], f.unitWord, `${f.key}: unit "${f.unit}" must have UNIT_WORDS["${f.unit}"] === unitWord "${f.unitWord}" (test/unit-rule.js)`);
    assert.match(f.unitWord, /^[a-z]+( [a-z]+)*$/, `${f.key}: unitWord is words (aria text), not a symbol`);
    assert.notEqual(f.unitWord, f.unit);
  }
  for (const [unit, word] of Object.entries(UNIT_WORDS)) {
    assert.ok(UNITS.includes(unit), `UNIT_WORDS names "${unit}", which is not in UNITS`);
    assert.ok(UNITS.some(u => word.startsWith(u)), `the word "${word}" must start with a word in UNITS`);
  }
});

test('table: mark, where present, is a value on the grid, strictly inside the range, with a label; it is not a snap', NEEDS_MARK, () => {
  for (const f of FIELDS.filter(g => g.mark)) {
    const { value, label } = f.mark;
    assert.ok(typeof label === 'string' && label.length > 0, `${f.key}: mark.label`);
    assert.ok(value > f.min && value < f.max && whole(value / f.step), `${f.key}: mark.value must be on the grid, inside the range`);
    assert.equal(fieldSnap(f, value), value, `${f.key}: a marked value must be a real slider position (not swallowed by a snap zone)`);
  }
});

test('table: UNIT_JOIN only holds units that exist, with the join text \'\' (the default is a no-break space)', () => {
  for (const [unit, join] of Object.entries(UNIT_JOIN)) {
    assert.equal(join, '', `UNIT_JOIN["${unit}"] must be ''`);
    assert.ok(UNITS.includes(unit), `UNIT_JOIN names "${unit}", which is not in UNITS`);
  }
});

test('unitText: a no-break space by default, the table\'s join for a listed unit, nothing for a unit that merely contains one', () => {
  assert.equal(unitText('40', 'm', {}), nb('40~m'));
  assert.equal(unitText('40', '°', { '°': '' }), '40°');
  assert.equal(unitText('40', 'm', { '°': '' }), nb('40~m'));
  assert.equal(unitText('40', 'constructor', {}), nb('40~constructor'), 'a unit named like an Object method is still joined by a no-break space');
  assert.equal(unitText('5', 'N/m', UNIT_JOIN), UNIT_JOIN['N/m'] === undefined ? nb('5~N/m') : '5N/m');
  const deg = { ...SYNTH_PLAIN, unit: '°', unitWord: 'degrees', decimals: 0 };
  assert.equal(fieldText(deg, 6, { '°': '' }), '6°');
  assert.equal(fieldText(deg, 6, {}), nb('6~°'));
});

test('lookups: fieldByKey finds an input and throws on an unknown one; fieldDefaults is {key: default}', () => {
  for (const f of FIELDS) assert.equal(fieldByKey(f.key), f);
  assert.throws(() => fieldByKey('no-such-input'), /no input called "no-such-input"/);
  assert.deepEqual(fieldDefaults(), Object.fromEntries(FIELDS.map(f => [f.key, f.default])));
});

test('display: fieldShow is fixed decimals with a true minus; fieldText adds the unit with a no-break space', () => {
  for (const f of FIELDS) {
    const s = fieldShow(f, f.max);
    assert.equal(s, f.max.toFixed(f.decimals));
    assert.equal(fieldText(f, f.max), nb(`${s}${J(f.unit)}${f.unit}`));   // an angle joins with nothing: "360°"
    assert.ok(!fieldShow(f, f.min).includes('-'), 'a minus sign, if any, is U+2212');
  }
  assert.equal(fieldShow(SYNTH_SNAP, -1.5), '−1.5');
  assert.equal(fieldShow(SYNTH_SNAP, -0), '0.0');
  assert.equal(fieldShow(SYNTH_PLAIN, 6), '6');
});

// ---- the rules: fieldSnap -----------------------------------------------------------------------
// A sweep of raw values from well below min to well above max, in steps finer than the field's own, plus the awkward
// ones. Every property below is stated without calling the rule's own arithmetic.
function sweep(f) {
  const out = [-0, 0, 1e-12, -1e-12];
  const lo = f.min - 3 * f.step, hi = f.max + 3 * f.step, d = f.step / 7;
  for (let v = lo; v <= hi; v += d) out.push(v);
  return out;
}

test('fieldSnap: every result is in range, on the grid, free of float noise, and never -0', () => {
  for (const f of CASES) {
    for (const raw of sweep(f)) {
      const r = fieldSnap(f, raw);
      assert.ok(r >= f.min && r <= f.max, `${f.key}: ${raw} -> ${r} is out of range`);
      assert.ok(whole(r / f.step), `${f.key}: ${raw} -> ${r} is not a whole number of steps`);
      assert.equal(r, Number(r.toFixed(f.decimals)), `${f.key}: ${raw} -> ${r} has float noise`);
      assert.ok(!Object.is(r, -0), `${f.key}: ${raw} -> -0`);
    }
  }
});

test('fieldSnap: rounds to the nearest step (within half a step of the clamped value), except inside a snap zone', () => {
  for (const f of CASES) {
    for (const raw of sweep(f)) {
      const clamped = Math.max(f.min, Math.min(f.max, raw));
      const r = fieldSnap(f, raw);
      if (f.snap && r === 0) assert.ok(Math.abs(clamped) <= f.snap.zone + f.step / 2 + 1e-9, `${f.key}: ${raw} snapped to 0`);
      else assert.ok(Math.abs(r - clamped) <= f.step / 2 + 1e-9, `${f.key}: ${raw} -> ${r}`);
    }
  }
});

test('fieldSnap: clamps both ends; idempotent; non-finite is 0 for a snap field and the minimum otherwise', () => {
  for (const f of CASES) {
    assert.equal(fieldSnap(f, f.max + 1000 * f.step), f.max, f.key);
    assert.equal(fieldSnap(f, f.min - 1000 * f.step), f.min, f.key);
    assert.equal(fieldSnap(f, 1e300), f.max);
    for (const raw of sweep(f)) assert.equal(fieldSnap(f, fieldSnap(f, raw)), fieldSnap(f, raw));
    for (const v of [NaN, Infinity, -Infinity, undefined]) {
      assert.equal(fieldSnap(f, v), f.snap ? 0 : f.min, `${f.key}: ${v}`);
      assert.ok(!Object.is(fieldSnap(f, v), -0));
    }
  }
});

test('fieldSnap: a snap zone is inclusive, collapses both sides to a literal 0, and ends one step later', () => {
  for (const f of CASES.filter(g => g.snap)) {
    const { zone } = f.snap;
    for (const raw of [0, zone, -zone, zone / 2, -zone / 2, 1e-9, -1e-9]) {
      assert.ok(Object.is(fieldSnap(f, raw), 0), `${f.key}: ${raw}`);
    }
    assert.equal(fieldSnap(f, zone + f.step), Number((zone + f.step).toFixed(f.decimals)), `${f.key}: just past the zone`);
    assert.equal(fieldSnap(f, -zone - f.step), -Number((zone + f.step).toFixed(f.decimals)));
  }
});

test('fieldSnap: a field without snap has no special zone: a tiny positive value goes to the nearest step, not to 0', () => {
  const f = SYNTH_PLAIN;
  assert.equal(fieldSnap(f, f.min + 0.4 * f.step), f.min);
  assert.equal(fieldSnap(f, f.min + 0.6 * f.step), f.min + f.step);
  const withZero = { ...f, min: 0, max: 6, step: 3, default: 3 };
  assert.ok(Object.is(fieldSnap(withZero, -0), 0), 'min 0: -0 becomes +0');
  assert.equal(fieldSnap(withZero, 1), 0);
  assert.equal(fieldSnap(withZero, 2), 3);
});

// ---- the rules: fieldNext (the keyboard) --------------------------------------------------------
test('fieldNext: a pointer drag only snaps, from anywhere, for every field', () => {
  for (const f of CASES) {
    for (const prev of [f.min, f.default, f.max, 0]) {
      for (const raw of sweep(f)) assert.equal(fieldNext(f, prev, raw, false), fieldSnap(f, raw), `${f.key}: ${prev} -> ${raw}`);
    }
  }
});

test('fieldNext: a field without snap ignores the keyboard flag completely', () => {
  for (const f of CASES.filter(g => !g.snap)) {
    for (const prev of [f.min, f.default, f.max, 0]) {
      for (const raw of sweep(f)) assert.equal(fieldNext(f, prev, raw, true), fieldSnap(f, raw), `${f.key}: ${prev} -> ${raw}`);
    }
  }
});

test('fieldNext: a keyboard nudge from 0 jumps past the zone, in the direction of the nudge', () => {
  for (const f of CASES.filter(g => g.snap)) {
    const { zone, jump } = f.snap;
    assert.equal(fieldNext(f, 0, f.step, true), jump, f.key);
    assert.equal(fieldNext(f, 0, -f.step, true), -jump, f.key);
    assert.equal(fieldNext(f, 0, 1e-9, true), jump, 'a tiny positive nudge also jumps');
    assert.equal(fieldNext(f, 0, -zone / 4, true), -jump);
  }
});

test('fieldNext: a nudge back from the jump lands on 0; elsewhere the keyboard is an ordinary snap', () => {
  for (const f of CASES.filter(g => g.snap)) {
    const { zone, jump } = f.snap;
    assert.ok(Object.is(fieldNext(f, jump, zone, true), 0), f.key);
    assert.ok(Object.is(fieldNext(f, -jump, -zone, true), 0), f.key);
    assert.equal(fieldNext(f, jump, jump + f.step, true), Number((jump + f.step).toFixed(f.decimals)), f.key);
    assert.equal(fieldNext(f, f.max, f.max - f.step, true), Number((f.max - f.step).toFixed(f.decimals)), f.key);
  }
});

test('fieldNext: a raw 0, a non-finite raw, or a nudge that does not start at 0 never jumps', () => {
  for (const f of CASES.filter(g => g.snap)) {
    assert.ok(Object.is(fieldNext(f, 0, 0, true), 0), f.key);
    assert.ok(Object.is(fieldNext(f, 0, -0, true), 0), f.key);
    for (const raw of [NaN, Infinity, -Infinity]) assert.ok(Object.is(fieldNext(f, 0, raw, true), 0), `${f.key}: ${raw}`);
    assert.equal(fieldNext(f, f.step, 0.9 * f.step, true), fieldSnap(f, 0.9 * f.step), 'prev is not 0: no jump');
  }
});
