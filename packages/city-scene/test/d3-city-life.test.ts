import assert from 'node:assert/strict';
import { it } from 'node:test';
import { CROSSING, CrossingFlocks, type CrossingBird } from '../src/life/birds/crossing.ts';
import { signalPhase } from '../src/life/signals.ts';
import { cityLifeCounts, cityStreets, StreetSim, TRAFFIC_RADIUS, walkArea } from '../src/life/street-sim.ts';
import { QUALITY } from '../src/quality/quality.ts';
import { cityRoads, districtBounds } from '../src/streets/extent.ts';
import { layout, rectsOverlap, type Rect } from './a2-helpers.ts';

const DT = 1 / 30;
const district = districtBounds(layout);
const inside = (a: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number) =>
  x > a.minX && x < a.maxX && z > a.minZ && z < a.maxZ;

it('drives on the generated city grid, open into the fog', () => {
  const streets = cityStreets(layout);
  const all = cityRoads(layout);
  for (const r of layout.streets.roadsX) assert.ok(streets.roadsX.includes(r), 'the district roads are kept');
  assert.ok(streets.roadsX.every(r => all.roadsX.includes(r)) && streets.roadsZ.every(r => all.roadsZ.includes(r)));
  assert.ok(Math.max(...streets.roadsX) > district.maxX + 100, 'roads continue well past the district');
  assert.ok(streets.extent <= TRAFFIC_RADIUS + 10);
  const sim = new StreetSim(layout, { vehicles: 60, pedestrians: 0, roofWorkers: 0, seed: 1 });
  assert.equal(sim.traffic.net.closed, false);
  assert.ok(sim.traffic.net.sources.length > 0, 'vehicles enter at the far edges');
});

it('scales vehicles and people from the quality budget', () => {
  for (const q of ['ultra', 'balanced', 'low'] as const) {
    const c = cityLifeCounts(QUALITY[q]);
    assert.ok(c.vehicles > QUALITY[q].vehicles && c.pedestrians >= QUALITY[q].pedestrians);
  }
  assert.ok(cityLifeCounts(QUALITY.low).vehicles < cityLifeCounts(QUALITY.ultra).vehicles / 3);
});

function rect(v: StreetSim['traffic']['vehicles'][number]): Rect {
  return { x: v.pose.x, z: v.pose.z, yaw: v.pose.yaw, hl: v.len / 2 - 0.04, hw: v.width / 2 - 0.04 };
}

it('city traffic (ultra): never overlaps, never commits on red, flows, keeps the district busy, fades at the edge', () => {
  const counts = cityLifeCounts(QUALITY.ultra);
  const sim = new StreetSim(layout, { ...counts, roofWorkers: 1, seed: 3 });
  let t = 0;
  let moving = 0;
  let inDistrict = 0;
  let samples = 0;
  let fadedOut = 0;
  for (let step = 0; step < 180 * 30; step++) {
    t += DT;
    const before = sim.traffic.vehicles.map(v => v.committed);
    sim.step(DT, t);
    const p = signalPhase(t);
    const grid = new Map<string, StreetSim['traffic']['vehicles']>();
    for (const v of sim.traffic.vehicles) {
      if (v.committed && !before[v.id]) {
        assert.notEqual(v.commitColor, 'red');
        const link = sim.traffic.net.links.find(l => l.out.includes(v.holding));
        if (link) assert.notEqual(link.heading % 2 === 0 ? p.ew : p.ns, 'red');
      }
      if (!v.active) continue;
      const key = `${Math.floor(v.pose.x / 6)},${Math.floor(v.pose.z / 6)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key)!.push(v);
    }
    // Overlaps: compare each vehicle with those in its own and neighbouring 6-unit cells.
    for (const v of sim.traffic.vehicles) {
      if (!v.active) continue;
      const gx = Math.floor(v.pose.x / 6);
      const gz = Math.floor(v.pose.z / 6);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          for (const o of grid.get(`${gx + dx},${gz + dz}`) ?? [])
            if (o.id > v.id) assert.ok(!rectsOverlap(rect(v), rect(o)), `t=${t.toFixed(2)} #${v.id} overlaps #${o.id}`);
    }
    if (step % 30 === 0) {
      const active = sim.traffic.vehicles.filter(v => v.active);
      moving += active.filter(v => v.v > 0.5).length / counts.vehicles;
      inDistrict += active.filter(v => inside(district, v.pose.x, v.pose.z)).length;
      fadedOut += active.filter(v => sim.traffic.edgeFade(v) < 0.05).length;
      for (const v of active)
        if (inside(district, v.pose.x, v.pose.z)) assert.equal(sim.traffic.edgeFade(v), 1, 'fully visible downtown');
      samples++;
    }
  }
  assert.ok(moving / samples > 0.3, `only ${((moving / samples) * 100).toFixed(0)}% moving`);
  assert.ok(
    inDistrict / samples >= QUALITY.ultra.vehicles,
    `the district holds ${(inDistrict / samples).toFixed(0)} vehicles on average`,
  );
  assert.ok(fadedOut > 0, 'some vehicles are seen fading at the far edge');
});

it('puts pedestrians on the sidewalks of the district and the first ring of blocks', () => {
  const counts = cityLifeCounts(QUALITY.ultra);
  const sim = new StreetSim(layout, { ...counts, roofWorkers: 0, seed: 7 });
  const area = walkArea(layout);
  let t = 0;
  let ring = 0;
  for (let step = 0; step < 60 * 30; step++) {
    t += DT;
    sim.step(DT, t);
    if (step % 30) continue;
    for (const p of sim.people.poses) {
      if (p.scale === 0) continue;
      assert.ok(inside(area, p.x, p.z), `person at ${p.x.toFixed(1)}, ${p.z.toFixed(1)} outside the walk area`);
      if (!inside(district, p.x, p.z)) ring++;
    }
  }
  assert.ok(ring > 0, 'people walk the ring 1 blocks too');
});

it('crossing flocks stay high above the roofs, move smoothly and come by only now and then', () => {
  const roof = 32;
  const c = new CrossingFlocks({ flocks: 3, birdsPerFlock: 11, roof, radius: 240 });
  const b: CrossingBird = { x: 0, y: 0, z: 0, yaw: 0, bank: 0, flap: 0, rate: 0, visible: 0 };
  let shown = 0;
  let n = 0;
  for (let f = 0; f < c.flocks.length; f++)
    for (let i = 0; i < c.flocks[f]!.members.length; i++) {
      let prev: [number, number, number] | null = null;
      for (let t = 0; t < 900; t += 0.25) {
        c.view(f, i, t, b);
        n++;
        if (!b.visible) {
          prev = null;
          continue;
        }
        shown++;
        assert.ok(b.y > roof + CROSSING.clearance - 2, `bird at ${b.y.toFixed(1)} too low`);
        if (prev) {
          const step = Math.hypot(b.x - prev[0], b.y - prev[1], b.z - prev[2]);
          assert.ok(step < CROSSING.speed * 0.25 * 1.6, `jump of ${step.toFixed(2)} in 0.25 s`);
        }
        prev = [b.x, b.y, b.z];
      }
    }
  const share = shown / n;
  assert.ok(share > 0.2 && share < 0.8, `flocks on screen ${(share * 100).toFixed(0)}% of the time`);
});
