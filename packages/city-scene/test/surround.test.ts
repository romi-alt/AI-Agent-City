// The generated Midtown-style city around the district: pure plan, no WebGL.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { facadePixels, STYLE_COUNT, TILE } from '../src/buildings/surround/facade.ts';
import {
  densityField,
  floorCap,
  footprint,
  overlaps,
  planBudget,
  planSurround,
  rng,
  SETBACK,
  splitFrontage,
} from '../src/buildings/surround/plan.ts';
import { cityRoads, heroClearance } from '../src/streets/extent.ts';
import { ROAD_HALF } from '../src/streets/grid.ts';
import { CENTRAL_PARK } from '../src/world/park.ts';
import { inWater, RIVERS, riverX } from '../src/world/waterfront.ts';
import { FLOOR_HEIGHT, type CityLayout } from '../src/types.ts';

const layout = JSON.parse(readFileSync(new URL('../src/data/city-layout.json', import.meta.url), 'utf8')) as CityLayout;
const roads = cityRoads(layout);
const clear = heroClearance(layout);
const park = [CENTRAL_PARK];
const plan = planSurround(roads, clear, { park });
const all = [...plan.ring1, ...plan.backs, ...plan.ring2, ...plan.ring3, ...plan.ring4];

describe('surround plan', () => {
  it('is deterministic for a seed and different for another', () => {
    assert.deepEqual(planSurround(roads, clear, { park }), plan);
    assert.notDeepEqual(planSurround(roads, clear, { park, seed: 7 }).ring1, plan.ring1);
  });

  it('fills all four rings with a huge city', () => {
    assert.ok(plan.ring1.length > 300, `ring1 ${plan.ring1.length}`);
    assert.ok(plan.ring2.length > 500, `ring2 ${plan.ring2.length}`);
    assert.ok(plan.ring3.length > 2000, `ring3 ${plan.ring3.length}`);
    assert.ok(plan.ring4.length > 3000, `ring4 ${plan.ring4.length}`);
    assert.ok(all.length > 8000, `buildings ${all.length}`);
  });

  it('never touches the district, a client lot, a road, the park or the water', () => {
    for (const b of all) {
      const f = footprint(b);
      for (const c of clear) assert.ok(!overlaps(f, c), `${c.kind} ${c.key ?? ''} at ${b.x},${b.z}`);
      for (const x of roads.roadsX) assert.ok(f.maxX <= x - ROAD_HALF || f.minX >= x + ROAD_HALF);
      for (const z of roads.roadsZ) assert.ok(f.maxZ <= z - ROAD_HALF || f.minZ >= z + ROAD_HALF);
      assert.ok(!overlaps(f, CENTRAL_PARK), `park at ${b.x},${b.z}`);
      assert.ok(!inWater(b.x, b.z, 0), `water at ${b.x},${b.z}`);
    }
  });

  it('keeps an extra avoid rectangle clear', () => {
    const avoid = { minX: 70, maxX: 160, minZ: -10, maxZ: 10 };
    const p = planSurround(roads, clear, { avoid: [avoid], park });
    for (const b of [...p.ring1, ...p.ring2, ...p.ring3]) assert.ok(!overlaps(footprint(b), avoid));
  });

  it('keeps the front of the district low so the client buildings stay in view, and builds supertall towers far out', () => {
    // The overview camera looks north from the +z side: nothing in front is taller than 9 floors.
    for (const b of [...plan.ring1, ...plan.ring2]) {
      if (b.z > 50 && Math.abs(b.x) < 120 && b.z < 128)
        assert.ok(b.y0 + b.h <= 9.5 * FLOOR_HEIGHT + 0.5, `${b.x},${b.z}`);
    }
    const top = Math.max(...all.map(b => b.y0 + b.h));
    assert.ok(top > 60 * FLOOR_HEIGHT, `tallest ${top}`);
    assert.ok(plan.spires.length >= 6 && plan.beacons.length >= 20);
    assert.ok(floorCap(30) < floorCap(100) && floorCap(100) < floorCap(300));
    assert.ok(densityField(0, 0) > densityField(0, -2000));
  });

  it('steps towers in (setbacks) and stacks tiers on each other', () => {
    const tiers = plan.ring3.filter(b => b.y0 > 0);
    assert.ok(tiers.length > 1000);
    for (const t of tiers.slice(0, 200)) assert.ok(t.w > 0 && t.d > 0 && t.h > 0);
    assert.ok(
      plan.ring3.some(b => b.flood),
      'floodlit crowns',
    );
  });

  it('puts the camera blockers only on tall towers', () => {
    assert.ok(plan.blockers.length > 20);
    for (const b of plan.blockers) assert.ok(b.top >= 60);
  });

  it('places Ring 1 fronts on the building line, so each block side is a continuous wall', () => {
    const onLine = (v: number, lines: number[]) => lines.some(l => Math.abs(Math.abs(v - l) - SETBACK) < 1e-6);
    for (const b of plan.ring1.filter(x => x.shop && x.y0 === 0 && x.cap && x.w <= 5.7 && x.d <= 4.81)) {
      const f = footprint(b);
      const front = { [0]: f.maxZ, [Math.PI]: f.minZ, [Math.PI / 2]: f.maxX, [-Math.PI / 2]: f.minX }[b.yaw];
      if (front === undefined) continue;
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

  it('builds less far out and with fewer tiers at low detail', () => {
    const low = planSurround(roads, clear, { park, detail: 0, maxReach: 700 });
    const mid = planSurround(roads, clear, { park, detail: 1, maxReach: 900 });
    const a = planBudget(low);
    const b = planBudget(mid);
    const c = planBudget(plan);
    assert.ok(a.boxes < b.boxes && b.boxes < c.boxes, `${a.boxes} < ${b.boxes} < ${c.boxes}`);
    // Light enough for the landing page's hero: a fixed number of draws and a bounded triangle count.
    assert.ok(a.boxes * 12 < 150_000, `low triangles ${a.boxes * 12}`);
    console.log(`surround boxes: low ${a.boxes}, balanced ${b.boxes}, ultra ${c.boxes}`);
  });
});

describe('waterfront', () => {
  it('has a river on each side of the island that wanders but stays put', () => {
    const [w, e] = RIVERS;
    assert.ok(w!.x < -300 && e!.x > 300);
    for (const z of [-900, 0, 900]) assert.ok(Math.abs(riverX(w!, z) - w!.x) < 25);
    assert.ok(inWater(w!.x, 0) && inWater(e!.x, 0) && !inWater(0, 0));
  });
});

describe('facade kit', () => {
  it('has an albedo and a glass mask layer per style', () => {
    assert.equal(facadePixels().length, TILE * TILE * 4 * STYLE_COUNT * 2);
  });
});

describe('colour grade', () => {
  it('mutes a colour toward grey and keeps white and black', async () => {
    const { muteHex } = await import('../src/environment/grade.ts');
    assert.equal(muteHex('#ffffff', 0.5), '#ffffff');
    assert.equal(muteHex('#000000', 0.5), '#000000');
    const m = muteHex('#f28b82', 0.5);
    const ch = (h: string, s: number) => (parseInt(h.slice(1), 16) >> s) & 255;
    assert.ok(ch(m, 16) - ch(m, 0) < ch('#f28b82', 16) - ch('#f28b82', 0), 'less saturated');
  });
});
