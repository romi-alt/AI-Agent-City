import assert from 'node:assert/strict';
import { it } from 'node:test';
import { AIRLINER, AirTraffic, HELICOPTER, type AirSample } from '../src/life/air/flights.ts';
import { buildingBoxes, tallestRoof } from '../src/life/geometry.ts';
import { QUALITY } from '../src/quality/quality.ts';
import { layout } from './a2-helpers.ts';

const sample = (): AirSample => ({ active: false, x: 0, y: 0, z: 0, yaw: 0, bank: 0, fade: 0 });
const boxes = buildingBoxes(layout);
const roofs = tallestRoof(layout);

function distToBoxes(x: number, z: number) {
  return Math.min(
    ...boxes.map(b => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ))),
  );
}

it('keeps airliners high above every building and far from the towers (one simulated hour)', () => {
  const air = new AirTraffic(layout, { aircraft: QUALITY.ultra.aircraft, helicopters: 0 });
  const s = sample();
  let seen = 0;
  let maxBank = 0;
  for (let t = 0; t < 3600; t += 0.5)
    for (let k = 0; k < QUALITY.ultra.aircraft; k++) {
      air.airliner(k, t, s);
      if (!s.active) continue;
      seen++;
      assert.ok(s.y >= roofs + AIRLINER.minAltitudeAboveRoofs, `altitude ${s.y.toFixed(1)}`);
      assert.ok(Math.hypot(s.x, s.z) >= AIRLINER.minDistance - 1e-6, `distance ${Math.hypot(s.x, s.z).toFixed(1)}`);
      assert.ok(distToBoxes(s.x, s.z) > 300);
      assert.ok(s.fade >= 0 && s.fade <= 1);
      maxBank = Math.max(maxBank, Math.abs(s.bank));
    }
  assert.ok(seen > 1000, 'aircraft actually fly');
  assert.ok(maxBank > 0.02 && maxBank < 0.35, `gentle banking (max ${maxBank.toFixed(2)} rad)`);
});

it('spaces airliners out: never more than the budget in the sky, and gaps between flights', () => {
  const n = QUALITY.balanced.aircraft;
  const air = new AirTraffic(layout, { aircraft: n, helicopters: 0 });
  const s = sample();
  let empty = 0;
  for (let t = 0; t < 1200; t += 1) {
    let active = 0;
    for (let k = 0; k < n; k++) if (air.airliner(k, t, s).active) active++;
    assert.ok(active <= n);
    if (active === 0) empty++;
  }
  assert.ok(empty > 60, 'there are quiet moments with no aircraft at all');
});

it('keeps helicopters above the roofs and clear of the towers', () => {
  const air = new AirTraffic(layout, { aircraft: 0, helicopters: QUALITY.ultra.helicopters });
  const s = sample();
  let near = 0;
  for (let t = 0; t < 3600; t += 0.25)
    for (let k = 0; k < QUALITY.ultra.helicopters; k++) {
      air.helicopter(k, t, s);
      assert.ok(s.y >= roofs + HELICOPTER.minAltitudeAboveRoofs - 1e-6, `heli altitude ${s.y}`);
      assert.ok(distToBoxes(s.x, s.z) > 20, `heli ${distToBoxes(s.x, s.z).toFixed(1)} from a tower`);
      if (Math.hypot(s.x, s.z) < 160) near++;
    }
  assert.ok(near > 1000, 'helicopters do come near the skyline');
});

it('moves helicopters smoothly (no jumps between frames)', () => {
  const air = new AirTraffic(layout, { aircraft: 0, helicopters: 1 });
  const a = sample();
  const b = sample();
  for (let t = 0; t < 1200; t += 0.1) {
    air.helicopter(0, t, a);
    air.helicopter(0, t + 1 / 30, b);
    assert.ok(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) < 1.5, `jump at t=${t.toFixed(1)}`);
  }
});
