// Run: node --import tsx --test src/buildings/surround/surround.test.ts (from packages/city-scene).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { cityRoads, heroClearance } from '../../streets/extent.ts';
import { ROAD_HALF } from '../../streets/grid.ts';
import type { CityLayout } from '../../types.ts';
import { facadePixels, STYLE_COUNT, TILE } from './facade.ts';
import { footprint, overlaps, PASTELS, planSurround, SETBACK, splitFrontage, rng } from './plan.ts';

const layout = JSON.parse(readFileSync(new URL('../../data/city-layout.json', import.meta.url), 'utf8')) as CityLayout;
const roads = cityRoads(layout);
const clear = heroClearance(layout);
const plan = planSurround(roads, clear);
const all = [...plan.ring1, ...plan.backs, ...plan.ring2, ...plan.ring3];

describe('surround plan', () => {
  it('is deterministic for a seed and different for another', () => {
    assert.deepEqual(planSurround(roads, clear), plan);
    assert.notDeepEqual(planSurround(roads, clear, { seed: 7 }).ring1, plan.ring1);
  });

  it('fills all three rings', () => {
    assert.ok(plan.ring1.length > 300, `ring1 ${plan.ring1.length}`);
    assert.ok(plan.ring2.length > 500, `ring2 ${plan.ring2.length}`);
    assert.ok(plan.ring3.length > 200, `ring3 ${plan.ring3.length}`);
  });

  it('never touches the district, a client lot or a road', () => {
    for (const b of all) {
      const f = footprint(b);
      for (const c of clear) assert.ok(!overlaps(f, c), `${c.kind} ${c.key ?? ''} at ${b.x},${b.z}`);
      for (const x of roads.roadsX) assert.ok(f.maxX <= x - ROAD_HALF || f.minX >= x + ROAD_HALF);
      for (const z of roads.roadsZ) assert.ok(f.maxZ <= z - ROAD_HALF || f.minZ >= z + ROAD_HALF);
    }
  });

  it('keeps an extra avoid rectangle clear', () => {
    const avoid = { minX: 70, maxX: 160, minZ: -10, maxZ: 10 };
    const p = planSurround(roads, clear, { avoid: [avoid] });
    for (const b of [...p.ring1, ...p.ring2, ...p.ring3]) assert.ok(!overlaps(footprint(b), avoid));
  });

  it('builds Ring 1 as pastel 4–7 floor street walls with a shop, awning and roof item', () => {
    for (const b of plan.ring1) {
      assert.ok(b.floors >= 4 && b.floors <= 7);
      assert.ok((PASTELS as readonly string[]).includes(b.color));
      assert.ok(b.shop && b.awning && b.roof);
    }
  });

  it('places Ring 1 fronts on the building line, so each block side is a continuous wall', () => {
    const onLine = (v: number, lines: number[]) => lines.some(l => Math.abs(Math.abs(v - l) - SETBACK) < 1e-6);
    for (const b of plan.ring1) {
      const f = footprint(b);
      const front = { [0]: f.maxZ, [Math.PI]: f.minZ, [Math.PI / 2]: f.maxX, [-Math.PI / 2]: f.minX }[b.yaw]!;
      assert.ok(onLine(front, Math.abs(b.yaw) === Math.PI / 2 ? roads.roadsX : roads.roadsZ));
    }
  });

  it('splits a frontage into widths that add up exactly', () => {
    const r = rng(1);
    for (const len of [3.4, 9.3, 12.2, 20]) {
      const w = splitFrontage(r, len);
      assert.ok(Math.abs(w.reduce((s, x) => s + x, 0) - len) < 1e-9);
    }
  });
});

describe('facade kit', () => {
  it('has an albedo and a glass mask layer per style', () => {
    assert.equal(facadePixels().length, TILE * TILE * 4 * STYLE_COUNT * 2);
  });
});
