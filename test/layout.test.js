import test from 'node:test';
import assert from 'node:assert/strict';
import { VB, FORCE_U, METRE_U, PANELS, SPLITS, SHAFT_REACH, LABEL_CHAR_W,
         COUPLE_R0, COUPLE_R_PER_NM, COUPLE_SWEEP, SHAFT_SEG,
         PLACE_MAX_SHIFT, PLACE_TEXT_GAP, LABEL_LIFT,
         beamPoints, screenDelta, forceList, coupleList, coupleRadius, coupleArc, coupleLabelSpot,
         loadArrow, loadFromHandle, fbdArrows, polygonVertices, fitPolygon,
         labelSpot, polygonLabelSpots, placeLabels, labelBox, boxesHit, arrowGeometry, shaftPieces,
         dist } from '../src/layout.js';
import { derive, X1, X2, SPAN } from '../src/physics.js';
import { STATES } from './grid.js';
import { forceLabel, coupleLabel } from '../src/scene.js';
import { segPlain } from '../src/format.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test('the beam is drawn to scale, and the collar\'s shaft reaches past it both ways', () => {
  const p = beamPoints(PANELS.space.baseY, PANELS.space.baseX);
  near(p.B.x - p.A.x, X1 * METRE_U);
  near(p.C.x - p.A.x, SPAN * METRE_U);
  assert.equal(p.A.y, PANELS.space.baseY);
  assert.ok(SHAFT_REACH > 60, 'the shaft must look like something the collar slides along');
  assert.ok(p.C.y - SHAFT_REACH > PANELS.space.box.y0, 'and must stay on the panel');
  assert.ok(p.C.y + SHAFT_REACH < PANELS.space.box.y1);
  assert.ok(p.C.x + 40 < SPLITS.upper.x, 'the whole situation fits in the upper-left panel');
});

test('screenDelta flips y once, and only once, and scales by the one force scale', () => {
  assert.deepEqual(screenDelta({ x: 3, y: 4 }, 1), { x: 3, y: -4 });
  assert.deepEqual(screenDelta({ x: 4, y: -8 }), { x: 4 * FORCE_U, y: 8 * FORCE_U });
});

test('the load arrow has its tip on B and its length is the magnitude', () => {
  const s = { f: 50, dir: 270, m: 60 };
  const a = loadArrow(s);
  const B = beamPoints(PANELS.space.baseY, PANELS.space.baseX).B;
  assert.deepEqual(a.tip, B);
  near(dist(a.tail, a.tip), 50 * FORCE_U);
  assert.ok(a.tail.y < B.y, 'a downward load is drawn coming from above');
  assert.equal(loadArrow({ f: 0, dir: 270, m: 60 }), null, 'no load, no arrow');
});

test('dragging the handle and reading the load back are inverses, over the whole grid', () => {
  for (const s of STATES) {
    if (s.f === 0) continue;
    const back = loadFromHandle(loadArrow(s).tail, 0);
    near(back.f, s.f, 1e-9);
    near(((back.dir - s.dir + 540) % 360) - 180, 0, 1e-9);
  }
});

test('the free-body arrows start where their force acts: the roller at A, the load at B, the collar at C', () => {
  const o = { x: 100, y: 500 };
  const spread = fbdArrows({ f: 50, dir: 215, m: 60 }, o, true);
  assert.deepEqual(spread.map(a => a.key), ['load', 'roller', 'collar']);
  near(spread[0].tail.x, o.x + X1 * METRE_U);
  near(spread[1].tail.x, o.x);
  near(spread[2].tail.x, o.x + SPAN * METRE_U);
  for (const a of fbdArrows({ f: 50, dir: 215, m: 60 }, o, false)) assert.deepEqual(a.tail, o);
  assert.equal(fbdArrows({ f: 0, dir: 270, m: 60 }, o, false).length, 0, 'a couple alone draws no arrows');
  assert.equal(fbdArrows({ f: 50, dir: 270, m: 0 }, o, false).length, 2, 'a vertical load leaves the collar no force');
});

test('the roller always points straight up or down, the collar always straight across', () => {
  for (const s of STATES) {
    const [, roller, collar] = forceList(s);
    assert.equal(roller.vec.x, 0, `${JSON.stringify(s)}: the roller can only push normal to the ground`);
    assert.equal(collar.vec.y, 0, `${JSON.stringify(s)}: the collar can only push normal to its shaft`);
  }
});

test('the couples are listed apart from the forces, because a couple is not a force', () => {
  const s = { f: 50, dir: 270, m: 60 };
  const cs = coupleList(s);
  assert.deepEqual(cs.map(c => c.key), ['applied', 'collar']);
  assert.equal(cs[0].at, null, 'an applied couple has no point of application at all');
  assert.equal(cs[1].at, SPAN, "the collar's couple is drawn where the collar is");
  near(cs[0].turn, 60);
  near(cs[1].turn, derive(s).mc);
  assert.ok(!forceList(s).some(f => 'turn' in f), 'no couple has leaked into the force list');
});

// ---- the couple arc ------------------------------------------------------------------------------
test('a bigger couple is a bigger arc, and a couple of zero is no arc at all', () => {
  assert.ok(coupleRadius(400) > coupleRadius(40), 'the radius has to carry the magnitude');
  assert.equal(coupleRadius(0), COUPLE_R0, 'but it does not start at zero, or a small couple would vanish');
  assert.ok(COUPLE_R_PER_NM > 0);
  const zero = coupleArc({ x: 0, y: 0 }, 0);
  assert.deepEqual(zero, { segments: [], head: null, boxes: [], r: 0 });
});

test('the arc turns the way the couple turns, as a reader of the page sees it', () => {
  const centre = { x: 200, y: 200 };
  // How a viewer reads the sense: the cross product of two successive points taken about the centre.
  // Screen y runs DOWN, so a counterclockwise turn ON THE PAGE has a NEGATIVE cross product here --
  // which is exactly the flip that is easy to get backwards, and the reason this test exists.
  const sense = (geo) => {
    const a = geo.segments[0], b = geo.segments[1];
    const p = { x: a.x1 - centre.x, y: a.y1 - centre.y };
    const q = { x: b.x2 - centre.x, y: b.y2 - centre.y };
    return Math.sign(p.x * q.y - p.y * q.x);
  };
  const ccw = coupleArc(centre, 100), cw = coupleArc(centre, -100);
  assert.ok(ccw.head && cw.head);
  assert.equal(sense(ccw), -1, 'a positive couple must turn counterclockwise on the page');
  assert.equal(sense(cw), 1, 'and a negative one clockwise');
  // both begin at the same place, so only the direction of travel distinguishes them
  near(ccw.segments[0].x1, cw.segments[0].x1);
  near(ccw.segments[0].y1, cw.segments[0].y1);
  assert.ok(dist(ccw.head[1], cw.head[1]) > 1, 'and they must not finish in the same place');
  // the head is at the far end of the sweep, not at the start
  assert.ok(dist(ccw.head[1], { x: ccw.segments.at(-1).x2, y: ccw.segments.at(-1).y2 }) < 1e-6);
});

test('an arc is cut into pieces short enough that none claims a big rectangle', () => {
  for (const turn of [5, 60, -200, 392, -392]) {
    const geo = coupleArc({ x: 300, y: 300 }, turn);
    assert.ok(geo.segments.length >= 3, 'too few pieces to look like a curve');
    for (const b of geo.boxes.slice(0, -1)) {
      assert.ok(Math.hypot(b.x1 - b.x0, b.y1 - b.y0) <= SHAFT_SEG + 1, `a piece of ${turn} claims too much`);
    }
    // the pieces join end to end
    for (let i = 1; i < geo.segments.length; i++) {
      near(geo.segments[i].x1, geo.segments[i - 1].x2, 1e-9);
      near(geo.segments[i].y1, geo.segments[i - 1].y2, 1e-9);
    }
    // every piece and the head stay on the circle the radius says
    const r = coupleRadius(Math.abs(turn));
    for (const p of geo.segments) near(Math.hypot(p.x1 - 300, p.y1 - 300), r, 1e-6);
  }
});

test('the arc stops short of a full turn, so which way it goes is visible', () => {
  assert.ok(COUPLE_SWEEP > 180 && COUPLE_SWEEP < 340, `a sweep of ${COUPLE_SWEEP} degrees`);
  const geo = coupleArc({ x: 0, y: 0 }, 100);
  const first = geo.segments[0], tip = geo.head[1];
  assert.ok(dist({ x: first.x1, y: first.y1 }, tip) > coupleRadius(100) * 0.3,
    'the gap between the arc\'s ends must be visible');
});

test('a couple\'s label sits outside its own arc', () => {
  const centre = { x: 100, y: 100 };
  const r = coupleRadius(200);
  const above = coupleLabelSpot(centre, r, true);
  assert.ok(above.y < centre.y - r, `the label at ${above.y} is inside an arc of radius ${r}`);
  const below = coupleLabelSpot(centre, r, false);
  assert.ok(below.y > centre.y + r);
});

test('every couple arc drawn in the figure stays on its panel', () => {
  for (const s of STATES) {
    const places = {
      applied: { x: PANELS.ext.baseX + PANELS.ext.coupleAt.dx, y: PANELS.ext.baseY + PANELS.ext.coupleAt.dy },
      collar: { x: PANELS.ext.baseX + SPAN * METRE_U, y: PANELS.ext.baseY }
    };
    for (const c of coupleList(s)) {
      const geo = coupleArc(places[c.key], c.turn);
      for (const b of geo.boxes) {
        assert.ok(b.x0 >= PANELS.ext.box.x0 - 1 && b.x1 <= PANELS.ext.box.x1 + 1, `${JSON.stringify(s)} ${c.key}: x`);
        assert.ok(b.y0 >= PANELS.ext.box.y0 - 1 && b.y1 <= PANELS.ext.box.y1 + 1, `${JSON.stringify(s)} ${c.key}: y`);
      }
    }
  }
});

// ---- the polygon ----------------------------------------------------------------------------------
test('the polygon starts and ends in the same place, in every state', () => {
  for (const s of STATES) {
    const v = polygonVertices(s);
    assert.equal(v.length, 4);
    near(v[3].x, v[0].x, 1e-12);
    near(v[3].y, v[0].y, 1e-12);
  }
});

test('the polygon is a right triangle, because one reaction is vertical and the other horizontal', () => {
  const v = polygonVertices({ f: 50, dir: 215, m: 60 });
  const side = (i) => ({ x: v[i + 1].x - v[i].x, y: v[i + 1].y - v[i].y });
  const roller = side(1), collar = side(2);
  near(roller.x, 0, 1e-12);
  near(collar.y, 0, 1e-12);
  near(roller.x * collar.x + roller.y * collar.y, 0, 1e-12);
});

test('the fitted polygon lands inside its box, in every state', () => {
  const box = PANELS.poly;
  for (const s of STATES) {
    const v = polygonVertices(s);
    const fit = fitPolygon(v, box);
    assert.ok(fit.scale > 0 && Number.isFinite(fit.scale), JSON.stringify(s));
    for (const p of v.map(fit.map)) {
      assert.ok(p.x >= box.x0 && p.x <= box.x1, `${JSON.stringify(s)}: x ${p.x}`);
      assert.ok(p.y >= box.y0 && p.y <= box.y1, `${JSON.stringify(s)}: y ${p.y}`);
    }
  }
});

test('the fitted polygon is drawn the right way up: a downward load runs DOWN the page', () => {
  const s = { f: 50, dir: 270, m: 60 };
  const v = polygonVertices(s);
  const fit = fitPolygon(v, PANELS.poly);
  assert.ok(fit.map(v[1]).y > fit.map(v[0]).y, 'the load pulls down, so its side must point down');
});

// ---- labels ----------------------------------------------------------------------------------------
test('a label sits beyond its arrow\'s tip, and a horizontal one is lifted clear of the beam', () => {
  const right = labelSpot({ x: 0, y: 0 }, { x: 100, y: 0 });
  assert.ok(right.x > 100 && right.anchor === 'start');
  assert.ok(right.y <= -LABEL_LIFT + 1e-9, 'a label on the beam\'s own line must be lifted off it');
  assert.ok(labelSpot({ x: 0, y: 0 }, { x: 0, y: 100 }).y > 0, 'a downward arrow labels below itself');
});

test('placeLabels moves a label off what it lands on, never moves a pinned one, and keeps it on the panel', () => {
  const bounds = { x0: 0, x1: 600, y0: 0, y1: 400 };
  const clear = [{ spot: { x: 50, y: 50, anchor: 'start' }, chars: 8 }];
  assert.deepEqual(placeLabels(clear, [], bounds)[0], clear[0].spot);
  const obstacle = { x0: 40, x1: 200, y0: 30, y1: 70 };
  const moved = placeLabels([{ spot: { x: 50, y: 50, anchor: 'start' }, chars: 8 }], [obstacle], bounds)[0];
  assert.ok(!boxesHit(labelBox(moved, 8), obstacle));
  const pinned = placeLabels([
    { spot: { x: 100, y: 100, anchor: 'start' }, chars: 9, pinned: true },
    { spot: { x: 104, y: 104, anchor: 'start' }, chars: 9 }
  ], [], bounds);
  assert.deepEqual(pinned[0], { x: 100, y: 100, anchor: 'start' });
  assert.ok(!boxesHit(labelBox(pinned[0], 9), labelBox(pinned[1], 9), PLACE_TEXT_GAP));
  const out = placeLabels([{ spot: { x: 295, y: 10, anchor: 'start' }, chars: 10 }], [], { x0: 0, x1: 300, y0: 0, y1: 200 })[0];
  assert.ok(labelBox(out, 10).x1 <= 300.01);
});

test('a label is never flung far from its arrow', () => {
  const wall = { x0: 0, x1: 600, y0: 0, y1: 600 };
  const spot = { x: 100, y: 100, anchor: 'start' };
  const o = placeLabels([{ spot, chars: 10 }], [wall], { x0: 0, x1: 1000, y0: 0, y1: 1000 })[0];
  assert.ok(Math.hypot(o.x - spot.x, o.y - spot.y) <= PLACE_MAX_SHIFT + 1);
});

test('an arrow is cut into pieces short enough that none claims a big rectangle', () => {
  const geo = arrowGeometry({ x: 0, y: 0 }, { x: 200, y: 200 }, 4, 12);
  assert.equal(geo.pieces.length, shaftPieces(Math.hypot(200, 200), 12));
  for (const b of geo.boxes.slice(0, -1)) {
    assert.ok(Math.hypot(b.x1 - b.x0, b.y1 - b.y0) <= SHAFT_SEG + 0.01);
  }
  assert.deepEqual(geo.head[1], { x: 200, y: 200 });
});

// ---- the two free-body panels, over EVERY state ---------------------------------------------------
function panelClash(s, panel, spread) {
  const origin = spread ? beamPoints(panel.baseY, panel.baseX).A : { x: panel.ox, y: panel.oy };
  const arrows = fbdArrows(s, origin, spread);
  if (!arrows.length) return null;
  const obs = arrows.flatMap(a => arrowGeometry(a.tail, a.tip, 4.2, 12).boxes);
  const items = [];
  if (spread) {
    const p = beamPoints(panel.baseY, panel.baseX);
    obs.push({ x0: p.A.x, x1: p.C.x, y0: p.A.y - 8, y1: p.A.y + 8 });
    for (const q of [p.A, p.B, p.C]) obs.push({ x0: q.x - 4.5, x1: q.x + 4.5, y0: q.y - 4.5, y1: q.y + 4.5 });
    const places = { applied: { x: p.A.x + panel.coupleAt.dx, y: p.A.y + panel.coupleAt.dy }, collar: p.C };
    for (const c of coupleList(s)) {
      if (c.mag === 0) continue;
      obs.push(...coupleArc(places[c.key], c.turn).boxes);
      items.push({ spot: coupleLabelSpot(places[c.key], coupleRadius(c.mag), c.key === 'applied'),
        chars: segPlain(coupleLabel(c.key, c.mag)).length });
    }
  }
  const forceItems = arrows.map(a => ({ spot: labelSpot(a.tail, a.tip), chars: segPlain(forceLabel(a.key, a.mag)).length }));
  const all = items.concat(forceItems);
  const out = placeLabels(all, obs, panel.box);
  const boxes = out.map((q, i) => labelBox(q, all[i].chars));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesHit(boxes[i], boxes[j], PLACE_TEXT_GAP)) return `labels ${i} and ${j} are not a word apart`;
    }
    for (const b of obs) if (boxesHit(boxes[i], b)) return `label ${i} sits on something drawn`;
    const bx = boxes[i];
    if (bx.x0 < panel.box.x0 - 0.01 || bx.x1 > panel.box.x1 + 0.01) return `label ${i} is off the panel sideways`;
    if (bx.y0 < panel.box.y0 - 0.01 || bx.y1 > panel.box.y1 + 0.01) return `label ${i} is off the panel vertically`;
  }
  return null;
}

test('in the point diagram no label lands on another, on an arrow, or off the panel, in any state', () => {
  for (const s of STATES) assert.equal(panelClash(s, PANELS.point, false), null, JSON.stringify(s));
});

test('in the free-body diagram no label lands on another, on anything drawn, or off the panel, in any state', () => {
  for (const s of STATES) assert.equal(panelClash(s, PANELS.ext, true), null, JSON.stringify(s));
});

test('the label estimate is the WIDEST label this figure prints, not an average', () => {
  // Measured in Chromium: "M₁ 200 N·m" is 113.7 units across for 10 characters, which is 11.37 each.
  // At the letter-average 10.6 the solver cleared a couple's arc by less than its own error and the
  // label came out sitting on it. A moment's label is nearly all digits, and digits are wide.
  assert.ok(LABEL_CHAR_W >= 11.37, `an estimate of ${LABEL_CHAR_W} is narrower than the widest label needs`);
  const widest = Math.max(...STATES.map(s => segPlain(coupleLabel('collar', derive(s).magMC)).length));
  assert.ok(widest >= 10, `the longest label is ${widest} characters, so the estimate matters`);
});

test('two labels end up a readable gap apart, not merely not touching', () => {
  assert.ok(PLACE_TEXT_GAP >= 8, 'a gap under about eight units reads as one word');
  const items = [
    { spot: { x: 200, y: 100, anchor: 'end' }, chars: 7 },
    { spot: { x: 202, y: 100, anchor: 'start' }, chars: 7 }
  ];
  const out = placeLabels(items, [], { x0: 0, x1: 600, y0: 0, y1: 400 });
  assert.ok(!boxesHit(labelBox(out[0], 7), labelBox(out[1], 7), PLACE_TEXT_GAP),
    'two labels set side by side were left touching');
});
