import test from 'node:test';
import assert from 'node:assert/strict';
import { stubElement, installSvgDocument } from './stub-dom.js';
import { createScene, forceLabel, coupleLabel, metreLabel } from '../src/scene.js';
import { segPlain, asSubscript } from '../src/format.js';
import { TEXT, VB, PANELS, FORCE_U, METRE_U, beamPoints } from '../src/layout.js';
import { derive, X1, X2, SPAN } from '../src/physics.js';
import { handleSpot } from '../src/interact.js';
import { STATES } from './grid.js';
import { nb } from './nb.js';

installSvgDocument();

const has = (n, ...cs) => cs.every(c => (n.attrs.class || '').split(/\s+/).includes(c));
const textOf = (n) => (n.textContent ||
  n.children.map(c => ((c.attrs.class || '').includes('sb') ? asSubscript(c.textContent) : c.textContent)).join(''));

function draw(s) {
  const svg = stubElement('svg');
  createScene(svg).render(s);
  const texts = svg.children.filter(n => n.tag === 'text');
  return {
    svg, texts,
    strings: texts.map(textOf),
    shafts: svg.children.filter(n => has(n, 'shaft') && n.tag === 'line'),
    arcs: svg.children.filter(n => has(n, 'couple', 'arc')),
    arcHeads: svg.children.filter(n => has(n, 'couple', 'head')),
    heads: svg.children.filter(n => has(n, 'arrow', 'head')),
    pieces: svg.children.filter(n => has(n, 'arrow', 'shaft')),
    find: (c) => svg.children.find(n => has(n, c))
  };
}
const partsOf = (d, ...cs) => ({
  shafts: d.pieces.filter(n => has(n, ...cs)),
  head: d.heads.find(n => has(n, ...cs))
});
const startOf = (p) => ({ x: Number(p.shafts[0].attrs.x1), y: Number(p.shafts[0].attrs.y1) });
const tipOf = (head) => {
  const m = head.attrs.d.match(/L([-\d.]+) ([-\d.]+) L/);
  return { x: Number(m[1]), y: Number(m[2]) };
};
const lineBox = (n) => ({
  x0: Math.min(Number(n.attrs.x1), Number(n.attrs.x2)), x1: Math.max(Number(n.attrs.x1), Number(n.attrs.x2)),
  y0: Math.min(Number(n.attrs.y1), Number(n.attrs.y2)), y1: Math.max(Number(n.attrs.y1), Number(n.attrs.y2))
});

// ---- the structure the browser harness depends on ----------------------------------------------
test('every graphic is a TOP-LEVEL element with class g, and every label a top-level text.t', () => {
  const { svg } = draw({ f: 50, dir: 215, m: 60 });
  for (const n of svg.children) {
    if (n.tag === 'text') assert.ok(has(n, 't'), `a text without class t: ${textOf(n)}`);
    else assert.ok(has(n, 'g'), `a ${n.tag} without class g`);
    assert.equal(n.parent, svg, 'nothing is nested: the harness only measures top-level nodes');
  }
});

test('every label clears the 12 px floor once the figure is scaled down', () => {
  for (const n of draw({ f: 80, dir: 35, m: -200 }).texts) {
    assert.ok(Number(n.attrs['font-size']) >= 16, `a label at ${n.attrs['font-size']} units`);
    for (const span of n.children) assert.ok(Number(span.attrs['font-size']) >= 16, 'a subscript must clear it too');
  }
});

test('arrows and couple arcs are both drawn as short pieces plus a head, all siblings', () => {
  const d = draw({ f: 50, dir: 215, m: 60 });
  for (const n of [...d.pieces, ...d.arcs]) { assert.equal(n.tag, 'line'); assert.ok(has(n, 'g')); }
  for (const n of [...d.heads, ...d.arcHeads]) { assert.equal(n.tag, 'path'); assert.ok(has(n, 'g')); }
  assert.ok(d.arcs.length >= 6, 'an arc drawn in one piece would claim its whole square');
  for (const n of d.arcs) {
    const b = lineBox(n);
    assert.ok(Math.hypot(b.x1 - b.x0, b.y1 - b.y0) <= 15, 'an arc piece claims too big a rectangle');
  }
});

test('render clears the figure first, so two renders leave one figure', () => {
  const svg = stubElement('svg');
  const scene = createScene(svg);
  scene.render({ f: 50, dir: 270, m: 60 });
  const n = svg.children.length;
  scene.render({ f: 50, dir: 270, m: 60 });
  assert.equal(svg.children.length, n);
});

// ---- what the four panels say -------------------------------------------------------------------
test('all four panels are headed', () => {
  const t = draw({ f: 50, dir: 270, m: 60 }).strings;
  for (const want of ['The situation', 'The beam as a single point',
    'Free-body diagram of the beam', 'The forces tip to tail']) {
    assert.ok(t.some(x => x === want), `no panel headed "${want}": ${t.join(' | ')}`);
  }
});

test('the names follow the notation reference, and no ASCII underscore reaches the screen', () => {
  const t = draw({ f: 50, dir: 215, m: 60 }).strings;
  const joined = t.join(' | ');
  assert.ok(!joined.includes('_'), joined);
  assert.ok(joined.includes('M₁'), 'the applied couple is NUMBERED: M₁, never a point letter');
  assert.ok(!/\bMₐ|\bM_?A\b/.test(joined), 'and never lettered after where it is drawn');
  assert.ok(joined.includes('M' + 'C'), "the collar's reaction couple takes its support letter");
  assert.ok(joined.includes('N' + 'A'), 'the roller gives a NORMAL force, not a generic F');
  assert.ok(joined.includes('N' + 'C'), 'and so does the collar');
  assert.ok(joined.includes('F' + 'B'), 'the load is the only F');
  assert.ok(!/F\s*A\b|F\s*C\b/.test(joined.replace(/F⃗/g, 'F')), 'no reaction is called F');
});

test('a moment is printed with a centred dot, as the notation reference requires', () => {
  assert.equal(segPlain(coupleLabel('applied', 60)), nb('M₁ 60~N·m'));
  assert.ok(!segPlain(coupleLabel('collar', 60)).includes('N.m'), 'a period is not a centred dot');
  assert.equal(segPlain(forceLabel('roller', 44.7)), nb('NA 44.7~N'));
  assert.equal(metreLabel(2.4), nb('2.4~m'));
});

test('the default state prints what the physics says, in every panel that shows it', () => {
  const t = draw({ f: 50, dir: 270, m: 60 }).strings;
  assert.ok(t.includes(nb('F' + 'B 50~N')));
  assert.ok(t.filter(x => x === nb('N' + 'A 50~N')).length >= 3, 'the roller force in all three diagrams');
  assert.ok(t.includes(nb('M₁ 60~N·m')));
  assert.ok(t.includes(nb('M' + 'C 60~N·m')));
  assert.ok(t.includes(nb('2.4~m')) && t.includes(nb('1.6~m')), 'the beam is dimensioned');
  for (const name of ['A', 'B', 'C']) assert.ok(t.includes(name), `point ${name} is named`);
});

// ---- what the supports can and cannot do ---------------------------------------------------------
test('the roller arrow is always vertical and the collar arrow always horizontal', () => {
  for (const s of STATES) {
    const d = draw(s);
    for (const [key, horizontal] of [['roller', false], ['collar', true]]) {
      const p = partsOf(d, 'ext', key);
      if (!p.head) continue;
      const from = startOf(p), to = tipOf(p.head);
      if (horizontal) assert.ok(Math.abs(to.y - from.y) < 1e-9, `${JSON.stringify(s)}: the collar pushed sideways off its shaft`);
      else assert.ok(Math.abs(to.x - from.x) < 1e-9, `${JSON.stringify(s)}: the roller pushed along the ground`);
    }
  }
});

test('a quantity that comes out exactly zero is SAID, not quietly left out', () => {
  // a vertical load: the collar has no force to give
  const vertical = draw({ f: 50, dir: 270, m: 60 });
  assert.ok(!partsOf(vertical, 'ext', 'collar').head, 'and so draws no arrow');
  assert.ok(vertical.strings.includes(nb('N' + 'C 0~N')), vertical.strings.join(' | '));
  // a load along the beam: the roller has nothing to carry
  const along = draw({ f: 50, dir: 180, m: 0 });
  assert.ok(along.strings.includes(nb('N' + 'A 0~N')));
  assert.ok(along.strings.includes(nb('M₁ 0~N·m')), 'and the applied couple says it is zero too');
  // the applied couple exactly balancing the load about A
  const balanced = draw({ f: 50, dir: 270, m: X1 * 50 });
  assert.ok(balanced.strings.includes(nb('M' + 'C 0~N·m')), balanced.strings.join(' | '));
  assert.equal(balanced.arcHeads.filter(n => has(n, 'collar')).length, 0, 'a couple of zero draws no arc');
});

test('a couple alone leaves no forces at all, and the polygon panel says so', () => {
  const d = draw({ f: 0, dir: 270, m: 80 });
  assert.equal(d.heads.length, 0, 'no force arrows anywhere');
  // three arcs, not two: the applied couple is drawn twice -- once in the situation and once in the
  // free-body diagram -- and the collar's reaction couple once
  assert.equal(d.arcHeads.length, 3, 'both couples are still drawn, and the applied one in both panels');
  assert.equal(d.arcHeads.filter(n => has(n, 'applied')).length, 2);
  assert.equal(d.arcHeads.filter(n => has(n, 'collar')).length, 1);
  assert.ok(d.strings.some(x => x.includes('a couple balances a couple')), d.strings.join(' | '));
});

test('the point diagram never draws a couple: a couple has no point to act at', () => {
  for (const s of STATES) {
    const d = draw(s);
    assert.equal(d.arcs.filter(n => has(n, 'pt')).length, 0, JSON.stringify(s));
    assert.equal(d.arcHeads.filter(n => has(n, 'pt')).length, 0, JSON.stringify(s));
  }
  assert.ok(draw({ f: 50, dir: 215, m: 60 }).strings.some(x => x.includes('a couple has no point to act at')));
});

// ---- the polygon and the viewBox ------------------------------------------------------------------
test('the polygon that is drawn really closes, in every state', () => {
  for (const s of STATES) {
    const d = draw(s);
    let x = 0, y = 0, sides = 0;
    for (const key of ['load', 'roller', 'collar']) {
      const p = partsOf(d, 'poly', key);
      if (!p.head) continue;
      const t = tipOf(p.head), f = startOf(p);
      x += t.x - f.x; y += t.y - f.y; sides++;
    }
    if (!sides) continue;
    assert.ok(Math.hypot(x, y) < 1e-6, `${JSON.stringify(s)}: the polygon misses closing by ${Math.hypot(x, y).toFixed(4)}`);
  }
});

test('nothing is drawn outside the viewBox, in any state', () => {
  for (const s of STATES) {
    const d = draw(s);
    for (const n of [...d.pieces, ...d.arcs]) {
      const b = lineBox(n);
      assert.ok(b.x0 >= -2 && b.x1 <= VB.w + 2, `${JSON.stringify(s)}: x ${b.x0.toFixed(1)}..${b.x1.toFixed(1)}`);
      assert.ok(b.y0 >= -2 && b.y1 <= VB.h + 2, `${JSON.stringify(s)}: y ${b.y0.toFixed(1)}..${b.y1.toFixed(1)}`);
    }
  }
});

test('the drag handle is exactly where the drag code goes looking for it, in every state', () => {
  for (const s of STATES) {
    const h = draw(s).find('load-handle');
    const want = handleSpot(s);
    assert.ok(Math.abs(Number(h.attrs.cx) - want.x) < 1e-9, JSON.stringify(s));
    assert.ok(Math.abs(Number(h.attrs.cy) - want.y) < 1e-9, JSON.stringify(s));
    assert.equal(h.attrs.tabindex, '0');
    assert.ok((h.attrs['aria-label'] || '').length > 10);
  }
});

test('the load arrow points INTO B, with its tail where the handle is drawn', () => {
  const d = draw({ f: 50, dir: 270, m: 60 });
  const load = partsOf(d, 'space', 'load');
  const B = beamPoints(PANELS.space.baseY, PANELS.space.baseX).B;
  assert.deepEqual(tipOf(load.head), B);
  assert.equal(Number(d.find('load-handle').attrs.cy), B.y - 50 * FORCE_U);
});

// ---- the gaps the mutation audit found ----------------------------------------------------------

test('every force and couple name carries the arrow a vector has to carry', () => {
  for (const key of ['load', 'roller', 'collar']) {
    const segs = forceLabel(key, 12.3);
    assert.equal(segs[0].vec, true, `${key}: the letter must be drawn with an arrow over it`);
    assert.equal(segs[1].sub, true, `${key}: and its subscript must be a real subscript`);
  }
  for (const key of ['applied', 'collar']) {
    const segs = coupleLabel(key, 12.3);
    assert.equal(segs[0].vec, true, `${key}: a couple moment is a vector too`);
    assert.equal(segs[1].sub, true);
  }
  // and the figure really draws the bar: in the stub DOM there is no text measurement, so what is
  // checked here is that the segment asks for one
  assert.ok(draw({ f: 50, dir: 215, m: 60 }).texts.some(n => n.children.length > 1), 'labels are built from tspans');
});

test('the free-body diagram puts each force where it acts, not all three on A', () => {
  const d = draw({ f: 50, dir: 215, m: 60 });
  const starts = ['load', 'roller', 'collar'].map(k => startOf(partsOf(d, 'ext', k)).x);
  assert.equal(new Set(starts.map(x => Math.round(x))).size, 3, `the three start at ${starts.join(', ')}`);
  assert.ok(starts[1] < starts[0] && starts[0] < starts[2], 'in the order A, B, C along the beam');
  const pt = ['load', 'roller', 'collar'].map(k => startOf(partsOf(d, 'pt', k)).x);
  assert.equal(new Set(pt.map(x => Math.round(x))).size, 1, 'and the point diagram starts them all together');
});

test('the polygon panel says that the couples balance apart from it', () => {
  const t = draw({ f: 50, dir: 215, m: 60 }).strings;
  assert.ok(t.some(x => x.includes('couples balance apart')), t.join(' | '));
});
