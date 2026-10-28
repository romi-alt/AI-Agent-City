import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Birds } from '../src/life/birds/flock.ts';
import { detailPlan } from '../src/life/details/placement.ts';
import { buildingBoxes, buildingDoors, roofHeight } from '../src/life/geometry.ts';
import { createRng } from '../src/life/rng.ts';
import { personGeometry } from '../src/life/people/body.ts';
import { StreetSim } from '../src/life/street-sim.ts';
import { VEHICLE_KINDS } from '../src/life/traffic/sim.ts';
import { vehicleGeometry } from '../src/life/traffic/vehicles.ts';
import { QUALITY } from '../src/quality/quality.ts';
import { layout } from './a2-helpers.ts';

it('sizes every system from the quality budget', () => {
  for (const level of ['ultra', 'balanced', 'low'] as const) {
    const q = QUALITY[level];
    const sim = new StreetSim(layout, {
      vehicles: q.vehicles,
      pedestrians: q.pedestrians,
      roofWorkers: q.microAnimations ? 1 : 0,
    });
    assert.equal(sim.traffic.vehicles.length, q.vehicles, `${level} vehicles`);
    assert.equal(sim.people.poses.length, q.pedestrians, `${level} pedestrians`);
    assert.equal(new Birds(layout, { count: q.birds }).count, q.birds);
    const birds = new Birds(layout, { count: q.birds });
    assert.equal(birds.roofFlocks.reduce((n, f) => n + f.size, 0) + birds.soarers.length, q.birds);
  }
});

it('is deterministic for a seed', () => {
  const a = new StreetSim(layout, { vehicles: 50, pedestrians: 80, roofWorkers: 1, seed: 3 });
  const b = new StreetSim(layout, { vehicles: 50, pedestrians: 80, roofWorkers: 1, seed: 3 });
  for (let t = 0; t < 30; t += 1 / 30) {
    a.step(1 / 30, t);
    b.step(1 / 30, t);
  }
  assert.deepEqual(
    a.traffic.vehicles.map(v => v.pose),
    b.traffic.vehicles.map(v => v.pose),
  );
  assert.deepEqual(a.people.poses, b.people.poses);
  const r1 = createRng(9);
  const r2 = createRng(9);
  for (let i = 0; i < 10; i++) assert.equal(r1(), r2());
});

it('puts rooftop details on the roofs, with restraint', () => {
  const plan = detailPlan(layout);
  const boxes = buildingBoxes(layout);
  const onRoof = (x: number, z: number, y: number) =>
    boxes.some(b => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && Math.abs(y - b.height) < 3);
  for (const f of plan.fans) assert.ok(onRoof(f.x, f.z, f.y));
  for (const b of plan.beacons) assert.ok(onRoof(b.x, b.z, b.y));
  for (const b of plan.billboards) {
    assert.ok(onRoof(b.x - b.w / 2, b.z, b.y) && onRoof(b.x + b.w / 2, b.z, b.y), 'billboard fits on its roof');
  }
  assert.ok(plan.fans.length <= layout.buildings.length * 1.2, 'most roofs stay quiet');
  assert.ok(plan.billboards.length <= 3);
  assert.ok(
    plan.fans.some(f => f.speed === 0),
    'some fans are idle',
  );
});

it('places a lobby door on a facade of every building, facing a street', () => {
  const doors = buildingDoors(layout);
  for (const b of layout.buildings) {
    const own = doors.filter(d => d.building === b.key);
    assert.ok(own.length >= 1);
    for (const d of own) assert.equal(Math.abs(d.z - b.z), b.d / 2);
  }
  assert.ok(roofHeight(layout.buildings[0]!) > 0);
});

it('keeps model triangle counts within budget (full detail on ultra/balanced, cheaper on low)', () => {
  const tris = (g: { index: { count: number } | null; getAttribute(n: string): { count: number } }) =>
    (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  for (const kind of VEHICLE_KINDS) {
    const full = tris(vehicleGeometry(kind, 'full'));
    const low = tris(vehicleGeometry(kind, 'low'));
    assert.ok(full <= 1400, `${kind}: ${full} triangles`);
    assert.ok(low <= 460 && low < full * 0.6, `${kind} low: ${low} triangles`);
  }
  assert.ok(tris(personGeometry()) <= 700);
  // A full ultra street (all vehicles and people, main pass) stays well under 200k triangles.
  const q = QUALITY.ultra;
  assert.ok(q.vehicles * 1400 + q.pedestrians * 700 < 250_000);
});
