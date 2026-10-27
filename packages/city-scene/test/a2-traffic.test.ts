import assert from 'node:assert/strict';
import { it } from 'node:test';
import { buildNetwork } from '../src/life/traffic/network.ts';
import { TrafficSim, vehicleMix, VEHICLE_KINDS } from '../src/life/traffic/sim.ts';
import { signalPhase } from '../src/life/signals.ts';
import { QUALITY } from '../src/quality/quality.ts';
import { layout, rectsOverlap, type Rect } from './a2-helpers.ts';

const DT = 1 / 30;

function rect(v: TrafficSim['vehicles'][number], shrink = 0.04): Rect {
  return { x: v.pose.x, z: v.pose.z, yaw: v.pose.yaw, hl: v.len / 2 - shrink, hw: v.width / 2 - shrink };
}

it('builds a lane graph that matches the streets', () => {
  const net = buildNetwork(layout.streets);
  const { roadsX, roadsZ } = layout.streets;
  assert.equal(net.junctions.length, roadsX.length * roadsZ.length);
  assert.equal(net.conns.length, net.junctions.length * 12);
  // One lane each way per road, cut at every junction.
  assert.equal(net.links.length, 2 * roadsZ.length * (roadsX.length + 1) + 2 * roadsX.length * (roadsZ.length + 1));
  for (const c of net.conns) {
    assert.ok(c.from >= 0 && c.to >= 0, 'every movement has an entry and an exit lane');
    assert.ok(c.length > 3 && c.length < 10);
  }
  // Movements that share an approach always conflict; opposite straight movements never do.
  assert.ok(net.conflicts[0]![1]);
  assert.ok(!net.conflicts[0]![6]);
});

it('splits the vehicle budget between kinds and respects it', () => {
  for (const level of ['ultra', 'balanced', 'low'] as const) {
    const n = QUALITY[level].vehicles;
    const mix = vehicleMix(n);
    assert.equal(
      VEHICLE_KINDS.reduce((s, k) => s + mix[k], 0),
      n,
    );
    assert.ok(mix.taxi > 0 && mix.sedan > 0);
    const sim = new TrafficSim(layout.streets, { count: n, seed: 3 });
    assert.equal(sim.vehicles.length, n);
  }
  assert.equal(vehicleMix(QUALITY.ultra.vehicles).emergency, 1);
});

for (const level of ['ultra', 'low'] as const) {
  it(`never overlaps, never commits on red, keeps moving (${level}, 4 simulated minutes)`, () => {
    const sim = new TrafficSim(layout.streets, { count: QUALITY[level].vehicles, seed: 11 });
    let moved = 0;
    let t = 0;
    const startS = sim.vehicles.map(v => v.s);
    for (let step = 0; step < 240 * 30; step++) {
      t += DT;
      const before = sim.vehicles.map(v => v.committed);
      sim.step(DT, t);
      const active = sim.vehicles.filter(v => v.active);
      for (const v of sim.vehicles) {
        if (v.committed && !before[v.id]) {
          assert.notEqual(v.commitColor, 'red', `vehicle ${v.id} committed on red at t=${t.toFixed(2)}`);
          const p = signalPhase(t);
          const link = sim.net.links.find(l => l.out.includes(v.holding));
          if (link) assert.notEqual(link.heading % 2 === 0 ? p.ew : p.ns, 'red');
        }
      }
      for (let i = 0; i < active.length; i++)
        for (let j = i + 1; j < active.length; j++) {
          const a = active[i]!;
          const b = active[j]!;
          if (Math.abs(a.pose.x - b.pose.x) > 6 || Math.abs(a.pose.z - b.pose.z) > 6) continue;
          assert.ok(
            !rectsOverlap(rect(a), rect(b)),
            `t=${t.toFixed(2)} ${a.kind}#${a.id} (piece ${a.piece} s=${a.s.toFixed(2)}) overlaps ${b.kind}#${b.id} (piece ${b.piece} s=${b.s.toFixed(2)})`,
          );
        }
      moved += active.filter(v => v.v > 0.5).length;
    }
    // Traffic flows: on average a good share of vehicles is moving, and nobody is stuck at the start forever.
    const avgMoving = moved / (240 * 30) / sim.vehicles.length;
    assert.ok(avgMoving > 0.35, `only ${(avgMoving * 100).toFixed(0)}% moving on average`);
    assert.ok(sim.vehicles.some((v, i) => v.s !== startS[i]));
  });
}

it('stops at the line on red and waits there', () => {
  const sim = new TrafficSim(layout.streets, { count: 50, seed: 5 });
  let t = 0;
  let checked = 0;
  for (let step = 0; step < 120 * 30; step++) {
    t += DT;
    sim.step(DT, t);
    const p = signalPhase(t);
    for (const v of sim.vehicles) {
      if (!v.active) continue;
      const piece = sim.net.pieces[v.piece]!;
      if (piece.kind !== 'link' || piece.toJ < 0 || v.committed) continue;
      const color = piece.heading % 2 === 0 ? p.ew : p.ns;
      const front = v.s + v.len / 2;
      assert.ok(front <= piece.length + 1e-6, 'an uncommitted car never passes the stop line');
      if (color === 'red' && piece.length - front < 0.3) checked++;
    }
  }
  assert.ok(checked > 100, 'cars were observed waiting at red lights');
});

it('never gridlocks: full budget with pedestrians, several seeds, 10 simulated minutes each', async () => {
  const { StreetSim } = await import('../src/life/street-sim.ts');
  for (const seed of [4, 6, 14]) {
    const sim = new StreetSim(layout, {
      vehicles: QUALITY.ultra.vehicles,
      pedestrians: QUALITY.ultra.pedestrians,
      roofWorkers: 1,
      seed,
    });
    let t = 0;
    let moving = 0;
    let samples = 0;
    for (let step = 0; step < 600 * 30; step++) {
      t += DT;
      sim.step(DT, t);
      if (step > 540 * 30) {
        moving += sim.traffic.vehicles.filter(v => v.active && v.v > 0.5).length;
        samples++;
      }
    }
    const share = moving / samples / QUALITY.ultra.vehicles;
    assert.ok(share > 0.3, `seed ${seed}: only ${(share * 100).toFixed(0)}% moving in the last minute`);
  }
});
