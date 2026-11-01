import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  boatPose,
  BRIDGES,
  bridgeCarPose,
  bridgeSpan,
  planBoats,
  planBridgeCars,
  riverOf,
  SAIL_RANGE,
} from '../src/world/fleet.ts';
import { bankLine, inWater, riverX } from '../src/world/waterfront.ts';

describe('bridges', () => {
  it('cross at cross streets, over the water, bank to bank', () => {
    for (const b of BRIDGES) {
      assert.equal(((b.z % 20) + 20) % 20, 10, `bridge at ${b.z} is on a cross street`);
      const [x0, x1] = bridgeSpan(b);
      const r = riverOf(b.river);
      assert.ok(x0 < riverX(r, b.z) - r.half && x1 > riverX(r, b.z) + r.half);
      assert.ok(inWater(riverX(r, b.z), b.z));
    }
    assert.ok(BRIDGES.some(b => b.kind === 'cable') && BRIDGES.some(b => b.kind === 'arch'));
  });

  it('keeps cars on the deck, in their lane, heading the right way', () => {
    const cars = planBridgeCars(4);
    assert.equal(cars.length, BRIDGES.length * 4);
    for (const c of cars) {
      const b = BRIDGES[c.bridge]!;
      const [x0, x1] = bridgeSpan(b);
      for (const t of [0, 13, 500]) {
        const p = bridgeCarPose(c, t);
        assert.ok(p.x >= x0 - 1e-6 && p.x <= x1 + 1e-6);
        assert.ok(Math.abs(p.z - b.z) <= b.wide / 2);
      }
    }
    assert.ok(cars.filter(c => c.taxi).length > cars.length / 3, 'yellow cabs are common');
  });
});

describe('boats', () => {
  it('is deterministic and keeps every boat on its river', () => {
    const a = planBoats(12);
    assert.deepEqual(a, planBoats(12));
    for (const b of a)
      for (const t of [0, 100, 1e5]) {
        const p = boatPose(b, t);
        const r = riverOf(b.river);
        assert.ok(Math.abs(p.x - riverX(r, p.z)) < r.half, `${b.kind} stays in the channel`);
        assert.ok(Math.abs(p.z) <= SAIL_RANGE + 1);
      }
  });

  it('has bank lines that follow the river', () => {
    const r = riverOf('west');
    const line = bankLine(r, r.half, -100, 100, 20);
    for (const [x, z] of line) assert.ok(Math.abs(x - riverX(r, z) - r.half) < 1e-9, 'on the bank');
  });
});

describe('blimp', () => {
  it('circles the city at a steady height, heading along its path', async () => {
    const { blimpPose, BLIMP } = await import('../src/world/blimp.ts');
    for (const t of [0, 100, 250, 419]) {
      const p = blimpPose(t);
      assert.ok(Math.abs(Math.hypot(p.x - BLIMP.cx, p.z - BLIMP.cz) - BLIMP.radius) < 1e-6);
      assert.ok(Math.abs(p.y - BLIMP.height) < 2);
      const q = blimpPose(t + 0.5);
      const hx = Math.cos(p.yaw);
      const hz = -Math.sin(p.yaw);
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      assert.ok((hx * dx + hz * dz) / Math.hypot(dx, dz) > 0.99, 'moves nose first');
    }
  });
});
