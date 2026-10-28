import type { V3 } from '../camera/math.ts';
import type { LayoutBuilding, LayoutDesk } from '../types.ts';
import type { DeskOccupant } from './occupants.ts';
import { officeSize, officeToWorld, planOffice, variantFor } from './plan.ts';

/** Desk top height (metres). */
export const DESK_HEIGHT = 0.74;

/** World position and facing of a desk on a floor, for the camera's desk close-up. */
export function deskWorld(
  b: LayoutBuilding,
  level: number,
  slot: number,
  occupants: number,
): { pos: V3; facing: number } | null {
  const { width, depth } = officeSize(b);
  const plan = planOffice(width, depth, occupants, variantFor(b.kind));
  const w = plan.workstations.find(x => x.slot === slot);
  if (!w) return null;
  return { pos: officeToWorld(b, level, w.x, DESK_HEIGHT, w.z), facing: w.facing };
}

/** The public layout's desks as occupants: AI desks keep their persona name, human desks stay anonymous. */
export function occupantsFromLayout(desks: LayoutDesk[], place?: { building: string; level: number }): DeskOccupant[] {
  return desks.map(d => ({
    // Unique across the city ("audi/12/0"), so a selected agent names one desk.
    id: place ? `${place.building}/${place.level}/${d.slot}` : String(d.slot),
    name: d.kind === 'ai' ? d.name : null,
    role: d.role,
    kind: d.kind,
    // Public views show no live activity: AI desks look busy, human desks idle (no real person's status).
    status: d.kind === 'ai' ? 'working' : 'idle',
  }));
}

/** The label a desk is announced with ("Ava, closer, AI agent"). */
export function deskLabel(o: DeskOccupant): string {
  const who = o.name ?? (o.kind === 'human' ? 'Team member' : 'AI agent');
  const kind = o.kind === 'ai' ? 'AI agent' : 'person';
  return o.name ? `${who}, ${o.role}, ${kind}` : `${who}, ${o.role}`;
}

/**
 * The team's part of an office floor in world units (the desks and the reception beside them), for framing the
 * dollhouse on the people rather than on the whole slab. Corners at floor and at head height.
 */
export function furnishedPoints(b: LayoutBuilding, level: number, occupants: number, lift = 0): V3[] {
  const { width, depth } = officeSize(b);
  const plan = planOffice(width, depth, occupants, variantFor(b.kind));
  // The desks actually placed (the team area's rectangle is allotted generously), plus the reception.
  const desks = plan.workstations.map(w => ({ x: w.x, z: w.z, w: 2.2, d: 2.2 }));
  const rects = [...(desks.length ? desks : [plan.work]), { x: plan.reception.x, z: plan.reception.z, w: 2, d: 2 }];
  const pad = 1.2;
  const x0 = Math.min(...rects.map(r => r.x - r.w / 2)) - pad;
  const x1 = Math.max(...rects.map(r => r.x + r.w / 2)) + pad;
  const z0 = Math.min(...rects.map(r => r.z - r.d / 2)) - pad;
  const z1 = Math.max(...rects.map(r => r.z + r.d / 2)) + pad;
  const out: V3[] = [];
  for (const x of [x0, x1])
    for (const z of [z0, z1])
      for (const y of [0, 1.7]) {
        const p = officeToWorld(b, level, x, y, z);
        out.push([p[0], p[1] + lift, p[2]]);
      }
  return out;
}
