import { fmt, fmtFixed, segPlain } from './format.js';
import { unitText } from './fields.js';
import { el, clear, text, arrow, coupleArrow, hatch, COLORS } from './svg.js';
import { derive, turnOf, cosDeg, sinDeg, FORCE_DP, MOMENT_DP, LOAD_SUB, NORMAL_SUB, COUPLE_SUB, X1, X2, SPAN } from './physics.js';
import { TEXT, SUB, HEAD_MAX, HANDLE_R, FORCE_U, METRE_U, SHAFT_REACH, PANELS, SPLITS,
         PLACE_NAME_SHIFT, beamPoints, loadArrow, fbdArrows, forceList, coupleList,
         coupleArc, coupleRadius, coupleLabelSpot, polygonVertices, fitPolygon,
         labelSpot, polygonLabelSpots, placeLabels, shaftPieces } from './layout.js';

// The figure. One svg, four panels, redrawn from the stored inputs on every change. Every graphic is
// a TOP-LEVEL element with class `g` and every label a TOP-LEVEL `text.t`, because that is all the
// browser harness can measure.
//
// NOTATION (.claude/references/physics-notation.md in the Wiki_Vault project): the load is F_B; both
// supports are smooth contacts, so their reactions are NORMAL forces, N_A at the roller and N_C at
// the collar; the applied couple is NUMBERED, M_1, because a couple has no point of application; and
// the collar's reaction couple takes its support letter, M_C. Every vector carries a drawn arrow
// over its letter, and a moment's unit is N·m with a centred dot.

// 'F'/'N'/'M' with a DRAWN arrow over it (the Unicode combining arrow does not render: see svg.js),
// then the subscript as a lowered tspan. The subscripts come from physics.js, one source of truth.
const FORCE_SYM = { load: ['F', LOAD_SUB], roller: ['N', NORMAL_SUB.roller], collar: ['N', NORMAL_SUB.collar] };
const COUPLE_SYM = { applied: ['M', COUPLE_SUB.applied], collar: ['M', COUPLE_SUB.collar] };
const symbolSegs = ([letter, sub]) => [{ t: letter, vec: true }, { t: sub, sub: true }];

const COLOR_OF = {
  load: COLORS.load, roller: COLORS.roller, collar: COLORS.collar,
  applied: COLORS.applied
};
const SHAFT = 4.2;
const COUPLE_W = 3.4;
const DIM_DP = 1;

// The length of an arrow's FIRST shaft piece, which is the `line` the browser harness measures (a
// shaft is drawn in short collinear pieces: see svg.js). One formula, shared with the tracks below.
export function firstPiece(mag) {
  const len = mag * FORCE_U;
  if (!(len > 0)) return 0;
  const head = Math.min(HEAD_MAX, len * 0.55);
  return (len - head) / shaftPieces(len, head);
}

// What the browser harness must find painted where, for each state. The harness keeps its OWN copy
// of this table, written from the equations rather than from this file, and test/harness.test.js
// fails if the two ever disagree on any state of the grid. `want` returns null when the element must
// be ABSENT -- which is how the two "this support carries nothing" cases get pinned down.
export const SCENE_TRACKS = [
  { sel: 'circle.load-handle', measure: 'cx',
    want: (s) => beamPoints(PANELS.space.baseY, PANELS.space.baseX).B.x - s.f * cosDeg(s.dir) * FORCE_U },
  { sel: 'circle.load-handle', measure: 'cy',
    want: (s) => (s.f === 0 ? PANELS.space.baseY - 46 : PANELS.space.baseY + s.f * sinDeg(s.dir) * FORCE_U) },
  { sel: 'line.shaft.pt.roller', measure: 'height',
    want: (s) => (derive(s).magNA === 0 ? null : firstPiece(derive(s).magNA)) },
  { sel: 'line.shaft.pt.collar', measure: 'width',
    want: (s) => (derive(s).magNC === 0 ? null : firstPiece(derive(s).magNC)) }
];

// A force's label: its vector name, then its magnitude in newtons.
export function forceLabel(key, mag) {
  return [...symbolSegs(FORCE_SYM[key]), { t: ' ' + unitText(fmt(mag, FORCE_DP), 'N') }];
}

// A couple's label: its vector name, then its magnitude in newton metres.
export function coupleLabel(key, mag) {
  return [...symbolSegs(COUPLE_SYM[key]), { t: ' ' + unitText(fmt(mag, MOMENT_DP), 'N·m') }];
}

// A length in metres, as the figure prints it.
export function metreLabel(m) {
  return unitText(fmtFixed(m, DIM_DP), 'm');
}

const boxOf = (x0, y0, x1, y1) => ({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1) });
const circleBox = (c, r) => boxOf(c.x - r, c.y - r, c.x + r, c.y + r);

// A panel collects, as it draws: the boxes a label must keep off (`obs`) and the labels themselves.
// A pinned item is a text that will not move but still pushes the others away.
function sheet(svg, panel) {
  const obs = [], items = [], draws = [];
  return {
    obs, items,
    block(...boxes) { obs.push(...boxes); },
    fixed(x, y, segs, opts = {}) {
      text(svg, x, y, segs, { size: opts.size || TEXT, sub: SUB, ...opts });
      items.push({ spot: { x, y, anchor: opts.anchor || 'start' }, chars: segPlain(segs).length, pinned: true });
    },
    moving(segs, spot, fill, opts = {}) {
      items.push({ spot, chars: segPlain(segs).length, pinned: false, maxShift: opts.maxShift });
      draws.push({ segs, fill, at: items.length - 1, weight: opts.weight || 600, size: opts.size || TEXT });
    },
    settle() {
      const placed = placeLabels(items, obs, panel.box);
      for (const d of draws) {
        const p = placed[d.at];
        text(svg, p.x, p.y, d.segs, { size: d.size, sub: SUB, anchor: p.anchor, fill: d.fill, weight: d.weight });
      }
    }
  };
}

function heading(sh, x, y, str) { sh.fixed(x, y, str, { weight: 700, halo: false }); }
function caption(sh, x, y, str) { sh.fixed(x, y, str, { size: SUB, fill: COLORS.faint, halo: false }); }

function rules(svg) {
  const line = (a) => el('line', { class: 'g sep', x1: a.x0 !== undefined ? a.x0 : a.x, y1: a.y0 !== undefined ? a.y0 : a.y,
    x2: a.x1 !== undefined ? a.x1 : a.x, y2: a.y1 !== undefined ? a.y1 : a.y, stroke: '#dde4ec', 'stroke-width': 2 }, svg);
  line(SPLITS.across); line(SPLITS.upper); line(SPLITS.lower);
}

function dimension(svg, sh, x0, x1, y, metres) {
  const g = el('g', { class: 'g dim' }, svg);
  el('line', { x1: x0, y1: y, x2: x1, y2: y, stroke: COLORS.dim, 'stroke-width': 1.6 }, g);
  for (const x of [x0, x1]) el('line', { x1: x, y1: y - 6, x2: x, y2: y + 6, stroke: COLORS.dim, 'stroke-width': 1.6 }, g);
  sh.block(boxOf(x0, y - 6, x1, y + 6));
  sh.fixed((x0 + x1) / 2, y - 16, metreLabel(metres), { anchor: 'middle', fill: COLORS.dim });
}

function beamRect(svg, sh, p) {
  el('rect', { class: 'g beam', x: p.A.x, y: p.A.y - 8, width: p.C.x - p.A.x, height: 16, rx: 3,
    fill: COLORS.beam, stroke: COLORS.ink, 'stroke-width': 1.8 }, svg);
  sh.block(boxOf(p.A.x, p.A.y - 8, p.C.x, p.A.y + 8));
}

// ---- panel 1: the situation (upper left) --------------------------------------------------------
function drawSpace(svg, s) {
  const P = PANELS.space;
  const sh = sheet(svg, P);
  const p = beamPoints(P.baseY, P.baseX);
  heading(sh, P.headX, P.headY, 'The situation');
  caption(sh, P.headX, P.headY + 20, 'drag the handle');

  // the collar's shaft: fixed top and bottom, with the collar riding on it at C
  const sx = p.C.x;
  el('rect', { class: 'g shaft', x: sx - 7, y: p.C.y - SHAFT_REACH, width: 14, height: 2 * SHAFT_REACH,
    fill: '#d8dde3', stroke: COLORS.ink, 'stroke-width': 1.6 }, svg);
  sh.block(boxOf(sx - 7, p.C.y - SHAFT_REACH, sx + 7, p.C.y + SHAFT_REACH));
  for (const dy of [-SHAFT_REACH, SHAFT_REACH]) {
    const y = p.C.y + dy;
    el('line', { class: 'g anchor', x1: sx - 26, y1: y, x2: sx + 26, y2: y, stroke: COLORS.ink, 'stroke-width': 3 }, svg);
    hatch(svg, { x: sx - 24, y }, { x: sx + 24, y }, dy < 0 ? 1 : -1, dy < 0 ? -1 : 1, 5, 11, COLORS.wall);
    sh.block(boxOf(sx - 26, y - 12, sx + 26, y + 12));
  }
  beamRect(svg, sh, p);
  el('rect', { class: 'g collar', x: sx - 15, y: p.C.y - 20, width: 30, height: 40, rx: 4,
    fill: COLORS.beam, stroke: COLORS.ink, 'stroke-width': 2 }, svg);
  sh.block(boxOf(sx - 15, p.C.y - 20, sx + 15, p.C.y + 20));

  // the roller at A: a pin on two wheels on the ground
  el('path', { class: 'g rsupport', d: `M${p.A.x} ${P.baseY + 8} L${p.A.x - 19} ${P.baseY + 36} L${p.A.x + 19} ${P.baseY + 36} Z`,
    fill: COLORS.wall, stroke: COLORS.ink, 'stroke-width': 1.8 }, svg);
  for (const dx of [-10, 10]) {
    el('circle', { class: 'g wheel', cx: p.A.x + dx, cy: P.baseY + 43, r: 7, fill: '#ffffff', stroke: COLORS.ink, 'stroke-width': 1.6 }, svg);
  }
  el('line', { class: 'g ground', x1: p.A.x - 30, y1: P.baseY + 50, x2: p.A.x + 30, y2: P.baseY + 50, stroke: COLORS.ink, 'stroke-width': 2.4 }, svg);
  hatch(svg, { x: p.A.x - 28, y: P.baseY + 50 }, { x: p.A.x + 28, y: P.baseY + 50 }, -1, 1, 5, 11, COLORS.wall);
  sh.block(boxOf(p.A.x - 30, P.baseY + 8, p.A.x + 30, P.baseY + 61));
  el('circle', { class: 'g pc', cx: p.A.x, cy: p.A.y, r: 5.5, fill: '#ffffff', stroke: COLORS.ink, 'stroke-width': 1.8 }, svg);
  sh.block(circleBox(p.A, 5.5));

  // the applied couple. It has no point of application, so where it is drawn is a convention: here,
  // off the left end, exactly where the given figure puts it.
  const mAt = { x: p.A.x + P.coupleAt.dx, y: p.A.y + P.coupleAt.dy };
  if (s.m !== 0) {
    sh.block(...coupleArrow(svg, mAt, s.m, COLORS.applied, COUPLE_W, 'applied'));
    sh.fixed(P.box.x1 - 8, P.headY + 10, coupleLabel('applied', Math.abs(s.m)), { anchor: 'end', fill: COLORS.applied, weight: 600 });
  }

  // point names
  const name = (x, y, t, anchor) => sh.moving(t, { x, y, anchor }, COLORS.ink, { weight: 700, maxShift: PLACE_NAME_SHIFT });
  name(p.A.x - 16, P.baseY - 20, 'A', 'end');
  name(p.C.x + 24, P.baseY - 24, 'C', 'start');

  for (const q of [p.A, p.B, p.C]) {
    el('line', { class: 'g ext', x1: q.x, y1: P.baseY + 14, x2: q.x, y2: P.dimY + 8, stroke: COLORS.faint, 'stroke-width': 1.2, 'stroke-dasharray': '5 5' }, svg);
  }
  dimension(svg, sh, p.A.x, p.B.x, P.dimY, X1);
  dimension(svg, sh, p.B.x, p.C.x, P.dimY, X2);

  // the load, tip on B, tail as the handle
  const a = loadArrow(s, P.baseY, P.baseX);
  if (a) {
    sh.block(...arrow(svg, a.tail, a.tip, COLORS.load, 4.6, 'space load', HEAD_MAX));
    // The arrow sweeps a full circle about B and reaches most of the panel, so its label does not
    // follow it: it sits in the panel's top right corner, always in the same place and always
    // legible. The top LEFT is where the applied couple's arc goes, which is why these are not there.
    sh.fixed(P.box.x1 - 8, P.headY + 56, forceLabel('load', derive(s).magB), { anchor: 'end', fill: COLORS.load, weight: 600 });
  }
  const h = a ? a.tail : { x: p.B.x, y: P.baseY - 46 };
  el('circle', { class: 'g handle load-handle', cx: h.x, cy: h.y, r: HANDLE_R, fill: '#ffffff', stroke: COLORS.load,
    'stroke-width': 3.2, tabindex: 0, role: 'slider', 'aria-label': 'Load arrow: drag it, or use the arrow keys' }, svg);
  sh.block(circleBox(h, HANDLE_R + 2));
  name(p.B.x, P.dimY - 20, 'B', 'middle');
  sh.settle();
}

// ---- the free-body arrows, shared by panels 2 and 3 ---------------------------------------------
function drawFbdArrows(svg, sh, arrows, cls) {
  for (const a of arrows) sh.block(...arrow(svg, a.tail, a.tip, COLOR_OF[a.cls], SHAFT, `${cls} ${a.cls}`, HEAD_MAX));
  for (const a of arrows) sh.moving(forceLabel(a.key, a.mag), labelSpot(a.tail, a.tip), COLOR_OF[a.cls]);
}

// ---- panel 2: the beam as a single point (upper right) ------------------------------------------
function drawPoint(svg, s) {
  const P = PANELS.point;
  const sh = sheet(svg, P);
  const o = { x: P.ox, y: P.oy };
  heading(sh, P.headX, P.headY, 'The beam as a single point');
  // Said plainly, because it is the one thing this panel can mislead about: shrinking the beam to a
  // point keeps the forces and throws away where they act, and where they act is the whole of the
  // moment equation. A couple cannot be drawn here at all -- it has no point to be drawn at.
  caption(sh, P.headX, P.headY + 20, 'the forces only: a couple has no point to act at');
  el('circle', { class: 'g dot origin', cx: o.x, cy: o.y, r: 7, fill: COLORS.ink }, svg);
  sh.block(circleBox(o, 7));
  drawFbdArrows(svg, sh, fbdArrows(s, o, false), 'pt');
  sh.settle();
}

// ---- panel 3: the free-body diagram of the beam (lower left) ------------------------------------
function drawExtended(svg, s) {
  const P = PANELS.ext;
  const sh = sheet(svg, P);
  const p = beamPoints(P.baseY, P.baseX);
  const d = derive(s);
  heading(sh, P.headX, P.headY, 'Free-body diagram of the beam');
  caption(sh, P.headX, P.headY + 20, 'each support replaced by what it does');
  beamRect(svg, sh, p);
  for (const q of [p.A, p.B, p.C]) {
    el('circle', { class: 'g dot', cx: q.x, cy: q.y, r: 4.5, fill: COLORS.ink }, svg);
    sh.block(circleBox(q, 4.5));
  }

  // the couples: the applied one off the left end, the collar's on the collar
  const places = { applied: { x: p.A.x + P.coupleAt.dx, y: p.A.y + P.coupleAt.dy }, collar: { x: p.C.x, y: p.C.y } };
  for (const c of coupleList(s)) {
    const at = places[c.key];
    if (c.mag === 0) continue;
    sh.block(...coupleArrow(svg, at, c.turn, c.key === 'applied' ? COLORS.applied : COLORS.collar, COUPLE_W, c.key));
    sh.moving(coupleLabel(c.key, c.mag), coupleLabelSpot(at, coupleRadius(c.mag), c.key === 'applied'),
      c.key === 'applied' ? COLORS.applied : COLORS.collar);
  }

  drawFbdArrows(svg, sh, fbdArrows(s, p.A, true), 'ext');

  // Anything that comes out exactly zero is SAID, not left out: a missing arrow and a zero are the
  // same picture otherwise, and which of these vanishes is the point of the whole simulation.
  const zeroAt = { load: p.B, roller: p.A, collar: p.C };
  for (const f of forceList(s)) {
    if (f.mag !== 0) continue;
    sh.moving(forceLabel(f.key, 0), { x: zeroAt[f.key].x, y: p.A.y + 44, anchor: 'middle' }, COLORS.faint, { weight: 400 });
  }
  if (d.magMC === 0) {
    sh.moving(coupleLabel('collar', 0), { x: p.C.x, y: p.C.y - 34, anchor: 'middle' }, COLORS.faint, { weight: 400 });
  }
  if (s.m === 0) {
    sh.moving(coupleLabel('applied', 0), { x: places.applied.x, y: places.applied.y, anchor: 'middle' }, COLORS.faint, { weight: 400 });
  }
  sh.settle();
}

// ---- panel 4: the three forces tip to tail (lower right) ----------------------------------------
function drawPolygon(svg, s) {
  const P = PANELS.poly;
  const sh = sheet(svg, P);
  const d = derive(s);
  heading(sh, P.headX, P.headY, 'The forces tip to tail');
  caption(sh, P.headX, P.headY + 20, 'the couples balance apart from this');
  if (d.magB === 0) {
    // Anchored at the panel's left edge, not centred: centred, a line this long runs off the figure.
    sh.fixed(P.x0, (P.y0 + P.y1) / 2, 'No forces: a couple balances a couple.',
      { size: SUB, anchor: 'start', fill: COLORS.faint, italic: true });
    sh.settle();
    return;
  }
  const verts = polygonVertices(s);
  const fit = fitPolygon(verts, P);
  const order = ['load', 'roller', 'collar'];
  const mags = { load: d.magB, roller: d.magNA, collar: d.magNC };
  const drawn = [];
  for (let i = 0; i < order.length; i++) {
    const from = fit.map(verts[i]), to = fit.map(verts[i + 1]);
    if (Math.hypot(to.x - from.x, to.y - from.y) < 1e-6) continue;    // a force of zero adds no side
    sh.block(...arrow(svg, from, to, COLOR_OF[order[i]], SHAFT, `poly ${order[i]}`, HEAD_MAX));
    drawn.push({ key: order[i], from, to });
  }
  const barN = 20, bar = barN * fit.scale;
  const by = P.y1 + 8;
  el('line', { class: 'g scalebar', x1: P.x0, y1: by, x2: P.x0 + bar, y2: by, stroke: COLORS.faint, 'stroke-width': 3 }, svg);
  sh.block(boxOf(P.x0, by - 2, P.x0 + bar, by + 2));
  sh.fixed(P.x0 + bar + 7, by + 6, unitText(fmt(barN, 0), 'N'), { size: SUB, anchor: 'start', fill: COLORS.faint });

  const spots = polygonLabelSpots(drawn);
  drawn.forEach((sd, i) => sh.moving(forceLabel(sd.key, mags[sd.key]), spots[i], COLOR_OF[sd.key]));
  sh.settle();
}

export function createScene(svg) {
  return {
    render(s) {
      clear(svg);
      rules(svg);
      drawSpace(svg, s);
      drawPoint(svg, s);
      drawExtended(svg, s);
      drawPolygon(svg, s);
    }
  };
}

export { segPlain };
