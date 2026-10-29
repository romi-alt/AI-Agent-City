import type { Part } from '../buildings/parts.ts';
import { RESERVOIR } from '../world/park.ts';
import { CURB_H, type District, rng } from './grid.ts';

/** Animated pieces and static parts of the fountain plaza and the small park. */
export interface LandscapePlan {
  parts: Part[];
  trees: [number, number, number, number][];
  fountains: { x: number; z: number; r: number }[];
  ponds: { x: number; z: number; r: number }[];
  flags: { x: number; z: number; h: number; color: string }[];
}

/** Park bench at real-world size: 1.8 m long, seat 0.45 m high (0.4 world units per metre, as the characters). */
const M = 0.4;
function bench(parts: Part[], x: number, z: number, ry: number) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const [sx, sz] = at(0, 0);
  parts.push({
    shape: 'box',
    mat: 'wood',
    x: sx,
    y: CURB_H + 0.45 * M,
    z: sz,
    sx: 1.8 * M,
    sy: 0.05 * M,
    sz: 0.45 * M,
    ry,
  });
  const [bx, bz] = at(0, -0.21 * M);
  parts.push({
    shape: 'box',
    mat: 'wood',
    x: bx,
    y: CURB_H + 0.68 * M,
    z: bz,
    sx: 1.8 * M,
    sy: 0.35 * M,
    sz: 0.05 * M,
    ry,
  });
  for (const lx of [-0.75 * M, 0.75 * M]) {
    const [lx2, lz2] = at(lx, 0);
    parts.push({
      shape: 'box',
      mat: 'iron',
      x: lx2,
      y: CURB_H + 0.225 * M,
      z: lz2,
      sx: 0.05 * M,
      sy: 0.45 * M,
      sz: 0.45 * M,
      ry,
    });
  }
}

/** A raised planting bed with a granite rim and a tree. */
const FLOWERS = ['#e8556d', '#f2c14e', '#f6f1e9', '#b56ad8', '#ff8a5c'];

/** A raised bed: granite kerb with a coping, a clipped hedge border, shrubs, flowers and a tree. */
function bed(plan: LandscapePlan, x: number, z: number, w: number, d: number, tree = true, seed = 1) {
  const r = rng(seed);
  const P = plan.parts;
  P.push({ shape: 'box', mat: 'granite', x, y: CURB_H + 0.2, z, sx: w, sy: 0.4, sz: d });
  P.push({ shape: 'box', mat: 'coping', x, y: CURB_H + 0.42, z, sx: w + 0.08, sy: 0.05, sz: d + 0.08 });
  P.push({ shape: 'box', mat: 'soil', x, y: CURB_H + 0.43, z, sx: w - 0.3, sy: 0.04, sz: d - 0.3 });
  // Hedge border.
  const hw = w / 2 - 0.32;
  const hd = d / 2 - 0.32;
  for (const [hx, hz, sx, sz] of [
    [x, z + hd, w - 0.5, 0.36],
    [x, z - hd, w - 0.5, 0.36],
    [x + hw, z, 0.36, d - 1.2],
    [x - hw, z, 0.36, d - 1.2],
  ] as const)
    P.push({ shape: 'box', mat: 'hedge', x: hx, y: CURB_H + 0.62, z: hz, sx, sy: 0.38, sz });
  // Shrubs and flowers inside.
  for (let i = 0; i < 6; i++) {
    const sx = x + (r() - 0.5) * (w - 1.4);
    const sz = z + (r() - 0.5) * (d - 1.4);
    if (tree && Math.hypot(sx - x, sz - z) < 0.6) continue;
    const k = 0.35 + r() * 0.3;
    P.push({
      shape: 'sphere',
      mat: 'shrub',
      x: sx,
      y: CURB_H + 0.45 + k * 0.35,
      z: sz,
      sx: k,
      sy: k * 0.75,
      sz: k,
      color: r() < 0.5 ? '#3f7a39' : '#4f8a3f',
    });
  }
  for (let i = 0; i < 14; i++) {
    const fx = x + (r() - 0.5) * (w - 1.0);
    const fz = z + (r() - 0.5) * (d - 1.0);
    P.push({
      shape: 'sphere',
      mat: 'flower',
      x: fx,
      y: CURB_H + 0.52,
      z: fz,
      sx: 0.16,
      sy: 0.12,
      sz: 0.16,
      color: FLOWERS[Math.floor(r() * FLOWERS.length)]!,
    });
  }
  if (tree) plan.trees.push([x, CURB_H + 0.45, z, 1.2]);
}

/** Playground: safety surface, a climbing frame with a slide, swings and a sandpit. */
function playground(plan: LandscapePlan, x: number, z: number) {
  const P = plan.parts;
  P.push({ shape: 'box', mat: 'rubber', x, y: CURB_H + 0.03, z, sx: 8, sy: 0.06, sz: 6.5, color: '#3f8f88' });
  P.push({
    shape: 'box',
    mat: 'rubber',
    x: x + 2.2,
    y: CURB_H + 0.04,
    z: z + 1.6,
    sx: 2.6,
    sy: 0.06,
    sz: 2.2,
    color: '#d9c38f',
  });
  // Climbing tower with a roof and a slide.
  for (const [dx, dz] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ] as const)
    P.push({
      shape: 'box',
      mat: 'paint',
      x: x - 1.8 + dx,
      y: CURB_H + 0.6,
      z: z - 1 + dz,
      sx: 0.08,
      sy: 1.2,
      sz: 0.08,
      color: '#e2b04a',
    });
  P.push({ shape: 'box', mat: 'wood', x: x - 1.8, y: CURB_H + 0.62, z: z - 1, sx: 1.1, sy: 0.08, sz: 1.1 });
  P.push({
    shape: 'pyramid',
    mat: 'paint',
    x: x - 1.8,
    y: CURB_H + 1.45,
    z: z - 1,
    sx: 1.3,
    sy: 0.5,
    sz: 1.3,
    color: '#e8556d',
  });
  P.push({
    shape: 'box',
    mat: 'paint',
    x: x - 1.8 + 1.1,
    y: CURB_H + 0.35,
    z: z - 1,
    sx: 1.6,
    sy: 0.06,
    sz: 0.5,
    rz: -0.38,
    color: '#3f7fd1',
  });
  // Swings.
  for (const dx of [-0.9, 0.9])
    P.push({ shape: 'box', mat: 'iron', x: x + 1.8 + dx, y: CURB_H + 0.7, z: z - 1.6, sx: 0.06, sy: 1.4, sz: 0.06 });
  P.push({ shape: 'box', mat: 'iron', x: x + 1.8, y: CURB_H + 1.4, z: z - 1.6, sx: 1.9, sy: 0.06, sz: 0.06 });
  for (const dx of [-0.4, 0.4])
    P.push({
      shape: 'box',
      mat: 'paint',
      x: x + 1.8 + dx,
      y: CURB_H + 0.35,
      z: z - 1.6,
      sx: 0.35,
      sy: 0.04,
      sz: 0.15,
      color: '#e8556d',
    });
}

/** A pond with a timber boardwalk and reeds. */
function pond(plan: LandscapePlan, x: number, z: number) {
  plan.ponds.push({ x, z, r: 3.4 });
  const P = plan.parts;
  P.push({ shape: 'cyl', mat: 'granite', x, y: CURB_H + 0.04, z, sx: 7.4, sy: 0.08, sz: 7.4 });
  P.push({ shape: 'box', mat: 'wood', x: x + 2.4, y: CURB_H + 0.12, z, sx: 4.2, sy: 0.08, sz: 1.0 });
  const r = rng(Math.round(x * 13 + z));
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = 3.0 + r() * 0.5;
    if (Math.cos(a) > 0.75) continue;
    P.push({
      shape: 'cone',
      mat: 'hedge',
      x: x + Math.cos(a) * d,
      y: CURB_H + 0.35,
      z: z + Math.sin(a) * d,
      sx: 0.18,
      sy: 0.7,
      sz: 0.18,
    });
  }
}

/**
 * The fountain plaza (fountain, planted beds, benches, flags) and the one small park (playground, pond, benches).
 */
export function planLandscape(d: District, treesPerParkBlock = 9): LandscapePlan {
  const plan: LandscapePlan = { parts: [], trees: [], fountains: [], ponds: [], flags: [] };
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
      const inside = c.cx > d.bounds.minX && c.cx < d.bounds.maxX && c.cz > d.bounds.minZ && c.cz < d.bounds.maxZ;
      if (inside) {
        // The pocket park along the west side: trees and benches, with the playground and pond at its near end.
        if (c.cz > d.bounds.maxZ - 30) {
          playground(plan, c.cx - 2.5, c.cz - 2.5);
          pond(plan, c.cx + 1.5, c.cz + 3.5);
        }
        for (let k = 0; k < 7; k++)
          plan.trees.push([
            c.x0 + 3 + r() * (c.x1 - c.x0 - 6),
            CURB_H,
            c.z0 + 3 + r() * (c.z1 - c.z0 - 6),
            1 + r() * 0.5,
          ]);
        const n = Math.max(1, Math.round((c.x1 - c.x0) / 8));
        for (let i = 0; i < n; i++) bench(plan.parts, c.x0 + ((i + 0.5) * (c.x1 - c.x0)) / n, c.z0 + 4.9, 0);
      } else {
        // The big park: tree clusters on the lawns; the reservoir is drawn as one large pond.
        const n = treesPerParkBlock;
        for (let k = 0; k < n; k++) {
          const x = c.x0 + 3 + r() * (c.x1 - c.x0 - 6);
          const z = c.z0 + 3 + r() * (c.z1 - c.z0 - 6);
          if (Math.hypot(x - RESERVOIR.x, z - RESERVOIR.z) < RESERVOIR.r + 2) continue;
          plan.trees.push([x, CURB_H, z, 1.1 + r() * 0.7]);
        }
      }
    }
  }
  plan.ponds.push({ x: RESERVOIR.x, z: RESERVOIR.z, r: RESERVOIR.r });
  return plan;
}
