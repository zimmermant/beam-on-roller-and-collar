// The unit lint's rule (a helper, not a test file): shared by test/units.test.js, and mutated by tools/rows-generic.mjs
// (rows for 'test/unit-rule.js') so the tests of the rule itself are shown to fail when the rule is broken.
import { NBSP } from './nb.js';

// >>> EDIT THIS: replace with YOUR simulation's units. <<<
// It lists three kinds of thing, longest first (a test enforces the order):
//   - unit symbols: 'N/m', 'N·m', 'N', 'm', 'J', 'Ω', '°', 'V', 's', 'm/s', ...
//   - the words your aria text uses (a FIELDS entry's unitWord, e.g. 'newtons per metre' starts with 'newtons'):
//     'newtons', 'metres', 'joules', 'volts', 'ohms'. A number in aria text still needs a listed unit after it.
//   - prefixed forms ('mA') BEFORE the unit they contain ('A'). Or avoid prefixes: see the README, "Symbols,
//     subscripts and units".
// The regex below is built from this list; nothing else needs to change. Any BMP symbol works ('Ω', '°'). The
// whole-word lookahead only looks at ASCII letters, digits and '/', so '40 Ωm' is still rejected (the m is).
// A single-letter unit (V, A) cannot be told from a variable: "2 V" passes whether it means volts or 2 times V.
// UNIT_WORDS: each FIELDS unit symbol and the word(s) its aria text uses (a test ties every field's unit to its unitWord,
// so "m" cannot quietly be announced as "kilograms"). Words starting with a listed word are accepted by the lint.
export const UNIT_WORDS = { 'N': 'newtons', '°': 'degrees', 'm': 'metres', 'N·m': 'newton metres' };
export const UNITS = ['newton metres', 'newtons', 'degrees', 'metres', 'N·m', 'N', 'm', '°'];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');

// A number: optional sign (U+2212 or hyphen-minus), digits with optional decimals, or '.5'. A full stop after digits
// ends a sentence ('→ 0.'), it is not a decimal point. An exponent belongs to its number: fmt prints a pasted
// 1e60 as '1e+60' (a quirk of Number.toFixed beyond 1e21), and the unit follows the whole token.
export const NUMBER = /[−-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?/g;
export { NBSP };
// Its unit: optionally one space, then a unit from UNITS as a whole word (so "4 metre" is NOT a unit).
// The space between a number and its unit must be a NO-BREAK SPACE (U+00A0), so a line break can never separate
// them: a plain space there is its own offence (plainSpaceNumbers), checked by every source.
export const UNIT_AFTER = new RegExp(`^[ \\u00a0]?(?:${UNITS.map(escapeRe).join('|')})(?![A-Za-z0-9\\/])`);

// Returns the numbers in `str` that are not followed by a unit.
export function bareNumbers(str) {
  const bad = [];
  for (const m of str.matchAll(NUMBER)) {
    const after = str.slice(m.index + m[0].length);
    if (!UNIT_AFTER.test(after)) bad.push(`${m[0]} in "${str}"`);
  }
  return bad;
}

// Returns the numbers whose unit follows a PLAIN space (a line break could fall between them).
export function plainSpaceNumbers(str) {
  const bad = [];
  for (const m of str.matchAll(NUMBER)) {
    const after = str.slice(m.index + m[0].length);
    if (UNIT_AFTER.test(after) && after.startsWith(' ')) bad.push(`${m[0]} in "${str}"`);
  }
  return bad;
}

// Returns the characters of `str` that are numeric but not ASCII digits (½, ², ₀, ...) and not in `allow`. Each allowed
// character needs a reason in the allow-list (test/units.test.js): a name's subscript (x₀, R₁), a dimensionless
// fraction (½), an exponent (²). Anything else is a number the digit lint cannot see.
export function unlistedNumerals(str, allow) {
  const bad = [];
  for (const ch of str) {
    if (/\p{N}/u.test(ch) && !/[0-9]/.test(ch) && !allow.has(ch)) bad.push(ch);
  }
  return bad;
}
