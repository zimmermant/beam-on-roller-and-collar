import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELDS, SLIDER_FIELDS, UNIT_JOIN, fieldShow } from '../src/fields.js';
import { parsePresets } from '../src/presets.js';
import { PAGES } from '../build.js';
import { VB } from '../src/layout.js';

// The page is the four diagrams and one slider. These tests pin that down as text: that the slider
// really is there with the table's range, that the inputs WITHOUT a slider really have none, and
// that nothing else crept back in.
const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const html = readFileSync(join(src, 'index.template.html'), 'utf8');
const css = readFileSync(join(src, 'styles.css'), 'utf8');
const count = (s, re) => (s.match(re) || []).length;
const sepHtml = (unit) => (Object.hasOwn(UNIT_JOIN, unit) ? UNIT_JOIN[unit] : '&nbsp;');
const symHtml = (f) => (f.sub ? `${f.symbol}<sub>${f.sub}</sub>` : f.symbol);

test('one page, and it has both inline markers exactly once', () => {
  assert.equal(PAGES.length, 1);
  assert.equal(PAGES[0].template, 'index.template.html');
  for (const marker of ['<!--INLINE_CSS-->', '<!--INLINE_JS-->']) {
    assert.equal(count(html, new RegExp(marker, 'g')), 1, marker);
  }
});

test('every id app.js looks up is in the page', () => {
  const app = readFileSync(join(src, 'app.js'), 'utf8');
  const ids = [...app.matchAll(/getElementById\('([\w-]+)'\)/g)].map(m => m[1]);
  assert.ok(ids.length >= 4, `only ${ids.length} ids found in app.js`);
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), `#${id} is missing from the page`);
});

test('the figure is the one the layout draws, and is left to letterbox itself', () => {
  const m = html.match(/<svg id="fig" viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(m, 'no <svg id="fig" viewBox="0 0 w h">');
  assert.deepEqual([Number(m[1]), Number(m[2])], [VB.w, VB.h]);
  assert.ok(!/preserveAspectRatio/.test(html), 'the default "meet" is what fits the figure to the window');
  assert.ok(/role="img"/.test(html) && /aria-label="[^"]{120,}"/.test(html), 'the figure needs a real description');
});

test('the input that HAS a slider has all of its parts, with the table\'s range', () => {
  for (const f of SLIDER_FIELDS) {
    const slider = html.match(new RegExp(`<input type="range" id="${f.id}-slider" min="(-?[\\d.]+)" max="(-?[\\d.]+)" step="([\\d.]+)" value="(-?[\\d.]+)"`));
    assert.ok(slider, `${f.key}: no range input with min, max, step and value`);
    assert.deepEqual(slider.slice(1).map(Number), [f.min, f.max, f.step, f.default], `${f.key}: the page's range differs from FIELDS`);
    const want = `<label for="${f.id}-slider"><b>${f.label}</b></label> ${symHtml(f)} = <b id="${f.id}-readout" class="readout">${fieldShow(f, f.default)}</b>${sepHtml(f.unit)}${f.unit}`;
    assert.ok(html.includes(want), `${f.key}: the heading line must read ${want}`);
    for (const end of [f.min, f.max]) {
      const shown = (end > 0 && f.snap ? '+' : '') + fieldShow(f, end);
      assert.ok(html.includes(`<span>${shown}${sepHtml(f.unit)}${f.unit}`), `${f.key}: no scale label "${shown}"`);
    }
  }
});

test('the inputs with no slider really have none, and the page says how they are set', () => {
  for (const f of FIELDS.filter(g => g.noSlider)) {
    assert.ok(!html.includes(`${f.id}-slider`), `${f.key} should have no slider`);
    assert.ok(!html.includes(`${f.id}-readout`), `${f.key} should have no readout`);
  }
  assert.equal(count(html, /<input\b/g), SLIDER_FIELDS.length, 'exactly one input per slider field, and no others');
  assert.ok(/the load is dragged/.test(html), 'the page has to say where the load comes from');
});

test('the marked zero: a tick and a label that lights up, for the snap field and no other', () => {
  const snapFields = SLIDER_FIELDS.filter(f => f.snap);
  assert.ok(snapFields.length >= 1, 'the applied couple is symmetric about zero and should snap there');
  assert.equal(count(html, /<i class="zt"><\/i>/g), snapFields.length, 'one zero tick per snap field');
  assert.equal(count(html, /class="zero-label"/g), snapFields.length);
  for (const f of snapFields) assert.ok(html.includes(`id="${f.id}-zero" class="zero-label"`), `${f.key}`);
  assert.ok(css.includes('.zero-label.on'), 'the zero label lights up when the slider sits on it');
});

test('nothing from the fuller page crept back in: no reading panel, no reset, no second page', () => {
  for (const id of ['calc', 'reset', 'status']) assert.ok(!html.includes(`id="${id}"`), `#${id} should not be here`);
  assert.equal(count(html, /<button\b/g), 0, 'the only interaction is the drag and the one slider');
  assert.ok(html.includes('id="from-link"'), 'but a link that presets the page still says so');
});

test('the page is exactly the window tall and never scrolls', () => {
  assert.ok(/body\s*\{[^}]*height:\s*100vh/.test(css));
  assert.ok(/body\s*\{[^}]*overflow:\s*hidden/.test(css));
  assert.ok(/\.fig-fill\s*\{[^}]*position:\s*relative/.test(css));
  assert.ok(/#fig\s*\{[^}]*position:\s*absolute/.test(css));
});

test('the slider shows every state it can be in, in both engines', () => {
  for (const sel of ['::-webkit-slider-thumb', '::-moz-range-thumb']) {
    assert.ok(css.includes(`input[type=range]:hover${sel}`), `the thumb needs a hover style for ${sel}`);
    assert.ok(css.includes(`input[type=range]:active${sel}`), `and an active one for ${sel}`);
    assert.ok(css.includes(`input[type=range]:focus-visible${sel}`), `and a focus one for ${sel}`);
  }
});

test('a subscript on the page is pinned at the 12 px floor, not left to the browser', () => {
  assert.ok(/#controls sub\s*\{[^}]*font-size:\s*12px/.test(css),
    'the browser default is 83% of the parent, which lands within a whisker of the floor');
  assert.ok(/<sub>/.test(html), 'and the page really has a subscript to pin');
});

test('the applied couple is measured in newton metres, not newtons', () => {
  const m = FIELDS.find(f => f.unit === 'N·m');
  assert.ok(m, 'no input is measured in N·m: a couple moment must be');
  assert.equal(m.unitWord, 'newton metres');
  assert.ok(html.includes('N·m'), 'and the page prints it with a centred dot');
  assert.ok(!/\bN\.m\b/.test(html), 'a period is not a centred dot');
});

test('the drag handle shows every state it can be in', () => {
  for (const state of [':hover', ':focus-visible']) {
    assert.ok(css.includes(`.load-handle${state}`), `the handle needs a ${state} style`);
  }
  assert.ok(css.includes('.dragging'), 'and a grabbed state');
});

test('the example in the page\'s own aria text is honest about what can be dragged', () => {
  const aria = html.match(/aria-label="([^"]*)"/)[1];
  assert.ok(/drag/i.test(aria));
  assert.ok(!/\d/.test(aria), 'digits in aria text read as bare numbers: spell them out');
});

test('a link can preset every input, including the ones with no slider', () => {
  const q = '?' + FIELDS.map(f => `${f.key}=${f.default}`).join('&');
  const p = parsePresets(q);
  for (const f of FIELDS) assert.equal(p.values[f.key], f.default, f.key);
  assert.deepEqual(p.ignored, []);
});
