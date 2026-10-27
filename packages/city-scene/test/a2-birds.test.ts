import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Birds, type BirdSample } from '../src/life/birds/flock.ts';
import { buildingBoxes, insideBox } from '../src/life/geometry.ts';
import { QUALITY } from '../src/quality/quality.ts';
import { layout } from './a2-helpers.ts';

const boxes = buildingBoxes(layout);

for (const level of ['ultra', 'balanced', 'low'] as const) {
  it(`keeps every bird in bounds and out of the buildings (${level}, 30 simulated minutes)`, () => {
    const birds = new Birds(layout, { count: QUALITY[level].birds, seed: 3 });
    const s: BirdSample = { x: 0, y: 0, z: 0, yaw: 0, bank: 0, flap: 0, rate: 0, perched: 0, scale: 1 };
    let n = 0;
    let flying = 0;
    let perched = 0;
    for (let t = 0; t < 1800; t += 0.2) {
      n = 0;
      birds.all(
        t,
        b => {
          n++;
          const { minX, maxX, minZ, maxZ, maxY } = birds.bounds;
          assert.ok(b.x >= minX && b.x <= maxX && b.z >= minZ && b.z <= maxZ, `bird out of bounds at ${b.x},${b.z}`);
          assert.ok(b.y > 0 && b.y <= maxY, `bird height ${b.y}`);
          for (const box of boxes)
            assert.ok(!insideBox(box, b.x, b.y, b.z), `bird inside ${box.key} at t=${t.toFixed(1)}`);
          if (b.perched > 0) perched++;
          else flying++;
        },
        s,
      );
      assert.equal(n, QUALITY[level].birds);
    }
    assert.ok(flying > 0 && perched > 0, 'birds both rest and fly');
  });
}

it('staggers wing beats and flights (nothing moves in lockstep)', () => {
  const birds = new Birds(layout, { count: 60, seed: 3 });
  const s: BirdSample = { x: 0, y: 0, z: 0, yaw: 0, bank: 0, flap: 0, rate: 0, perched: 0, scale: 1 };
  const xs = new Set<string>();
  birds.all(100, b => xs.add(`${b.x.toFixed(2)},${b.z.toFixed(2)},${b.y.toFixed(2)}`), s);
  assert.equal(xs.size, 60, 'no two birds share a spot');
  // Flocks leave at different times.
  const departures = birds.roofFlocks.map(f => f.legs[0]!.t0 + f.legs[0]!.rest);
  assert.equal(new Set(departures.map(d => d.toFixed(2))).size, departures.length);
});
