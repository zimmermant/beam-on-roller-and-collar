// Pure geometry for the figure: where everything is drawn, in viewBox units. No DOM, no drawing.
// scene.js turns this into SVG; the browser harness checks the result against the same numbers.
//
// The figure is ONE svg with four stacked panels, so the harness keeps its single-figure model:
//   1  the space diagram   (the given situation, with the draggable load)
//   2  the extended FBD    (the beam alone, forces at the points where they act)
//   3  the point FBD       (the beam shrunk to a point, all three forces from it)
//   4  the force polygon   (the same three forces tip to tail, closing)
//
// Screen y runs DOWN and physics y runs UP, so every physics vector (vx, vy) becomes the screen
// delta (vx, -vy) * FORCE_U. That flip happens in exactly one place: screenDelta().

import { derive, X1, SPAN } from './physics.js';

export const VB = { w: 960, h: 616 };

// WHY THE FIGURE IS A TWO-BY-TWO GRID AND NOT A STACK OF FOUR
// The page must fit a Canvas iframe (800 x 750) with NO vertical scroll, which leaves the figure about
// 555 px of height; at the 740 px column that is 720 viewBox units. Four panels stacked would give each
// 180 units, and one free-body diagram alone needs 21 (heading) + 89 (longest arrow) + 25 (its label),
// twice over, plus the beam. So the panels sit two by two. The extended diagram is the wide one -- it
// needs the beam PLUS an arrow and its label at each end -- so it takes the whole width of the lower
// row, and the force polygon, which is compact, sits beside it.

export const FORCE_U = 1;        // viewBox units per newton -- ONE scale for panels 1 to 3
export const METRE_U = 62;       // viewBox units per metre of beam
export const TEXT = 21;          // base label size: 21 * (740/960) = 16.2 px rendered
export const SUB = 16;           // a subscript: 12.3 px rendered, just over the 12 px floor
export const HEAD_MAX = 12;      // longest arrowhead
export const HANDLE_R = 10;      // the drag handle's drawn radius
export const HANDLE_HIT = 24;    // and how close a press counts as grabbing it

// How a couple moment is drawn: an arc of fixed angular sweep whose RADIUS carries the magnitude, so
// a bigger couple really is a bigger mark. It cannot start at zero radius or a small couple would be
// invisible, so the scale has an offset -- which is why this is NOT the force scale and the figure
// never invites you to compare an arc with an arrow. A couple of exactly zero draws no arc at all.
export const COUPLE_R0 = 14;          // radius at a vanishingly small couple
export const COUPLE_R_PER_NM = 0.06;  // and how fast it grows
export const COUPLE_SWEEP = 250;      // degrees of arc: short of a full turn, so the sense is visible
export const COUPLE_START = -35;      // where the arc begins, measured CCW from +x

// The collar's shaft, in the space diagram: how far above and below the beam it runs.
export const SHAFT_REACH = 112;

// The four panels. `baseX` is where A sits in the panels that draw the beam.
export const PANELS = {
  space: { headY: 22, headX: 10, baseX: 70, baseY: 152, dimY: 268,
           coupleAt: { dx: -8, dy: -58 },        // M_1's arc, relative to A: clear of the beam and the roller
           box: { x0: 8, x1: 518, y0: 6, y1: 328 } },
  point: { headY: 22, headX: 534, ox: 745, oy: 186,
           box: { x0: 532, x1: 952, y0: 6, y1: 328 } },
  ext:   { headY: 352, headX: 10, baseX: 180, baseY: 492,
           coupleAt: { dx: -8, dy: -58 },
           box: { x0: 8, x1: 622, y0: 340, y1: 610 } },
  poly:  { headY: 352, headX: 644, x0: 644, x1: 950, y0: 382, y1: 596,
           box: { x0: 638, x1: 952, y0: 340, y1: 610 } }
};
// The rules between them: one across, and one down each row.
export const SPLITS = {
  across: { y: 334, x0: 8, x1: 952 },
  upper:  { x: 525, y0: 8, y1: 328 },
  lower:  { x: 630, y0: 342, y1: 610 }
};

// The beam's three points, in whichever panel is asked for. Both beam panels use the same scale, so an
// arrow of a given length means the same thing in each.
export function beamPoints(baseY, baseX) {
  return {
    A: { x: baseX, y: baseY },
    B: { x: baseX + X1 * METRE_U, y: baseY },
    C: { x: baseX + SPAN * METRE_U, y: baseY }
  };
}

// A physics vector in newtons -> a screen delta in viewBox units. The ONE place y is flipped.
export function screenDelta(v, scale = FORCE_U) {
  return { x: v.x * scale, y: -v.y * scale };
}

// The three FORCES of state s, in the order the figure introduces them, with the colour class each
// renderer uses. `at` is where the force acts, in metres from A; `vec` is the force in newtons. The
// two couples are not here: a couple is not a force, it has no point of application, and it belongs
// to coupleList() below.
export function forceList(s) {
  const d = derive(s);
  return [
    { key: 'load',   at: X1,   vec: d.B,  mag: d.magB,  cls: 'load' },
    { key: 'roller', at: 0,    vec: d.NA, mag: d.magNA, cls: 'roller' },
    { key: 'collar', at: SPAN, vec: d.NC, mag: d.magNC, cls: 'collar' }
  ];
}

// The two COUPLES: the applied one and the collar's reaction. `turn` is + for counterclockwise.
// `at` is where each is DRAWN -- the applied one has no point of application at all, so where it is
// drawn is a convention, and the collar's is drawn on the collar because that is what applies it.
export function coupleList(s) {
  const d = derive(s);
  return [
    { key: 'applied', at: null, turn: s.m, mag: Math.abs(s.m), cls: 'applied' },
    { key: 'collar',  at: SPAN, turn: d.mc, mag: d.magMC,      cls: 'collar' }
  ];
}

// The radius of a couple's arc, in viewBox units.
export function coupleRadius(mag) {
  return COUPLE_R0 + mag * COUPLE_R_PER_NM;
}

// A couple's arc, as the separate short segments it is really drawn from, plus the three corners of
// its arrowhead. Cut up for the same reason an arrow's shaft is: a long curve claims its whole
// bounding rectangle, and these sit right where the labels want to be. A couple of zero draws
// nothing -- the figure says so in words instead.
export function coupleArc(centre, turn, segLen = SHAFT_SEG, head = 11) {
  const mag = Math.abs(turn);
  if (!(mag > 0)) return { segments: [], head: null, boxes: [], r: 0 };
  const r = coupleRadius(mag);
  const dir = turn > 0 ? 1 : -1;
  const sweep = COUPLE_SWEEP * Math.PI / 180;
  const start = COUPLE_START * Math.PI / 180;
  // screen y runs DOWN, so a counterclockwise turn on the page is a DECREASING screen angle
  const at = (t) => ({ x: centre.x + r * Math.cos(start + dir * t), y: centre.y - r * Math.sin(start + dir * t) });
  const n = Math.max(3, Math.ceil(r * sweep / segLen));
  const segments = [];
  for (let i = 0; i < n; i++) {
    const a = at(sweep * i / n), b = at(sweep * (i + 1) / n);
    segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  // the head sits at the far end, pointing along the arc
  const tip = at(sweep);
  const back = at(sweep - head / r);
  const ux = tip.x - back.x, uy = tip.y - back.y;
  const len = Math.hypot(ux, uy) || 1;
  const nx = -uy / len, ny = ux / len;
  const half = head * 0.42;
  const corners = [
    { x: back.x + nx * half, y: back.y + ny * half },
    tip,
    { x: back.x - nx * half, y: back.y - ny * half }
  ];
  const boxes = segments.map(p => ({
    x0: Math.min(p.x1, p.x2), x1: Math.max(p.x1, p.x2), y0: Math.min(p.y1, p.y2), y1: Math.max(p.y1, p.y2)
  }));
  boxes.push({
    x0: Math.min(...corners.map(c => c.x)), x1: Math.max(...corners.map(c => c.x)),
    y0: Math.min(...corners.map(c => c.y)), y1: Math.max(...corners.map(c => c.y))
  });
  return { segments, head: corners, boxes, r };
}

// Where a couple's label goes: outside its arc, on the side away from the beam. The clearance has to
// leave room for the arrowhead, which sticks out past the radius the arc is drawn on.
export const COUPLE_LABEL_GAP = 22;

export function coupleLabelSpot(centre, r, above = true) {
  return { x: centre.x, y: centre.y + (above ? -(r + COUPLE_LABEL_GAP) : r + COUPLE_LABEL_GAP + 14), anchor: 'middle' };
}

// Panel 1: the load arrow has its TIP at B, as the given figure draws it, and its tail is the drag
// handle. Returns null when there is no load to draw.
export function loadArrow(s, baseY = PANELS.space.baseY, baseX = PANELS.space.baseX) {
  const d = derive(s);
  if (d.magB === 0) return null;
  const B = beamPoints(baseY, baseX).B;
  const dl = screenDelta(d.B);
  return { tip: B, tail: { x: B.x - dl.x, y: B.y - dl.y } };
}

// The inverse: a handle dropped at `tail` means the load runs from there INTO B. Magnitude in newtons and
// direction in degrees CCW from +x, ready for the sliders' own snapping. A handle exactly on B keeps the
// old direction, because a zero vector has none.
export function loadFromHandle(tail, prevDir, baseY = PANELS.space.baseY, baseX = PANELS.space.baseX) {
  const B = beamPoints(baseY, baseX).B;
  const vx = (B.x - tail.x) / FORCE_U;
  const vy = -(B.y - tail.y) / FORCE_U;              // back to physics y, which runs up
  const mag = Math.hypot(vx, vy);
  if (!(mag > 1e-9)) return { f: 0, dir: prevDir };
  const deg = Math.atan2(vy, vx) * 180 / Math.PI;
  return { f: mag, dir: deg < 0 ? deg + 360 : deg };
}

// Panels 2 and 3: an FBD arrow has its TAIL where the force acts and its tip in the force's direction.
// Panel 2 spreads them along the beam; panel 3 puts every tail on one point.
export function fbdArrows(s, origin, spread) {
  const out = [];
  for (const f of forceList(s)) {
    if (f.mag === 0) continue;
    const tail = spread ? { x: origin.x + f.at * METRE_U, y: origin.y } : { x: origin.x, y: origin.y };
    const dl = screenDelta(f.vec);
    out.push({ ...f, tail, tip: { x: tail.x + dl.x, y: tail.y + dl.y } });
  }
  return out;
}

// Panel 4: the same three forces laid tip to tail, in the order load, link, pin. The chain must come
// back to where it started, which is the whole point of the picture. Returns the vertices in NEWTONS,
// physics axes; fitPolygon turns them into viewBox units.
export function polygonVertices(s) {
  const pts = [{ x: 0, y: 0 }];
  for (const f of forceList(s)) {
    const last = pts[pts.length - 1];
    pts.push({ x: last.x + f.vec.x, y: last.y + f.vec.y });
  }
  return pts;
}

// Fit a set of physics points into a box, keeping the aspect ratio and leaving `pad` units of margin.
// Returns a mapping function and the scale, in viewBox units per newton, so the figure can draw a scale
// bar. A degenerate set (every point equal, or a straight line) still gets a usable scale.
export function fitPolygon(pts, box, pad = 46) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = box.x1 - box.x0 - 2 * pad, h = box.y1 - box.y0 - 2 * pad;
  const spanX = maxX - minX, spanY = maxY - minY;
  const kx = spanX > 1e-9 ? w / spanX : Infinity;
  const ky = spanY > 1e-9 ? h / spanY : Infinity;
  const k = Math.min(kx, ky, 6);                      // never blow a tiny polygon up past 6 units/N
  const scale = Number.isFinite(k) && k > 0 ? k : 1;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const mx = (box.x0 + box.x1) / 2, my = (box.y0 + box.y1) / 2;
  return {
    scale,
    map: (p) => ({ x: mx + (p.x - cx) * scale, y: my - (p.y - cy) * scale })
  };
}

// Where a force's label goes: past the arrow's tip, along the arrow, so it never sits on the shaft.
// A NEARLY HORIZONTAL arrow gets its label lifted clear instead of nudged along the line -- in the two
// beam panels such an arrow runs down the beam, and a label on the line lands on the beam itself.
// `anchor` keeps the text inside the figure by reading the direction, not the position.
export const LABEL_LIFT = 24;   // measured: a label's box reaches about 20 units above its baseline and 10 below

export function labelSpot(tail, tip, out = 17) {
  const dx = tip.x - tail.x, dy = tip.y - tail.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const lift = Math.abs(uy) < 0.35 ? -LABEL_LIFT
    : uy > 0 ? TEXT * 0.85
    : -TEXT * 0.3;
  return {
    x: tip.x + ux * out,
    y: tip.y + uy * out + lift,
    anchor: ux > 0.25 ? 'start' : ux < -0.25 ? 'end' : 'middle'
  };
}

// Where a polygon side's label goes: beside the middle of its own side, on the far side from the
// polygon's centre. A FLAT polygon (the load along the beam, so the link carries nothing) has its
// centre ON every side, so there is no far side: the sides then take turns above and below one
// shared perpendicular, which is what keeps the two labels of a collapsed triangle apart.
export function polygonLabelSpots(sides, out = 24) {
  if (!sides.length) return [];
  const cx = sides.reduce((a, s) => a + (s.from.x + s.to.x) / 2, 0) / sides.length;
  const cy = sides.reduce((a, s) => a + (s.from.y + s.to.y) / 2, 0) / sides.length;
  const perpOf = (s) => {
    const dx = s.to.x - s.from.x, dy = s.to.y - s.from.y;
    const n = Math.hypot(dx, dy) || 1;
    return { x: -dy / n, y: dx / n };
  };
  const mids = sides.map(s => ({ x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 }));
  const perps = sides.map(perpOf);
  const outward = sides.map((s, i) => (mids[i].x - cx) * perps[i].x + (mids[i].y - cy) * perps[i].y);
  const flat = outward.every(v => Math.abs(v) < 1);
  return sides.map((s, i) => {
    const p = flat ? perps[0] : perps[i];
    const sign = flat ? (i % 2 ? -1 : 1) : Math.sign(outward[i]) || 1;
    const x = mids[i].x + p.x * sign * out;
    const y = mids[i].y + p.y * sign * out + TEXT * 0.34;
    return { x, y, anchor: p.x * sign < -0.25 ? 'end' : p.x * sign > 0.25 ? 'start' : 'middle' };
  });
}

// ---------------------------------------------------------------------------------------------
// Boxes: how a label is measured, and how one is moved off whatever it lands on.
//
// Everything that checks a figure for collisions -- the browser harness, and a reader's eye -- works
// on rectangles, so this file places labels by rectangle too. The three constants are MEASURED in
// Chromium at TEXT units with the figure's own font, not guessed: a label's box reaches about 21 units
// above its baseline (the halo included) and 11 below (the subscript's descender), and one character
// is about half the font size wide.
// ---------------------------------------------------------------------------------------------
// MEASURED in Chromium, and taken from the WIDEST label this figure prints, not an average: at 10.6
// (the average of a letter-heavy label) "M₁ 200 N·m" came out 113.7 units against an estimate of 106,
// and the solver cleared an arc by less than the error. Digits and the centred dot are wider than
// letters, and a label of a moment is almost all digits.
export const LABEL_CHAR_W = 11.4;
export const LABEL_ABOVE = 21;
export const LABEL_BELOW = 11;
export const PLACE_PAD = 1.5;        // clear space demanded between a label and a drawn shape
// Two labels need a real gap, not merely not to touch. At 1.5 units apart "F_B 60 N" and "F_A 60 N"
// are measurably clear of each other and read as one string; this is the space between two words.
export const PLACE_TEXT_GAP = 11;
export const PLACE_PASSES = 8;
export const PLACE_MAX_SHIFT = 110;  // how far a label may be moved from where its arrow put it, by default
// Raised from the previous simulation's 95: this figure has five labels in the lower-left panel --
// three forces and two couples -- and the couple labels are long, so in the most crowded states the
// solver needs the extra room. It still moves each label as little as it can.

// A point's name (A, B, C, D) may be nudged, but only a little: further than this and it no longer
// reads as the name of that point. Items carry their own cap through `maxShift`.
export const PLACE_NAME_SHIFT = 30;

export function labelBox(spot, chars) {
  const w = chars * LABEL_CHAR_W;
  const x0 = spot.anchor === 'end' ? spot.x - w : spot.anchor === 'middle' ? spot.x - w / 2 : spot.x;
  return { x0, x1: x0 + w, y0: spot.y - LABEL_ABOVE, y1: spot.y + LABEL_BELOW };
}

// True when the two boxes are closer than `pad` apart. EXACTLY `pad` apart counts as clear: the
// placement solver moves a label to precisely that distance, and without the epsilon the arithmetic
// that put it there and the test that checks it disagree by a last bit, so the move never takes.
const BOX_EPS = 1e-6;

export function boxesHit(a, b, pad = PLACE_PAD) {
  return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > -pad + BOX_EPS &&
         Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > -pad + BOX_EPS;
}

const shift = (box, dx, dy) => ({ x0: box.x0 + dx, x1: box.x1 + dx, y0: box.y0 + dy, y1: box.y1 + dy });

// Keeps a box inside `bounds` by sliding it, and says how far it had to slide.
function insideShift(box, bounds) {
  let dx = 0, dy = 0;
  if (box.x0 < bounds.x0) dx = bounds.x0 - box.x0;
  else if (box.x1 > bounds.x1) dx = bounds.x1 - box.x1;
  if (box.y0 < bounds.y0) dy = bounds.y0 - box.y0;
  else if (box.y1 > bounds.y1) dy = bounds.y1 - box.y1;
  return { dx, dy };
}

// Places labels so that none sits on another, on an obstacle, or outside its panel.
//
//   items      [{ spot, chars, pinned }] -- a pinned item never moves but still blocks the others
//   obstacles  [box] -- the beam, the link, the dimension lines, every piece of every arrow
//   bounds     the panel's box; a label is kept inside it
//
// For each movable label it tries the four smallest escapes (up, down, left, right past whatever it
// overlaps), keeps the one that costs least movement from where the arrow put it, and repeats. A label
// that cannot be freed stays at its best position rather than flying off: the figure is then still
// readable, and the browser harness says so. Pure and deterministic.
export function placeLabels(items, obstacles = [], bounds = null) {
  const boxes = items.map(it => labelBox(it.spot, it.chars));
  const home = boxes.map(b => ({ ...b }));
  const blockers = (i) => [
    ...obstacles.map(b => ({ b, hard: true, gap: PLACE_PAD })),
    ...boxes.map((b, j) => ({ b, hard: !!items[j].pinned, gap: PLACE_TEXT_GAP, self: j === i })).filter(x => !x.self)
  ];

  // Landing on something that cannot move is worse than landing on another label, which the next pass
  // can still push aside. Without that difference a label with no clear spot stays where it is -- on
  // the beam -- because every escape looks exactly as bad.
  //
  // Leaving the panel costs far more than any number of overlaps: an arrow is drawn in many short
  // pieces, so brushing one arrow already counts several times over, and a smaller penalty here let a
  // label sit half off the figure rather than touch a long arrow. Off the edge it is simply cut off.
  const HARD = 3, SOFT = 1, OUT = 1000;

  const cost = (i, b) => {
    let n = 0;
    for (const o of blockers(i)) if (boxesHit(b, o.b, o.gap)) n += o.hard ? HARD : SOFT;
    if (bounds) { const s = insideShift(b, bounds); if (s.dx || s.dy) n += OUT; }
    return n;
  };
  const travel = (i, b) => Math.hypot(b.x0 - home[i].x0, b.y0 - home[i].y0);
  const capOf = (i) => (items[i].maxShift === undefined ? PLACE_MAX_SHIFT : items[i].maxShift);

  // The four ways out of one blocker: just above it, just below it, just left of it, just right of it,
  // each clearing it by the gap that blocker demands.
  const escapes = (box, o, gap) => [
    { dx: 0, dy: o.y0 - gap - box.y1 },
    { dx: 0, dy: o.y1 + gap - box.y0 },
    { dx: o.x0 - gap - box.x1, dy: 0 },
    { dx: o.x1 + gap - box.x0, dy: 0 }
  ];

  for (let pass = 0; pass < PLACE_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].pinned) continue;
      if (cost(i, boxes[i]) === 0) continue;
      let best = boxes[i], bestCost = cost(i, boxes[i]), bestTravel = travel(i, boxes[i]);
      // `far` lets one kind of move ignore the travel cap: sliding back onto the panel. A label off the
      // edge is cut off and unreadable, which is worse than a label that has wandered from its arrow.
      const consider = (cand0, far = false) => {
        let cand = cand0;
        if (bounds) { const s = insideShift(cand, bounds); cand = shift(cand, s.dx, s.dy); }
        if (!far && travel(i, cand) > capOf(i)) return null;
        const c = cost(i, cand), tr = travel(i, cand);
        if (c < bestCost || (c === bestCost && tr < bestTravel - 1e-9)) { best = cand; bestCost = c; bestTravel = tr; }
        return cand;
      };
      // One step out of each blocker, and -- because escaping one thing often lands on the next -- a
      // second step out of whatever that first step ran into. Without the second step a label with a
      // row of obstacles beside it never moves: every single step looks exactly as bad as staying.
      for (const first of blockers(i)) {
        if (!boxesHit(boxes[i], first.b, first.gap)) continue;
        for (const t of escapes(boxes[i], first.b, first.gap)) {
          const cand = consider(shift(boxes[i], t.dx, t.dy));
          if (!cand || cost(i, cand) === 0) continue;
          for (const second of blockers(i)) {
            if (!boxesHit(cand, second.b, second.gap)) continue;
            for (const u of escapes(cand, second.b, second.gap)) consider(shift(cand, u.dx, u.dy));
          }
        }
      }
      // sliding back inside the panel is always worth trying, even when nothing is in the way
      if (bounds) {
        const s0 = insideShift(boxes[i], bounds);
        if (s0.dx || s0.dy) consider(shift(boxes[i], s0.dx, s0.dy), true);
      }
      if (best !== boxes[i]) { boxes[i] = best; moved = true; }
    }
    if (!moved) break;
  }

  return items.map((it, i) => ({
    ...it.spot,
    x: it.spot.x + (boxes[i].x0 - home[i].x0),
    y: it.spot.y + (boxes[i].y0 - home[i].y0)
  }));
}

// ---------------------------------------------------------------------------------------------
// The concurrency construction: the three lines of action, and the point they meet at.
//
// Three non-parallel forces on a rigid body in equilibrium must meet at one point. That is the same
// fact as the force polygon closing, and drawing it is the whole reason this panel is worth looking
// at next to the polygon. The construction is drawn only when there IS a point to draw: with no load
// there are no lines; with the load along the beam the link carries nothing and the two remaining
// forces share one line (the beam itself); and as the load's line turns parallel to the link's, the
// meeting point runs away to infinity. That last case is not a failure to draw -- it is the thing a
// student should notice -- so the reading panel says which case it is in.
// ---------------------------------------------------------------------------------------------
export const CONCUR_MARGIN = 16;     // keep the meeting point this far inside the panel
export const CONCUR_R = 7;           // the open circle drawn on it
export const DASH_ON = 9;            // a construction line is drawn as separate short dashes, so that
export const DASH_OFF = 7;           // each one's rectangle hugs the line (see svg.js on arrows)

// Where the three lines of action meet, in metres from A with y up, or null when there is no such
// point. `null` means one of: no load, no link force, or the load exactly parallel to the link.
export function concurrencyPoint(s) {
  const d = derive(s);
  if (d.magB === 0 || d.magC === 0) return null;
  const den = d.C.x * d.B.y - d.C.y * d.B.x;          // zero when the two lines are parallel
  if (Math.abs(den) < 1e-9 * d.magB * d.magC) return null;
  const t = (X1 - SPAN) * d.B.y / den;
  return { x: SPAN + d.C.x * t, y: d.C.y * t };
}

// Why there is no construction to draw, as a reason the reading panel can name.
export function concurrencyCase(s, panel) {
  const d = derive(s);
  if (d.magB === 0) return 'no-load';
  if (d.magC === 0) return 'one-line';                // the load lies along the beam
  return concurrencyInPanel(s, panel) ? 'point' : 'far';
}

// The meeting point in a panel's own units, but only when it lands inside that panel with room for
// its circle. Returns { at, metres } or null.
export function concurrencyInPanel(s, panel) {
  const p = concurrencyPoint(s);
  if (!p) return null;
  const at = { x: panel.baseX + p.x * METRE_U, y: panel.baseY - p.y * METRE_U };
  const b = panel.box, m = CONCUR_MARGIN;
  const on = at.x >= b.x0 + m && at.x <= b.x1 - m && at.y >= b.y0 + m && at.y <= b.y1 - m;
  return on ? { at, metres: p } : null;
}

// A dashed segment, as the separate short dashes it is really drawn from. The last dash is cut to the
// end of the segment rather than overrunning it.
export function dashes(from, to, on = DASH_ON, off = DASH_OFF) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 0.5)) return [];
  const ux = dx / len, uy = dy / len;
  const out = [];
  for (let a = 0; a < len; a += on + off) {
    const b = Math.min(a + on, len);
    out.push({ x1: from.x + ux * a, y1: from.y + uy * a, x2: from.x + ux * b, y2: from.y + uy * b });
  }
  return out;
}

// The three construction lines of the extended diagram: from each force's point of application to the
// meeting point, which is where its line of action runs. Returns [] when there is nothing to draw.
export function concurrencyLines(s, panel) {
  const con = concurrencyInPanel(s, panel);
  if (!con) return [];
  const p = beamPoints(panel.baseY, panel.baseX);
  return [p.A, p.B, p.C].map(q => ({ from: q, to: con.at, dashes: dashes(q, con.at) }));
}

// The pieces an arrow is drawn from, as pure geometry, so the figure and the collision boxes can never
// disagree: svg.js draws exactly this. Returns the shaft pieces, the head's three corners, and the box
// of every piece.
export function arrowGeometry(from, to, width, headMax) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { pieces: [], head: null, boxes: [] };
  const ux = dx / len, uy = dy / len;
  const head = Math.min(headMax, len * 0.55);
  const bx = to.x - ux * head, by = to.y - uy * head;
  const half = width * 1.5 + 2.2;
  const shaftLen = len - head;
  const n = shaftPieces(len, head);
  const pieces = [];
  for (let i = 0; i < n; i++) {
    pieces.push({
      x1: from.x + ux * shaftLen * (i / n), y1: from.y + uy * shaftLen * (i / n),
      x2: from.x + ux * shaftLen * ((i + 1) / n), y2: from.y + uy * shaftLen * ((i + 1) / n)
    });
  }
  const corners = [
    { x: bx - uy * half, y: by + ux * half },
    { x: to.x, y: to.y },
    { x: bx + uy * half, y: by - ux * half }
  ];
  const boxes = pieces.map(p => ({ x0: Math.min(p.x1, p.x2), x1: Math.max(p.x1, p.x2), y0: Math.min(p.y1, p.y2), y1: Math.max(p.y1, p.y2) }));
  boxes.push({
    x0: Math.min(...corners.map(c => c.x)), x1: Math.max(...corners.map(c => c.x)),
    y0: Math.min(...corners.map(c => c.y)), y1: Math.max(...corners.map(c => c.y))
  });
  return { pieces, head: corners, boxes };
}

// How long each piece of a shaft is. The shaft is cut up because every collision check works on
// bounding rectangles, and one diagonal line claims its whole rectangle: see svg.js.
export const SHAFT_SEG = 14;

export function shaftPieces(len, head) {
  return Math.max(1, Math.ceil((len - head) / SHAFT_SEG));
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
