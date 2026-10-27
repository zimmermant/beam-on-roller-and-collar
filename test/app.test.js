import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubElement } from './stub-dom.js';
import { FIELDS, SLIDER_FIELDS, fieldShow, fieldText, fieldSnap } from '../src/fields.js';
import { PRESET_SHOWN_MAX } from '../src/presets.js';
import { VB } from '../src/layout.js';
import { nb } from './nb.js';
import { J } from './join.js';

const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.template.html'), 'utf8');
const IDS = ['fig', 'stage', 'controls', 'from-link'];
for (const f of SLIDER_FIELDS) {
  IDS.push(`${f.id}-slider`, `${f.id}-readout`);
  if (f.snap) IDS.push(`${f.id}-zero`);
  if (f.mark) IDS.push(`${f.id}-mark`);
}
let boots = 0;

// Runs src/app.js against a stub page, as the browser does on load: the module wires everything and
// draws once. Each call imports a fresh copy (the query string defeats the module cache).
async function boot(search) {
  const els = {};
  for (const id of IDS) els[id] = stubElement(id === 'fig' ? 'svg' : 'div');
  els['from-link'].hidden = true;
  els.stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: VB.w, height: VB.h });
  globalThis.document = {
    title: '',
    getElementById: (id) => { assert.ok(els[id], `app.js looked up #${id}, which the page lacks`); return els[id]; },
    createElementNS: (ns, name) => stubElement(name)
  };
  globalThis.location = { search };
  await import(`../src/app.js?boot=${++boots}`);
  const texts = () => els.fig.children.filter(n => n.tag === 'text')
    .map(n => n.textContent || n.children.map(c => c.textContent).join(''));
  const readout = (f) => els[`${f.id}-readout`].textContent;
  return { els, texts, readout };
}
const query = (pairs) => '?' + pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

test('page load with no parameters: titled like the page, drawn, defaults in the slider, note hidden', async () => {
  const { els, texts, readout } = await boot('');
  assert.equal(document.title, template.match(/<title>([^<]*)<\/title>/)[1], 'the title and the page must agree');
  assert.ok(texts().length >= 15, `only ${texts().length} labels drawn`);
  assert.ok(texts().some(t => t === 'The situation'));
  assert.ok(texts().some(t => t === 'The forces tip to tail'), 'all four panels are drawn');
  for (const f of SLIDER_FIELDS) {
    assert.equal(readout(f), fieldShow(f, f.default), f.key);
    assert.equal(els[`${f.id}-slider`].value, String(f.default), f.key);
    assert.equal(els[`${f.id}-slider`].attrs['aria-valuetext'], nb(`${fieldShow(f, f.default)}~${f.unitWord}`));
  }
  assert.equal(els['from-link'].hidden, true);
  assert.equal(els['from-link'].textContent, '');
  assert.ok(els.fig.children.some(n => (n.attrs.class || '').includes('load-handle')), 'the drag handle is drawn');
});

test('a link presets every input, including the two with no slider, and says so as TEXT', async () => {
  const { els, texts } = await boot('?f=80&dir=180&m=-40');
  assert.equal(els['from-link'].hidden, false);
  assert.equal(els['from-link'].innerHTML, '', 'the note is written with textContent, never as markup');
  const note = els['from-link'].textContent;
  for (const f of FIELDS) assert.ok(note.includes(f.label), `${f.key} is not named in the note`);
  assert.ok(note.includes(nb('80~N')) && note.includes('180°') && note.includes(nb('−40~N·m')), note);
  // and the figure is drawn from those values, not from the defaults
  assert.ok(texts().some(t => t === nb('F' + 'B 80~N')), texts().join(' | '));
});

test('the presets are applied BEFORE the first draw, so the defaults never flash', async () => {
  const { texts } = await boot('?f=20&dir=90&m=0');
  const shown = texts().join(' | ');
  assert.ok(shown.includes(nb('F' + 'B 20~N')), shown);
  assert.ok(!shown.includes(nb('F' + 'B 50~N')), 'the default load was drawn at least once');
});

test('the zero label lights up exactly when the snapped input sits on zero', async () => {
  for (const f of SLIDER_FIELDS.filter(g => g.snap)) {
    const on = await boot(query([[f.key, 0]]));
    assert.ok((on.els[`${f.id}-zero`].attrs.class || '').includes('on'), `${f.key}: not lit at zero`);
    const off = await boot(query([[f.key, f.max]]));
    assert.ok(!(off.els[`${f.id}-zero`].attrs.class || '').includes('on'), `${f.key}: lit away from zero`);
  }
});

test('moving the slider redraws the figure and the readout', async () => {
  const { els, texts, readout } = await boot('');
  const f = SLIDER_FIELDS[0];
  const before = texts().join('|');
  els[`${f.id}-slider`].value = String(f.max);
  els[`${f.id}-slider`].fire('input', {});
  assert.equal(readout(f), fieldShow(f, f.max));
  assert.notEqual(texts().join('|'), before, 'the figure did not follow the slider');
});

test('dragging the load redraws the whole figure', async () => {
  const { els, texts } = await boot('?f=40&dir=270&m=0');
  const { handleSpot } = await import('../src/interact.js');
  const before = texts().find(t => /^FB/.test(t));
  const spot = handleSpot({ f: 40, dir: 270, m: 0 });
  const ev = (type, x, y) => els.stage.fire(type, { type, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, target: null, preventDefault() {} });
  ev('pointerdown', spot.x, spot.y);
  ev('pointermove', spot.x, spot.y - 30);
  ev('pointerup', spot.x, spot.y - 30);
  const after = texts().find(t => /^FB/.test(t));
  assert.notEqual(after, before, 'either the drag is not attached or nothing redraws');
  assert.equal(after, nb('F' + 'B 70~N'));
});

test('a hostile parameter reaches the page only as text, cut short', async () => {
  const bad = '<img src=x onerror=alert(1)>' + 'z'.repeat(60);
  const { els } = await boot(query([[FIELDS[0].key, bad]]));
  assert.equal(els['from-link'].innerHTML, '');
  assert.ok(els['from-link'].textContent.includes(Array.from(bad).slice(0, PRESET_SHOWN_MAX).join('') + '…'));
  assert.ok(!els['from-link'].textContent.includes('alert(1)'));
});

test('an unknown parameter is ignored silently, and the note stays hidden', async () => {
  const { els } = await boot('?wobble=3');
  assert.equal(els['from-link'].hidden, true);
  assert.equal(els['from-link'].textContent, '');
});

test('a value off the slider grid is snapped, and the note says it was', async () => {
  const f = SLIDER_FIELDS[0];
  const off = f.min + 0.4 * f.step + f.step;
  const { els, readout } = await boot(query([[f.key, off]]));
  assert.equal(readout(f), fieldShow(f, fieldSnap(f, off)));
  assert.ok(els['from-link'].textContent.includes('Adjusted'), els['from-link'].textContent);
  assert.ok(els['from-link'].textContent.includes(fieldText(f, fieldSnap(f, off))));
});
