import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import layoutJson from '../src/data/city-layout.json' with { type: 'json' };
import { referencePlanFor } from '../src/interior/placement.ts';
import { officeSize } from '../src/interior/plan.ts';
import {
  clockHands,
  deskAccent,
  DESK_ACCENTS,
  detailLayout,
  detailLevelFor,
  featureBoard,
  funnelShape,
  PIPELINE_STAGES,
  personLook,
  shelfBooks,
} from '../src/interior/room/detail.ts';
import { roomLayout } from '../src/interior/room/layout.ts';
import { plantLeaves } from '../src/interior/room/plants.ts';
import type { CityLayout } from '../src/types.ts';

const layout = layoutJson as CityLayout;
const people = Array.from({ length: 8 }, () => ({ kind: 'ai' as const, role: 'follow-up' }));

/** The three floor sizes the city has, as rooms. */
const rooms = ['audi', 'rc-new', 'fast-sales'].map(key => {
  const b = layout.buildings.find(x => x.key === key)!;
  return { key, room: roomLayout(referencePlanFor(b, people)), size: officeSize(b) };
});

describe('office detail (I1)', () => {
  it('maps quality to detail: low keeps the big pieces, ultra adds the small ones', () => {
    assert.equal(detailLevelFor('low'), 'low');
    assert.equal(detailLevelFor('balanced'), 'full');
    assert.equal(detailLevelFor('ultra'), 'rich');
  });

  for (const { key, room } of rooms) {
    describe(`layout on ${key}`, () => {
      const d = detailLayout(room);
      const inside = (x: number, z: number, pad = 0) =>
        Math.abs(x) <= room.width / 2 - pad && Math.abs(z) <= room.depth / 2 - pad;

      it('keeps the back-wall pieces apart, left to right, inside the room', () => {
        const spans = [...d.backWall].sort((a, b) => a.from - b.from);
        assert.deepEqual(
          spans.map(s => s.id),
          ['coffee', 'crm', 'feature', 'content'],
        );
        for (let i = 0; i < spans.length; i++) {
          assert.ok(spans[i]!.from >= -room.width / 2, `${spans[i]!.id} within the west glass`);
          assert.ok(spans[i]!.to <= room.width / 2, `${spans[i]!.id} within the east glass`);
          if (i) assert.ok(spans[i]!.from >= spans[i - 1]!.to, `${spans[i - 1]!.id} and ${spans[i]!.id} overlap`);
        }
      });

      it('hangs each screen and picture on its panel', () => {
        for (const p of d.panels) {
          assert.ok(p.screen.w < p.w && p.screen.y + p.screen.h / 2 < p.h, `${p.id} screen fits`);
        }
        for (const a of d.art) {
          const own = d.panels.find(p => Math.abs(a.x - p.x) < p.w / 2)!;
          assert.ok(Math.abs(a.x - own.x) + a.w / 2 + 0.07 <= own.w / 2 + 1e-9, 'print inside the panel edge');
          assert.ok(
            Math.abs(a.x - own.x) - a.w / 2 - 0.07 >= own.screen.w / 2 + 0.13 - 1e-9,
            'print clear of the screen',
          );
          const panel = d.panels.find(p => Math.abs(a.x - p.x) < p.w / 2);
          assert.ok(panel, `a ${a.art} print hangs on a panel`);
          assert.ok(a.y + a.h / 2 < panel!.h);
        }
        assert.deepEqual(d.art.map(a => a.art).sort(), ['abstract', 'chart', 'hills']);
      });

      it('puts furniture, lamps and plants on the floor', () => {
        assert.ok(inside(d.coffee.x, d.coffee.z));
        for (const o of [d.printer, d.cooler, d.cabinet, ...d.lamps]) assert.ok(inside(o.x, o.z, 0.4), 'on the floor');
        for (const p of d.plants) assert.ok(inside(p.x, p.z), `plant at ${p.x},${p.z}`);
      });

      it('keeps the task board clear above the ledge', () => {
        const b = featureBoard(room.featureWall, room.scale);
        assert.ok(b.y - b.h / 2 > 0.84 * room.scale, 'board bottom above the ledge top');
        assert.ok(b.y + b.h / 2 < room.featureWall.h, 'board inside the wall');
      });
    });
  }

  it('fills shelves deterministically, inside the shelf and the rows', () => {
    const a = shelfBooks(17, 3.2, 4, 0.55, 8);
    assert.deepEqual(a, shelfBooks(17, 3.2, 4, 0.55, 8));
    assert.ok(a.length > 40 && a.length < 200, `${a.length} books`);
    for (const b of a) {
      assert.ok(b.x - b.w / 2 >= 0 && b.x + b.w / 2 <= 3.2, 'inside the shelf width');
      assert.ok(b.row >= 0 && b.row < 4);
      assert.ok(b.h <= 0.45 + 1e-9, 'fits under the next shelf');
      assert.ok(b.colour >= 0 && b.colour < 8);
    }
    assert.ok(
      a.some(b => b.lean > 0),
      'a few lean',
    );
  });

  it('sets clock hands from the time', () => {
    const three = clockHands(3, 0);
    assert.ok(Math.abs(three.hour - Math.PI / 2) < 1e-9 && three.minute === 0);
    const half = clockHands(6, 30);
    assert.ok(Math.abs(half.minute - Math.PI) < 1e-9);
    assert.ok(Math.abs(half.hour - (6.5 / 12) * Math.PI * 2) < 1e-9, 'hour hand is halfway to seven');
    assert.deepEqual(clockHands(15, 0), clockHands(3, 0), '24-hour times wrap');
  });

  it('sketches a funnel that narrows, never a count', () => {
    const f = funnelShape(PIPELINE_STAGES.length);
    assert.equal(f.length, 5);
    assert.equal(f[0], 1);
    for (let i = 1; i < f.length; i++) assert.ok(f[i]! < f[i - 1]!);
    assert.ok(f.at(-1)! > 0.2);
  });

  it('cycles agent accents and varies the people', () => {
    assert.equal(deskAccent(0), DESK_ACCENTS[0]);
    assert.equal(deskAccent(8), DESK_ACCENTS[0]);
    assert.equal(deskAccent(-1), DESK_ACCENTS[7]);
    const looks = Array.from({ length: 16 }, (_, i) => personLook(i + 1));
    assert.deepEqual(personLook(3), personLook(3), 'deterministic');
    assert.ok(new Set(looks.map(l => l.skin)).size >= 3, 'several skin tones');
    assert.ok(new Set(looks.map(l => l.hairStyle)).size >= 4, 'several hairstyles');
    assert.ok(looks.some(l => l.female) && looks.some(l => !l.female));
    for (const l of looks) {
      if (l.female) assert.ok(['long', 'bob', 'bun', 'pony'].includes(l.hairStyle) && !l.beard && !l.tie);
      else assert.ok(['side', 'quiff', 'buzz'].includes(l.hairStyle) && !l.skirt);
    }
  });

  it('grows more leaves at higher detail, the same way each time', () => {
    for (const type of ['bush', 'snake', 'monstera', 'palm'] as const) {
      const low = plantLeaves(type, 3, 'low');
      const rich = plantLeaves(type, 3, 'rich');
      assert.ok(low.length < rich.length, `${type}: ${low.length} < ${rich.length}`);
      assert.deepEqual(rich, plantLeaves(type, 3, 'rich'));
      for (const l of rich) assert.ok(l.green >= 0 && l.green < 4 && l.scale.every(Number.isFinite));
    }
  });
});
