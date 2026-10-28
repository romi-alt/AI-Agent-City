import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isLeadRole, planReferenceOffice, type SeatKind } from '../src/interior/plan.ts';

const ai = (n: number): SeatKind[] => Array.from({ length: n }, () => ({ kind: 'ai', lead: false }));
const inside = (x: number, z: number, r: { x: number; z: number; w: number; d: number }) =>
  Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2;

describe('reference office desks', () => {
  it('seats AI agents on the team rug, at most four to a row, facing the back wall', () => {
    const plan = planReferenceOffice(31.5, 31.5, ai(10));
    assert.equal(plan.desks.length, 10);
    const rows = new Map<number, number>();
    for (const d of plan.desks) {
      assert.equal(d.zone, 'team');
      assert.equal(d.facing, Math.PI);
      assert.ok(inside(d.x, d.z, plan.teamRug), `desk ${d.slot} on the team rug`);
      const key = Math.round(d.z * 10);
      rows.set(key, (rows.get(key) ?? 0) + 1);
    }
    assert.ok([...rows.values()].every(n => n <= 4));
  });

  it('puts people and leadership on the corner rug', () => {
    const seats: SeatKind[] = [{ kind: 'human', lead: false }, ...ai(3), { kind: 'ai', lead: true }];
    const plan = planReferenceOffice(31.5, 31.5, seats);
    const lead = plan.desks.filter(d => d.zone === 'lead').map(d => d.slot);
    assert.deepEqual(lead.sort(), [0, 4]);
    for (const d of plan.desks.filter(x => x.zone === 'lead')) assert.ok(inside(d.x, d.z, plan.leadRug));
  });

  it('keeps every desk and its chair inside the floor without overlaps', () => {
    for (const [w, d, n] of [
      [31.5, 31.5, 8],
      [24, 18, 12],
      [21, 21, 3],
    ] as const) {
      const plan = planReferenceOffice(w, d, ai(n));
      const s = plan.scale;
      for (const a of plan.desks) {
        assert.ok(Math.abs(a.x) + 1.3 * s <= w / 2 && a.z - 0.65 * s >= -d / 2 && a.z + 1.5 * s <= d / 2);
        for (const b of plan.desks)
          if (a !== b) assert.ok(Math.abs(a.x - b.x) >= 2.6 * s || Math.abs(a.z - b.z) >= 2.1 * s, 'no overlap');
      }
    }
  });

  it('places the feature wall at the back and leaves an empty floor without desks', () => {
    const plan = planReferenceOffice(31.5, 31.5, []);
    assert.equal(plan.desks.length, 0);
    assert.ok(plan.featureWall.z < -31.5 / 2 + 1);
  });

  it('recognises leadership roles', () => {
    assert.ok(isLeadRole('CEO'));
    assert.ok(isLeadRole('Sales manager'));
    assert.ok(!isLeadRole('closer'));
  });
});
