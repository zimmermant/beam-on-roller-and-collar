// Browser verification harness for dist/<page>.html. Not part of the build and not run by node: it needs a real
// layout engine (getBoundingClientRect, getScreenCTM, computed styles).
//
// Serve the project folder over http so the built page and this file share an origin (any static server, on a port
// nothing else uses: check with `lsof -iTCP:8765` first):
//
//   python3 -m http.server 8765        (run in the project folder)
//
// Open http://localhost:8765/dist/<page>.html in a window of one of the sizes in SIM.viewport, RELOAD, then paste into
// the page (console, or the browser tool's JavaScript executor):
//
//   eval(await (await fetch('/tools/browser-harness.js')).text()); H.install(); H.all()
//
// H.all() is SYNCHRONOUS (no await). Pass = sweep.violationCount 0, sensitivity.flagged true, budget.ok true.
// Run it once per budget in SIM.viewport (resize the window, RELOAD, install, all). Probes that load the page with a
// query string are asynchronous: `await H.queries()` (pass = violationCount 0).
//
// THE RULES (what the checker sees, and what it cannot)
//   | element        | rule |
//   | texts          | only `text.t` (SVG text with class t) is measured for position; nested `tspan`s count only for rule 6 |
//   | graphics       | only TOP-LEVEL elements with class g are measured; a g inside another g is invisible to it, so put every |
//   |                | graphic in a top-level g (a `rect.g`, `line.g`, `polyline.g` or a `g.g` group) |
//   | arrow          | a `g` whose FIRST child is a `line`; a group that starts with a path or circle is never an arrow |
//   | pc             | `.g.pc` marker circles are tested only against arrows (rule 4); nothing else treats them specially |
//   | 12 px          | rule 6 = computed font-size x the figure's scale >= SIM.minTextPx. It cannot judge glyph size: subscript |
//   |                | digits (₁ ₂) pass at 12.3 px but draw visibly smaller. Look at them yourself |
//   | overlap        | two boxes overlap only if the intersection exceeds 0.5 viewBox units in x AND in y |
//   | floors         | fewer texts or top-level g than SIM.floors is itself a violation (a renamed class cannot pass vacuously) |
//   | tracks         | an element's painted cx, cy, width or height must equal origin + pxPerUnit x its input, or want(state) (SIM.tracks) |
//   | page text      | in #calc and #controls every element must compute to >= SIM.minTextPx (HTML sub included); children of each |
//   |                | .zl (scale labels) and .ctl-head must not overlap each other (checkPage) |
//   | BLIND SPOT     | every box is a bounding RECTANGLE: a curve or a diagonal arrow claims its whole rectangle, so put labels outside |
//   |                | it (a margin gauge line works) or split the curve into short segments |
//   | BLIND SPOT     | colour-only ties and label-to-graphic association are not checked; neither is overlap between HTML elements |
//   |                | other than the two groups above, nor glyph size |
//   | BLIND SPOT     | `ask` probes are normalised by the browser's range input before the app sees them: for a field without snap |
//   |                | they test the browser, not fieldSnap. Only `query` probes reach the app's snapping |
//   | clearSpot      | where sensitivity() plants its faults: checked empty in the default state only |
//
// What each phase proves
//   install      the figure renders >= SIM.minFigPx wide (getBBox / rect metrics are untrustworthy in a collapsed
//                pane, so it REFUSES below that); stores element references.
//   sweep        drives the REAL page: clicks the reset button, then sets each slider with an `input` event (no
//                keydown, so pointer-style input), over the cartesian product of SIM.grid (every input's list) and
//                the `ask` probes in SIM.probes (off-step or out-of-range values whose snapped result is `expect`).
//                After each state it verifies the drive worked (sliders, readouts), that every SIM.tracks element is
//                painted where the state says, and runs checkFigure. A key missing from a probe means "the default".
//   queries      (async) for each SIM.probes entry with a `query`: loads the page in a hidden same-origin iframe of the
//                window's size with that query string, so states only a link can produce (a degenerate state, the
//                longest preset note, a rejected echo) get the same checks, plus the budget.
//   checkFigure  1 every text lies inside the viewBox; 2 no two texts overlap; 3 no text overlaps a graphic;
//                4 no arrow overlaps a marker circle; 5 every graphic lies inside the viewBox; 6 every text AND
//                tspan renders at >= SIM.minTextPx; 7 non-vacuity floors (counts of texts and graphics). Boxes
//                come from getBoundingClientRect converted to viewBox units through the figure's screen CTM.
//   sensitivity  plants faults (a text over a graphic, a text on another text, a text past the viewBox, a 10-unit
//                text, an HTML span over a scale label, a 10 px span in the calculation) and requires the checks to NAME
//                each, then requires a clean page after removal; also that clearSpot is empty. A checker that cannot
//                see a planted fault proves nothing.
//   checkPage    the HTML rules above: scale-label overlap and the 12 px floor over #calc and #controls; run on every
//                sweep state and every query probe.
//   budget       H.budget() checks the window as it is; H.budget({ width, height }) additionally requires the window to
//                BE that size (it compares with the real innerWidth/innerHeight and refuses otherwise). The page fits
//                the window (no vertical scroll), figure, controls and calculation are fully visible, nothing
//                overlaps the figure (the sticky row included), nothing clipped, no horizontal scroll.
(function () {
  // ---- SIM: everything specific to this simulation lives in this block --------------------------------
  // The values marked (drift) are copies of source values: test/harness.test.js loads this file and fails if they stop
  // matching FIELDS (src/fields.js), the template, or SCENE_TRACKS (src/scene.js). The function bodies below name no
  // input, no element and no scale: they only read this block.
  // The harness's OWN statics, written from the equations rather than from src/. If this and the app
  // ever disagree, one of them is wrong -- which is the point. test/harness.test.js compares the
  // tracks below with src/scene.js's SCENE_TRACKS on every state of the grid.
  //
  //   sum F_x = 0 -> N_Cx = -F_Bx;  sum F_y = 0 -> N_Ay = -F_By;  sum M_A = 0 -> M_C = -M_1 - x1 F_By
  const PHYS = {
    X1: 2.4, SPAN: 4,
    FU: 1, HEAD: 12, SEG: 14,           // (drift) FORCE_U, HEAD_MAX and SHAFT_SEG in src/layout.js
    BASEX: 70, METRE: 62,               // (drift) where A is drawn, and viewBox units per metre
    BY: 152, REST: 106,                 // (drift) the beam's line, and the handle's resting y at no load
    get BX() { return PHYS.BASEX + PHYS.X1 * PHYS.METRE; },   // computed, not written out: 70 + 2.4 x 62
                                        // is 218.79999999999998, and a rounded literal would drift
    PT: { x: 745, y: 186 },             // (drift) the origin of the point diagram
    cos(d) { const m = ((d % 360) + 360) % 360; return m === 90 || m === 270 ? 0 : m === 0 ? 1 : m === 180 ? -1 : Math.cos(m * (Math.PI / 180)); },
    sin(d) { const m = ((d % 360) + 360) % 360; return m === 0 || m === 180 ? 0 : m === 90 ? 1 : m === 270 ? -1 : Math.sin(m * (Math.PI / 180)); },
    of(s) {
      const Bx = s.f * PHYS.cos(s.dir), By = s.f * PHYS.sin(s.dir);
      const NAy = -By, NCx = -Bx;
      // the magnitudes come from the reactions THEMSELVES, so that getting a reaction wrong above
      // cannot be hidden by a magnitude written out a second time from the load
      return { Bx, By, NAy, NCx, mc: -s.m - PHYS.X1 * By,
        magB: Math.hypot(Bx, By), magNA: Math.abs(NAy), magNC: Math.abs(NCx), magMC: Math.abs(-s.m - PHYS.X1 * By) };
    },
    // The shaft is drawn in short collinear pieces and the harness measures the FIRST one.
    piece(mag) {
      const len = mag * PHYS.FU;
      if (!(len > 0)) return 0;
      const head = Math.min(PHYS.HEAD, len * 0.55);
      return (len - head) / Math.max(1, Math.ceil((len - head) / PHYS.SEG));
    }
  };

  const SIM = {
    figId: 'fig',
    viewBox: { w: 960, h: 616 },                                   // (drift) the template's <svg viewBox>
    // This page has the four diagrams and ONE slider: no reading panel and no reset button, so those
    // two ids are null and the harness does not go looking for them.
    controlsId: 'controls', calcId: null, resetId: null,
    // One entry per input that HAS a slider. The load is dragged, so f and dir are not here -- they
    // are still inputs, still stored and snapped, and the query probes below are how they are set.
    sliders: [                                                     // (drift) SLIDER_FIELDS
      { key: 'm', id: 'm', min: -200, max: 200, step: 10, decimals: 0 }
    ],
    defaults: { f: 50, dir: 270, m: 60 },                          // (drift) FIELDS defaults
    // What the figure must track. Two follow the handle -- the thing the student drags -- and two
    // follow a free-body arrow's first shaft piece, the thing the physics moves. The collar's arrow
    // is absent whenever the load is vertical, so that track pins that case down too.
    tracks: [                                                      // (drift) scene.js SCENE_TRACKS
      { sel: 'circle.load-handle', measure: 'cx', want: (s) => PHYS.BX - s.f * PHYS.cos(s.dir) * PHYS.FU },
      { sel: 'circle.load-handle', measure: 'cy', want: (s) => (s.f === 0 ? PHYS.REST : PHYS.BY + s.f * PHYS.sin(s.dir) * PHYS.FU) },
      { sel: 'line.shaft.pt.roller', measure: 'height',
        want: (s) => { const d = PHYS.of(s); return d.magNA === 0 ? null : PHYS.piece(d.magNA); } },
      { sel: 'line.shaft.pt.collar', measure: 'width',
        want: (s) => { const d = PHYS.of(s); return d.magNC === 0 ? null : PHYS.piece(d.magNC); } }
    ],
    // Only the slider can be driven in the page, so the sweep varies the applied couple; the load
    // comes from the query probes.
    grid: { m: [-200, -120, -40, -20, 0, 20, 60, 120, 200] },
    probes: [
      { ask: { m: 55 }, expect: { m: 60 } },                                   // off-step
      { ask: { m: 5 }, expect: { m: 0 } },                                     // inside the snap zone
      { ask: { m: 10 }, expect: { m: 0 } },                                    // the zone's edge
      { ask: { m: 20 }, expect: { m: 20 } },                                   // the keyboard's jump out of it
      { ask: { m: -200 }, expect: { m: -200 } },
      { query: '?f=0&dir=270&m=80', expect: { f: 0, dir: 270, m: 80 } },        // a couple alone: no forces at all
      { query: '?f=50&dir=270&m=120', expect: { f: 50, dir: 270, m: 120 } },    // the collar's couple vanishes
      { query: '?f=50&dir=180&m=0', expect: { f: 50, dir: 180, m: 0 } },        // the roller carries nothing
      { query: '?f=60&dir=0&m=-40', expect: { f: 60, dir: 0, m: -40 } },        // the other way along the beam, couple reversed
      { query: '?f=80&dir=35&m=-200', expect: { f: 80, dir: 35, m: -200 } },    // everything at once
      { query: '?f=52&dir=217&m=55', expect: { f: 50, dir: 215, m: 60 } },      // every field adjusted
      { query: '?f=' + 'q'.repeat(40) + '&dir=zzzz&m=yyyy', expect: { f: 50, dir: 270, m: 60 } }   // all rejected
    ],
    clearSpot: { x: 470, y: 300 },                                 // a place no label or graphic ever uses
    minTextPx: 12, minFigPx: 600,
    floors: { texts: 14, graphics: 24 },
    viewport: [
      { width: 800, height: 750, note: 'Canvas iframe: the figure fills the window above the slider' },
      { width: 1280, height: 720, note: 'laptop: the page must fit with the slider visible' }
    ]
  };
  const TOL = 0.5;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const askProbes = SIM.probes.filter(p => p.ask);
  const queryProbes = SIM.probes.filter(p => p.query);
  const EXPECTED_COMBOS = SIM.sliders.reduce((n, sl) => n * SIM.grid[sl.key].length, 1) + askProbes.length;

  let main = null;                                                  // the page's own context, set by install()
  const need = () => { if (!main) throw new Error('Run H.install() first.'); };
  const pick = (o, key) => (o[key] === undefined ? SIM.defaults[key] : o[key]);       // a missing key is the default
  const show = (s, v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(s.decimals);          // the readout text (true minus)

  // A context bundles one page's window, figure and controls, so the same checks run on the page itself and on a
  // hidden iframe's page (queries). Returns null if an element is missing.
  // What the page is REQUIRED to have is whatever SIM names. A page with no reading panel and no
  // reset button says so by setting those ids to null, and then the harness does not go looking for
  // them; a page that names one and has lost it still fails, which is the point. Only the figure and
  // the sliders SIM lists are never optional.
  function makeCtx(win) {
    const doc = win.document;
    const fig = doc.getElementById(SIM.figId);
    if (!fig) return null;
    const byId = (id) => (id ? doc.getElementById(id) : null);
    const ui = { controls: byId(SIM.controlsId), calc: byId(SIM.calcId), reset: byId(SIM.resetId), sliders: {}, readouts: {} };
    for (const s of SIM.sliders) {
      ui.sliders[s.key] = doc.getElementById(`${s.id}-slider`);
      ui.readouts[s.key] = doc.getElementById(`${s.id}-readout`);
    }
    const named = [[SIM.controlsId, ui.controls], [SIM.calcId, ui.calc], [SIM.resetId, ui.reset]];
    const missing = named.some(([id, el]) => id && !el) ||
      [...Object.values(ui.sliders), ...Object.values(ui.readouts)].some(e => !e);
    return missing ? null : { win, doc, fig, ui };
  }

  function install() {
    const f = document.getElementById(SIM.figId);
    const figPx = f ? f.getBoundingClientRect().width : 0;
    if (!f || figPx < SIM.minFigPx) {
      throw new Error(`The figure is only ${Math.round(figPx)} px wide: measurements are unreliable below ` +
        `${SIM.minFigPx} px. Set the window to one of SIM.viewport (${SIM.viewport.map(v => v.width + 'x' + v.height).join(', ')}) and reload.`);
    }
    const c = makeCtx(window);
    if (!c) throw new Error('A page element named in SIM is missing (figure, controls, calculation, reset, or a slider/readout id).');
    main = c;
    return { ok: true, figPx: Math.round(figPx), viewport: [window.innerWidth, window.innerHeight] };
  }

  // ---- measuring -------------------------------------------------------------------------
  // The painted box in viewBox units: getBoundingClientRect through the figure's screen transform (handles any
  // letterboxing or zoom). Every element, text or graphic, is measured the same way, so the comparison is like for like.
  function box(c, el) {
    const m = c.fig.getScreenCTM(), r = el.getBoundingClientRect();
    return { x0: (r.left - m.e) / m.a, y0: (r.top - m.f) / m.d, x1: (r.right - m.e) / m.a, y1: (r.bottom - m.f) / m.d };
  }
  const hits = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > TOL && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > TOL;
  const outside = (b) => b.x0 < -TOL || b.y0 < -TOL || b.x1 > SIM.viewBox.w + TOL || b.y1 > SIM.viewBox.h + TOL;
  const r1 = (n) => Math.round(n * 10) / 10;
  const name = (el, b) => el.tagName === 'text'
    ? `text "${el.textContent}"`
    : `<${el.tagName}${el.getAttribute('class') ? '.' + el.getAttribute('class').replace(/\s+/g, '.') : ''}> @${r1(b.x0)},${r1(b.y0)}-${r1(b.x1)},${r1(b.y1)}`;
  const topLevelG = (c) => Array.from(c.fig.querySelectorAll('.g')).filter(e => !e.parentElement.closest('.g'));

  // Every geometry rule in one place; used by sweep, queries and sensitivity. Returns { violations, minPx, nTexts, nG }.
  function checkFigure(tag, c = main) {
    const out = [];
    const bad = (msg) => out.push(`${tag}: ${msg}`);
    const texts = Array.from(c.fig.querySelectorAll('text.t')).map(el => ({ el, b: box(c, el) }));
    const gs = topLevelG(c).map(el => ({ el, b: box(c, el) }));
    const pcs = gs.filter(g => g.el.classList.contains('pc'));
    const arrows = gs.filter(g => g.el.tagName === 'g' && g.el.firstElementChild && g.el.firstElementChild.tagName === 'line');

    for (const x of texts) if (outside(x.b)) bad(`${name(x.el, x.b)} outside the viewBox`);                       // 1
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {                          // 2
      if (hits(texts[i].b, texts[j].b)) bad(`${name(texts[i].el, texts[i].b)} overlaps ${name(texts[j].el, texts[j].b)}`);
    }
    for (const x of texts) for (const g of gs) {                                                                 // 3
      if (hits(x.b, g.b)) bad(`${name(x.el, x.b)} overlaps ${name(g.el, g.b)}`);
    }
    for (const a of arrows) for (const p of pcs) {                                                               // 4
      if (hits(a.b, p.b)) bad(`${name(a.el, a.b)} overlaps circle ${name(p.el, p.b)}`);
    }
    for (const g of gs) if (outside(g.b)) bad(`${name(g.el, g.b)} outside the viewBox`);                         // 5
    if (texts.length < SIM.floors.texts) bad(`only ${texts.length} texts found (< ${SIM.floors.texts}): the checks are vacuous`);   // 7
    if (gs.length < SIM.floors.graphics) bad(`only ${gs.length} top-level .g found (< ${SIM.floors.graphics}): the checks are vacuous`);

    // 6: rendered size = computed font-size (user units) x the figure's scale, for every text AND tspan
    const scale = c.fig.getScreenCTM().a;
    let minPx = Infinity;
    for (const el of c.fig.querySelectorAll('text, tspan')) {
      const px = parseFloat(c.win.getComputedStyle(el).fontSize) * scale;
      if (px < minPx) minPx = px;
      if (!(px >= SIM.minTextPx)) bad(`${name(el, box(c, el))} renders at ${r1(px)} px (< ${SIM.minTextPx})`);
    }
    return { violations: out, minPx, nTexts: texts.length, nG: gs.length };
  }

  // The HTML rules (checkFigure is SVG only): scale labels and heading parts must not overlap each other, and every element in
  // the calculation and the controls must compute to at least SIM.minTextPx (a <sub> defaults to 83% of its parent).
  function checkPage(tag, c = main) {
    const out = [];
    const rect = (el) => el.getBoundingClientRect();
    const label = (el) => `<${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).replace(/\s+/g, '.') : ''}> "${(el.textContent || '').trim().slice(0, 24)}"`;
    for (const group of c.doc.querySelectorAll('.zl, .ctl-head')) {
      const kids = Array.from(group.children).map(el => ({ el, r: rect(el) })).filter(k => k.r.width > 0 && k.r.height > 0);
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].r, b = kids[j].r;
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > TOL && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > TOL) {
          out.push(`${tag}: ${label(kids[i].el)} overlaps ${label(kids[j].el)}`);
        }
      }
    }
    for (const el of c.doc.querySelectorAll('#calc *, #controls *')) {
      const px = parseFloat(c.win.getComputedStyle(el).fontSize);
      if (!(px >= SIM.minTextPx)) out.push(`${tag}: ${label(el)} computes to ${r1(px)} px (< ${SIM.minTextPx})`);
    }
    return out;
  }

  // ---- driving the real UI ---------------------------------------------------------------
  function setSlider(c, key, v) {
    c.ui.sliders[key].value = String(v);
    c.ui.sliders[key].dispatchEvent(new c.win.Event('input', { bubbles: true }));
  }

  // What the page shows must be `expect`: every slider and readout, and every tracked element where the state puts it.
  function verify(c, expect, tag) {
    const probs = [];
    for (const s of SIM.sliders) {
      const want = pick(expect, s.key), got = c.ui.sliders[s.key].value, out = c.ui.readouts[s.key].textContent;
      if (Math.abs(Number(got) - want) > 1e-9) probs.push(`${tag}: ${s.key} slider shows ${got}, expected ${want}`);
      if (out !== show(s, want)) probs.push(`${tag}: ${s.key} readout "${out}", expected "${show(s, want)}"`);
    }
    // Every input, not just the ones with a slider: on this page the load is dragged, so f and dir
    // never appear in SIM.sliders, yet a track's want() needs them. `expect` carries whatever the
    // probe set; everything else is at its default.
    const state = { ...SIM.defaults, ...expect };
    for (const s of SIM.sliders) state[s.key] = pick(expect, s.key);
    for (const t of SIM.tracks) {                                     // the figure shows what the state says
      const e = c.fig.querySelector(t.sel);
      const want = t.want ? t.want(state) : (t.origin || 0) + state[t.key] * t.pxPerUnit;
      if (want === null || want === undefined) {                      // `want` null: the element must not be there
        if (e) probs.push(`${tag}: ${t.sel} is drawn but should be absent in this state`);
        continue;
      }
      if (!e) { probs.push(`${tag}: nothing found for ${t.sel}`); continue; }
      const b = box(c, e);
      const got = { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, width: b.x1 - b.x0, height: b.y1 - b.y0 }[t.measure];
      if (!(Math.abs(got - want) <= (t.tol === undefined ? TOL : t.tol))) probs.push(`${tag}: ${t.sel} ${t.measure} is ${r1(got)}, expected ${r1(want)}`);
    }
    return probs;
  }

  // Clicks reset (and checks it restored the defaults), then sets each slider; returns drive problems.
  function drive(ask, expect, tag, c = main) {
    // A page with no reset button is put back by setting every slider to its default instead.
    let probs = [];
    if (c.ui.reset) {
      c.ui.reset.click();
      probs = verify(c, SIM.defaults, `${tag} (after reset)`);
    } else {
      for (const s of SIM.sliders) setSlider(c, s.key, SIM.defaults[s.key]);
    }
    for (const s of SIM.sliders) setSlider(c, s.key, pick(ask, s.key));
    return probs.concat(verify(c, expect, tag));
  }
  const tagOf = (s) => SIM.sliders.map(sl => `${sl.key}=${pick(s, sl.key)}`).join(' ');
  const restore = () => drive({}, {}, 'restore');

  function sweep() {
    need();
    const violations = [];
    let combos = 0, minTextPx = Infinity, minTexts = Infinity, minGs = Infinity;
    // the cartesian product of the grid lists, then the `ask` probes
    const grid = SIM.sliders.reduce((acc, sl) => acc.flatMap(c => SIM.grid[sl.key].map(v => ({ ...c, [sl.key]: v }))), [{}]);
    const states = grid.map(g => ({ ask: g, expect: g })).concat(askProbes);
    try {
      for (const st of states) {
        const tag = tagOf(st.ask);
        for (const p of drive(st.ask, st.expect, tag)) violations.push(p);
        const c = checkFigure(tag);
        for (const v of c.violations) violations.push(v);
        for (const v of checkPage(tag)) violations.push(v);
        minTextPx = Math.min(minTextPx, c.minPx);
        minTexts = Math.min(minTexts, c.nTexts);
        minGs = Math.min(minGs, c.nG);
        combos++;
      }
      if (combos !== EXPECTED_COMBOS) violations.push(`sweep ran ${combos} combos, expected ${EXPECTED_COMBOS}`);
    } finally {
      for (const p of restore()) violations.push(p);
    }
    return { combos, violations, minTextPx: r1(minTextPx), minTexts, minGs };
  }

  // ---- probes that need a page load: a query string, in a hidden iframe ---------------------------
  function loadQuery(search) {
    return new Promise((resolve, reject) => {
      const fr = document.createElement('iframe');
      fr.style.cssText = `position:fixed;left:0;top:0;width:${window.innerWidth}px;height:${window.innerHeight}px;border:0;visibility:hidden;pointer-events:none`;
      const timer = setTimeout(() => { fr.remove(); reject(new Error(`the page did not load with ${search} within 10 s`)); }, 10000);
      fr.onload = () => { clearTimeout(timer); resolve(fr); };
      fr.src = window.location.pathname + search;
      document.body.appendChild(fr);
    });
  }

  async function queries() {
    need();
    const violations = [];
    let combos = 0;
    for (const p of queryProbes) {
      const fr = await loadQuery(p.query);
      try {
        const c = makeCtx(fr.contentWindow);
        const tag = `query ${p.query.length > 50 ? p.query.slice(0, 50) + '...' : p.query}`;
        if (!c) { violations.push(`${tag}: the page did not build its elements`); continue; }
        for (const v of verify(c, p.expect || {}, tag)) violations.push(v);
        for (const v of checkFigure(tag, c).violations) violations.push(v);
        for (const v of checkPage(tag, c)) violations.push(v);
        const b = budgetOf(c);
        if (!b.ok) violations.push(`${tag}: budget ${JSON.stringify(b)}`);
        combos++;
      } finally {
        fr.remove();
      }
    }
    return { combos, violationCount: violations.length, sample: violations.slice(0, 10) };
  }

  function plant(x, y, str, size, anchor) {
    const n = main.doc.createElementNS(SVG_NS, 'text');
    n.setAttribute('class', 't');
    n.setAttribute('x', x);
    n.setAttribute('y', y);
    n.setAttribute('font-size', size);
    if (anchor) n.setAttribute('text-anchor', anchor);
    n.textContent = str;
    main.fig.appendChild(n);
    return n;
  }

  function sensitivity() {
    need();
    restore();
    const planted = [];
    const put = (...a) => { const n = plant(...a); planted.push(n); return n; };
    let r;
    const htmlPlants = [];
    try {
      // the clear spot, where the plants below go, must really be clear in the default state
      const spot = SIM.clearSpot;
      const inside = (b) => spot.x >= b.x0 && spot.x <= b.x1 && spot.y >= b.y0 && spot.y <= b.y1;
      const clearSpotEmpty = ![...main.fig.querySelectorAll('text.t')].some(el => inside(box(main, el))) && !topLevelG(main).some(el => inside(box(main, el)));
      // 1: a text in the middle of the largest graphic: the checker must name that graphic
      const gs = topLevelG(main).map(el => ({ el, b: box(main, el) }));
      const area = (g) => (g.b.x1 - g.b.x0) * (g.b.y1 - g.b.y0);
      const big = gs.reduce((m, g) => (area(g) > area(m) ? g : m));
      // The plant has to land INSIDE the graphic it is meant to be caught on. A fixed drop of 24
      // units falls straight out of a thin one -- a beam is about 16 units tall -- and then the
      // checker is right to say nothing and the harness wrongly reports it blind. Drop by a quarter
      // of the box instead, capped at the old 24.
      const drop = Math.min(24, (big.b.y1 - big.b.y0) / 4);
      put((big.b.x0 + big.b.x1) / 2 - 20, (big.b.y0 + big.b.y1) / 2 + drop, 'PROBE1', 16);
      // 2: exactly on an existing label (same anchor, same baseline)
      const first = main.fig.querySelector('text.t');
      put(first.getAttribute('x'), first.getAttribute('y'), 'PROBE2', 16, first.getAttribute('text-anchor'));
      put(SIM.viewBox.w - 5, SIM.clearSpot.y - 30, 'PROBE3', 16);          // 3: runs past the right edge of the viewBox
      put(SIM.clearSpot.x, SIM.clearSpot.y, 'PROBE4', 10);                  // 4: renders below the minimum size
      // 5, 6: an HTML span over the first scale label, a 10 px span in the calculation (checkPage must name both)
      const zl = main.doc.querySelector('.zl');
      if (zl) {
        const s = main.doc.createElement('span');
        s.textContent = 'PLANTPAD';
        s.style.cssText = 'position:absolute;left:0;top:0';
        zl.appendChild(s);
        htmlPlants.push(s);
      }
      // The too-small plant goes in the reading panel when there is one, and in the controls when
      // there is not: checkPage measures both, so either host proves the same thing.
      const tinyHost = main.ui.calc || main.ui.controls;
      let tiny = null;
      if (tinyHost) {
        tiny = main.doc.createElement('span');
        tiny.textContent = 'PLANTTINY';
        tiny.style.fontSize = '10px';
        tinyHost.appendChild(tiny);
        htmlPlants.push(tiny);
      }
      const pageNamed = checkPage('probe').filter(v => v.includes('PLANT'));
      const padCaught = !zl || pageNamed.some(v => v.includes('PLANTPAD') && v.includes('overlaps'));
      const tinyCaught = !tinyHost || pageNamed.some(v => v.includes('PLANTTINY') && v.includes('computes to'));
      const all = checkFigure('probe').violations;
      const named = all.filter(v => v.includes('PROBE'));
      const of = (p) => named.filter(v => v.includes(p));
      const gName = name(big.el, big.b);
      const gCaught = of('PROBE1').some(v => v.endsWith(`overlaps ${gName}`));
      const textCaught = of('PROBE2').some(v => v.includes(`overlaps text "${first.textContent}"`) || v.includes(`"${first.textContent}" overlaps`));
      const clipCaught = of('PROBE3').some(v => v.includes('outside the viewBox'));
      const smallCaught = of('PROBE4').some(v => v.includes('renders at'));
      const onlyPlanted = all.length === named.length;                       // no genuine element is flagged
      r = { gCaught, textCaught, clipCaught, smallCaught, padCaught, tinyCaught, clearSpotEmpty, onlyPlanted, named: named.length };
    } finally {
      for (const n of planted) n.remove();
      for (const n of htmlPlants) n.remove();
      restore();
    }
    r.cleanAfter = checkFigure('after').violations.length === 0 && checkPage('after').length === 0;
    r.flagged = r.gCaught && r.textCaught && r.clipCaught && r.smallCaught && r.padCaught && r.tinyCaught && r.clearSpotEmpty && r.onlyPlanted && r.cleanAfter;
    return r;
  }

  // The window-fit rules for one context (the page, or a query probe's iframe). Uses that window's real size.
  function budgetOf(c) {
    const bottom = (el) => Math.round(el.getBoundingClientRect().bottom);
    const inter = (a, b) => Math.round(Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)));
    const innerH = c.win.innerHeight, doc = c.doc.documentElement;
    const figRect = c.fig.getBoundingClientRect();
    const figBottom = bottom(c.fig);
    // A page with no controls has nothing below the figure to be covered or clipped, so those three
    // measurements are the figure's own: the page still has to fit, and still must not scroll.
    // What is not on the page cannot be below the figure, cannot be covered and cannot be clipped,
    // so those measurements fall back to the figure's own. The page must still fit and must not scroll.
    const controlsBottom = c.ui.controls ? bottom(c.ui.controls) : figBottom;
    const calcBottom = c.ui.calc ? bottom(c.ui.calc) : figBottom;
    const pageHeight = doc.scrollHeight;
    // the sticky row (controls + calculation) sits below the figure; a non-zero overlap means it covers it
    const sideOverlap = c.ui.controls ? inter(c.ui.controls.getBoundingClientRect(), figRect) : 0;
    const controlsClipped = c.ui.controls ? c.ui.controls.scrollHeight > c.ui.controls.clientHeight + 1 : false;
    const calcClipped = c.ui.calc ? c.ui.calc.scrollHeight > c.ui.calc.clientHeight + 1 : false;
    const hscroll = doc.scrollWidth > doc.clientWidth;
    const controlsVisible = controlsBottom <= innerH;
    const fits = pageHeight <= innerH;
    const ok = figBottom <= innerH && controlsVisible && calcBottom <= innerH && !hscroll && fits &&
      sideOverlap === 0 && !controlsClipped && !calcClipped;
    return { viewport: [c.win.innerWidth, innerH], figBottom, controlsBottom, calcBottom, hscroll, controlsVisible, ok, pageHeight, fits, sideOverlap, controlsClipped, calcClipped };
  }

  // budget() checks the window as it is. budget({ width, height }) also REQUIRES the window to be that size (compared
  // with the real innerWidth/innerHeight): resize, reload, install, then ask. Run it at every size in SIM.viewport.
  function budget(want) {
    need();
    const here = { width: window.innerWidth, height: window.innerHeight };
    const listed = SIM.viewport.find(v => v.width === here.width && v.height === here.height);
    if (want && (want.width !== here.width || want.height !== here.height)) {
      return { ok: false, listed: !!listed, error: `the window is ${here.width}x${here.height}, not ${want.width}x${want.height}: resize the window, reload, run H.install() again` };
    }
    const r = budgetOf(main);
    r.listed = !!listed;
    r.note = listed ? listed.note : `${here.width}x${here.height} is not one of SIM.viewport (${SIM.viewport.map(v => v.width + 'x' + v.height).join(', ')}): fine for a look, not a budget run`;
    return r;
  }

  function all() {
    const inst = install();
    const s = sweep();
    return {
      install: inst,
      sweep: { combos: s.combos, violationCount: s.violations.length, sample: s.violations.slice(0, 10), minTextPx: s.minTextPx, minTexts: s.minTexts, minGs: s.minGs },
      sensitivity: sensitivity(),
      budget: budget(),
      queries: queryProbes.length ? `${queryProbes.length} query probes not run here: await H.queries()` : 'none'
    };
  }

  window.H = { install, sweep, queries, sensitivity, budget, all, checkFigure, checkPage, show, SIM, PHYS };
})();
