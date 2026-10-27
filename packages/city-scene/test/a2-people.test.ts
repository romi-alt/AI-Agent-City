import assert from 'node:assert/strict';
import { it } from 'node:test';
import { StreetSim } from '../src/life/street-sim.ts';
import { walkSignal } from '../src/life/signals.ts';
import { CROSSWALK_HALF_WIDTH, ROAD_HALF } from '../src/life/geometry.ts';
import { QUALITY } from '../src/quality/quality.ts';
import { layout, rectsOverlap } from './a2-helpers.ts';

const DT = 1 / 30;

it('fills the pedestrian budget exactly', () => {
  for (const level of ['ultra', 'balanced', 'low'] as const) {
    const q = QUALITY[level];
    const sim = new StreetSim(layout, {
      vehicles: q.vehicles,
      pedestrians: q.pedestrians,
      roofWorkers: q.microAnimations ? 1 : 0,
    });
    assert.equal(sim.people.poses.length, q.pedestrians, level);
    // A mix: walkers plus standing, talking and seated people.
    assert.ok(sim.people.poses.some(p => p.mode === 2) || q.pedestrians < 30, `${level}: somebody is seated`);
    assert.ok(sim.people.poses.some(p => p.mode === 1));
  }
});

it('crosses only on walk, and no car is ever on a crosswalk with people on it (5 simulated minutes)', () => {
  const q = QUALITY.ultra;
  const sim = new StreetSim(layout, { vehicles: q.vehicles, pedestrians: q.pedestrians, roofWorkers: 1, seed: 4 });
  const net = sim.traffic.net;
  let t = 0;
  let crossings = 0;
  const wasCrossing = new Set<number>();
  const doorsUsed = new Set<number>();
  for (let step = 0; step < 300 * 30; step++) {
    t += DT;
    const before = sim.people.states();
    sim.step(DT, t);
    const after = sim.people.states();
    after.forEach((s, i) => {
      if (s === 'cross' && before[i] !== 'cross') {
        crossings++;
        wasCrossing.add(i);
      }
      if (s === 'inside') doorsUsed.add(i);
    });
    for (const c of sim.people.crossing()) {
      const cw = net.crosswalks[c.cw]!;
      // The person is between the kerbs of this crosswalk...
      assert.ok(Math.hypot(c.x - cw.x, c.z - cw.z) < ROAD_HALF + 1.8);
      if (Math.hypot(c.x - cw.x, c.z - cw.z) > ROAD_HALF + 0.2) continue;
      // ...and no vehicle body touches the stripe.
      const stripe =
        cw.walkAxis === 'x'
          ? { x: cw.x, z: cw.z, yaw: 0, hl: ROAD_HALF, hw: CROSSWALK_HALF_WIDTH }
          : { x: cw.x, z: cw.z, yaw: Math.PI / 2, hl: ROAD_HALF, hw: CROSSWALK_HALF_WIDTH };
      for (const v of sim.traffic.vehicles) {
        if (!v.active || Math.hypot(v.pose.x - cw.x, v.pose.z - cw.z) > 6) continue;
        const r = { x: v.pose.x, z: v.pose.z, yaw: v.pose.yaw, hl: v.len / 2, hw: v.width / 2 };
        assert.ok(
          !rectsOverlap(r, stripe),
          `t=${t.toFixed(2)}: ${v.kind}#${v.id} on crosswalk ${c.cw} with a pedestrian`,
        );
      }
    }
  }
  assert.ok(crossings > 100, `only ${crossings} crossings`);
  assert.ok(wasCrossing.size > 30, 'many different people cross');
  assert.ok(doorsUsed.size > 3, 'people walk into lobbies');
});

it('starts crossing only while the walk signal is on', () => {
  const sim = new StreetSim(layout, { vehicles: 50, pedestrians: 80, roofWorkers: 0, seed: 9 });
  let t = 0;
  for (let step = 0; step < 120 * 30; step++) {
    t += DT;
    const before = sim.people.states();
    // Single sub-step so the signal time is exactly t.
    sim.traffic.step(DT, t);
    sim.people.step(DT, t);
    const sig = walkSignal(t);
    for (const c of sim.people.crossing()) {
      if (before[c.id] === 'cross') continue;
      const axis = sim.traffic.net.crosswalks[c.cw]!.walkAxis;
      assert.equal(axis === 'x' ? sig.ew : sig.ns, 'walk');
    }
  }
});

it('keeps walkers moving (nobody is stuck forever)', () => {
  const sim = new StreetSim(layout, { vehicles: 90, pedestrians: 160, roofWorkers: 1, seed: 2 });
  const start = sim.people.poses.map(p => ({ x: p.x, z: p.z }));
  let t = 0;
  const moved = new Set<number>();
  for (let step = 0; step < 180 * 30; step++) {
    t += DT;
    sim.step(DT, t);
    if (step % 30 === 0)
      sim.people.walkers.forEach(w => {
        const p = sim.people.poses.indexOf(w.pose);
        if (Math.hypot(w.pose.x - start[p]!.x, w.pose.z - start[p]!.z) > 5) moved.add(p);
      });
  }
  assert.ok(moved.size >= sim.people.walkers.length * 0.95, `${moved.size}/${sim.people.walkers.length} walkers moved`);
  void rectsOverlap;
});
