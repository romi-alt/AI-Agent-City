import { PLAZAS } from '../../streets/grid.ts';

/**
 * Where people gather in A1's plaza (read-only: A1's `PLAZAS` from streets/grid.ts): small standing groups on the
 * cross paths between the planted beds, and benches facing the paths. The plaza is a granite square with four beds
 * in its quarters and a fountain at the centre, so the paths along its two axes are open ground.
 */
export interface PlazaSpots {
  groups: { x: number; z: number }[];
  benches: { x: number; z: number; yaw: number }[];
}

export function plazaSpots(): PlazaSpots {
  const out: PlazaSpots = { groups: [], benches: [] };
  for (const p of PLAZAS) {
    if (p.kind !== 'plaza') continue;
    // The four arms of the cross path (+x, −z, −x, +z).
    for (const [ax, az] of [
      [1, 0],
      [0, -1],
      [-1, 0],
      [0, 1],
    ] as const) {
      out.groups.push({ x: p.x + ax * 3.6 + az * 0.6, z: p.z + az * 3.6 - ax * 0.6 });
      // A bench on one side of the arm, facing across it.
      const sx = -az;
      const sz = ax;
      out.benches.push({ x: p.x + ax * 5.6 + sx * 1.7, z: p.z + az * 5.6 + sz * 1.7, yaw: Math.atan2(sz, -sx) });
    }
  }
  return out;
}
