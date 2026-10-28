import { planPlazas } from '../../streets/plazas.ts';
import { PLAZAS } from '../../streets/grid.ts';

/**
 * Where people gather in A1's plaza (read-only: `PLAZAS` and `planPlazas()` from streets/): small standing groups on
 * the open paving between the planted beds, kept clear of A1's benches, beds, fountain and flagpoles. People are not
 * seated on A1's plaza benches: those are built at the earlier, larger people scale (seat 0.42 units high).
 */
export interface PlazaSpots {
  groups: { x: number; z: number }[];
}

export function plazaSpots(): PlazaSpots {
  const out: PlazaSpots = { groups: [] };
  const plan = planPlazas();
  // Keep 0.5 clear of every bed, bench and post, of the fountain basin and of the flagpoles.
  const boxes = plan.parts
    .filter(p => Math.max(p.sx, p.sz) < 6)
    .map(p => ({
      minX: p.x - p.sx / 2 - 0.5,
      maxX: p.x + p.sx / 2 + 0.5,
      minZ: p.z - p.sz / 2 - 0.5,
      maxZ: p.z + p.sz / 2 + 0.5,
    }));
  const clear = (x: number, z: number) =>
    boxes.every(b => x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) &&
    plan.fountains.every(f => Math.hypot(x - f.x, z - f.z) > f.r + 0.7) &&
    plan.flags.every(f => Math.hypot(x - f.x, z - f.z) > 0.8);
  for (const p of PLAZAS) {
    if (p.kind !== 'plaza') continue;
    // Open paving inside the plaza square, on a loose grid, every other free spot (groups need room around them).
    let k = 0;
    for (let dz = -6.6; dz <= 6.6; dz += 1.2)
      for (let dx = -6.6; dx <= 6.6; dx += 1.2) {
        const x = p.x + dx + (Math.round(dz / 1.2) % 2) * 0.6;
        const z = p.z + dz;
        if (!clear(x, z)) continue;
        if (k++ % 3 === 0) out.groups.push({ x, z });
      }
  }
  return out;
}
