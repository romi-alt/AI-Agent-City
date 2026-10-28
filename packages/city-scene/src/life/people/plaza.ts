import type { CityLayout } from '../../types.ts';
import { districtPlan } from '../../streets/grid.ts';
import { planLandscape } from '../../streets/plazas.ts';

/**
 * Where people gather in A1's plaza (read-only: \`districtPlan()\` and \`planLandscape()\` from streets/): small standing
 * groups on the open paving, kept clear of A1's beds, benches, fountain, ponds and flagpoles.
 */
export interface PlazaSpots {
  groups: { x: number; z: number }[];
}

export function plazaSpots(layout: CityLayout): PlazaSpots {
  const out: PlazaSpots = { groups: [] };
  const district = districtPlan(layout.streets);
  const plan = planLandscape(district);
  // Keep 0.5 clear of every bed, bench and post, of fountains and ponds and of the flagpoles.
  const boxes = plan.parts
    .filter(p => Math.max(p.sx, p.sz) < 8)
    .map(p => {
      const r = p.ry ? Math.hypot(p.sx, p.sz) / 2 : 0;
      const hx = (r || p.sx / 2) + 0.5;
      const hz = (r || p.sz / 2) + 0.5;
      return { minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz };
    });
  const round = [...plan.fountains, ...plan.ponds];
  const clear = (x: number, z: number) =>
    boxes.every(b => x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) &&
    round.every(f => Math.hypot(x - f.x, z - f.z) > f.r + 0.7) &&
    plan.flags.every(f => Math.hypot(x - f.x, z - f.z) > 0.8);
  for (const c of district.cells) {
    if (c.kind !== 'plaza') continue;
    // Free spots on the open paving inside the plaza (1 unit in from the kerb), then spread out: each next group goes
    // where it is farthest from the groups already placed, so they scatter instead of lining up.
    const free: { x: number; z: number }[] = [];
    for (let z = c.z0 + 1.2; z <= c.z1 - 1.2; z += 0.8)
      for (let x = c.x0 + 1.2; x <= c.x1 - 1.2; x += 0.8) if (clear(x, z)) free.push({ x, z });
    const chosen: { x: number; z: number }[] = [];
    while (free.length && chosen.length < 14) {
      let best = 0;
      let bestD = -Infinity;
      free.forEach((f, i) => {
        const d = chosen.length
          ? Math.min(...chosen.map(o => Math.hypot(o.x - f.x, o.z - f.z)))
          : -Math.hypot(f.x - c.cx, f.z - c.cz);
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
