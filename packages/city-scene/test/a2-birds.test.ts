import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Boids, BOIDS, type BirdView } from '../src/life/birds/boids.ts';
import { birdWorld } from '../src/life/birds/obstacles.ts';
import { QUALITY } from '../src/quality/quality.ts';
import { layout } from './a2-helpers.ts';

const world = birdWorld(layout);
const view = (): BirdView => ({ x: 0, y: 0, z: 0, yaw: 0, bank: 0, pitch: 0, flap: 0, rate: 0, perched: 0, scale: 1 });

it('builds landing roofs and obstacles from the building designs', () => {
  assert.ok(world.roofs.length >= 10, `${world.roofs.length} roofs`);
  assert.ok(world.obstacles.length >= layout.buildings.length);
  for (const r of world.roofs) assert.ok(r.spots.length >= 4);
});

for (const level of ['ultra', 'balanced', 'low'] as const) {
  it(`keeps every bird in bounds and out of every building (${level}, 15 simulated minutes)`, () => {
    const birds = new Boids(layout, world, { count: QUALITY[level].birds, seed: 3 });
    const v = view();
    let flying = 0;
    let perched = 0;
    let canyon = 0;
    for (let t = 0; t < 900; t += 0.1) {
      birds.advance(t);
      let n = 0;
      birds.flocks.forEach((f, fi) =>
        f.birds.forEach((_, i) => {
          n++;
          birds.view(fi, i, 1, v);
          const { minX, maxX, minZ, maxZ, maxY } = birds.bounds;
          assert.ok(v.x >= minX && v.x <= maxX && v.z >= minZ && v.z <= maxZ, `bird out of bounds at ${v.x},${v.z}`);
          assert.ok(v.y > 0 && v.y <= maxY, `bird height ${v.y}`);
          for (const o of world.obstacles) {
            const inside =
              v.x > o.minX + 0.02 &&
              v.x < o.maxX - 0.02 &&
              v.z > o.minZ + 0.02 &&
              v.z < o.maxZ - 0.02 &&
              v.y > o.minY + 0.02 &&
              v.y < o.maxY - 0.02;
            assert.ok(
              !inside,
              `bird inside a building at t=${t.toFixed(1)} (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`,
            );
          }
          if (v.perched >= 1) perched++;
          else {
            flying++;
            if (v.y < world.skyline - 4) canyon++;
          }
        }),
      );
      assert.equal(n, QUALITY[level].birds);
    }
    assert.ok(flying > 0 && perched > 0, 'birds both rest and fly');
    assert.ok(canyon > 0, 'some flights go between the buildings, below the rooftops');
  });
}

it('keeps flock members apart and moving smoothly (no jumps between steps)', () => {
  const birds = new Boids(layout, world, { count: 40, seed: 5 });
  const a = view();
  const b = view();
  let close = 0;
  let samples = 0;
  for (let t = 0; t < 300; t += BOIDS.step) {
    birds.advance(t);
    for (const f of birds.flocks)
      f.birds.forEach((bird, i) => {
        if (bird.perched > 0) return;
        for (let j = i + 1; j < f.birds.length; j++) {
          const o = f.birds[j]!;
          if (o.perched > 0) continue;
          samples++;
          if (Math.hypot(bird.x - o.x, bird.y - o.y, bird.z - o.z) < 0.15) close++;
        }
      });
    birds.view(0, 0, 0, a);
    birds.view(0, 0, 1, b);
    assert.ok(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) < 1, 'one step moves a bird less than a unit');
  }
  assert.ok(samples > 0 && close / samples < 0.01, `birds overlap too often (${close}/${samples})`);
});
