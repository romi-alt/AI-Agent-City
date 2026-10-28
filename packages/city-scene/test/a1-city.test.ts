import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { BUILDING_BASE_Y, designBuilding } from '../src/buildings/designs.ts';
import { BLOCK_INSET, planSkyline } from '../src/buildings/skyline.ts';
import {
  median,
  pickInitialQuality,
  SLOW_FRAME_MS,
  SLOW_SECONDS,
  SlowFrameMonitor,
  stepDown,
} from '../src/quality/auto.ts';
import { LAMP_OFFSET, planFurniture, SIGNAL_CORNER, TREE_OFFSET } from '../src/streets/furniture.ts';
import { CURB_H, extendedGrid, LANE, PLAZAS, ROAD_HALF, SIDEWALK } from '../src/streets/grid.ts';
import { FLOOR_HEIGHT, type CityLayout } from '../src/types.ts';

const layout = JSON.parse(readFileSync(new URL('../src/data/city-layout.json', import.meta.url), 'utf8')) as CityLayout;
const grid = extendedGrid(layout.streets);
const distToRoad = (x: number, z: number) =>
  Math.min(...grid.xs.map(r => Math.abs(x - r)), ...grid.zs.map(r => Math.abs(z - r)));

describe('street grid', () => {
  it('keeps the legacy street geometry that traffic and pedestrians use', () => {
    assert.equal(ROAD_HALF, 2);
    assert.equal(LANE, 1);
    assert.equal(SIDEWALK, 2.7);
  });

  it('continues the layout roads outward and has exactly the 15 lots in its core', () => {
    for (const r of layout.streets.roadsX) assert.ok(grid.xs.includes(r));
    for (const r of layout.streets.roadsZ) assert.ok(grid.zs.includes(r));
    const core = grid.blocks.filter(b => b.core);
    assert.equal(core.length, layout.buildings.length);
    for (const b of layout.buildings)
      assert.ok(
        core.some(c => c.x === b.x && c.z === b.z),
        b.key,
      );
  });
});

describe('background skyline', () => {
  const full = planSkyline(layout.streets, 'full');

  it('is deterministic', () => {
    assert.deepEqual(planSkyline(layout.streets, 'full'), full);
  });

  it('is the same city at every quality: lower levels only drop details', () => {
    const minimal = planSkyline(layout.streets, 'minimal');
    const reduced = planSkyline(layout.streets, 'reduced');
    const key = (m: { x: number; z: number; y0: number; y1: number }) => `${m.x},${m.z},${m.y0},${m.y1}`;
    const all = new Set(full.masses.map(key));
    for (const m of [...minimal.masses, ...reduced.masses]) assert.ok(all.has(key(m)));
    assert.ok(minimal.masses.length < reduced.masses.length && reduced.masses.length <= full.masses.length);
    // 'minimal' keeps only the signature tops that make the silhouette (spires, pyramids, slanted crowns).
    for (const p of minimal.parts) assert.ok(['steel', 'copper', 'darkGlass'].includes(p.mat), p.mat);
    assert.ok(minimal.parts.length < reduced.parts.length);
    assert.ok(reduced.parts.length < full.parts.length);
  });

  it('stays off the roads, the walking line and the 15 lots, and never overlaps itself', () => {
    const ground = full.masses.filter(m => m.y0 <= CURB_H + 1e-6);
    for (const m of ground) {
      for (const [cx, cz] of [
        [m.x - m.w / 2, m.z - m.d / 2],
        [m.x + m.w / 2, m.z + m.d / 2],
        [m.x - m.w / 2, m.z + m.d / 2],
        [m.x + m.w / 2, m.z - m.d / 2],
      ] as const) {
        if (Math.max(Math.abs(cx), Math.abs(cz)) > 200) continue;
        assert.ok(distToRoad(cx, cz) >= ROAD_HALF + BLOCK_INSET - 1e-6, `corner ${cx},${cz} too close to a road`);
      }
      for (const b of layout.buildings)
        assert.ok(Math.abs(m.x - b.x) > 8 || Math.abs(m.z - b.z) > 8, `skyline building on lot ${b.key}`);
      for (const p of PLAZAS)
        assert.ok(Math.abs(m.x - p.x) > 8 || Math.abs(m.z - p.z) > 8, 'skyline building on a plaza');
    }
    for (let i = 0; i < full.masses.length; i++)
      for (let j = i + 1; j < full.masses.length; j++) {
        const a = full.masses[i]!;
        const b = full.masses[j]!;
        const ox = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
        const oz = Math.min(a.z + a.d / 2, b.z + b.d / 2) - Math.max(a.z - a.d / 2, b.z - b.d / 2);
        const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        assert.ok(!(ox > 0.01 && oz > 0.01 && oy > 0.01), 'two skyline masses overlap (z-fighting)');
      }
  });

  it('has varied silhouettes: several styles, setbacks, signature tops and a range of heights', () => {
    for (const shape of ['pyramid', 'wedge', 'cone'] as const)
      assert.ok(
        full.parts.some(p => p.shape === shape),
        shape,
      );
    assert.ok(
      full.masses.some(m => m.style === 'crown'),
      'lantern crowns',
    );
    const styles = new Set(full.masses.map(m => m.style));
    for (const s of ['glass', 'stone', 'brick', 'ribbon', 'fins', 'louvre'] as const) assert.ok(styles.has(s), s);
    const heights = full.masses.map(m => m.y1);
    assert.ok(Math.max(...heights) > 50, 'some towers rise high');
    const tanks = full.parts.filter(p => p.mat === 'tank').length;
    assert.ok(tanks > 20, 'water tanks on the walk-ups');
  });
});

describe('layout buildings', () => {
  const count: Record<string, number> = {};
  const designs = layout.buildings.map((b, i) => {
    const k = (count[b.kind] = (count[b.kind] ?? -1) + 1);
    return { b, d: designBuilding(b, k, 101 + i * 37) };
  });

  it('stack their floors exactly: the last floor ends at base + floors × FLOOR_HEIGHT', () => {
    for (const { b, d } of designs) {
      const top = BUILDING_BASE_Y + b.floors.length * FLOOR_HEIGHT;
      const floorMasses = d.masses.filter(m => m.style !== 'crown' && m.style !== 'louvre');
      assert.ok(Math.abs(Math.max(...floorMasses.map(m => m.y1)) - top) < 1e-9, b.key);
      assert.ok(Math.abs(Math.min(...floorMasses.map(m => m.y0)) - BUILDING_BASE_Y) < 1e-9, b.key);
      assert.ok(d.top >= top);
    }
  });

  it('stay inside their lots', () => {
    for (const { b, d } of designs)
      for (const m of d.masses) {
        assert.ok(Math.abs(m.x - b.x) + m.w / 2 <= b.w / 2 + 1e-9, b.key);
        assert.ok(Math.abs(m.z - b.z) + m.d / 2 <= b.d / 2 + 1e-9, b.key);
      }
  });

  it('make the Training Center the tallest point of the lots, and sign every dealership with its brand', () => {
    const hq = designs.find(x => x.b.kind === 'training')!;
    for (const { b, d } of designs) if (b !== hq.b) assert.ok(d.top < hq.d.top, b.key);
    for (const { b, d } of designs.filter(x => x.b.kind === 'dealership'))
      assert.ok(
        d.signs.some(s => s.text === b.brand!.toUpperCase()),
        b.key,
      );
  });
});

describe('street furniture', () => {
  const plan = planFurniture(layout, 110);
  it('keeps lamps and trees off the roads and the walking line, and out of buildings', () => {
    assert.ok(plan.lamps.length > 100 && plan.trees.length > 100);
    assert.ok(LAMP_OFFSET - SIDEWALK > 0.35 && TREE_OFFSET > LAMP_OFFSET);
    for (const p of [...plan.lamps, ...plan.trees.map(([x, , z]) => ({ x, z }))]) {
      assert.ok(distToRoad(p.x, p.z) > SIDEWALK + 0.3, `${p.x},${p.z} on the road or walking line`);
      for (const b of layout.buildings)
        assert.ok(Math.abs(p.x - b.x) >= b.w / 2 || Math.abs(p.z - b.z) >= b.d / 2, `${p.x},${p.z} inside ${b.key}`);
    }
  });

  it('puts two signal poles at every junction of the traffic grid', () => {
    assert.equal(plan.signals.length, layout.streets.roadsX.length * layout.streets.roadsZ.length * 2);
    for (const s of plan.signals) assert.ok(distToRoad(s.x, s.z) >= SIGNAL_CORNER - ROAD_HALF - 1e-9);
  });
});

describe('automatic quality', () => {
  it('picks the initial level from the median frame time', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.equal(pickInitialQuality(Array(90).fill(12)), 'ultra');
    assert.equal(pickInitialQuality(Array(90).fill(25)), 'balanced');
    assert.equal(pickInitialQuality(Array(90).fill(60)), 'low');
    // A few hitches do not drag the pick down.
    assert.equal(pickInitialQuality([...Array(80).fill(14), ...Array(10).fill(200)]), 'ultra');
  });

  it('steps down only after sustained slow seconds, one level at a time', () => {
    const m = new SlowFrameMonitor();
    let fired = 0;
    const slow = SLOW_FRAME_MS + 8;
    // One slow second, then fast: no change.
    for (let t = 0; t < 1000; t += slow) fired += +m.push(slow);
    for (let t = 0; t < 2000; t += 16) fired += +m.push(16);
    assert.equal(fired, 0);
    for (let t = 0; t < SLOW_SECONDS * 1000 + slow; t += slow) fired += +m.push(slow);
    assert.equal(fired, 1);
    assert.equal(stepDown('ultra'), 'balanced');
    assert.equal(stepDown('balanced'), 'low');
    assert.equal(stepDown('low'), 'low');
  });
});
