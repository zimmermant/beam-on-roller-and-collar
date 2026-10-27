import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, fieldSnap, fieldShow, fieldText } from '../src/fields.js';
import { parsePresets, describePresets, PRESET_SHOWN_MAX } from '../src/presets.js';
import { nb } from './nb.js';
import { J } from './join.js';

const EMPTY = { values: {}, adjusted: [], ignored: [] };
const parse = (...pairs) => parsePresets('?' + pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&'));
const note = (f, raw, to) => nb(`${f.label} ${fieldShow(f, raw)}${J(f.unit)}${f.unit} → ${fieldShow(f, to)}${J(f.unit)}${f.unit}`);
// An off-grid value close to min is only a VISIBLE change if the field's decimals show it: 5.4 prints as "5" for a whole-step
// field, so nothing is reported. `visibleOffGrid` gives a raw value the decimals do reveal (an out-of-range one if needed).
const visibleOffGrid = (f) => {
  const near = f.min + 0.4 * f.step;
  return fieldShow(f, near) !== fieldShow(f, f.min) ? near : f.max + 5 * f.step;
};

test('no params gives no changes and an empty description', () => {
  for (const search of [undefined, null, '', '?']) {
    const p = parsePresets(search);
    assert.deepStrictEqual(p, EMPTY, String(search));
    assert.strictEqual(describePresets(p), '', String(search));
  }
});

test('valid: every field is read by its key, alone and all together, and described with its label and unit', () => {
  for (const f of FIELDS) {
    const p = parse([f.key, String(f.max)]);
    assert.deepStrictEqual(p, { ...EMPTY, values: { [f.key]: f.max } }, f.key);
    assert.strictEqual(describePresets(p), nb(`From the link: ${f.label} = ${fieldShow(f, f.max)}${J(f.unit)}${f.unit}.`));
  }
  const all = parse(...FIELDS.map(f => [f.key, String(f.min)]));
  assert.deepStrictEqual(all.values, Object.fromEntries(FIELDS.map(f => [f.key, fieldSnap(f, f.min)])));
  assert.strictEqual(describePresets(all),
    'From the link: ' + FIELDS.map(f => nb(`${f.label} = ${fieldShow(f, f.min)}${J(f.unit)}${f.unit}`)).join(', ') + '.');
});

test('adjusted: a value off the grid or out of range snaps through the slider rule, and says so', () => {
  for (const f of FIELDS) {
    const off = visibleOffGrid(f);                           // off the grid (or out of range) by an amount the decimals show
    const to = fieldSnap(f, off);
    const p = parse([f.key, String(off)]);
    assert.strictEqual(p.values[f.key], to, f.key);
    assert.deepStrictEqual(p.adjusted, [note(f, off, to)], f.key);
    assert.strictEqual(describePresets(p), nb(`From the link: ${f.label} = ${fieldShow(f, to)}${J(f.unit)}${f.unit}. Adjusted: `) + note(f, off, to) + '.');
    const far = f.max + 5 * f.step;
    assert.strictEqual(parse([f.key, String(far)]).values[f.key], f.max, `${f.key}: clamped`);
    assert.deepStrictEqual(parse([f.key, String(far)]).adjusted, [note(f, far, f.max)]);
  }
});

test('a snap zone applies to a preset exactly as to the slider, and a preset is never -0', () => {
  for (const f of FIELDS) {
    for (const raw of ['-0', '0', '-0.0', f.snap ? String(f.snap.zone) : '0']) {
      const v = parse([f.key, raw]).values[f.key];
      assert.strictEqual(v, fieldSnap(f, Number(raw)), `${f.key}=${raw}`);
      assert.ok(!Object.is(v, -0), `${f.key}=${raw}`);
    }
  }
});

test('adjusted: a snap too small to print is no news', () => {
  for (const f of FIELDS) {
    const tiny = f.default + f.step / 1000;
    assert.deepStrictEqual(parse([f.key, String(tiny)]).adjusted, [], f.key);
    assert.deepStrictEqual(parse([f.key, String(f.default)]).adjusted, [], f.key);
  }
});

test('ignored: a value that is not a number is dropped with a note, and the other fields still apply', () => {
  const BAD = ['', 'abc', '1,2', 'Infinity', 'NaN', '1e3', '0x10', '--1', ' '];
  for (const f of FIELDS) {
    for (const raw of BAD) {
      const p = parse([f.key, raw]);
      assert.strictEqual(p.values[f.key], undefined, `${f.key}=${JSON.stringify(raw)}`);
      assert.deepStrictEqual(p.ignored, [`${f.label} = ${raw} (use a number of ${f.unit})`]);
    }
    assert.strictEqual(describePresets(parse([f.key, 'abc'])), `From the link: nothing set. Ignored: ${f.label} = abc (use a number of ${f.unit}).`);
  }
  if (FIELDS.length > 1) {
    const [a, b] = FIELDS;
    const p = parse([a.key, 'abc'], [b.key, String(b.max)]);
    assert.deepStrictEqual(p, { values: { [b.key]: b.max }, adjusted: [], ignored: [`${a.label} = abc (use a number of ${a.unit})`] });
  }
});

test('ignored: the echo of a rejected value is capped', () => {
  for (const f of FIELDS) {
    assert.deepStrictEqual(parse([f.key, 'a'.repeat(400)]).ignored, [`${f.label} = ${'a'.repeat(PRESET_SHOWN_MAX)}… (use a number of ${f.unit})`]);
    assert.strictEqual(parse([f.key, 'b'.repeat(PRESET_SHOWN_MAX)]).ignored[0], `${f.label} = ${'b'.repeat(PRESET_SHOWN_MAX)} (use a number of ${f.unit})`);
    assert.ok(parse([f.key, '9'.repeat(400)]).ignored[0].startsWith(`${f.label} = ` + '9'.repeat(PRESET_SHOWN_MAX) + '…'), '400 digits overflow and are ignored');
  }
});

test('a number pasted from the screen, with the true minus sign U+2212, is read like a hyphen-minus one', () => {
  for (const f of FIELDS) {
    const p = parse([f.key, '−' + String(f.step)]);
    assert.strictEqual(p.values[f.key], fieldSnap(f, -f.step), f.key);
    assert.deepStrictEqual(p.ignored, []);
  }
});

test('the first duplicate wins, unknown keys are ignored silently, the note follows the order of the table', () => {
  const f = FIELDS[0];
  assert.strictEqual(parsePresets(`?${f.key}=${f.min}&${f.key}=${f.max}`).values[f.key], f.min);
  assert.deepStrictEqual(parsePresets('?foo=1'), EMPTY);
  const reversed = parsePresets('?' + [...FIELDS].reverse().map(g => `${g.key}=${g.max}`).join('&'));
  assert.strictEqual(describePresets(reversed), 'From the link: ' + FIELDS.map(g => fieldText(g, g.max).replace(/^/, `${g.label} = `)).join(', ') + '.');
});

test('a field whose key differs from its name: the URL uses the key (r1), every note prints the label', () => {
  const R1 = { key: 'r1', id: 'r1', label: 'Resistance', symbol: 'R₁', min: 10, max: 200, step: 10, unit: 'Ω', unitWord: 'ohms', default: 40, decimals: 0 };
  const fields = [R1];
  const p = parsePresets('?r1=44', fields);
  assert.deepStrictEqual(p.values, { r1: 40 });
  assert.deepStrictEqual(p.adjusted, [nb('Resistance 44~Ω → 40~Ω')]);
  assert.strictEqual(describePresets(p, fields), nb('From the link: Resistance = 40~Ω. Adjusted: Resistance 44~Ω → 40~Ω.'));
  const bad = parsePresets('?r1=abc', fields);
  assert.deepStrictEqual(bad.ignored, ['Resistance = abc (use a number of Ω)']);
  assert.strictEqual(describePresets(bad, fields), 'From the link: nothing set. Ignored: Resistance = abc (use a number of Ω).');
  assert.deepStrictEqual(parsePresets('?R₁=44', fields), EMPTY, 'the symbol is not a URL key');
  assert.deepStrictEqual(parsePresets('?Resistance=44', fields), EMPTY, 'the label is not a URL key either');
});

test('adjusted: an off-grid value the field\'s decimals hide (a whole step, 0 decimals: 5.4 prints as 5) is applied but not reported', () => {
  const WHOLE = { key: 'n', id: 'n', label: 'Count', symbol: 'n', min: 5, max: 20, step: 1, unit: 'm', unitWord: 'metres', default: 10, decimals: 0 };
  const p = parsePresets('?n=5.4', [WHOLE]);
  assert.deepStrictEqual(p.values, { n: 5 });
  assert.deepStrictEqual(p.adjusted, [], 'it prints as 5 either way: no news');
  assert.deepStrictEqual(parsePresets('?n=25', [WHOLE]).adjusted, [nb('Count 25~m → 20~m')]);
});

test('a unit in UNIT_JOIN prints without the no-break space in every note ("90°"), a unit not in it keeps the no-break space', async () => {
  const { UNIT_JOIN } = await import('../src/fields.js');
  const ANGLE = { key: 'a', id: 'a', label: 'Angle', symbol: 'θ', min: 0, max: 90, step: 1, unit: '°', unitWord: 'degrees', default: 40, decimals: 0 };
  const LEN = { key: 'l', id: 'l', label: 'Length', symbol: 'l', min: 0, max: 9, step: 1, unit: 'm', unitWord: 'metres', default: 4, decimals: 0 };
  const had = Object.hasOwn(UNIT_JOIN, '°'), old = UNIT_JOIN['°'];     // your table may already have it: restore it afterwards
  UNIT_JOIN['°'] = '';
  try {
    const p = parsePresets('?a=95&l=12', [ANGLE, LEN]);
    assert.strictEqual(describePresets(p, [ANGLE, LEN]), nb('From the link: Angle = 90°, Length = 9~m. Adjusted: Angle 95° → 90°; Length 12~m → 9~m.'));
  } finally {
    if (had) UNIT_JOIN['°'] = old; else delete UNIT_JOIN['°'];
  }
});
