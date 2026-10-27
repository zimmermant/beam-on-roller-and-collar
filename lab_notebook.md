# Lab notebook — beam_roller_collar

## 2026-10-26 — built: a beam on a roller and a collar, four diagrams, one slider

### Summary
A third free-body-diagram sandbox for PHYS 291 Statics, built from a figure Todd supplied: a
horizontal beam from a **roller at A** on the ground to a **collar at C** on a fixed vertical shaft,
with a load **F⃗_B** at **B** (2.4 m from A, 1.6 m short of C) and an applied couple **M⃗₁** on the
beam. It is the sibling of `beam_link_fbd`, with the two-force link replaced by a support that can
also resist turning — so this one has a *couple* among the unknowns, which the earlier two did not.

Todd asked for the diagrams-only shape from the start: four panels, no reading card, no "how to read
this" card. The load is dragged; the applied couple gets the page's single slider.

The statics, with x right, y up and moments counterclockwise:

    ΣF_x = 0:   N_Cx = − F_Bx          (the collar pushes normal to its shaft: horizontal)
    ΣF_y = 0:   N_Ay = − F_By          (the roller pushes normal to the ground: vertical)
    ΣM_A = 0:   M_C  = − M₁ − x₁ F_By

Neither reaction *force* appears in the moment equation — N⃗_A acts at A, and N⃗_C is horizontal along
A's own line — so each unknown answers to exactly one equation. That is the teaching point, and it is
why the figure is worth four panels rather than one.

### Decisions Todd made
- **Diagrams only**, four panels, the load dragged and M₁ on a slider. No calculation card: the
  numbers live beside the arrows.
- **Notation, restated twice and binding**: never `A_x`, never `C_x`, never `A_y`. Forces are F⃗ with
  a point subscript; the roller's and collar's reactions are *normal* forces **N⃗_A** and **N⃗_C**; the
  applied couple is numbered, **M⃗₁**, never named after a point; the collar's reaction couple takes
  its support letter, **M⃗_C**; position vectors would be r⃗_{Cx}, r⃗_{Ay}. The rules live in
  `physics-notation.md` in the Wiki_Vault project (not in this workspace — I looked here first and
  wrongly reported it missing).

### Decisions I made
- **The subscript on M₁ is a Unicode subscript (₁), never an ASCII 1.** The unit lint reads a bare
  ASCII digit in a symbol as a number without a unit. `format.js` maps a `sub` segment through
  `asSubscript`, so the same table-driven field prints `M₁` in HTML, a lowered tspan in SVG and
  "M sub one" in aria text.
- **The field key is `m`, not `m1`.** Preset keys are `^[a-z]+$`, so the digit cannot go in the key.
  The symbol carries it instead (`symbol: 'M', sub: '1', subWord: 'one'`).
- **The arrow over a vector is drawn, not typed.** U+20D7 (combining arrow above) renders as stacked
  broken bars in the figure font, so every vector name draws its own bar with `getComputedTextLength`.
- **A diagonal arrow and a couple arc are drawn as short collinear pieces at the TOP level of the
  group**, not as one long element and not nested. The harness measures bounding boxes, and a
  diagonal line claims its whole rectangle, so a single long arrow would "cover" half the panel and
  push every label away. The pieces are top-level because the harness measures the outermost element
  carrying class `g`.
- **The polygon panel is forces only**, with a caption saying the couples balance apart from it. A
  couple is a free vector and has no place in a tip-to-tail force polygon; saying so is better than
  leaving a student to wonder where M₁ went.
- **Zero quantities are labelled in words** ("N⃗_C 0 N") rather than drawn as a zero-length arrow, so
  a vanished reaction is visibly *zero* and not visibly *missing*.

### Problems encountered, and how they were resolved
- **`coupleArcGeometry is not defined` in the built page, with every node test green.** The source
  used a renaming import (`import { coupleArc as coupleArcGeometry }`); node honours the alias, the
  single-scope inliner in `build.js` cannot. Fixed, and `build.js` now throws on any renaming import,
  with a test. This was a whole class of bug the node suite was blind to.
- **`s.m1` against a field key of `m`** — nine physics tests went NaN. Fixed at the source.
- **Labels overlapping the M₁ arc at the extremes.** `LABEL_CHAR_W` was 10.6, but the widest label
  this figure prints, "M₁ 200 N·m", measures 113.7 units for 10 characters — 11.37 each. A moment's
  label is nearly all digits and digits are wide. Raised to 11.4; one crowded state then needed
  `PLACE_MAX_SHIFT` 95 → 110. Both constants now have a test that says where the number came from.
- **The space panel's readouts collided with each other and with the arc.** Moved to the panel's
  top-right.
- **The harness could not see a planted fault** (`gCaught: false`): the plant dropped an element 24
  units, and the beam is 16 units tall, so the drop left the figure entirely instead of overlapping.
  The drop is now a quarter of the box height, capped at 24.
- **Three harness mutations survived the suite.** The harness keeps its own copy of the statics,
  written from the equations, precisely so that drift shows up — but only two quantities reached a
  track, so the collar's couple could be deleted from it unnoticed, and the two reactions could be
  swapped because the magnitudes were written out a second time from the load. Fixed both ways: the
  magnitudes now come from the reactions themselves, and a new test compares the harness's statics
  with `src/physics.js` on every state of the grid. A third row deleted the only query probe at
  zero load; the probe rule now requires each no-slider input to be driven at two distinct values
  *and* at its minimum, since the sweep drives sliders and can never reach those states by itself.

### Verification
- `node --test test/*.test.js`: **212 green**, 0 failing.
- Mutation audit (`node tools/mutations.mjs --coverage --strict`), run last, after the tests stopped
  changing: **all 202 mutations caught, 0 misses**. It took three full runs to get there:
  1. 20 misses. Twelve were real gaps in the tests (the ones listed under *Problems* above, plus the
     scene, layout, interaction, unit and CSS assertions nobody was making); eight were in `app.js`
     and went away with a new `test/app.test.js`.
  2. 1 miss and 5 rows that could no longer apply. The misses taught more than the fixes: a *row*
     that cannot apply is as blind as a test that cannot fail, and four of those five were stale
     because I had edited the very line they quoted. The one real miss was the click-versus-drag
     test — it moved the pointer 2 units and compared values, but a 2-unit drag snaps back to the
     same numbers, so the test passed whether or not the threshold existed. It now moves 2.9 units
     (still under the 3-unit threshold) straight out along the load, because 50 + 2.9 snaps to 55.
  3. 1 "too blunt" row: the store's change-detection is reached by 15 tests now that the page has
     its own test file, over the default limit of 12. Limit raised to 16, with the reason written in.
- `--coverage` named 32 tests that no mutation could make fail. I wrote 13 new rows for the ones
  where a plausible wrong edit exists (a couple arc that grows ten times too fast, a polygon drawn
  upside down or never scaled to fit, an arrow drawn as one long piece, a panel losing its heading,
  a force printed to the nearest newton, a reset button creeping back into the page, a harness
  track saying `undefined` where it means absent, an input key with a digit in it, a unit word that
  is the unit). That left 17, all of them guards that overlap a covered test; I stopped there rather
  than write rows for their own sake.
- Browser, the built single file served over http, at both budgets:
  - **800 × 750** (Canvas iframe): figure 784 px, smallest text 13.1 px, 14 sweep states and 7 query
    probes with no violation, every sensitivity plant caught, page fits with the slider visible.
  - **1280 × 720** (laptop): figure 1264 px, smallest text 16.3 px, same clean sweep and probes.
  - Spot-checked the extreme state `?f=80&dir=35&m=-200` by eye as well: M⃗_C 89.9 N·m, N⃗_A 45.9 N,
    N⃗_C 65.5 N, nothing overlapping.

### Open questions / next steps
- Not published. Todd has not asked, and the skill's gate says never to publish on my own initiative.
  If he does: the sibling went out as `zimmermant/beam-and-two-force-link` with a card on
  <https://zimmermant.github.io/simulations/>, and this one would follow the same procedure in
  `publishing.md`.
- The roller is treated as **bilateral** — at some load directions N⃗_A points *into* the ground, which
  a real roller could not do. The earlier sims make the same idealisation. Worth deciding whether a
  future version should flag "this support would lift off" instead.
- No second "detail" page, and none asked for.

### Source material
- Todd's figure (the second image in the session of 2026-10-26).
- Notation rules: `physics-notation.md` in the Wiki_Vault project.
- Sibling simulation and its notebook: `../beam_link_fbd/`.
- The kit and its procedure: the `building-physics-simulations` skill (its `kit/README.md`,
  `process.md`, `lessons.md` and `publishing.md`), which stays local and is never published.
