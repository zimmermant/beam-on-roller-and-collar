# Beam on a roller and a collar

**Live:** <https://zimmermant.github.io/beam-on-roller-and-collar/>

An interactive free-body-diagram sandbox for PHYS 291 Statics. One page, no network, nothing to
install: open `dist/beam_roller_collar.html`.

A horizontal beam runs from a **roller** at **A**, sitting on the ground, to a **collar** at **C**
riding on a fixed vertical shaft. A load **F⃗_B** acts at **B**, and an applied couple **M⃗₁** acts on
the beam. Drag the load by its handle, set the couple with the one slider, and watch four pictures of
the same equilibrium stay in step:

| panel | what it shows |
|---|---|
| The situation | the given figure, with the draggable load and the applied couple |
| The beam as a single point | the three forces, all from one point — and no couples |
| Free-body diagram of the beam | both supports replaced by what they do, couples included |
| The forces tip to tail | the three forces as a closed polygon |

## What the supports can do, and what follows

A roller on the ground can only push **normal to the ground**: vertically. A collar on a shaft slides
along it, so it can only push **normal to the shaft** (horizontally) and resist turning. Three
unknowns, three equations, with x right, y up and moments counterclockwise:

    ΣF_x = 0:   N_Cx + F_Bx = 0              →  N_Cx = − F_Bx
    ΣF_y = 0:   N_Ay + F_By = 0              →  N_Ay = − F_By
    ΣM_A = 0:   M₁ + M_C + x₁ F_By = 0       →  M_C = − M₁ − x₁ F_By

(The A in ΣM_A names the moment centre, not a moment.) N⃗_C is horizontal and acts on A's own line, so
it has no moment about A, and N⃗_A acts *at* A — neither reaction force appears in the moment equation
at all. That is why each unknown answers to a different thing, and why the sandbox has four things
worth finding:

- a **vertical** load ⇒ the collar carries **no force**, only a couple;
- a load **along the beam** ⇒ the roller carries **nothing**;
- **M₁ = x₁ F** ⇒ the collar's couple **vanishes**;
- **no load at all** ⇒ no forces anywhere, yet the beam is still in equilibrium: a couple is balanced
  by a couple, and the force polygon is empty.

Anything that comes out exactly zero is **said in words** rather than left out, because a missing
arrow and a zero look identical otherwise.

## Notation

From Todd's notation conventions, which are binding here. The
load is **F⃗_B**. Both supports are smooth contacts, so their reactions are **normal** forces: **N⃗_A**
and **N⃗_C**, never a generic F⃗. An **applied** couple is **numbered** — **M⃗₁** — because a couple has
no point of application, even when it is drawn at a labelled point; a support's **reaction** couple
takes the support letter, **M⃗_C**. Every vector carries a drawn arrow, a moment's unit is **N·m**
with a centred dot, and no ASCII underscore ever reaches the screen.

## Using it

- **Drag the round handle** on the load arrow, or tab to it and use the arrow keys (left/right swing,
  up/down pull harder; Home for the hardest straight-down pull, End for no load).
- **The slider** sets the applied couple, either way round, and snaps to zero.
- A link can preset all three: `?f=50&dir=270&m=120` (that one makes the collar's couple vanish).

## Working on it

```
node build.js                  # writes dist/beam_roller_collar.html from src/
node --test test/*.test.js     # the suite
node tools/mutations.mjs --coverage --strict
```

The browser harness needs a real layout engine, so node does not run it. Serve the folder, open the
page at one of the sizes in `SIM.viewport`, reload, then in the page:

```
eval(await (await fetch('/tools/browser-harness.js')).text()); H.install(); H.all()
await H.queries()
```

Pass is `sweep.violationCount` 0, `queries.violationCount` 0, `sensitivity.flagged` true and
`budget.ok` true, at **both** 800 × 750 and 1280 × 720.

### Things worth knowing before changing the figure

**Arrows and couple arcs are drawn as separate short top-level pieces.** Every overlap check works on
bounding rectangles, and one long diagonal line — or one arc — claims its whole square, which is
exactly where the labels want to go. The pieces must be top level, because the harness measures the
outermost element carrying class `g`.

**Labels are placed by a solver**, `placeLabels` in `src/layout.js`, against the boxes of everything
already drawn. Its constants are measured in Chromium: `LABEL_CHAR_W` is taken from the **widest**
label the figure prints, not an average, because a label of a moment is nearly all digits and digits
are wider than letters.

**The load has no slider.** It is dragged, so its FIELDS entries carry `noSlider`, and everything that
builds or checks a slider reads `SLIDER_FIELDS` while everything about state, snapping and presets
still reads `FIELDS`.

**The build refuses a renaming import** (`import { a as b }`). Node honours the alias; the inliner
strips the import line and every module shares one scope, so `b` would never exist and the page would
die at run time while every node test passed. That is the one class of bug the suite is blind to by
construction, so the build catches it instead.

## Embedding it

The page has no frame-busting code and GitHub Pages sends no frame-blocking headers, so it can be put
in an iframe. Some learning-management systems restrict what an iframe may load; that is their
setting, not this page's.

It is built for a window about 800 px wide and 750 px tall, so give it those:

```html
<iframe src="https://zimmermant.github.io/beam-on-roller-and-collar/dist/beam_roller_collar.html?f=50&amp;dir=270&amp;m=120"
        width="100%" height="750" style="border:0; max-width:800px"
        title="Beam on a roller and a collar" loading="lazy"></iframe>
```

That preset is the state worth opening on: a straight-down load of 50 N with an applied couple of
120 N·m, which is exactly M₁ = x₁ F, so the collar's reaction couple comes out **zero** and the page
says so in words.

## Licence

MIT — see [LICENSE](LICENSE). The physics is nobody's property; the code is yours to take.
