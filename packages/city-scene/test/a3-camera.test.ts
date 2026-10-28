import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildingBox,
  cityBounds,
  cityBoxes,
  clampPosition,
  clampTarget,
  isInsideBox,
  segmentHitsBox,
} from '../src/camera/bounds.ts';
import {
  flightDuration,
  MAX_FLIGHT,
  MAX_TRAVEL,
  MAX_TURN,
  MIN_FLIGHT,
  peakRates,
  planFlight,
  planGlide,
  sampleFlight,
  sampleGlide,
} from '../src/camera/flight.ts';
import { catmullRom, dampFactor, dist, easeInOutCubic, type V3 } from '../src/camera/math.ts';
import { EXPLORE_LIMITS, orbitFromPose, orbitPosition, pan, rotate, zoom } from '../src/camera/orbit.ts';
import { ARRIVAL_SECONDS } from '../src/camera/arrival.ts';
import { explodedExtra, floorLift } from '../src/camera/explode.ts';
import { fitPoints, projectToVisible, type Viewport } from '../src/camera/fit.ts';
import { boxesFor } from '../src/camera/scene-boxes.ts';
import {
  arrivalKeyframes,
  blockedSightLines,
  buildingShot,
  floorBase,
  floorShot,
  homeShot,
  officeShot,
  overviewOrbit,
  OVERVIEW_PHI,
  OVERVIEW_THETA,
  districtPoints,
  topShot,
  type Pose,
} from '../src/camera/shots.ts';
import layoutJson from '../src/data/city-layout.json' with { type: 'json' };
import type { CityLayout } from '../src/types.ts';

const layout = layoutJson as CityLayout;
const bounds = cityBounds(layout);
const boxes = cityBoxes(layout);
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe('easing and smoothing', () => {
  it('eases from 0 to 1, monotonically, with zero speed at both ends', () => {
    assert.equal(easeInOutCubic(0), 0);
    assert.equal(easeInOutCubic(1), 1);
    assert.equal(easeInOutCubic(-1), 0);
    assert.equal(easeInOutCubic(2), 1);
    let prev = 0;
    for (let t = 0.01; t <= 1; t += 0.01) {
      const v = easeInOutCubic(t);
      assert.ok(v >= prev);
      prev = v;
    }
    assert.ok(easeInOutCubic(0.01) < 0.001 && 1 - easeInOutCubic(0.99) < 0.001);
  });
  it('damps the same over one long frame as over many short ones', () => {
    const one = dampFactor(9, 0.1);
    let rest = 1;
    for (let i = 0; i < 10; i++) rest *= 1 - dampFactor(9, 0.01);
    assert.ok(close(1 - one, rest, 1e-9));
  });
  it('passes the spline through its first and last points', () => {
    const pts: V3[] = [
      [0, 0, 0],
      [5, 2, 1],
      [9, 9, 9],
    ];
    assert.deepEqual(catmullRom(pts, 0), [0, 0, 0]);
    assert.deepEqual(catmullRom(pts, 1), [9, 9, 9]);
    assert.deepEqual(catmullRom(pts, 0.5), [5, 2, 1]);
  });
});

describe('orbit', () => {
  it('round-trips a pose', () => {
    const o = orbitFromPose([30, 20, 40], [1, 2, 3]);
    const p = orbitPosition(o);
    assert.ok(dist(p, [30, 20, 40]) < 1e-9);
  });
  it('keeps zoom and tilt within limits', () => {
    let o = orbitFromPose([0, 50, 80], [0, 0, 0]);
    for (let i = 0; i < 100; i++) o = zoom(o, 0.5, EXPLORE_LIMITS);
    assert.equal(o.radius, EXPLORE_LIMITS.minRadius);
    for (let i = 0; i < 100; i++) o = zoom(o, 2, EXPLORE_LIMITS);
    assert.equal(o.radius, EXPLORE_LIMITS.maxRadius);
    o = rotate(o, 0, 10, EXPLORE_LIMITS);
    assert.equal(o.phi, EXPLORE_LIMITS.minPhi);
    o = rotate(o, 0, -10, EXPLORE_LIMITS);
    assert.equal(o.phi, EXPLORE_LIMITS.maxPhi);
  });
  it('pans forward along the view heading, in the ground plane', () => {
    const o = orbitFromPose([0, 30, 40], [0, 0, 0]); // looking towards -z
    const moved = pan(o, 0, 0.5);
    assert.ok(moved.target[2] < 0 && close(moved.target[0], 0) && moved.target[1] === 0);
    const right = pan(o, 0.5, 0);
    assert.ok(right.target[0] > 0 && close(right.target[2], 0));
  });
});

describe('bounds and collisions', () => {
  it('pushes a camera out of every building, whichever side it entered', () => {
    for (const b of layout.buildings) {
      const inside: V3 = [b.x + b.w * 0.2, 3, b.z - b.d * 0.1];
      const out = clampPosition(inside, boxes, bounds);
      for (const box of boxes) assert.ok(!isInsideBox(out, box, 0.5), `${b.key} -> still inside ${box.key}`);
    }
  });
  it('leaves through the nearest face (over the roof when close to it)', () => {
    const b = layout.buildings[0]!;
    const box = buildingBox(b);
    const nearTop: V3 = [b.x, box.top - 0.2, b.z];
    const out = clampPosition(nearTop, boxes, bounds);
    assert.ok(out[1] > box.top && close(out[0], b.x) && close(out[2], b.z));
  });
  it('stays above the street and inside the city', () => {
    const p = clampPosition([1e4, -50, -1e4], boxes, bounds);
    assert.ok(p[1] >= bounds.minY);
    assert.ok(Math.abs(p[0]) <= bounds.extent && Math.abs(p[2]) <= bounds.extent);
    const t = clampTarget([500, -3, 500], bounds);
    assert.deepEqual(t, [bounds.targetExtent, 0, bounds.targetExtent]);
  });
  it('lets the camera into an opened floor but not below it', () => {
    const b = layout.buildings.find(x => x.key === 'rental-2')!;
    const cut = cityBoxes(layout, { building: b.key, level: 3 });
    const floorY = floorBase(3);
    const inOffice: V3 = [b.x + 1, floorY + 0.5, b.z + 1];
    assert.deepEqual(clampPosition(inOffice, cut, bounds), inOffice);
    const below = clampPosition([b.x, floorY - 0.6, b.z], cut, bounds);
    assert.ok(below[1] >= floorY || Math.abs(below[0] - b.x) >= b.w / 2 || Math.abs(below[2] - b.z) >= b.d / 2);
  });
  it('detects a sight line through a box', () => {
    const box = { key: 'x', minX: -1, maxX: 1, minZ: -1, maxZ: 1, top: 5 };
    assert.ok(segmentHitsBox([-5, 1, 0], [5, 1, 0], box));
    assert.ok(!segmentHitsBox([-5, 7, 0], [5, 7, 0], box));
    assert.ok(!segmentHitsBox([-5, 1, 3], [5, 1, 3], box));
  });
});

const VP: Viewport = { width: 1280, height: 800, right: 0, bottom: 0, fov: 42 };
const VP_PANEL: Viewport = { ...VP, right: 396 };
const VP_PHONE: Viewport = { width: 390, height: 844, right: 0, bottom: 440, fov: 42 };

describe('framing', () => {
  it('fits every point inside the part of the view the panels leave visible, centred, with little waste', () => {
    for (const vp of [VP, VP_PANEL, VP_PHONE]) {
      const pts = districtPoints(boxes);
      const o = fitPoints(pts, OVERVIEW_THETA, OVERVIEW_PHI, vp, 0.04);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        const [x, y] = projectToVisible(o, p, vp);
        assert.ok(Math.abs(x) <= 1.0001 && Math.abs(y) <= 1.0001, `outside the visible view: ${x}, ${y}`);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      // Centred, and filling the view on at least one axis (no excessive empty space).
      assert.ok(Math.abs(minX + maxX) < 0.02 && Math.abs(minY + maxY) < 0.02);
      assert.ok(Math.max(maxX - minX, maxY - minY) > 1.85, 'fills the frame');
    }
  });
  it('City Overview is an elevated aerial at 45–55° from the south-east, showing roofs, fronts and sides', () => {
    const o = overviewOrbit(boxes, VP);
    const pitch = 90 - (o.phi * 180) / Math.PI;
    assert.ok(pitch >= 45 && pitch <= 55, `pitch ${pitch.toFixed(1)}°`);
    const pos = orbitPosition(o);
    assert.ok(pos[2] > o.target[2] && pos[0] > o.target[0], 'front (+z) and east facades face the camera');
  });
  it('Top View looks almost straight down at the whole district', () => {
    const t = topShot(boxes, VP);
    const o = orbitFromPose(t.pos, t.target);
    assert.ok(o.phi < 0.06);
    for (const p of districtPoints(boxes)) {
      const [x, y] = projectToVisible(o, p, VP);
      assert.ok(Math.abs(x) <= 1.0001 && Math.abs(y) <= 1.0001);
    }
  });
  it('frames every building three-quarter, complete, from outside every building, with a clear line of sight', () => {
    for (const vp of [VP, VP_PANEL, VP_PHONE]) {
      for (const b of layout.buildings) {
        const others = boxes.filter(x => x.key !== b.key);
        const s = buildingShot(b, vp, others);
        const o = orbitFromPose(s.pos, s.target);
        for (const box of boxes) assert.ok(!isInsideBox(s.pos, box), `${b.key} shot inside ${box.key}`);
        assert.equal(blockedSightLines(s.pos, b, others), 0, `${b.key} is hidden behind another building`);
        const h = b.floors.length * 1.4;
        for (const p of [
          [b.x - b.w / 2, 0, b.z + b.d / 2],
          [b.x + b.w / 2, h, b.z - b.d / 2],
        ] as V3[]) {
          const [x, y] = projectToVisible(o, p, vp);
          assert.ok(Math.abs(x) <= 1 && Math.abs(y) <= 1, `${b.key} not completely in view`);
        }
        // Three-quarter: neither straight on nor from above.
        const pitch = 90 - (o.phi * 180) / Math.PI;
        assert.ok(pitch > 10 && pitch < 58, `${b.key} pitch ${pitch.toFixed(0)}`);
      }
    }
  });
  it('makes room for exploded floors', () => {
    const b = layout.buildings.find(x => x.key === 'audi')!;
    const shut = orbitFromPose(buildingShot(b, VP).pos, buildingShot(b, VP).target);
    const open = buildingShot(b, VP, [], undefined, explodedExtra(b.key, b.floors.length, 1));
    assert.ok(orbitFromPose(open.pos, open.target).radius > shut.radius * 1.3);
    assert.equal(floorLift('audi', 1, 1), 0, 'the lobby stays on the ground');
    assert.ok(floorLift('audi', 5, 1) > floorLift('audi', 4, 1) && floorLift('audi', 5, 0) === 0);
  });
  it('looks into an opened floor from above the cut, and into the office from inside the cut', () => {
    for (const b of layout.buildings) {
      for (const level of [1, Math.ceil(b.floors.length / 2), b.floors.length]) {
        const cut = cityBoxes(layout, { building: b.key, level });
        const f = floorShot(b, level, VP);
        const o = officeShot(b, level, VP);
        for (const box of cut) {
          assert.ok(!isInsideBox(f.pos, box, 0.05), `floor shot ${b.key} L${level} inside ${box.key}`);
          assert.ok(!isInsideBox(o.pos, box, 0.05), `office shot ${b.key} L${level} inside ${box.key}`);
        }
        assert.ok(f.pos[1] > f.target[1] && o.pos[1] > o.target[1]);
      }
    }
  });
  it('keeps exploded floors above an opened one as their own box', () => {
    const mode = { kind: 'floor' as const, building: 'audi', level: 4 };
    const bx = boxesFor(layout, mode, null, 1).filter(x => x.key.startsWith('audi'));
    assert.equal(bx.length, 2);
    const above = bx.find(x => x.bottom !== undefined)!;
    assert.ok(above.bottom! > floorBase(5));
    const p: V3 = [layout.buildings[0]!.x, (bx[0]!.top + above.bottom!) / 2, layout.buildings[0]!.z];
    assert.deepEqual(clampPosition(p, bx, bounds), p, 'the gap between the opened floor and the lifted ones is free');
  });
  it('enters with a short reveal that starts high above and ends on the overview or the visitor’s building', () => {
    const b = layout.buildings.find(x => x.key === 'rental-2')!;
    const others = boxes.filter(x => x.key !== b.key);
    const keys = arrivalKeyframes(boxes, VP, b, others);
    assert.ok(keys[0]!.pos[1] > Math.max(...boxes.map(x => x.top)) * 3);
    assert.deepEqual(keys.at(-1), buildingShot(b, VP, others));
    for (const k of keys.slice(0, -1)) for (const box of boxes) assert.ok(k.pos[1] > box.top + 5);
    assert.deepEqual(arrivalKeyframes(boxes, VP, null).at(-1), homeShot(boxes, VP));
  });
});

/** Peak angular speed (rad/s) of the view direction and peak speed of the look-at point, sampled at 120 Hz. */
function peakSpeeds(sample: (t: number) => Pose, duration: number) {
  return peakRates(sample, duration, Math.ceil(duration * 120));
}

describe('comfort limits', () => {
  it('never turns or slides faster than the limits between any two framings', () => {
    const shots: Pose[] = [homeShot(boxes, VP), topShot(boxes, VP)];
    for (const b of layout.buildings) {
      shots.push(
        buildingShot(
          b,
          VP,
          boxes.filter(x => x.key !== b.key),
        ),
        floorShot(b, 2, VP),
        officeShot(b, 2, VP),
      );
    }
    for (let i = 0; i < shots.length; i += 3) {
      for (let j = 1; j < shots.length; j += 4) {
        const f = planFlight(shots[i]!, shots[j]!);
        assert.ok(f.duration >= MIN_FLIGHT && f.duration <= MAX_FLIGHT);
        const peak = peakSpeeds(t => sampleFlight(f, t), f.duration);
        if (f.duration < MAX_FLIGHT) {
          assert.ok(peak.turn <= MAX_TURN * 1.08, `turn ${peak.turn.toFixed(2)} rad/s (${i}->${j})`);
          assert.ok(peak.travel <= MAX_TRAVEL * 1.08, `travel ${peak.travel.toFixed(1)} u/s (${i}->${j})`);
        }
        assert.ok(dist(sampleFlight(f, f.duration).pos, shots[j]!.pos) < 1e-6);
      }
    }
  });
  it('keeps the entrance reveal short and calm', () => {
    for (const key of ['rental-2', 'audi', 'fast-sales', null]) {
      const b = layout.buildings.find(x => x.key === key) ?? null;
      const g = planGlide(
        arrivalKeyframes(
          boxes,
          VP,
          b,
          boxes.filter(x => x.key !== key),
        ),
        ARRIVAL_SECONDS,
      );
      assert.ok(ARRIVAL_SECONDS <= 8);
      const peak = peakSpeeds(t => sampleGlide(g, t), g.duration);
      assert.ok(peak.turn <= MAX_TURN * 1.25, `arrival to ${key}: ${peak.turn.toFixed(2)} rad/s`);
    }
  });
  it('gives short hops a short (but not abrupt) flight', () => {
    const a = homeShot(boxes, VP);
    assert.equal(flightDuration(a, a), MIN_FLIGHT);
  });
});
