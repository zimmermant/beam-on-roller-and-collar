import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, collarCouple, loadComponents, turnOf, cosDeg, sinDeg,
         X1, X2, SPAN, FORCE_DP, MOMENT_DP, LOAD_SUB, NORMAL_SUB, COUPLE_SUB } from '../src/physics.js';
import { STATES } from './grid.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

// The moment of the whole system about ANY point, counterclockwise positive. Equilibrium means this
// vanishes wherever the point is, not just about A, and that is the sharpest check there is on a
// problem whose answer includes a couple.
function momentAbout(s, px) {
  const d = derive(s);
  const cross = (atX, F) => (atX - px) * F.y;          // every force acts on the beam's own line, y = 0
  return s.m + d.mc + cross(0, d.NA) + cross(X1, d.B) + cross(SPAN, d.NC);
}

test('the geometry is the figure: the load between a roller at A and a collar at C', () => {
  assert.equal(X1, 2.4);
  assert.equal(X2, 1.6);
  assert.equal(SPAN, 4);
  assert.ok(X1 !== X2 && X1 !== SPAN / 2, 'keep the three lengths distinct, or a wrong formula can still look right');
});

test('the names follow the notation reference: numbered applied couple, lettered reaction couple', () => {
  assert.equal(LOAD_SUB, 'B', 'the load takes its point of application');
  assert.deepEqual(NORMAL_SUB, { roller: 'A', collar: 'C' }, 'both reactions are normal forces at their points');
  assert.equal(COUPLE_SUB.applied, '1', 'an applied couple is NUMBERED: it has no point of application');
  assert.equal(COUPLE_SUB.collar, 'C', "a support's reaction couple takes the support letter");
  assert.ok(!/[A-Z]/.test(COUPLE_SUB.applied), 'the applied couple must never be given a point letter');
});

test('cosDeg and sinDeg are EXACT at the quadrant points, where Math.cos is not', () => {
  assert.equal(cosDeg(270), 0);
  assert.equal(sinDeg(180), 0);
  assert.equal(cosDeg(0), 1);
  assert.equal(cosDeg(180), -1);
  assert.equal(sinDeg(90), 1);
  assert.equal(sinDeg(270), -1);
  assert.notEqual(Math.cos(270 * Math.PI / 180), 0);   // the bug this guards against
  near(cosDeg(35), Math.cos(35 * Math.PI / 180));
  assert.equal(sinDeg(360), sinDeg(0));
});

test('the default state, hand-derived', () => {
  // F_B = 50 N down, M_1 = 60 N·m counterclockwise, x1 = 2.4 m.
  //   N_Ay = -F_By = +50 N up.   N_Cx = -F_Bx = 0.
  //   M_C = -M_1 - x1 F_By = -60 - 2.4(-50) = -60 + 120 = +60 N·m counterclockwise.
  const d = derive({ f: 50, dir: 270, m: 60 });
  assert.deepEqual(d.B, { x: 0, y: -50 });
  near(d.NA.y, 50);
  near(d.NA.x, 0, 0);
  near(d.NC.x, 0);
  near(d.NC.y, 0, 0);
  near(d.mc, 60);
  assert.equal(turnOf(d.mc), 'ccw');
});

test('a roller carries nothing when the load is along the beam', () => {
  for (const dir of [0, 180, 360]) {
    const d = derive({ f: 60, dir, m: 40 });
    assert.equal(d.NA.y, 0, `dir ${dir}: the roller is vertical, and there is nothing vertical to carry`);
    near(Math.abs(d.NC.x), 60, 1e-9);
    near(d.mc, -40, 1e-9);                            // only the applied couple is left to balance
  }
});

test('a collar carries no FORCE when the load is vertical, only a couple', () => {
  for (const dir of [90, 270]) {
    const d = derive({ f: 60, dir, m: 0 });
    assert.equal(d.NC.x, 0, `dir ${dir}: the collar pushes normal to its shaft, and there is nothing horizontal`);
    near(Math.abs(d.NA.y), 60);
    assert.notEqual(d.mc, 0, 'but it still has to stop the beam turning');
  }
});

test('the collar needs no couple when the applied one already balances the load about A', () => {
  // M_1 = x1 F, with the load straight down, leaves M_C = 0
  const d = derive({ f: 50, dir: 270, m: X1 * 50 });
  near(d.mc, 0);
  assert.equal(turnOf(d.mc), 'none');
  // and a hair either side of it turns the collar's couple round
  assert.equal(turnOf(derive({ f: 50, dir: 270, m: X1 * 50 - 10 }).mc), 'ccw');
  assert.equal(turnOf(derive({ f: 50, dir: 270, m: X1 * 50 + 10 }).mc), 'cw');
});

test('a couple on its own is balanced by a couple: no forces anywhere', () => {
  const d = derive({ f: 0, dir: 215, m: 80 });
  for (const v of [d.B.x, d.B.y, d.NA.y, d.NC.x, d.magB, d.magNA, d.magNC]) assert.equal(v, 0);
  near(d.mc, -80);
  assert.equal(d.magMC, 80);
});

test('nothing applied at all means nothing anywhere', () => {
  const d = derive({ f: 0, dir: 90, m: 0 });
  for (const v of [d.NA.y, d.NC.x, d.mc, d.magB, d.magNA, d.magNC, d.magMC]) assert.equal(v, 0);
  assert.equal(turnOf(d.mc), 'none');
});

test('EVERY state of the grid is in equilibrium: the forces sum to zero', () => {
  for (const s of STATES) {
    const d = derive(s);
    near(d.NA.x + d.B.x + d.NC.x, 0, 1e-12);
    near(d.NA.y + d.B.y + d.NC.y, 0, 1e-12);
  }
});

test('and the moments sum to zero about EVERY point, not just about A', () => {
  for (const s of STATES) {
    for (const px of [0, X1, SPAN, -3.7, 12.5]) {
      near(momentAbout(s, px), 0, 1e-9, `${JSON.stringify(s)} about x = ${px}`);
    }
  }
});

test('each unknown answers to a different thing', () => {
  const base = { f: 50, dir: 215, m: 60 };
  const d = derive(base);
  // the applied couple moves the collar's couple and nothing else
  const m2 = derive({ ...base, m: base.m + 40 });
  near(m2.NA.y, d.NA.y);
  near(m2.NC.x, d.NC.x);
  near(m2.mc, d.mc - 40);
  // the roller answers only to the vertical load, the collar's force only to the horizontal
  for (const s of STATES) {
    const q = derive(s);
    near(q.NA.y, -loadComponents(s).y, 1e-12);
    near(q.NC.x, -loadComponents(s).x, 1e-12);
  }
});

test('the whole thing is linear in the load and in the applied couple', () => {
  const one = derive({ f: 20, dir: 215, m: 30 });
  const two = derive({ f: 40, dir: 215, m: 60 });
  near(two.NA.y, 2 * one.NA.y);
  near(two.NC.x, 2 * one.NC.x);
  near(two.mc, 2 * one.mc);
});

test('turnOf names the sense, and calls exactly zero neither way', () => {
  assert.equal(turnOf(5), 'ccw');
  assert.equal(turnOf(-5), 'cw');
  assert.equal(turnOf(0), 'none');
  assert.equal(turnOf(-0), 'none');
});

test('the grid stays inside the drawing budgets the figure is built for', () => {
  let maxF = 0, maxM = 0;
  for (const s of STATES) {
    const d = derive(s);
    maxF = Math.max(maxF, d.magB, d.magNA, d.magNC);
    maxM = Math.max(maxM, d.magMC);
  }
  near(maxF, 80, 1e-9);   // no force can exceed the load itself: both reactions are one component of it
  assert.ok(maxM <= 200 + X1 * 80 + 1e-9, `the biggest couple is ${maxM}`);
  assert.ok(maxM > 380, 'and the grid really reaches it');
});

test('no quantity is ever reported as negative zero', () => {
  for (const s of STATES) {
    const d = derive(s);
    for (const v of [d.B.x, d.B.y, d.NA.x, d.NA.y, d.NC.x, d.NC.y, d.mc]) {
      assert.ok(!Object.is(v, -0), `${JSON.stringify(s)} produced a negative zero`);
    }
  }
  assert.ok(!Object.is(collarCouple({ f: 0, dir: 0, m: 0 }), -0));
});

test('the printed precisions are the ones the figure claims', () => {
  assert.equal(FORCE_DP, 1);
  assert.equal(MOMENT_DP, 1);
});
