import type { Part } from '../buildings/parts.ts';
import { CURB_H, PLAZAS, rng } from './grid.ts';

/** Fountain basins and flagpoles placed by `planPlazas`, for the animated parts (water, jets, flags). */
export interface PlazaPlan {
  parts: Part[];
  trees: [number, number, number, number][];
  fountains: { x: number; z: number; r: number }[];
  flags: { x: number; z: number; h: number; color: string }[];
}

function bench(parts: Part[], x: number, z: number, ry: number) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const [sx, sz] = at(0, 0);
  parts.push({ shape: 'box', mat: 'wood', x: sx, y: CURB_H + 0.42, z: sz, sx: 1.5, sy: 0.07, sz: 0.42, ry });
  const [bx, bz] = at(0, -0.2);
  parts.push({ shape: 'box', mat: 'wood', x: bx, y: CURB_H + 0.68, z: bz, sx: 1.5, sy: 0.32, sz: 0.06, ry });
  for (const lx of [-0.62, 0.62]) {
    const [lx2, lz2] = at(lx, 0);
    parts.push({ shape: 'box', mat: 'iron', x: lx2, y: CURB_H + 0.21, z: lz2, sx: 0.06, sy: 0.42, sz: 0.4, ry });
  }
}

/**
 * The plaza south of the Training Center (fountain, lawns, benches, flags) and two pocket parks with lawns, paths,
 * trees and benches.
 */
export function planPlazas(): PlazaPlan {
  const plan: PlazaPlan = { parts: [], trees: [], fountains: [], flags: [] };
  const r = rng(77);
  for (const p of PLAZAS) {
    if (p.kind === 'plaza') {
      // Granite field with four planted beds around a fountain.
      for (const [dx, dz] of [
        [-4.6, -4.6],
        [4.6, -4.6],
        [-4.6, 4.6],
        [4.6, 4.6],
      ] as const) {
        plan.parts.push({
          shape: 'box',
          mat: 'granite',
          x: p.x + dx,
          y: CURB_H + 0.2,
          z: p.z + dz,
          sx: 4.4,
          sy: 0.4,
          sz: 4.4,
        });
        plan.parts.push({
          shape: 'box',
          mat: 'lawn',
          x: p.x + dx,
          y: CURB_H + 0.41,
          z: p.z + dz,
          sx: 4.0,
          sy: 0.04,
          sz: 4.0,
        });
        plan.trees.push([p.x + dx, CURB_H + 0.42, p.z + dz, 1.15 + r() * 0.2]);
      }
      plan.fountains.push({ x: p.x, z: p.z, r: 2.3 });
      for (const [dx, dz, ry] of [
        [0, -3.6, 0],
        [0, 3.6, Math.PI],
        [-3.6, 0, Math.PI / 2],
        [3.6, 0, -Math.PI / 2],
      ] as const)
        bench(plan.parts, p.x + dx, p.z + dz, ry);
      plan.flags.push(
        { x: p.x - 1.4, z: p.z - 6.4, h: 6.5, color: '#0f1b2d' },
        { x: p.x, z: p.z - 6.4, h: 7.2, color: '#f5b335' },
        { x: p.x + 1.4, z: p.z - 6.4, h: 6.5, color: '#1f8a8a' },
      );
    } else {
      // Pocket park: lawn with a cross of paths, trees and benches.
      for (const [dx, dz] of [
        [-3.6, -3.6],
        [3.6, -3.6],
        [-3.6, 3.6],
        [3.6, 3.6],
      ] as const) {
        plan.parts.push({
          shape: 'box',
          mat: 'lawn',
          x: p.x + dx,
          y: CURB_H + 0.04,
          z: p.z + dz,
          sx: 5.6,
          sy: 0.08,
          sz: 5.6,
        });
        for (let i = 0; i < 2; i++)
          plan.trees.push([
            p.x + dx + (r() - 0.5) * 3.2,
            CURB_H + 0.08,
            p.z + dz + (r() - 0.5) * 3.2,
            1.0 + r() * 0.35,
          ]);
      }
      bench(plan.parts, p.x + 2.2, p.z - 1.0, 0);
      bench(plan.parts, p.x - 2.2, p.z + 1.0, Math.PI);
      bench(plan.parts, p.x - 1.0, p.z - 2.2, -Math.PI / 2);
    }
  }
  return plan;
}
