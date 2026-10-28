import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Boids, type BirdView } from '../src/life/birds/boids.ts';
import { birdWorld } from '../src/life/birds/obstacles.ts';
import { StreetSim } from '../src/life/street-sim.ts';
import { QUALITY } from '../src/quality/quality.ts';
import { layout, rectsOverlap } from './a2-helpers.ts';

const DT = 1 / 30;
const Q = QUALITY.ultra;

function street(seed: number) {
  return new StreetSim(layout, { vehicles: Q.vehicles, pedestrians: Q.pedestrians, roofWorkers: 1, seed });
}

/** Run a city for `seconds`, calling `each` after every step. */
function run(sim: StreetSim, seconds: number, each: (t: number) => void) {
  let t = 0;
  for (let i = 0; i < seconds * 30; i++) {
    t += DT;
    sim.step(DT, t);
    each(t);
  }
}

it('traffic never reverses, never overlaps, and brakes and accelerates progressively (4 simulated minutes)', () => {
  const sim = street(9);
  const vs = sim.traffic.vehicles;
  const last = new Map<number, number>();
  let worstJerk = 0;
  let jerks = 0;
  let samples = 0;
  run(sim, 240, () => {
    for (const v of vs) {
      if (!v.active) continue;
      assert.ok(v.v >= 0 && Number.isFinite(v.v), `speed ${v.v}`);
      assert.ok(Number.isFinite(v.yawRate) && Number.isFinite(v.a));
      const before = last.get(v.id);
      if (before !== undefined) {
        const jerk = Math.abs(v.a - before) / DT;
        worstJerk = Math.max(worstJerk, jerk);
        // The commanded acceleration builds up at a bounded rate; only an emergency cap may exceed it.
        if (jerk > 15) jerks++;
        samples++;
      }
      last.set(v.id, v.a);
    }
    const act = vs.filter(v => v.active);
    for (let i = 0; i < act.length; i++)
      for (let j = i + 1; j < act.length; j++) {
        const a = act[i]!;
        const b = act[j]!;
        if (Math.abs(a.pose.x - b.pose.x) > 4 || Math.abs(a.pose.z - b.pose.z) > 4) continue;
        const r = (v: typeof a) => ({
          x: v.pose.x,
          z: v.pose.z,
          yaw: v.pose.yaw,
          hl: v.len / 2 - 0.04,
          hw: v.width / 2 - 0.04,
        });
        assert.ok(!rectsOverlap(r(a), r(b)), `vehicles ${a.id} and ${b.id} overlap`);
      }
  });
  assert.ok(
    jerks / samples < 0.002,
    `${jerks} of ${samples} steps had a jerk above 15 (worst ${worstJerk.toFixed(1)})`,
  );
});

it('a queue sets off as a wave: each driver starts a moment after the car ahead', () => {
  const sim = street(9);
  const vs = sim.traffic.vehicles;
  const delays: number[] = [];
  const waitingFor = new Map<number, number>();
  const leaderStart = new Map<number, number>();
  run(sim, 360, t => {
    for (const v of vs) {
      if (!v.active) continue;
      const lead = vs.filter(o => o.active && o.piece === v.piece && o.s > v.s).sort((a, b) => a.s - b.s)[0];
      if (!lead) continue;
      // Both at rest nose to tail: the follower now waits for this leader to go.
      if (v.v < 0.05 && lead.v < 0.05 && lead.s - v.s < 4) waitingFor.set(v.id, lead.id);
      if (lead.v > 0.5 && !leaderStart.has(lead.id)) leaderStart.set(lead.id, t);
      if (lead.v < 0.05) leaderStart.delete(lead.id);
      const who = waitingFor.get(v.id);
      if (who === lead.id && v.v > 0.3) {
        const t0 = leaderStart.get(lead.id);
        if (t0 !== undefined) delays.push(t - t0);
        waitingFor.delete(v.id);
      }
    }
  });
  assert.ok(delays.length > 10, `${delays.length} queue departures seen`);
  delays.sort((a, b) => a - b);
  const median = delays[Math.floor(delays.length / 2)]!;
  assert.ok(median > 0.4, `median start-up delay ${median.toFixed(2)} s`);
});

it('buses wait at their stops, and wait longer than a taxi', () => {
  const sim = street(9);
  const dwell = { bus: 0, taxi: 0 };
  const open = new Map<number, number>();
  run(sim, 600, () => {
    for (const v of sim.traffic.vehicles) {
      if (v.kind !== 'bus' && v.kind !== 'taxi') continue;
      if (v.active && v.dwell >= 0 && v.v < 0.1) open.set(v.id, (open.get(v.id) ?? 0) + DT);
      else if (open.has(v.id)) {
        dwell[v.kind] = Math.max(dwell[v.kind], open.get(v.id)!);
        open.delete(v.id);
      }
    }
  });
  assert.ok(dwell.bus >= 4, `longest bus stop ${dwell.bus.toFixed(1)} s`);
  assert.ok(dwell.taxi <= dwell.bus, 'taxis wait no longer than buses');
});

it('vehicles roll with their turns and lean while pulling in', () => {
  const sim = street(9);
  let turning = 0;
  let pulled = 0;
  run(sim, 240, () => {
    for (const v of sim.traffic.vehicles) {
      if (!v.active) continue;
      if (Math.abs(v.yawRate) > 0.4 && v.v > 1) turning++;
      if (v.pull > 0.5) pulled++;
      assert.ok(Math.abs(sim.traffic.laneOffset(v)) < 0.5, 'a driver stays in the lane');
    }
  });
  assert.ok(turning > 50, `${turning} turning samples`);
  assert.ok(pulled > 0, 'a bus or taxi pulled towards the kerb');
});

it('traffic and pedestrians are deterministic for a seed', () => {
  const a = street(5);
  const b = street(5);
  run(a, 60, () => undefined);
  run(b, 60, () => undefined);
  assert.deepEqual(
    a.traffic.vehicles.map(v => [v.pose.x, v.pose.z, v.v, v.pull]),
    b.traffic.vehicles.map(v => [v.pose.x, v.pose.z, v.v, v.pull]),
  );
  assert.deepEqual(
    a.people.poses.map(p => [p.x, p.z, p.yaw, p.phase]),
    b.people.poses.map(p => [p.x, p.z, p.yaw, p.phase]),
  );
});

it('pedestrians move smoothly: no jumps outside doors, bounded turning', () => {
  const sim = street(7);
  const poses = sim.people.poses;
  sim.step(DT, 0);
  const prev = poses.map(p => ({ x: p.x, z: p.z, yaw: p.yaw, scale: p.scale }));
  let worstStep = 0;
  let worstTurn = 0;
  run(sim, 180, () => {
    poses.forEach((p, i) => {
      const q = prev[i]!;
      // Going through a door shows or hides a person: that is allowed to jump.
      if (p.scale > 0 && q.scale > 0) {
        worstStep = Math.max(worstStep, Math.hypot(p.x - q.x, p.z - q.z));
        worstTurn = Math.max(worstTurn, Math.abs(Math.atan2(Math.sin(p.yaw - q.yaw), Math.cos(p.yaw - q.yaw))));
      }
      prev[i] = { x: p.x, z: p.z, yaw: p.yaw, scale: p.scale };
    });
  });
  // 1.5 units/s is a brisk walk: 0.05 per step; the smoothed position may catch up a little faster after a corner.
  assert.ok(worstStep < 0.2, `largest single step ${worstStep.toFixed(3)}`);
  assert.ok(worstTurn < 0.5, `largest single turn ${worstTurn.toFixed(3)} rad`);
});

it('pairs and trios walk together, stop together, and keep to the pavement', () => {
  const sim = street(7);
  const people = sim.people;
  const groups = people.groups();
  assert.ok(groups.length >= 3, `${groups.length} walking groups`);
  let stoppedTogether = 0;
  let worst = 0;
  run(sim, 120, () => {
    for (const g of groups) {
      const d = Math.hypot(g.leader.x - g.member.x, g.leader.z - g.member.z);
      if (g.leader.scale > 0) worst = Math.max(worst, d);
      assert.equal(g.member.mode, g.leader.mode);
      if (g.leader.gait < 0.1 && g.member.gait < 0.1 && g.leader.mode === 0) stoppedTogether++;
    }
  });
  assert.ok(worst < 1.3, `companions stay within ${worst.toFixed(2)} of each other`);
  assert.ok(stoppedTogether > 0, 'groups stop to look around together');
});

it('walkers wait for each other on a pavement and pass on the right', () => {
  const sim = street(7);
  let stops = 0;
  let nudged = 0;
  run(sim, 240, () => {
    for (const w of sim.people.walkers) {
      if (w.state === 'side' && w.pause > 0) stops++;
      if (Math.abs(w.nudge) > 0.1) nudged++;
      assert.ok(Math.abs(w.nudge) <= 0.26);
    }
  });
  assert.ok(stops > 0, 'somebody stopped to look around');
  assert.ok(nudged > 0, 'people stepped aside to pass');
});

const world = birdWorld(layout);
const view = (): BirdView => ({ x: 0, y: 0, z: 0, yaw: 0, bank: 0, pitch: 0, flap: 0, rate: 0, perched: 0, scale: 1 });

it('birds flap, glide and soar, bank into turns, and stay clear of the tallest tower', () => {
  const birds = new Boids(layout, world, { count: QUALITY.ultra.birds, seed: 11 });
  const v = view();
  let flapping = 0;
  let gliding = 0;
  let soaring = 0;
  let banked = 0;
  let topOfCircling = Infinity;
  for (let t = 0; t < 900; t += 0.1) {
    birds.advance(t);
    birds.flocks.forEach((f, fi) =>
      f.birds.forEach((b, i) => {
        birds.view(fi, i, 1, v);
        assert.ok(v.flap >= 0 && v.flap <= 1 && Math.abs(v.bank) <= 0.7);
        if (v.perched > 0) return;
        if (v.flap > 0.6) flapping++;
        if (v.flap < 0.1) gliding++;
        if (Math.abs(v.bank) > 0.25) banked++;
        if (b.soar > 0.9) {
          soaring++;
          topOfCircling = Math.min(topOfCircling, v.y);
        }
      }),
    );
  }
  assert.ok(flapping > 100 && gliding > 100, `${flapping} flapping and ${gliding} gliding samples`);
  assert.ok(banked > 50, `${banked} banked samples`);
  assert.ok(soaring > 100, `${soaring} soaring samples`);
  assert.ok(
    topOfCircling >= birds.top,
    `soaring flocks stay above ${birds.top.toFixed(1)} (lowest ${topOfCircling.toFixed(1)})`,
  );
});

it('thermal routes circle high above every tower', () => {
  const birds = new Boids(layout, world, { count: QUALITY.ultra.birds, seed: 11 });
  let thermals = 0;
  for (const f of birds.flocks)
    for (const leg of f.legs) {
      if (!leg.thermal) continue;
      thermals++;
      const circle = leg.path.slice(1, -1);
      assert.ok(circle.length > 12);
      for (const p of circle) assert.ok(p[1] >= birds.top + 4.9 && p[1] <= birds.bounds.maxY, `circle height ${p[1]}`);
    }
  assert.ok(thermals > 0, 'some flights are thermals');
});

it('birds are deterministic for a seed', () => {
  const a = new Boids(layout, world, { count: 30, seed: 8 });
  const b = new Boids(layout, world, { count: 30, seed: 8 });
  a.advance(120);
  b.advance(120);
  const va = view();
  const vb = view();
  a.flocks.forEach((f, fi) =>
    f.birds.forEach((_, i) => assert.deepEqual(a.view(fi, i, 0.5, va), b.view(fi, i, 0.5, vb))),
  );
});
