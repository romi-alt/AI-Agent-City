import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { BUILDING_BASE_Y, designAll } from '../src/buildings/designs.ts';
import { EXPLODE_GAP, easeExplode, floorOffset, lobbyLevels, stepExplode } from '../src/buildings/explode.ts';
import { designsForLayout } from '../src/buildings/info.ts';
import {
  median,
  pickInitialQuality,
  SLOW_FRAME_MS,
  SLOW_SECONDS,
  SlowFrameMonitor,
  stepDown,
} from '../src/quality/auto.ts';
import { onRoad, planFurniture, SIGNAL_CORNER } from '../src/streets/furniture.ts';
import { districtPlan, LANE, ROAD_HALF, SIDEWALK } from '../src/streets/grid.ts';
import { FLOOR_HEIGHT, type CityLayout } from '../src/types.ts';

const layout = JSON.parse(readFileSync(new URL('../src/data/city-layout.json', import.meta.url), 'utf8')) as CityLayout;
const district = districtPlan(layout.streets);
const designs = designAll(layout);
const distToRoad = (x: number, z: number) =>
  Math.min(...district.xs.map(r => Math.abs(x - r)), ...district.zs.map(r => Math.abs(z - r)));

describe('district plan', () => {
  it('keeps the legacy street geometry that traffic and pedestrians use', () => {
    assert.equal(ROAD_HALF, 2);
    assert.equal(LANE, 1);
    assert.equal(SIDEWALK, 2.7);
  });

  it('is the layout grid closed by a parkway, with exactly the 15 lots and a central plaza', () => {
    for (const r of layout.streets.roadsX) assert.ok(district.xs.includes(r));
    for (const r of layout.streets.roadsZ) assert.ok(district.zs.includes(r));
    assert.equal(Math.max(...district.xs), layout.streets.extent);
    const lots = district.cells.filter(c => c.kind === 'lot');
    assert.equal(lots.length, layout.buildings.length);
    for (const b of layout.buildings)
      assert.ok(
        lots.some(c => Math.abs(c.cx - b.x) < 1e-9 && Math.abs(c.cz - b.z) < 1e-9),
        b.key,
      );
    assert.equal(district.cells.filter(c => c.kind === 'plaza').length, 1);
  });
});

describe('the 15 buildings', () => {
  it('are the only buildings: one design per layout building, nothing else', () => {
    assert.equal(designs.length, 15);
    assert.deepEqual(
      designs.map(d => d.building.key),
      layout.buildings.map(b => b.key),
    );
  });

  it('stack their floors exactly and stand on their lots', () => {
    for (const { building: b, design: d } of designs) {
      assert.equal(d.roof, BUILDING_BASE_Y + b.floors.length * FLOOR_HEIGHT, b.key);
      assert.ok(d.top >= d.roof);
      for (const o of d.outline) {
        assert.ok(Math.abs(o.x - b.x) + o.w / 2 <= b.w / 2 + 1e-9, `${b.key} volume outside its lot`);
        assert.ok(Math.abs(o.z - b.z) + o.d / 2 <= b.d / 2 + 1e-9, `${b.key} volume outside its lot`);
        assert.ok(o.from >= 1 && o.to <= b.floors.length);
      }
      // Every floor is covered by a volume.
      for (let lv = 1; lv <= b.floors.length; lv++)
        assert.ok(
          d.outline.some(o => o.from <= lv && o.to >= lv),
          `${b.key} ${lv}`,
        );
      for (const p of d.parts) assert.ok(p.lv >= 1 && p.lv <= b.floors.length, `${b.key} part on floor ${p.lv}`);
    }
  });

  it('have real facade depth, entrances and rooftops (not textured boxes)', () => {
    for (const { building: b, design: d } of designs) {
      const mats = new Set(d.parts.map(p => p.mat));
      assert.ok(mats.has('glass') || mats.has('lobbyGlass'), b.key);
      assert.ok(d.parts.filter(p => p.lv === 1 && p.mat === 'glow').length >= 1, `${b.key} has a lit canopy`);
      assert.ok(d.parts.length > 300, `${b.key} has facade members`);
      assert.ok(
        d.parts.some(p => p.mat === 'mech' || p.mat === 'lantern' || p.mat === 'louvre' || p.shape === 'wedge'),
        `${b.key} rooftop`,
      );
      assert.ok(d.signs.length >= 1, `${b.key} signage`);
    }
    const hq = designs.find(x => x.building.kind === 'training')!;
    for (const { building: b, design: d } of designs) if (b !== hq.building) assert.ok(d.top < hq.design.top, b.key);
  });

  it('give the camera its facts through designsForLayout()', () => {
    const info = designsForLayout(layout);
    assert.equal(info.length, 15);
    for (const i of info) {
      const b = layout.buildings.find(x => x.key === i.key)!;
      assert.equal(i.floors, b.floors.length);
      assert.ok(i.height > i.roof && i.roof > i.baseY);
      assert.ok(['+x', '-x', '+z', '-z'].includes(i.entrance));
      assert.ok(Math.abs(i.entrancePoint[2] - (b.z + b.d / 2)) < 2);
    }
  });
});

describe('exploded floors', () => {
  it('leave the lobby on the ground, lift each floor by one more gap, and move the roof with the top floor', () => {
    for (const b of layout.buildings) {
      const lobby = lobbyLevels(b.kind);
      for (let lv = 1; lv <= lobby; lv++) assert.equal(floorOffset(b.key, lv, 1), 0);
      for (let lv = lobby + 1; lv <= b.floors.length; lv++) {
        assert.ok(Math.abs(floorOffset(b.key, lv, 1) - (lv - lobby) * EXPLODE_GAP) < 1e-9);
        // No overlap: consecutive floors separate monotonically at every t.
        for (const t of [0.1, 0.5, 0.9]) assert.ok(floorOffset(b.key, lv, t) >= floorOffset(b.key, lv - 1, t));
      }
      assert.equal(floorOffset(b.key, b.floors.length, 0), 0);
    }
    assert.equal(floorOffset('no-such-building', 5, 1), 0);
  });

  it('eases in and out, and advances frame-rate independently', () => {
    assert.equal(easeExplode(0), 0);
    assert.equal(easeExplode(1), 1);
    assert.ok(easeExplode(0.1) < 0.1 && easeExplode(0.9) > 0.9);
    // 0.8 s at 60 fps or at 20 fps both reach fully open.
    let a = 0;
    for (let i = 0; i < 48; i++) a = stepExplode(a, true, 1 / 60);
    let b = 0;
    for (let i = 0; i < 16; i++) b = stepExplode(b, true, 1 / 20);
    assert.ok(Math.abs(a - 1) < 1e-9 && Math.abs(b - 1) < 1e-9);
    assert.equal(stepExplode(0.5, false, 10), 0);
  });
});

describe('street furniture', () => {
  const plan = planFurniture(layout, district);
  it('keeps lamps and trees off the roads and the walking line, and out of buildings', () => {
    assert.ok(plan.lamps.length > 60 && plan.trees.length > 150);
    for (const p of [...plan.lamps, ...plan.trees.map(([x, , z]) => ({ x, z }))]) {
      assert.ok(!onRoad(district, p.x, p.z), `${p.x},${p.z} on a road`);
      if (Math.max(Math.abs(p.x), Math.abs(p.z)) <= district.ring)
        assert.ok(distToRoad(p.x, p.z) > SIDEWALK + 0.3, `${p.x},${p.z} on the walking line`);
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
    assert.equal(pickInitialQuality([...Array(80).fill(14), ...Array(10).fill(200)]), 'ultra');
  });

  it('steps down only after sustained slow seconds, one level at a time', () => {
    const m = new SlowFrameMonitor();
    let fired = 0;
    const slow = SLOW_FRAME_MS + 8;
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
