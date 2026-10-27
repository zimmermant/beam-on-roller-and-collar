import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubElement, installSvgDocument } from './stub-dom.js';
import { asSubscript } from '../src/format.js';
import { createScene } from '../src/scene.js';
import { createControls } from '../src/controls.js';
import { createState } from '../src/state.js';
import { parsePresets, describePresets } from '../src/presets.js';
import { FIELDS, SLIDER_FIELDS, fieldShow } from '../src/fields.js';
import { UNITS, NUMBER, bareNumbers, plainSpaceNumbers, unlistedNumerals } from './unit-rule.js';
import { STATES } from './grid.js';
import { nb } from './nb.js';
import { J } from './join.js';

// The unit lint: every number the page can show is followed by its unit. It builds the page's text for every
// reachable state and fails on any bare number or any plain space before a unit.

installSvgDocument();
const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(here, '..', 'src', 'index.template.html'), 'utf8');

// >>> EDIT THIS: the allow-list of numeric characters that are not ASCII digits, each with its reason. <<<
// A subscript in a symbol's NAME (x₀, R₁) is a label, not a quantity; a fraction or an exponent in a formula is a pure
// number. ASCII digits in a name are NOT allowed anywhere: the lint reads them as bare numbers, so name symbols with
// subscripts (FIELDS symbols are tested for this) and spell digits as words in aria text ("R sub one").
// Every entry must actually occur in the page's text (a test below), so a stale entry is deleted, not kept.
// Nothing here: this page prints no fractions, no exponents and no Unicode subscript glyphs. Every
// subscript in a force's name (F_B, F_CD, F_A) is a real lowered tspan or a <sub> element holding an
// ordinary letter, so the lint never meets a numeral that is not an ASCII digit.
const NON_ASCII_NUMERIC_OK = new Map([
  ['₁', 'the 1 of M₁, the applied couple: a digit in a subscript is part of a name, not a quantity. The figure draws it as an ordinary lowered 1; segPlain and the lint read it back as this.']
]);
const ALLOWED = new Set(NON_ASCII_NUMERIC_OK.keys());

// >>> EDIT THIS: how many numbers ONE state shows in each source, measured once. <<<
// The lint also fails if it looks at too few numbers (it could pass by checking nothing). Each floor is
// FLOOR_SHARE of (measured per-state count x number of states), so small changes do not trip it but a lint that has
// stopped seeing the figure does. To recalibrate after you change what a source shows: run `node --test
// test/units.test.js`; a floor failure prints the numbers actually seen per state; set the matching entry to that
// (rounded down). Measured on the toy (minimum over the grid): the figure shows 4 numbers per state, the calculation 6
// (7 when x = 0 adds its note), the controls 4 (a readout and an aria-valuetext for each of the 2 inputs).
const MEASURED_PER_STATE = { scene: 13, controls: 2 };
const FLOOR_SHARE = 0.85;
const floor = (perState) => Math.floor(FLOOR_SHARE * perState * STATES.length);

const plain = (html) => html.replace(/<[^>]*>/g, '');

// A figure label with a subscript is a <text> of <tspan>s, so its own textContent is empty: read the
// children instead. A tspan marked `sb` is a subscript, and a DIGIT in a subscript is part of a name
// (the 1 of M₁), so it is read back as the Unicode subscript -- exactly what segPlain() in
// src/format.js produces at the point the label is built. Without that the lint would see a bare 1.
const nodeText = (n) => (n.textContent ||
  n.children.map(c => ((c.attrs.class || '').includes('sb') ? asSubscript(c.textContent) : c.textContent)).join(''));

// Every string checked, and how many numbers were looked at, so the lint cannot pass by checking nothing.
const seen = { strings: 0, numbers: 0 };
const offenders = [];
const plainSpace = [];
const allowedSeen = new Set();
function lint(str, where) {
  assert.equal(typeof str, 'string', where);
  seen.strings++;
  seen.numbers += (str.match(NUMBER) || []).length;
  for (const ch of str) if (ALLOWED.has(ch)) allowedSeen.add(ch);
  const odd = unlistedNumerals(str, ALLOWED);
  assert.deepEqual(odd, [], `${where}: numeric character(s) ${odd.join(' ')} not allow-listed in NON_ASCII_NUMERIC_OK: "${str}"`);
  for (const b of bareNumbers(str)) offenders.push(`${where}: ${b}`);
  for (const b of plainSpaceNumbers(str)) plainSpace.push(`${where}: ${b}`);
}
function verdict(source) {
  const mine = offenders.filter(o => o.startsWith(source));
  assert.deepEqual(mine.slice(0, 5), [], `${mine.length} number(s) without a unit; first ones: ${mine.slice(0, 5).join(' || ')}`);
  const sp = plainSpace.filter(o => o.startsWith(source));
  assert.deepEqual(sp.slice(0, 5), [], `${sp.length} number(s) with a plain space before the unit (must be U+00A0); first ones: ${sp.slice(0, 5).join(' || ')}`);
}
function enough(source, got, perState) {
  const avg = got / STATES.length, set = `set MEASURED_PER_STATE.${source} to ${Math.floor(avg)}`;
  assert.ok(got >= floor(perState), `the lint saw only ${got} numbers in ${source} over ${STATES.length} states (${avg.toFixed(2)} per state); floor ${floor(perState)}. If that is right, ${set}.`);
  assert.ok(avg <= perState / FLOOR_SHARE, `${source} shows ${avg.toFixed(2)} numbers per state, far more than the recorded ${perState}: the floor is too weak. Calibrate it: ${set}.`);
}

// ---- the rule itself, on known strings --------------------------------------------------------
test('the rule: UNITS is ordered longest-first (prefixed units before the unit they contain)', () => {
  const lens = UNITS.map(u => u.length);
  assert.deepEqual(lens, [...lens].sort((a, b) => b - a));
});

// The rule's self-tests are built from YOUR `UNITS`, so they need no edit when you change the list: every listed unit is accepted
// after a number (several shapes), and each is rejected when a letter or a digit is glued to it. Bare numbers are fixed samples.
const SHAPES = ['5~U', '.5~U', '−0.30~U', '(1.8~U)²', 'x = 0.20~U,', 'F = 2~U × 3~U = 6~U', 'x 5~U → 0~U.', 'x 1e+60~U → 0.50~U', '½ × 2~U', 'x₀ = 0~U', '2~U (left)'];
const inUnit = (shape, u) => nb(shape.replaceAll('U', u));
test('the rule: every listed unit is accepted after a number, in every shape', () => {
  for (const u of UNITS) for (const shape of SHAPES) assert.deepEqual(bareNumbers(inUnit(shape, u)), [], `${shape} with ${u}`);
});

test('the rule: bare numbers, a glued letter or digit, an unlisted word, and a double space are rejected', () => {
  const U = UNITS.at(-1);
  for (const bad of ['100', '0', '−20 (left)', '1.00 x', 'k = 0, so', `F = 100 × 2~${U}`, `300 / 2~${U}`, `1e+60 → 2~${U}`, '5~zzzz', `100  ${U}`.replace(' ', nb('~')), 'R1 = 5~' + U])
    assert.ok(bareNumbers(nb(bad)).length > 0, bad);
  for (const u of UNITS) {
    assert.ok(bareNumbers(`5  ${u}`).length > 0, `two spaces before ${u}`);
    // A unit that STARTS with another listed unit ('N·m' starts with 'N') is read as the shorter one when the next character
    // is not an ASCII letter, digit or '/': a known limit of the whole-word check, so those are not asserted here.
    if (UNITS.some(v => v !== u && u.startsWith(v))) continue;
    assert.ok(bareNumbers(nb(`5~${u}x`)).length > 0, `a letter glued to ${u}`);
    assert.ok(bareNumbers(nb(`5~${u}2`)).length > 0, `a digit glued to ${u}`);
  }
});

test('the rule: a plain space between a number and its unit is an offence, a no-break space is not; no space at all is fine', () => {
  for (const u of UNITS) {
    assert.deepEqual(plainSpaceNumbers(nb(`50~${u} = (2~${u})`)), [], u);
    assert.deepEqual(plainSpaceNumbers(`50${u}`), [], `${u} with no space ("40°")`);
    assert.ok(plainSpaceNumbers(`50 ${u}`).length > 0, `${u}: plain space`);
    assert.ok(plainSpaceNumbers(nb(`2~${u} = 10 ${u}`)).length > 0, `${u}: second number`);
  }
});

test('the rule: numerals that are not ASCII digits need an allow-list entry; ASCII digits in a name are bare numbers', () => {
  assert.deepEqual(unlistedNumerals('U = ½ × k × x²', new Set(['½', '²'])), []);   // its own allow set: this page allows neither
  assert.deepEqual(unlistedNumerals('x₀ and R₁', new Set(['₀'])), ['₁']);
  assert.deepEqual(unlistedNumerals('R₁ ≈ ① ⅓', new Set(['₁'])), ['①', '⅓']);
  assert.deepEqual(unlistedNumerals('plain 12 digits', new Set()), []);
  assert.ok(bareNumbers(nb('R1 = 40~Ω')).some(b => b.startsWith('1 in')), 'R1 reads as the number 1');
  assert.deepEqual(bareNumbers(nb('R₁ = 40~m')), [], 'R₁ is a name once ₁ is allow-listed');
});

test('the lint itself: an unlisted numeral, a bare number and a plain space each make lint() fail its verdict', () => {
  const strings0 = seen.strings, numbers0 = seen.numbers, off0 = offenders.length, plain0 = plainSpace.length;
  assert.throws(() => lint('R₂ = 5' + nb('~m'), 'self-test'), /not allow-listed/);   // ₂ is not allow-listed; ₁ is, for M₁
  lint('self 7', 'selftest-bare');
  lint('self 7 m', 'selftest-plain');
  assert.equal(offenders.filter(o => o.startsWith('selftest-bare')).length, 1);
  assert.equal(plainSpace.filter(o => o.startsWith('selftest-plain')).length, 1);
  assert.throws(() => verdict('selftest-bare'), /without a unit/);
  assert.throws(() => verdict('selftest-plain'), /plain space/);
  // take the self-test strings back out, so the real verdicts and counts below are not affected by them
  offenders.length = off0; plainSpace.length = plain0; seen.strings = strings0; seen.numbers = numbers0;
});

// ---- the figure: every text of every state ----------------------------------------------------
test('unit lint: the figure (scene.js) for every state of the grid', () => {
  const before = seen.numbers;
  for (const s of STATES) {
    const svg = stubElement('svg');       // a fresh figure per state: what is drawn is exactly this state's text
    createScene(svg).render(s);
    for (const n of svg.children) if (n.tag === 'text') lint(nodeText(n), `scene ${JSON.stringify(s)}`);
  }
  enough('scene', seen.numbers - before, MEASURED_PER_STATE.scene);
  verdict('scene');
});

// ---- the page's static text -------------------------------------------------------------------
// Visible text of the template: tags dropped, plus the attributes a reader or a screen reader gets.
function templateStrings(html) {
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/&nbsp;/g, nb('~'))
    // A <sub> holding digits is a NAME, the 1 of M₁, exactly as a lowered tspan is in the figure.
    // Fold it into the Unicode subscript before the tags are stripped, or the split leaves a bare 1.
    .replace(/<sub>([0-9]+)<\/sub>/g, (_, d) => asSubscript(d));
  const out = [];
  for (const m of body.matchAll(/\b(?:aria-label|aria-valuetext|title|alt|placeholder)="([^"]*)"/g)) out.push(`attr: ${m[1]}`);
  for (const m of body.matchAll(/<title>([^<]*)<\/title>/g)) out.push(`title: ${m[1]}`);
  const visible = body.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<svg\b[\s\S]*?<\/svg>/g, ' ');
  // one string per element's text run, so a unit in the next element is not credited to a number before it
  for (const run of visible.replace(/<\/?(?:b|label)\b[^>]*>/g, '').split(/<[^>]*>/)) {
    const t = run.replace(/[ \t\r\n]+/g, ' ').trim();   // not \s: that would swallow the no-break spaces
    if (t) out.push(`text: ${t}`);
  }
  return out;
}

test('unit lint: the template (headings, scales, buttons, links, aria text)', () => {
  const strs = templateStrings(template);
  assert.ok(strs.length >= 8, `only ${strs.length} template strings`);
  assert.ok(strs.some(s => s.startsWith('attr:')), 'no aria text found');
  for (const f of SLIDER_FIELDS) {                // the scale labels of every slider were seen, with their numbers
    // J(unit) is the join this field really uses: a no-break space, or nothing at all for an angle ("360°").
    assert.ok(strs.some(s => s.includes(nb(fieldShow(f, f.min) + J(f.unit) + f.unit))), `${f.key}: its minimum label was not linted`);
    assert.ok(strs.some(s => s.includes(nb(fieldShow(f, f.max) + J(f.unit) + f.unit))), `${f.key}: its maximum label was not linted`);
  }
  for (const s of strs) lint(s, 'template');
  verdict('template');
});

function rig() {
  const parts = { reset: stubElement('button'), sliders: {}, readouts: {}, zeros: {}, marks: {} };
  for (const f of SLIDER_FIELDS) {
    parts.sliders[f.key] = stubElement('input');
    parts.readouts[f.key] = stubElement('b');
    if (f.snap) parts.zeros[f.key] = stubElement('span');
    if (f.mark) parts.marks[f.key] = stubElement('span');
  }
  const state = createState();
  return { parts, state, controls: createControls(stubElement(), state, parts) };
}

test('unit lint: each slider readout with the unit that follows it on the page, and its aria-valuetext', () => {
  // The readout node holds only the number; the page prints the unit right after it. Compose the sentence as the
  // template has it (the <b id="x-readout"> element's text replaced by what controls.js wrote).
  const sentence = (id) => {
    const m = template.match(new RegExp(`<b id="${id}"[^>]*>[^<]*</b>([^<]*)<`));
    assert.ok(m, `no <b id="${id}"> followed by text`);
    return m[1].replace(/&nbsp;/g, nb('~'));
  };
  const { parts, state, controls } = rig();
  const before = seen.numbers;
  for (const s of STATES) {
    state.set(s);
    controls.render(state.getState());
    for (const f of SLIDER_FIELDS) {
      lint(parts.readouts[f.key].textContent + sentence(`${f.id}-readout`), `controls ${f.key} readout ${s[f.key]}`);
      lint(parts.sliders[f.key].attrs['aria-valuetext'], `controls ${f.key} aria-valuetext ${s[f.key]}`);
    }
  }
  enough('controls', seen.numbers - before, MEASURED_PER_STATE.controls);
  verdict('controls');
});

// ---- the link note ----------------------------------------------------------------------------
// URLs built from FIELDS: for each input a valid, an off-step, an out-of-range, a pasted-minus, a junk and a very
// long value, alone and mixed, so every kind of note is produced.
const URLS = ['', '?foo=1&bar=2'];
for (const f of FIELDS) {
  const mid = f.default, off = f.min + 0.4 * f.step, far = f.max + 7 * f.step;
  URLS.push(`?${f.key}=${mid}`, `?${f.key}=${off}`, `?${f.key}=${far}`, `?${f.key}=-${far}`, `?${f.key}=−${f.step}`, `?${f.key}=-0`,
    `?${f.key}=.5`, `?${f.key}=1.`, `?${f.key}=+${mid}`, `?${f.key}=1e3`, `?${f.key}=abc`, `?${f.key}=12abc`, `?${f.key}=0x10`, `?${f.key}=1,5`,
    `?${f.key}=${'9'.repeat(60)}`, `?${f.key}=${'a1'.repeat(40)}`, `?${f.key}=` + '%F0%9F%98%80'.repeat(45), `?${f.key}=${mid + f.step / 1000}`);
}
URLS.push('?' + FIELDS.map(f => `${f.key}=${f.max}`).join('&'),
  '?' + FIELDS.map(f => `${f.key}=${f.min + 0.4 * f.step}`).join('&'),
  '?' + FIELDS.map((f, i) => `${f.key}=${i % 2 ? 'junk' : f.max + 9 * f.step}`).join('&'));

function stripEcho(p, text) {
  // The user's literal text after '=' in each ignored entry is theirs; the rest of the note is ours.
  let out = text;
  for (const entry of p.ignored) {
    const kept = entry.replace(/=.*(?= \([^()]*\)$)/s, '=ECHO');
    assert.ok(out.includes(entry), `the note lacks its ignored entry "${entry}"`);
    out = out.replace(entry, kept);
  }
  return out;
}

test('unit lint: the link note (describePresets) over a table of URLs built from FIELDS', () => {
  const before = seen.numbers;
  let withAdjusted = 0, withIgnored = 0;
  for (const search of URLS) {
    const p = parsePresets(search);
    if (p.adjusted.length) withAdjusted++;
    if (p.ignored.length) withIgnored++;
    lint(stripEcho(p, describePresets(p)), `link ${search.length > 60 ? search.slice(0, 30) + '...' : search}`);
  }
  assert.ok(withAdjusted >= 3 * FIELDS.length && withIgnored >= 5 * FIELDS.length, `table too thin: ${withAdjusted} adjusted, ${withIgnored} ignored`);
  assert.ok(seen.numbers - before >= 10 * FIELDS.length, `only ${seen.numbers - before} numbers checked in the link notes`);
  verdict('link');
});

test('the lint saw enough, and every allow-listed numeral really occurs on the page', () => {
  assert.ok(seen.strings > 4 * STATES.length, `strings checked: ${seen.strings}`);
  const perState = Object.values(MEASURED_PER_STATE).reduce((a, b) => a + b, 0);
  assert.ok(seen.numbers > floor(perState), `numbers checked: ${seen.numbers}`);
  const never = [...ALLOWED].filter(ch => !allowedSeen.has(ch));
  assert.deepEqual(never, [], `allow-listed but never shown (delete the entry): ${never.join(' ')}`);
});
