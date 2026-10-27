import { fmtFixed, withUnit } from './format.js';

// ======================================================================================================
// THE FIELDS TABLE: the one place that says what the learner can set.
//
// This simulation stores only the applied load: its magnitude and its direction. The beam's geometry is
// fixed (physics.js), and every force is derived.
//
//   key       name in the state and in a URL preset (?f=50). Short, lower-case letters.
//   id        stem of the DOM ids: #<id>-slider, #<id>-readout (and #<id>-mark when `mark` is set)
//   label     the heading shown above the slider
//   symbol    the physics symbol, as its BASE letter only ("F", "θ"). An ASCII digit in a name is a bare
//             number to the unit lint, so a name that needs one takes `sub` instead.
//   sub       OPTIONAL subscript, rendered as a real subscript everywhere it is shown: <sub> in HTML, a
//             lowered tspan in SVG, a <sub> node in the link note. NEVER an ASCII underscore on screen.
//             Todd's rule: a force is never named after a point, so the load is F_B, not B.
//   subWord   OPTIONAL: `sub` as it should be SPOKEN, for aria text ("B", "x"). Required with `sub`.
//   min, max, step   the slider's range; min and max are whole multiples of step
//   unit      printed after a number; must be listed in test/unit-rule.js UNITS, with its word in UNIT_WORDS
//   unitWord  the same unit in words, for aria-valuetext
//   default   the starting value (on the grid)
//   decimals  decimals printed and kept
//   mark      OPTIONAL: a critical value, STRICTLY inside the range, shown but never snapped to:
//             { value, label }. The load magnitude has none -- nothing is special about a magnitude
//             except zero, and zero is the slider's own left-hand end, where its scale label names it.
//   snap      OPTIONAL, for a slider symmetric about zero (here the applied couple, which can turn
//             either way): { zone, jump }. |value| <= zone snaps to exactly 0, and a keyboard nudge
//             from 0 lands on +/-jump so the arrow keys can leave the zone.
//   noSlider  OPTIONAL: this input has no slider on the page and is set some other way (the load is
//             dragged). It is still stored, still snapped, and can still be set by a link.
// ======================================================================================================
export const FIELDS = [
  // Set by DRAGGING the load arrow, not by a slider: this page shows the four diagrams and one
  // slider, and the load is the thing you take hold of. `noSlider` keeps the controls, the template
  // and the browser harness from looking for a slider that is not there.
  { key: 'f', id: 'f', label: 'Load magnitude', symbol: 'F', sub: 'B', subWord: 'B',
    min: 0, max: 80, step: 5, unit: 'N', unitWord: 'newtons', default: 50, decimals: 0, noSlider: true },
  { key: 'dir', id: 'dir', label: 'Load direction', symbol: 'θ',
    min: 0, max: 360, step: 5, unit: '°', unitWord: 'degrees', default: 270, decimals: 0, noSlider: true },
  // The applied couple is the one thing with a slider. It is symmetric about zero -- a couple can
  // turn either way -- so it gets a snap zone there, which is the marked value its scale shows.
  { key: 'm', id: 'm', label: 'Applied couple', symbol: 'M', sub: '1', subWord: 'one',
    min: -200, max: 200, step: 10, unit: 'N·m', unitWord: 'newton metres', default: 60, decimals: 0,
    snap: { zone: 10, jump: 20 } }
];

// The inputs that really have a slider on the page. Everything that builds or checks a slider reads
// this, not FIELDS; everything about state, presets and snapping still reads FIELDS.
export const SLIDER_FIELDS = FIELDS.filter(f => !f.noSlider);

// An angle prints "270°", with nothing between the number and the unit. Every other unit is joined by U+00A0.
export const UNIT_JOIN = { '°': '' };

// ------------------------------------------------------------------------------------------------------
// Below this line everything is generic: no edit needed.
// ------------------------------------------------------------------------------------------------------

export function fieldByKey(key) {
  const f = FIELDS.find(g => g.key === key);
  if (!f) throw new Error(`no input called "${key}"`);
  return f;
}

export function fieldDefaults() {
  return Object.fromEntries(FIELDS.map(f => [f.key, f.default]));
}

// Raw slider value -> allowed value: clamp, round to whole steps and clean the float noise by rounding to the
// field's decimals; a snap zone collapses to a literal 0. Non-finite input becomes 0 for a snap field and the
// minimum otherwise. The result is never -0.
export function fieldSnap(f, v) {
  if (!Number.isFinite(v)) return f.snap ? 0 : f.min;
  const clamped = Math.max(f.min, Math.min(f.max, v));
  const stepped = Number((Math.round(clamped / f.step) * f.step).toFixed(f.decimals));
  return f.snap && Math.abs(stepped) <= f.snap.zone ? 0 : stepped;
}

// Slider input handler. Only a field with `snap` jumps past its zero zone on a keyboard step.
export function fieldNext(f, prev, raw, viaKeyboard) {
  const snapped = fieldSnap(f, raw);
  if (f.snap && viaKeyboard && prev === 0 && snapped === 0 && raw !== 0 && Number.isFinite(raw)) {
    return raw > 0 ? f.snap.jump : -f.snap.jump;
  }
  return snapped;
}

// The value as printed: fixed decimals, true minus sign, never -0.
export function fieldShow(f, v) {
  return fmtFixed(v, f.decimals);
}

// A printed number and its unit, joined by a no-break space or as UNIT_JOIN says.
export function unitText(text, unit, joins = UNIT_JOIN) {
  return withUnit(text, unit, Object.hasOwn(joins, unit) ? joins[unit] : undefined);
}

// The value with its unit.
export function fieldText(f, v, joins = UNIT_JOIN) {
  return unitText(fieldShow(f, v), f.unit, joins);
}

// A symbol as SEGMENTS, so every renderer can draw a real subscript and none has to parse a string:
// [{ t: 'F' }, { t: 'B', sub: true }]. The only way a symbol reaches the screen.
export function fieldSymbol(f) {
  return f.sub ? [{ t: f.symbol }, { t: f.sub, sub: true }] : [{ t: f.symbol }];
}

// The same symbol as it should be SPOKEN ("F sub B"), for aria text. Digits are spelled out by subWord.
export function fieldSymbolWord(f) {
  return f.sub ? `${f.symbol} sub ${f.subWord}` : f.symbol;
}
