import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildingBox } from '../src/camera/bounds.ts';
import { deskShot, floorBase } from '../src/camera/shots.ts';
import layoutJson from '../src/data/city-layout.json' with { type: 'json' };
import { deskLabel, deskWorld, occupantsFromLayout } from '../src/interior/placement.ts';
import {
  type OfficeVariant,
  planOffice,
  type Rect,
  rectsOverlap,
  seatPosition,
  variantFor,
} from '../src/interior/plan.ts';
import type { CityLayout } from '../src/types.ts';

const layout = layoutJson as CityLayout;
const deskRect = (x: number, z: number): Rect => ({ x, z, w: 1.6, d: 0.8 });

describe('office floor plan', () => {
  const variants: OfficeVariant[] = ['office', 'showroom', 'classroom'];
  for (const variant of variants) {
    for (const [w, d] of [
      [31.5, 31.5],
      [28, 28],
      [49, 42],
    ] as const) {
      for (const n of [0, 3, 8, 20]) {
        it(`${variant} ${w}×${d} m with ${n} people: desks inside the glass, clear of rooms, one per slot`, () => {
          const p = planOffice(w, d, n, variant);
          assert.ok(p.workstations.length >= n, 'everyone gets a desk');
          const slots = p.workstations.map(x => x.slot);
          assert.equal(new Set(slots).size, slots.length);
          assert.deepEqual(
            [...slots].sort((a, b) => a - b),
            [...slots.keys()],
          );
          for (const ws of p.workstations) {
            const [sx, sz] = seatPosition(ws);
            for (const [x, z] of [
              [ws.x, ws.z],
              [sx, sz],
            ] as const) {
              assert.ok(Math.abs(x) < w / 2 - 0.5 && Math.abs(z) < d / 2 - 0.5, `outside the floor at ${x},${z}`);
            }
            for (const room of [p.core, p.meeting, p.lounge]) assert.ok(!rectsOverlap(deskRect(ws.x, ws.z), room));
          }
          for (const room of [p.meeting, p.lounge]) assert.ok(!rectsOverlap(room, p.core));
          // Desks do not overlap each other.
          for (let i = 0; i < p.workstations.length; i++)
            for (let j = i + 1; j < p.workstations.length; j++) {
              const a = p.workstations[i]!;
              const b = p.workstations[j]!;
              assert.ok(
                !rectsOverlap(deskRect(a.x, a.z), { ...deskRect(b.x, b.z), w: 1.59, d: 0.79 }),
                `desks ${i}/${j}`,
              );
            }
        });
      }
    }
  }
  it('spreads a small team across pods instead of crowding one', () => {
    const p = planOffice(31.5, 31.5, 4, 'office');
    const firstFour = p.workstations.filter(w => w.slot < 4);
    for (let i = 0; i < firstFour.length; i++)
      for (let j = i + 1; j < firstFour.length; j++) {
        const a = firstFour[i]!;
        const b = firstFour[j]!;
        assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 3, 'each of the first four sits at a different pod');
      }
  });
  it('picks the variant from the building kind', () => {
    assert.equal(variantFor('dealership'), 'showroom');
    assert.equal(variantFor('training'), 'classroom');
    assert.equal(variantFor('rental'), 'office');
    assert.equal(variantFor('associates'), 'office');
  });
});

describe('desks in the city', () => {
  it('puts every desk inside its building and the desk close-up inside the office', () => {
    for (const b of layout.buildings) {
      for (const f of b.floors) {
        const box = buildingBox(b);
        for (let slot = 0; slot < Math.max(1, f.desks.length); slot++) {
          const d = deskWorld(b, f.level, slot, f.desks.length);
          assert.ok(d);
          assert.ok(d.pos[0] > box.minX && d.pos[0] < box.maxX && d.pos[2] > box.minZ && d.pos[2] < box.maxZ);
          const shot = deskShot(d.pos, d.facing);
          const floorY = floorBase(f.level);
          assert.ok(shot.pos[1] > floorY + 0.3 && shot.pos[1] < floorY + 3.3 / 3.5, 'below the ceiling');
          assert.ok(
            shot.pos[0] > box.minX && shot.pos[0] < box.maxX && shot.pos[2] > box.minZ && shot.pos[2] < box.maxZ,
          );
        }
      }
    }
  });
  it('keeps human desks anonymous in public views', () => {
    const f = layout.buildings.find(b => b.key === 'rc-new')!.floors[0]!;
    const o = occupantsFromLayout(f.desks);
    const human = o.find(x => x.kind === 'human')!;
    assert.equal(human.name, null);
    assert.equal(deskLabel(human), 'Team member, associate');
    assert.equal(human.status, 'idle');
    const ai = o.find(x => x.kind === 'ai' && x.name)!;
    assert.equal(deskLabel(ai), `${ai.name}, ${ai.role}, AI agent`);
  });
});
