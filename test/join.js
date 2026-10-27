import { UNIT_JOIN } from '../src/fields.js';

// A test helper (not a test file): the text between a number and its unit, in the notation of nb(): '~' (a no-break space) for
// most units, or the UNIT_JOIN entry ('' for the degree sign). Build expected strings as nb(`${shown}${J(f.unit)}${f.unit}`).
export const J = (unit) => (Object.hasOwn(UNIT_JOIN, unit) ? UNIT_JOIN[unit] : '~');
