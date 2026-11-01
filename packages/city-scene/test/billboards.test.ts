import assert from 'node:assert/strict';
import { it } from 'node:test';
import { ADS, planBillboards, SQUARE } from '../src/world/billboards.ts';
import { ROAD_HALF } from '../src/streets/grid.ts';

it('stands the Times Square masts on the sidewalk corners and faces every screen to the junction', () => {
  for (const n of [12, 28, 40]) {
    const { masts, panels } = planBillboards(n);
    assert.equal(masts.length, 4);
    assert.ok(Math.abs(panels.length - n) <= 4);
    for (const m of masts)
      assert.ok(Math.abs(m.x - SQUARE.x) > ROAD_HALF && Math.abs(m.z - SQUARE.z) > ROAD_HALF, 'off the roads');
    for (const p of panels) {
      // The normal (sin yaw, cos yaw) points toward the junction centre from the panel.
      const dx = SQUARE.x - p.x;
      const dz = SQUARE.z - p.z;
      const dot = (Math.sin(p.yaw) * dx + Math.cos(p.yaw) * dz) / Math.hypot(dx, dz);
      assert.ok(dot > 0.8, `faces the junction (${dot.toFixed(2)})`);
      assert.ok(p.ad >= 0 && p.ad < ADS.length);
    }
  }
});

it('uses only invented names (no real brands)', () => {
  const text = ADS.map(a => `${a.big} ${a.small}`)
    .join(' ')
    .toLowerCase();
  for (const brand of ['coca', 'pepsi', 'sony', 'samsung', 'nike', 'mcdonald', 'apple', 'google'])
    assert.ok(!text.includes(brand));
});

it('dresses the streets mid-block, off the junctions and the roads', async () => {
  const { planDressing, KERB_OFFSET } = await import('../src/world/dressing.ts');
  const xs = [-50, -30, -10, 10, 30, 50];
  const zs = [-30, -10, 10, 30];
  const d = planDressing(xs, zs, 150);
  assert.ok(d.vents.length > 3 && d.hydrants.length > 3);
  assert.deepEqual(d, planDressing(xs, zs, 150));
  assert.ok(planDressing(xs, zs, 150, 0.5).vents.length <= d.vents.length);
  const nearest = (v: number, lines: number[]) => Math.min(...lines.map(l => Math.abs(v - l)));
  for (const h of [...d.hydrants, ...d.kiosks, ...d.carts]) {
    const onAvenue = nearest(h.x, xs) < 4;
    const off = onAvenue ? nearest(h.x, xs) : nearest(h.z, zs);
    assert.ok(Math.abs(off - KERB_OFFSET) < 1e-6 || off > KERB_OFFSET - 1e-6, `off the road (${off})`);
    assert.ok(off >= 2, 'not on the carriageway');
  }
});
