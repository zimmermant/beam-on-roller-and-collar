import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// A literal no-break space (U+00A0) in a source file looks exactly like a plain space in every editor, in diffs and in
// tool output, so nobody can type or review one reliably. Source and tests write it as an escape or as nb('~') (test/nb.js).
// This test fails if any file under src/, test/ or tools/ holds the literal character. The pattern is built from its
// code point so that THIS file does not contain the character either.
const NBSP_LITERAL = new RegExp(String.fromCharCode(0xa0));
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

test('no source, test or tool file contains a literal U+00A0', () => {
  const scanned = [];
  const bad = [];
  for (const dir of ['src', 'test', 'tools']) {
    for (const p of files(join(root, dir))) {
      scanned.push(p);
      const lines = readFileSync(p, 'utf8').split('\n');
      lines.forEach((line, i) => { if (NBSP_LITERAL.test(line)) bad.push(`${dir}/${p.slice(join(root, dir).length + 1)}:${i + 1}`); });
    }
  }
  assert.ok(scanned.length >= 20, `only ${scanned.length} files scanned`);
  assert.deepEqual(bad, [], `literal no-break space in: ${bad.join(', ')} (write an escape, or nb('...~...') in tests)`);
});

test('the scanner itself finds a literal no-break space and ignores a plain space', () => {
  assert.ok(NBSP_LITERAL.test('12' + String.fromCharCode(0xa0) + 'V'));
  assert.ok(!NBSP_LITERAL.test('12 V'));
  assert.equal(NBSP_LITERAL.source.length, 1);
});
