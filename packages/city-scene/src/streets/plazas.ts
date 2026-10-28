import type { Part } from '../buildings/parts.ts';
import { CURB_H, type District, ROAD_HALF, rng } from './grid.ts';

/** Distance of the outer avenue from the parkway centre line. */
const ROAD_OUT = ROAD_HALF + 2.2;

/** Animated pieces and static parts of the plaza, parks and waterfront. */
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

/** A small glass café pavilion with a timber roof overhang, and umbrella tables on a paved terrace. */
function cafe(plan: LandscapePlan, x: number, z: number) {
  const P = plan.parts;
  P.push({ shape: 'box', mat: 'paving', x, y: CURB_H + 0.03, z, sx: 8, sy: 0.06, sz: 7 });
  P.push({ shape: 'box', mat: 'kioskGlass', x: x - 2, y: CURB_H + 0.6, z: z - 1.8, sx: 3, sy: 1.1, sz: 2.2 });
  P.push({ shape: 'box', mat: 'wood', x: x - 2, y: CURB_H + 1.22, z: z - 1.8, sx: 3.8, sy: 0.14, sz: 3.0 });
  for (const [dx, dz] of [
    [-1.4, -0.9],
    [1.4, -0.9],
    [-1.4, -2.7],
    [1.4, -2.7],
  ] as const)
    P.push({
      shape: 'box',
      mat: 'iron',
      x: x - 2 + dx * 0.95,
      y: CURB_H + 0.6,
      z: z - 1.8 + dz + 1.8,
      sx: 0.05,
      sy: 1.1,
      sz: 0.05,
    });
  const umbrellas = ['#f6f1e9', '#1f8a8a', '#f6f1e9', '#e2b04a', '#f6f1e9', '#1f8a8a'];
  for (let i = 0; i < 6; i++) {
    const ux = x - 2.5 + (i % 3) * 2.5;
    const uz = z + 1.0 + Math.floor(i / 3) * 2.2;
    P.push({ shape: 'cyl', mat: 'iron', x: ux, y: CURB_H + 0.55, z: uz, sx: 0.04, sy: 1.1, sz: 0.04 });
    P.push({
      shape: 'cone',
      mat: 'canvas',
      x: ux,
      y: CURB_H + 1.18,
      z: uz,
      sx: 1.7,
      sy: 0.32,
      sz: 1.7,
      color: umbrellas[i]!,
    });
    P.push({ shape: 'cyl', mat: 'wood', x: ux, y: CURB_H + 0.24, z: uz, sx: 0.55, sy: 0.04, sz: 0.55 });
    for (const a of [0, Math.PI])
      P.push({
        shape: 'box',
        mat: 'iron',
        x: ux + Math.cos(a) * 0.45,
        y: CURB_H + 0.15,
        z: uz,
        sx: 0.22,
        sy: 0.3,
        sz: 0.22,
      });
  }
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

/** A tennis court: blue surface, green surround, white lines, a net and fence posts. */
function court(plan: LandscapePlan, x: number, z: number) {
  const P = plan.parts;
  P.push({ shape: 'box', mat: 'rubber', x, y: CURB_H + 0.03, z, sx: 8.6, sy: 0.06, sz: 13, color: '#3f7f5f' });
  P.push({ shape: 'box', mat: 'rubber', x, y: CURB_H + 0.04, z, sx: 6.2, sy: 0.06, sz: 10.4, color: '#2f6fa8' });
  const line = (lx: number, lz: number, sx: number, sz: number) =>
    P.push({ shape: 'box', mat: 'line', x: x + lx, y: CURB_H + 0.075, z: z + lz, sx, sy: 0.01, sz });
  line(0, 5.2, 6.2, 0.06);
  line(0, -5.2, 6.2, 0.06);
  line(3.1, 0, 0.06, 10.4);
  line(-3.1, 0, 0.06, 10.4);
  line(2.4, 0, 0.05, 10.4);
  line(-2.4, 0, 0.05, 10.4);
  line(0, 2.9, 4.8, 0.05);
  line(0, -2.9, 4.8, 0.05);
  line(0, 0, 0.05, 5.8);
  P.push({ shape: 'box', mat: 'net', x, y: CURB_H + 0.3, z, sx: 6.8, sy: 0.4, sz: 0.03 });
  for (let i = -2; i <= 2; i++)
    for (const sz of [-6.4, 6.4])
      P.push({ shape: 'box', mat: 'iron', x: x + i * 2.1, y: CURB_H + 0.9, z: z + sz, sx: 0.05, sy: 1.8, sz: 0.05 });
}

/**
 * The central plaza (fountain, planted beds, benches, flags), benches and lawns in the parks, and the waterfront
 * promenade with its stone embankment and railing.
 */
export function planLandscape(d: District): LandscapePlan {
  const plan: LandscapePlan = { parts: [], trees: [], fountains: [], ponds: [], flags: [] };
  let parkIndex = 0;
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
      // Every park block has a purpose; benches line the inner walk.
      const feature = parkIndex++ % 5;
      const fz = c.cz + (c.cz > 0 ? 2.5 : -2.5);
      if (feature === 0) cafe(plan, c.cx, fz);
      else if (feature === 1) playground(plan, c.cx, fz);
      else if (feature === 2) pond(plan, c.cx, fz);
      else if (feature === 3) court(plan, c.cx, c.cz);
      else bed(plan, c.cx, fz, 5, 4, true, parkIndex);
      if (feature !== 3) {
        const n = Math.max(1, Math.round((c.x1 - c.x0) / 8));
        const bz = c.cz > 0 ? c.z0 + 4.9 : c.z1 - 4.9;
        for (let i = 0; i < n; i++)
          bench(plan.parts, c.x0 + ((i + 0.5) * (c.x1 - c.x0)) / n, bz, c.cz > 0 ? 0 : Math.PI);
      }
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
