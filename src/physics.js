// The statics: pure functions of the stored inputs, no DOM.
//
// A horizontal beam A-C. A is a ROLLER on the ground, so what it can push with is normal to the
// ground: vertical only. C is a COLLAR on a vertical shaft; it slides along the shaft, so it cannot
// push along it, and what it can do is push normal to the shaft (horizontal) and resist turning (a
// couple). The student sets the load at B -- its magnitude `f` and its direction `dir`, measured CCW
// from +x, so straight down is 270 degrees -- and the applied couple `m` (drawn M_1), positive
// counterclockwise. The stored key is `m` because a FIELDS key is plain lower-case letters; the name
// the student sees is M_1, which is the notation reference's rule for an applied couple.
//
// NOTATION (the Wiki_Vault reference, .claude/references/physics-notation.md): a force is never named
// after a point. A roller and a smooth collar both give a NORMAL force, so they are N_A and N_C, not
// F_A and F_C. An APPLIED couple moment is numbered -- M_1 -- even though it is drawn at a labelled
// point, because a couple has no point of application; a support's REACTION moment takes the support
// letter, so the collar's is M_C.
//
// Axes: x right, y up, moments counterclockwise positive. Three unknowns, three equations:
//
//   sum F_x = 0:   N_Cx + F_Bx = 0          ->  N_Cx = -F_Bx
//   sum F_y = 0:   N_Ay + F_By = 0          ->  N_Ay = -F_By
//   sum M_A = 0:   M_1 + M_C + x1 F_By = 0  ->  M_C = -M_1 - x1 F_By
//
// (In that last line the A names the moment CENTRE, not a moment.) N_C is horizontal and acts on the
// same line as A, so it has no moment about A, and N_A acts AT A, so neither reaction force appears
// in the moment equation. That is what makes each unknown answer to a different thing.

export const DEG = Math.PI / 180;

export const X1 = 2.4;               // m, A to B
export const X2 = 1.6;               // m, B to C
export const SPAN = X1 + X2;         // m, A to C

export const FORCE_DP = 1;           // decimals printed for a force
export const MOMENT_DP = 1;          // decimals printed for a couple moment

// The subscript of each quantity's name. ONE source of truth, so the figure and any other reader can
// never drift apart. The load and the two normal forces take their point; the applied couple takes a
// NUMBER, because it has no point of application; the collar's reaction couple takes its support.
export const LOAD_SUB = 'B';
export const NORMAL_SUB = { roller: 'A', collar: 'C' };
export const COUPLE_SUB = { applied: '1', collar: 'C' };

// cos and sin of a whole number of degrees, EXACT at the quadrant points. Math.cos(270 * DEG) is
// -1.8e-16, not 0, which would leave a hair of horizontal load in a load that is exactly vertical --
// and the collar force is nothing BUT the horizontal load, so the hair would be the whole answer.
export function cosDeg(d) {
  const m = ((d % 360) + 360) % 360;
  if (m === 90 || m === 270) return 0;
  if (m === 0) return 1;
  if (m === 180) return -1;
  return Math.cos(m * DEG);
}

export function sinDeg(d) {
  const m = ((d % 360) + 360) % 360;
  if (m === 0 || m === 180) return 0;
  if (m === 90) return 1;
  if (m === 270) return -1;
  return Math.sin(m * DEG);
}

// The applied load as components, in newtons. Adding 0 turns -0 into 0.
export function loadComponents(s) {
  return { x: s.f * cosDeg(s.dir) + 0, y: s.f * sinDeg(s.dir) + 0 };
}

// The couple the collar must apply, in newton metres, counterclockwise positive.
export function collarCouple(s) {
  return -s.m - X1 * loadComponents(s).y + 0;
}

// Everything that is shown but not stored.
export function derive(s) {
  const B = loadComponents(s);
  const NA = { x: 0, y: -B.y + 0 };        // the roller: normal to the ground, so vertical
  const NC = { x: -B.x + 0, y: 0 };        // the collar: normal to the shaft, so horizontal
  const mc = collarCouple(s);
  return {
    B, NA, NC, mc,
    magB: Math.hypot(B.x, B.y),
    magNA: Math.abs(NA.y),
    magNC: Math.abs(NC.x),
    magMC: Math.abs(mc)
  };
}

// Which way a couple turns: 'ccw' when positive, 'cw' when negative, 'none' at zero.
export function turnOf(m) {
  if (m > 0) return 'ccw';
  if (m < 0) return 'cw';
  return 'none';
}
