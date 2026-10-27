import test from 'node:test';
import assert from 'node:assert/strict';
import { MINUS, NBSP, fmt, fmtFixed, withUnit, unfmt } from '../src/format.js';
import { nb } from './nb.js';

test('MINUS is U+2212 and NBSP is U+00A0', () => {
  assert.equal(MINUS.codePointAt(0), 0x2212);
  assert.equal(NBSP.codePointAt(0), 0xa0);
  assert.equal(NBSP.length, 1);
});

test('fmt: true minus, no -0, trailing zeros trimmed, non-finite is a dash', () => {
  assert.equal(fmt(-5.3333), '−5.33');
  assert.equal(fmt(-0.001), '0');
  assert.equal(fmt(-0), '0');
  assert.equal(fmt(200), '200');
  assert.equal(fmt(1.5), '1.5');
  assert.equal(fmt(1.5, 0), '2');
  for (const v of [NaN, Infinity, null, undefined]) assert.equal(fmt(v), '—');
});

test('fmtFixed: always dp decimals, true minus, never -0.00', () => {
  assert.equal(fmtFixed(0.2), '0.20');
  assert.equal(fmtFixed(0), '0.00');
  assert.equal(fmtFixed(-0), '0.00');
  assert.equal(fmtFixed(-0.001), '0.00');
  assert.equal(fmtFixed(-0.004), '0.00');
  assert.equal(fmtFixed(-0.3), '−0.30');
  assert.equal(fmtFixed(-12), '−12.00');
  assert.equal(fmtFixed(2.5, 0), '3');
  assert.equal(fmtFixed(-0.4, 0), '0');
  for (const v of [NaN, Infinity, -Infinity, null, undefined]) assert.equal(fmtFixed(v), '—');
});

test('withUnit joins with a no-break space', () => {
  assert.equal(withUnit('50', 'N/m'), nb('50~N/m'));
  assert.ok(!withUnit('50', 'N/m').includes(' '));
});

test('unfmt is the inverse of the printing functions, true minus included', () => {
  assert.equal(unfmt('−0.30'), -0.3);
  assert.equal(unfmt('12'), 12);
  assert.equal(unfmt(fmt(-5.3333)), -5.33);
  assert.equal(unfmt(fmtFixed(0.2)), 0.2);
  assert.ok(Number.isNaN(unfmt('—')));
});

test('nb(): "~" becomes U+00A0 and nothing else changes', () => {
  assert.equal(nb('12~V'), '12' + NBSP + 'V');
  assert.equal(nb('a b'), 'a b');
  assert.equal(nb('~~'), NBSP + NBSP);
});
