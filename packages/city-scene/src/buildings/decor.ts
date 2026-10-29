import { CURB_H, rng } from '../streets/grid.ts';
import { FLOOR_HEIGHT } from '../types.ts';
import type { Part } from './parts.ts';

/**
 * The district's own decor buildings (X04): legacy-style pastel walk-ups and mid-rises filling the empty blocks
 * between the client towers, in continuous street walls. Each has a white window grid (drawn by the decor facade
 * shader), a shopfront with a coloured awning, a cornice and a roof item (water tank, AC units, rooftop garden or
 * antenna). Pure and seeded; rendered instanced.
 */

/** Manhattan fabric: pre-war brick, limestone and brownstone (no pastels). */
export const PASTELS = ['#8c4b39', '#7d4435', '#9a5a42', '#cfc7b4', '#bdb49f', '#a99f8a', '#6e4a3c', '#b0a792'];
const AWNINGS = ['#1f3b2d', '#5a1f1f', '#1d2f4d', '#2b2b2b', '#6b5a2e', '#7a2e2e', '#2d4a5a'];
/** Sidewalk in front of the street walls (curb to facade). */
export const FRONT_SETBACK = 1.9;

export interface DecorBox {
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  color: string;
  seed: number;
}

export interface DecorPlan {
  boxes: DecorBox[];
  parts: Part[];
}

export interface DecorCell {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Fills a block with two back-to-back rows of narrow buildings, edge to edge along the streets. */
export function planDecor(cells: DecorCell[], seed = 4242, floors: [number, number] = [5, 11]): DecorPlan {
  const r = rng(seed);
  const plan: DecorPlan = { boxes: [], parts: [] };
  for (const c of cells) {
    const x0 = c.x0 + FRONT_SETBACK;
    const x1 = c.x1 - FRONT_SETBACK;
    const zm = (c.z0 + c.z1) / 2;
    const rows: [number, number, 1 | -1][] = [
      [c.z0 + FRONT_SETBACK, zm - 0.1, -1],
      [zm + 0.1, c.z1 - FRONT_SETBACK, 1],
    ];
    for (const [za, zb, face] of rows) {
      let x = x0;
      while (x < x1 - 0.5) {
        const w = Math.min(x1 - x, 2.6 + r() * 2.4);
        const use = x1 - (x + w) < 2.2 ? x1 - x : w;
        const box: DecorBox = {
          x: x + use / 2,
          z: (za + zb) / 2,
          w: use - 0.02,
          d: zb - za,
          floors: floors[0] + Math.floor(r() * (floors[1] - floors[0] + 1)),
          color: PASTELS[Math.floor(r() * PASTELS.length)]!,
          seed: Math.floor(r() * 997),
        };
        plan.boxes.push(box);
        addDetails(plan.parts, box, face, r);
        x += use;
      }
    }
  }
  return plan;
}

function addDetails(parts: Part[], b: DecorBox, face: 1 | -1, r: () => number) {
  const top = CURB_H + b.floors * FLOOR_HEIGHT;
  const fz = b.z + (face * b.d) / 2;
  // Awning over the shopfront, tilted down to the street.
  parts.push({
    shape: 'box',
    mat: 'awning',
    x: b.x,
    y: CURB_H + FLOOR_HEIGHT * 0.82,
    z: fz + face * 0.42,
    sx: b.w * 0.86,
    sy: 0.07,
    sz: 0.84,
    rx: face * 0.32,
    color: AWNINGS[Math.floor(r() * AWNINGS.length)]!,
  });
  // Cornice and parapet.
  parts.push({
    shape: 'box',
    mat: 'cornice',
    x: b.x,
    y: top + 0.1,
    z: b.z,
    sx: b.w + 0.16,
    sy: 0.2,
    sz: b.d + 0.16,
    color: '#9a948a',
  });
  // Roof item.
  const k = r();
  const rx = b.x + (r() - 0.5) * (b.w - 1.6);
  const rz = b.z + (r() - 0.5) * (b.d - 2);
  if (k < 0.35) {
    for (const [lx, lz] of [
      [-0.35, -0.35],
      [0.35, -0.35],
      [-0.35, 0.35],
      [0.35, 0.35],
    ] as const)
      parts.push({ shape: 'box', mat: 'steel', x: rx + lx, y: top + 0.45, z: rz + lz, sx: 0.07, sy: 0.7, sz: 0.07 });
    parts.push({
      shape: 'octa',
      mat: 'tank',
      x: rx,
      y: top + 1.25,
      z: rz,
      sx: 1.1,
      sy: 1.0,
      sz: 1.1,
      color: '#8a6243',
    });
    parts.push({ shape: 'cone', mat: 'tankRoof', x: rx, y: top + 1.95, z: rz, sx: 1.2, sy: 0.45, sz: 1.2 });
  } else if (k < 0.65) {
    for (let i = 0; i < 2; i++)
      parts.push({
        shape: 'box',
        mat: 'hvac',
        x: rx + (i - 0.5) * 0.9,
        y: top + 0.45,
        z: rz,
        sx: 0.7,
        sy: 0.5,
        sz: 0.7,
      });
  } else if (k < 0.85) {
    parts.push({ shape: 'box', mat: 'garden', x: b.x, y: top + 0.24, z: b.z, sx: b.w - 0.7, sy: 0.12, sz: b.d - 0.9 });
    parts.push({
      shape: 'sphere',
      mat: 'shrub',
      x: rx,
      y: top + 0.55,
      z: rz,
      sx: 0.8,
      sy: 0.65,
      sz: 0.8,
      color: '#5a9a48',
    });
  } else {
    parts.push({ shape: 'cyl', mat: 'steel', x: rx, y: top + 1.2, z: rz, sx: 0.06, sy: 2.2, sz: 0.06 });
  }
}
