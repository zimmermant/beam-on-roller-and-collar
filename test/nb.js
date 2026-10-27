// A test helper (not a test file). A literal no-break space (U+00A0) in a source file looks exactly like a plain
// space, so nobody can type or review one reliably. Write expected strings with "~" where the page has a no-break
// space: nb('12~V') is '12' + U+00A0 + 'V'. test/nbsp.test.js fails if a literal one ever sneaks into src/ or test/.
export const NBSP = '\u00a0';
export const nb = (s) => s.replaceAll('~', NBSP);
