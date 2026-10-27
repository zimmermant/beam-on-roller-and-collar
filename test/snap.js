import { FIELDS } from '../src/fields.js';

// A test helper (not a test file): tests that need an input with a snap zone (keyboard jump, zero label) skip themselves
// when no FIELDS entry has `snap` (a quantity with no zero). Use it as the options argument:
//   test('...', NEEDS_SNAP, () => { ... uses FIRST_SNAP ... });
// A skipped test is not a failure; tools/mutations.mjs knows it and does not list it as uncovered in that case.
export const FIRST_SNAP = FIELDS.find(f => f.snap);
export const NEEDS_SNAP = FIRST_SNAP ? {} : { skip: 'no input has snap' };

// Same for `mark` (a labelled critical value that is not snapped to).
export const FIRST_MARK = FIELDS.find(f => f.mark);
export const NEEDS_MARK = FIRST_MARK ? {} : { skip: 'no input has mark' };
