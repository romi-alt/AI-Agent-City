import { designAll } from '../../buildings/designs.ts';
import type { CityLayout } from '../../types.ts';
import type { BirdWorld, Obstacle, Roof } from './boids.ts';

/**
 * The birds' view of the buildings, from A1's building designs (read-only): every outline box and every sizeable part
 * (crowns, spires, tanks, signs) becomes a box to avoid, and each building's highest main roof offers landing spots
 * along its edges that are clear of rooftop parts.
 */
export function birdWorld(layout: CityLayout): BirdWorld {
  const obstacles: Obstacle[] = [];
  const roofs: Roof[] = [];
  let skyline = 0;
  for (const { design } of designAll(layout)) {
    const parts: Obstacle[] = [];
    for (const m of design.outline) {
      obstacles.push({
        minX: m.x - m.w / 2,
        maxX: m.x + m.w / 2,
        minY: 0,
        maxY: m.y1,
        minZ: m.z - m.d / 2,
        maxZ: m.z + m.d / 2,
      });
      skyline = Math.max(skyline, m.y1);
    }
    const shell = design.outline.map(m => ({
      minX: m.x - m.w / 2,
      maxX: m.x + m.w / 2,
      maxY: m.y1,
      minZ: m.z - m.d / 2,
      maxZ: m.z + m.d / 2,
    }));
    for (const p of design.parts) {
      if (Math.max(p.sx, p.sy, p.sz) < 0.6) continue;
      // Facade detail inside (or flush with) the building's outline adds nothing: skip it.
      const q = 0.4;
      const inShell = shell.some(
        o =>
          p.x - p.sx / 2 >= o.minX - q &&
          p.x + p.sx / 2 <= o.maxX + q &&
          p.z - p.sz / 2 >= o.minZ - q &&
          p.z + p.sz / 2 <= o.maxZ + q &&
          p.y + p.sy / 2 <= o.maxY + 0.05,
      );
      // Street-level parts (canopies, planters, signs on the ground floor) are below where birds fly.
      if (inShell || p.y + p.sy / 2 < 3) continue;
      // Rotated parts: use the bounding square of their footprint.
      const r = p.ry ? Math.hypot(p.sx, p.sz) / 2 : 0;
      const hx = r || p.sx / 2;
      const hz = r || p.sz / 2;
      parts.push({
        minX: p.x - hx,
        maxX: p.x + hx,
        minY: p.y - p.sy / 2,
        maxY: p.y + p.sy / 2,
        minZ: p.z - hz,
        maxZ: p.z + hz,
      });
    }
    obstacles.push(...parts);
    // Landing spots along the edges of the highest roof (or setback terrace) that has room to stand: on the slab or
    // on a parapet, and never under anything (crowns, pitched roofs, signs).
    const sides: [number, number][] = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ];
    const all = [...parts, ...obstacles];
    for (const top of [...design.outline].sort((p, q) => q.y1 - p.y1)) {
      const spots: Roof['spots'] = [];
      for (const [nx, nz] of sides)
        for (let k = -6; k <= 6; k++) {
          const x = top.x + nx * (top.w / 2 - 0.1) + (nz !== 0 ? k * 0.36 : 0);
          const z = top.z + nz * (top.d / 2 - 0.1) + (nx !== 0 ? k * 0.36 : 0);
          if (Math.abs(x - top.x) > top.w / 2 - 0.05 || Math.abs(z - top.z) > top.d / 2 - 0.05) continue;
          const here = all.filter(o => x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ);
          const y = here.reduce((m, o) => (o.maxY <= top.y1 + 1.2 ? Math.max(m, o.maxY) : m), top.y1);
          const blocked = all.some(
            o =>
              x > o.minX - 0.06 &&
              x < o.maxX + 0.06 &&
              z > o.minZ - 0.06 &&
              z < o.maxZ + 0.06 &&
              y + 0.3 > o.minY &&
              y < o.maxY - 0.01,
          );
          if (!blocked) spots.push({ x, y, z, yaw: Math.atan2(-nz, nx) });
        }
      if (spots.length >= 4) {
        roofs.push({ x: top.x, z: top.z, y: Math.max(...spots.map(p => p.y)), spots });
        break;
      }
    }
  }
  return { obstacles, roofs, skyline };
}
