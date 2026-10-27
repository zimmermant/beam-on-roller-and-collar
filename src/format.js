export const MINUS = '−';           // U+2212, the true minus sign

// A number and its unit are never separated by a line break: the space between them is a no-break space (U+00A0).
// Written as an ESCAPE on purpose: a literal U+00A0 looks exactly like a plain space in every editor. A test
// (test/nbsp.test.js) fails if any source or test file contains the literal character.
export const NBSP = '\u00a0';

// The only way a number reaches the screen. Rounds here and nowhere else; a null or non-finite value prints as a
// dash; and negative zero can never appear, because String(-0) is "0" and Number("-0.00") is -0.
export function fmt(n, dp = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const s = String(Number(n.toFixed(dp)));
  return s.startsWith('-') ? MINUS + s.slice(1) : s;
}

// Always exactly dp decimals ("0.20", "0.00"): for readings whose trailing zeros are part of the reading.
// A tiny negative that rounds to zero prints "0.00" (toFixed keeps the sign: (-0.001).toFixed(2) is "-0.00").
export function fmtFixed(n, dp = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  let s = n.toFixed(dp);
  if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
  return s.startsWith('-') ? MINUS + s.slice(1) : s;
}

// Already-formatted text and its unit, joined the one allowed way: a no-break space, unless `join` says otherwise
// (the degree sign prints "40°": see UNIT_JOIN in fields.js, which passes it).
export function withUnit(text, unit, join = NBSP) {
  return `${text}${join}${unit}`;
}

// The inverse of fmt / fmtFixed: printed text (with a true minus sign) back to a number.
export function unfmt(text) {
  return Number(String(text).replace(MINUS, '-'));
}

// A label as SEGMENTS -- [{ t: 'F' }, { t: 'B', sub: true }] -- read back as plain text. Segments are how
// every symbol with a subscript travels: each renderer draws the `sub` ones as a real subscript (a <sub>
// element, a lowered tspan), and this is the only way to get the whole label back as a string, for the
// unit lint and for the tests. A plain string is allowed and means a single segment.
export function segPlain(segs) {
  return typeof segs === 'string' ? segs : segs.map(s => (s.sub ? asSubscript(s.t) : s.t)).join('');
}

// A digit in a SUBSCRIPT is part of a name, not a quantity: the 1 of M₁ is no more a number than the
// B of F_B. The figure draws it as an ordinary lowered '1', but the plain-text form uses the Unicode
// subscript, because the unit lint reads an ASCII digit as a bare number with no unit after it and
// would reject the label. Letters are left alone: there is no Unicode subscript for most of them.
const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

export function asSubscript(text) {
  return String(text).replace(/[0-9]/g, (d) => SUBSCRIPT_DIGITS[Number(d)]);
}
