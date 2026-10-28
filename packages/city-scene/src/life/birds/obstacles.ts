import { designAll } from '../../buildings/designs.ts';
import type { CityLayout } from '../../types.ts';
import type { BirdWorld, Obstacle, Roof } from './boids.ts';

/**
 * The birds' view of the buildings, from A1's building designs (read-only): every mass and every sizeable part
 * (crowns, spires, tanks, signs) becomes a box to avoid, and each building's highest main roof offers landing spots
 * along its edges that are clear of rooftop parts.
 */
export function birdWorld(layout: CityLayout): BirdWorld {
  const obstacles: Obstacle[] = [];
  const roofs: Roof[] = [];
  let skyline = 0;
  for (const { design } of designAll(layout)) {
    const parts: Obstacle[] = [];
    for (const m of design.masses) {
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
    for (const p of design.parts) {
      if (Math.max(p.sx, p.sy, p.sz) < 0.6) continue;
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
    const top = design.masses.reduce((a, m) => (m.y1 > a.y1 ? m : a), design.masses[0]!);
    const spots: Roof['spots'] = [];
    const sides: [number, number][] = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ];
    for (const [nx, nz] of sides)
      for (let k = -6; k <= 6; k++) {
        const x = top.x + nx * (top.w / 2 - 0.2) + (nz !== 0 ? k * 0.36 : 0);
        const z = top.z + nz * (top.d / 2 - 0.2) + (nx !== 0 ? k * 0.36 : 0);
        if (Math.abs(x - top.x) > top.w / 2 - 0.15 || Math.abs(z - top.z) > top.d / 2 - 0.15) continue;
        const y = top.y1;
        const blocked = [...parts, ...obstacles].some(
          o =>
            x > o.minX - 0.2 &&
            x < o.maxX + 0.2 &&
            z > o.minZ - 0.2 &&
            z < o.maxZ + 0.2 &&
            y + 0.05 > o.minY &&
            y < o.maxY - 0.01,
        );
        if (!blocked) spots.push({ x, y, z, yaw: Math.atan2(-nz, nx) });
      }
    if (spots.length >= 4) roofs.push({ x: top.x, z: top.z, y: top.y1, spots });
  }
  return { obstacles, roofs, skyline };
}
