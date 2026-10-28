import type { Part } from '../buildings/parts.ts';
import { CURB_H, type District, ROAD_HALF, rng } from './grid.ts';

/** Distance of the outer avenue from the parkway centre line. */
const ROAD_OUT = ROAD_HALF + 2.2;

/** Animated pieces and static parts of the plaza, parks and waterfront. */
export interface LandscapePlan {
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
  parts.push({ shape: 'box', mat: 'wood', x: sx, y: CURB_H + 0.42, z: sz, sx: 1.6, sy: 0.07, sz: 0.44, ry });
  const [bx, bz] = at(0, -0.21);
  parts.push({ shape: 'box', mat: 'wood', x: bx, y: CURB_H + 0.68, z: bz, sx: 1.6, sy: 0.3, sz: 0.06, ry });
  for (const lx of [-0.66, 0.66]) {
    const [lx2, lz2] = at(lx, 0);
    parts.push({ shape: 'box', mat: 'iron', x: lx2, y: CURB_H + 0.21, z: lz2, sx: 0.06, sy: 0.42, sz: 0.42, ry });
  }
}

/** A raised planting bed with a granite rim and a tree. */
function bed(plan: LandscapePlan, x: number, z: number, w: number, d: number, tree = true) {
  plan.parts.push({ shape: 'box', mat: 'granite', x, y: CURB_H + 0.22, z, sx: w, sy: 0.44, sz: d });
  plan.parts.push({ shape: 'box', mat: 'lawn', x, y: CURB_H + 0.45, z, sx: w - 0.36, sy: 0.04, sz: d - 0.36 });
  if (tree) plan.trees.push([x, CURB_H + 0.46, z, 1.2]);
}

/**
 * The central plaza (fountain, planted beds, benches, flags), benches and lawns in the parks, and the waterfront
 * promenade with its stone embankment and railing.
 */
export function planLandscape(d: District): LandscapePlan {
  const plan: LandscapePlan = { parts: [], trees: [], fountains: [], flags: [] };
  const r = rng(77);
  for (const c of d.cells) {
    if (c.kind === 'plaza') {
      const x = c.cx;
      const z = c.cz;
      plan.fountains.push({ x, z: z - 2, r: 2.6 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bed(plan, x + sx * 4.6, z - 2 + sz * 5.2, 3.2, 4.2);
      for (const [dx, dz, ry] of [
        [0, -6.2, 0],
        [0, 2.2, Math.PI],
        [-4.0, -2, Math.PI / 2],
        [4.0, -2, -Math.PI / 2],
      ] as const)
        bench(plan.parts, x + dx, z + dz, ry);
      // Flags at the plaza's head, facing the Training Center.
      for (const [dx, h, color] of [
        [-1.6, 6.8, '#0f1b2d'],
        [0, 7.6, '#f5b335'],
        [1.6, 6.8, '#1f8a8a'],
      ] as const)
        plan.flags.push({ x: x + dx, z: c.z0 + 4.8, h, color });
      // A row of trees along the plaza's south edge.
      for (let i = -3; i <= 3; i++) plan.trees.push([x + i * 2.1, CURB_H, c.z1 - 4.6, 1.1 + r() * 0.2]);
    } else if (c.kind === 'park') {
      // Benches along the inner walk.
      const n = Math.max(1, Math.round((c.x1 - c.x0) / 8));
      for (let i = 0; i < n; i++) bench(plan.parts, c.x0 + ((i + 0.5) * (c.x1 - c.x0)) / n, c.z0 + 4.9, 0);
    }
  }
  // Waterfront: an embankment wall and a railed promenade along the north and west shores.
  const R = d.ring;
  const wz = d.waterZ;
  const wx = d.waterX;
  const far = 420;
  // North shore (along x), from the west water edge to far east.
  plan.parts.push({
    shape: 'box',
    mat: 'stone',
    x: (wx + far) / 2,
    y: -0.25,
    z: wz + 0.3,
    sx: far - wx,
    sy: 1.0,
    sz: 0.6,
  });
  plan.parts.push({
    shape: 'box',
    mat: 'paving',
    x: (wx + far) / 2,
    y: CURB_H / 2 - 0.02,
    z: wz + 2.6,
    sx: far - wx,
    sy: CURB_H,
    sz: 4.6,
  });
  // West shore (along z).
  plan.parts.push({
    shape: 'box',
    mat: 'stone',
    x: wx + 0.3,
    y: -0.25,
    z: (wz + far) / 2,
    sx: 0.6,
    sy: 1.0,
    sz: far - wz,
  });
  plan.parts.push({
    shape: 'box',
    mat: 'paving',
    x: wx + 2.6,
    y: CURB_H / 2 - 0.02,
    z: (wz + far) / 2,
    sx: 4.6,
    sy: CURB_H,
    sz: far - wz,
  });
  // Railing: posts and a top rail, near the district only (far stretches are lost in the haze anyway).
  const reach = R + 90;
  for (let s = wx; s <= reach; s += 2)
    plan.parts.push({ shape: 'box', mat: 'iron', x: s, y: CURB_H + 0.5, z: wz + 0.45, sx: 0.06, sy: 1.0, sz: 0.06 });
  for (let s = wz; s <= reach; s += 2)
    plan.parts.push({ shape: 'box', mat: 'iron', x: wx + 0.45, y: CURB_H + 0.5, z: s, sx: 0.06, sy: 1.0, sz: 0.06 });
  plan.parts.push({
    shape: 'box',
    mat: 'iron',
    x: (wx + reach) / 2,
    y: CURB_H + 1.0,
    z: wz + 0.45,
    sx: reach - wx,
    sy: 0.06,
    sz: 0.08,
  });
  plan.parts.push({
    shape: 'box',
    mat: 'iron',
    x: wx + 0.45,
    y: CURB_H + 1.0,
    z: (wz + reach) / 2,
    sx: 0.08,
    sy: 0.06,
    sz: reach - wz,
  });
  // Promenade trees and benches.
  for (let s = wx + 8; s <= reach; s += 9) {
    plan.trees.push([s, CURB_H, wz + 5.6, 1.1 + r() * 0.3]);
    bench(plan.parts, s + 4.5, wz + 2.0, Math.PI);
  }
  for (let s = wz + 8; s <= reach; s += 9) {
    plan.trees.push([wx + 5.6, CURB_H, s, 1.1 + r() * 0.3]);
    bench(plan.parts, wx + 2.0, s + 4.5, -Math.PI / 2);
  }
  // An avenue of trees along the outer side of the parkway (south and east).
  for (let s = -R; s <= R + 10; s += 4.5) {
    plan.trees.push([s, 0, R + ROAD_OUT, 1.25 + r() * 0.3]);
    plan.trees.push([R + ROAD_OUT, 0, s, 1.25 + r() * 0.3]);
  }
  // Parkland groves south and east: clusters of trees of varied size, thinning with distance.
  const groves: [number, number, number][] = [];
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 0.5;
    const dist = R + 16 + r() * 90;
    groves.push([Math.cos(a) * dist + 10, Math.sin(a) * dist + 10, 5 + r() * 7]);
  }
  for (const [gx, gz, gr] of groves) {
    if (Math.abs(gx) < R + 10 && Math.abs(gz) < R + 10) continue;
    const n = Math.round(gr * 1.4);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d2 = Math.sqrt(r()) * gr;
      plan.trees.push([gx + Math.cos(a) * d2, 0, gz + Math.sin(a) * d2, 1.2 + r() * 1.0]);
    }
  }
  return plan;
}
