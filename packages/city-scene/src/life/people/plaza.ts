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
    // Free spots on the open paving inside the plaza square, then spread out: each next group goes where it is
    // farthest from the groups already placed (so they scatter over the plaza instead of lining up).
    const free: { x: number; z: number }[] = [];
    for (let dz = -6.4; dz <= 6.4; dz += 0.8)
      for (let dx = -6.4; dx <= 6.4; dx += 0.8) if (clear(p.x + dx, p.z + dz)) free.push({ x: p.x + dx, z: p.z + dz });
    const chosen: { x: number; z: number }[] = [];
    while (free.length && chosen.length < 12) {
      let best = 0;
      let bestD = -1;
      free.forEach((f, i) => {
        const d = chosen.length
          ? Math.min(...chosen.map(c => Math.hypot(c.x - f.x, c.z - f.z)))
          : -Math.hypot(f.x - p.x, f.z - p.z - 4);
        if (d > bestD) {
          bestD = d;
          best = i;
        }
      });
      if (chosen.length && bestD < 1.6) break;
      chosen.push(free.splice(best, 1)[0]!);
    }
    out.groups.push(...chosen);
  }
  return out;
}
