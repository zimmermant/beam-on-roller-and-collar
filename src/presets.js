import { FIELDS, fieldSnap, fieldShow, fieldText, unitText } from './fields.js';

// Optional URL parameters that preset a setup, one per input in FIELDS, by its key:   ?f=50&dir=215
// Presets are configuration read once at load, held OUTSIDE the state. Every number goes through the same
// snapping as its slider (fieldSnap) and a change you could see is reported.
//
// The note names each input by its LABEL ("Load magnitude"), not by its symbol and not by its URL key.
// A symbol with a subscript (F_B) cannot be written into a plain-text node as a real subscript, and an
// ASCII underscore must never reach the screen; a label has neither problem and reads better in a
// sentence. The whole note goes into the page through textContent, so no URL text can become markup.

const PRESET_NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
// Characters of a rejected value echoed back. Kept short on purpose: the note sits in the reading
// panel, and the page has to fit a Canvas iframe without scrolling, so a long echo that wraps onto a
// fourth line pushes the bottom of the page out of view. Measured at both viewport budgets with the
// worst link there is -- every field rejected, so every field echoed. Enough to recognise what was typed.
export const PRESET_SHOWN_MAX = 14;

function presetNumber(text) {
  // The page prints a real minus sign (U+2212), so a number pasted from the screen starts with one.
  const s = text.trim().replace(/^−/, '-');
  if (!PRESET_NUMBER.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;           // 400 digits overflow to Infinity
}

// A rejected value is echoed back, but a 2,000-character one would overflow the page.
function presetShown(raw) {
  const chars = Array.from(raw);
  return chars.length > PRESET_SHOWN_MAX ? chars.slice(0, PRESET_SHOWN_MAX).join('') + '…' : raw;
}

// Reads one field's number. Returns the snapped value, or undefined (and an ignored note) when it is not a number.
function presetValue(f, raw, out) {
  const n = presetNumber(raw);
  if (n === null) {
    out.ignored.push(`${f.label} = ${presetShown(raw)} (use a number of ${f.unit})`);
    return undefined;
  }
  const s = fieldSnap(f, n);
  // Compare what would be PRINTED: a snap too small to show is no news.
  if (fieldShow(f, n) !== fieldShow(f, s)) {
    out.adjusted.push(`${f.label} ${unitText(fieldShow(f, n), f.unit)} → ${unitText(fieldShow(f, s), f.unit)}`);
  }
  return s;
}

// -> { values: { key: snapped value, only for keys the link set }, adjusted: [...], ignored: [...] }
export function parsePresets(search, fields = FIELDS) {
  const q = new URLSearchParams(search || '');
  const out = { values: {}, adjusted: [], ignored: [] };
  for (const f of fields) {
    const raw = q.get(f.key);
    if (raw === null) continue;
    const v = presetValue(f, raw, out);
    if (v !== undefined) out.values[f.key] = v;
  }
  return out;
}

export function describePresets(p, fields = FIELDS) {
  const set = fields.filter(f => p.values[f.key] !== undefined)
    .map(f => `${f.label} = ${fieldText(f, p.values[f.key])}`);
  const parts = [];
  if (set.length) parts.push(`From the link: ${set.join(', ')}.`);
  else if (p.adjusted.length || p.ignored.length) parts.push('From the link: nothing set.');
  if (p.adjusted.length) parts.push(`Adjusted: ${p.adjusted.join('; ')}.`);
  if (p.ignored.length) parts.push(`Ignored: ${p.ignored.join('; ')}.`);
  return parts.join(' ');
}
