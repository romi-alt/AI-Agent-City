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
export function occupantsFromLayout(desks: LayoutDesk[]): DeskOccupant[] {
  return desks.map(d => ({
    id: String(d.slot),
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
