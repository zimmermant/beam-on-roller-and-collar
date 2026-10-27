import { segPlain } from './format.js';
import { arrowGeometry, coupleArc } from './layout.js';

export const NS = 'http://www.w3.org/2000/svg';

// One palette for the whole app. It lives here because build.js concatenates every module into a single
// scope, so a top-level `const COLORS` in two files would collide and fail the build. The .c-* classes in
// styles.css repeat these values for the HTML side.
export const COLORS = {
  load:    '#c53030',  // the applied load the student drags
  applied: '#6b46c1',  // the applied couple: the other thing the student sets
  roller:  '#2b6cb0',  // the roller's normal force
  collar:  '#2f855a',  // the collar's normal force and its reaction couple
  beam:   '#bee3f8',
  wall:   '#cbd5e0',
  ink:    '#111827',
  dim:    '#4a5568',   // dimension lines and their text
  faint:  '#9aa1ab'
};

export function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, name);
  for (const k in attrs) {
    const v = attrs[k];
    if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(node);
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

// How far a subscript drops, as a fraction of the base size. Matched to SUB in layout.js by eye in the
// browser, not derived: the figure is checked at both viewport budgets.
const SUB_DROP = 0.3;

// The vector arrow over a symbol is DRAWN, not typed. U+20D7 (combining right arrow above) falls back to
// a stack of bars in system-ui on macOS -- it was tried in the browser and is unusable -- and a Unicode
// subscript glyph is too small for the 12 px floor. So a segment marked `vec: true` gets a one-glyph
// arrow drawn over it: measured at render time with getComputedTextLength, which only a real browser
// has, so in the stub DOM of the tests the label is simply drawn without its bar.
//
// The bar is a SIBLING of the text with class `vecbar` and NOT class `g`, so the browser harness does
// not measure it as a graphic of its own: it belongs to the label it sits on, always overlaps that
// label's box by construction, and would otherwise be reported as a text-over-graphic violation on
// every single label.
const VEC_BAR_Y = 0.80;          // how far above the baseline the bar sits, in ems
const VEC_F_EM = 0.5538;         // advance width of 'F' in system-ui at weight 600, measured in Chromium

// A label, as SEGMENTS: [{ t: 'F' }, { t: 'B', sub: true }, { t: ' 50 N' }]. A subscript is a
// real lowered tspan at its own size, never an ASCII underscore and never a Unicode subscript glyph
// (those draw at about 0.6 em, which falls under the 12 px floor at this figure's scale).
//
// A plain string is allowed and is the common case. A node with tspans has an empty textContent, so
// segPlain() (format.js) is the one way to read a label back as text: the unit lint and the scene tests use it.

export { segPlain };

// Draws the arrow over the first glyph of `node`, whose text begins at the base letter. Returns the path,
// or null when the environment cannot measure text.
function vectorBar(parent, node, x, y, size, color) {
  if (typeof node.getComputedTextLength !== 'function') return null;
  const total = node.getComputedTextLength();
  const anchor = node.getAttribute('text-anchor') || 'start';
  const x0 = anchor === 'end' ? x - total : anchor === 'middle' ? x - total / 2 : x;
  const by = y - size * VEC_BAR_Y;
  const x1 = x0 + size * VEC_F_EM + 1.5;
  const h = size * 0.16;
  const d = `M${x0 - 0.5} ${by} L${x1 - h} ${by} M${x1 - h} ${by - h * 0.75} L${x1} ${by} L${x1 - h} ${by + h * 0.75}`;
  el('path', { class: 'vecbar halo', d, stroke: '#ffffff', 'stroke-width': size * 0.22, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, parent);
  return el('path', { class: 'vecbar', d, stroke: color, 'stroke-width': size * 0.072, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, parent);
}

export function text(parent, x, y, segs, opts = {}) {
  const size = opts.size || 21;
  const node = el('text', {
    x, y,
    class: opts.class || 't',
    'font-size': size,
    'font-family': 'system-ui, -apple-system, sans-serif',
    'font-style': opts.italic ? 'italic' : null,
    fill: opts.fill || COLORS.ink,
    'text-anchor': opts.anchor || 'start',
    'font-weight': opts.weight || 400,
    'paint-order': 'stroke',
    stroke: '#ffffff',
    'stroke-width': opts.halo === false ? 0 : 4,
    'stroke-linejoin': 'round'
  }, parent);
  const list = typeof segs === 'string' ? [{ t: segs }] : segs;
  if (list.length === 1 && !list[0].sub && !list[0].vec) {
    node.textContent = list[0].t;
    return node;
  }
  let dy = 0;                                   // where the baseline currently sits, in units
  for (const s of list) {
    const want = s.sub ? size * SUB_DROP : 0;
    // `sb` marks a subscript. It is what tells a reader of the DOM -- the unit lint above all --
    // that a digit in here is part of a name (the 1 of M₁), not a quantity with a missing unit.
    const span = el('tspan', { class: s.sub ? 'sb' : null, dy: Number((want - dy).toFixed(3)), 'font-size': s.sub ? (opts.sub || 16) : size }, node);
    span.textContent = s.t;
    dy = want;
  }
  if (list[0].vec) vectorBar(parent, node, x, y, size, opts.fill || COLORS.ink);
  return node;
}

// Draws an arrow from `from` to `to` as sibling pieces of `parent`, each with class `g arrow <cls>`:
// the shaft in short collinear lines, then the head, whose tip sits exactly on `to`. Returns the boxes
// the pieces occupy, so the caller can keep labels off them.
//
// AN ARROW IS DRAWN AS SEPARATE TOP-LEVEL PIECES, not as one group, and this is why. Every overlap
// check -- the browser harness's and the eye's -- works on BOUNDING RECTANGLES. A single diagonal line
// from one corner of a square to the other claims the whole square, so a label in the clear space
// beside a diagonal arrow is measured as sitting on it, and in a figure of radiating arrows almost
// every label is. Cut into short pieces, each piece's rectangle hugs the line. The pieces must be
// TOP-LEVEL to be measured one by one: the harness takes the box of the OUTERMOST element carrying
// class `g`, so pieces inside a `g.g` group would be invisible to it and the group's whole rectangle
// would be measured instead. The pieces touch, so what is drawn is exactly the same arrow.
//
// What this gives up: the harness's rule 4 (an arrow must not cover a `.pc` joint circle) looks for a
// group whose first child is a line, and finds none. test/scene.test.js checks that instead, over every
// state of the grid rather than the harness's 38, which is the stronger check.
//
// The geometry itself lives in layout.js, so the boxes the labels avoid are the boxes really drawn.
export function arrow(parent, from, to, color, width, cls, headMax = 13) {
  const geo = arrowGeometry(from, to, width, headMax);
  if (!geo.head) return geo.boxes;
  for (const p of geo.pieces) {
    el('line', { class: `g arrow shaft ${cls}`, x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2,
      stroke: color, 'stroke-width': width, 'stroke-linecap': 'butt' }, parent);
  }
  const c = geo.head;
  el('path', { class: `g arrow head ${cls}`, d: `M${c[0].x} ${c[0].y} L${c[1].x} ${c[1].y} L${c[2].x} ${c[2].y} Z`, fill: color }, parent);
  return geo.boxes;
}

// Draws a couple moment as an arc with an arrowhead, in the same separate top-level pieces an arrow
// is drawn in and for the same reason: one long curve claims its whole bounding rectangle, and these
// arcs sit exactly where the labels want to go. Returns the boxes the pieces occupy. A couple of zero
// draws nothing and returns no boxes -- the figure says "0 N·m" in words instead.
export function coupleArrow(parent, centre, turn, color, width, cls) {
  const geo = coupleArc(centre, turn);
  if (!geo.head) return geo.boxes;
  for (const p of geo.segments) {
    el('line', { class: `g couple arc ${cls}`, x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2,
      stroke: color, 'stroke-width': width, 'stroke-linecap': 'round' }, parent);
  }
  const c = geo.head;
  el('path', { class: `g couple head ${cls}`, d: `M${c[0].x} ${c[0].y} L${c[1].x} ${c[1].y} L${c[2].x} ${c[2].y} Z`, fill: color }, parent);
  return geo.boxes;
}

// Diagonal hatching along a line, for a wall or the ground under a support.
export function hatch(parent, from, to, nx, ny, n, len, color) {
  const g = el('g', { class: 'g hatch' }, parent);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = from.x + (to.x - from.x) * t, py = from.y + (to.y - from.y) * t;
    el('line', { x1: px, y1: py, x2: px + nx * len, y2: py + ny * len, stroke: color, 'stroke-width': 2 }, g);
  }
  return g;
}
