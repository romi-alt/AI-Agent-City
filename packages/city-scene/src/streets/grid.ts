import type { CityLayout } from '../types.ts';

/**
 * Street geometry shared by roads, sidewalks, furniture and the skyline. Same constants as the legacy `street.ts`,
 * so A2's traffic (lane offset 1) and pedestrians (2.7 from the road centre) line up with the drawn roads.
 */
export const ROAD_HALF = 2;
export const LANE = 1;
export const SIDEWALK = 2.7;
/** Height of the curb / sidewalk slabs; buildings stand on it. */
export const CURB_H = 0.15;
/** Half-size of the area covered by street blocks (the core plus the decorative ring). */
export const CITY_HALF = 190;
/** Lots sit on a 16 x 16 slab between roads 20 apart. */

export type StreetGrid = CityLayout['streets'];

export interface Block {
  x: number;
  z: number;
  /** Half-size of the block slab (curb to curb). */
  half: number;
  /** One of the 15 layout lots (inside the core roads). */
  core: boolean;
}

export interface ExtendedGrid {
  spacing: number;
  /** Road centre lines along z (at each x) and along x (at each z), core and decorative ring. */
  xs: number[];
  zs: number[];
  blocks: Block[];
}

function extend(core: number[], spacing: number, half: number): number[] {
  const out = [...core];
  for (let v = core[0]! - spacing; v >= -half; v -= spacing) out.unshift(v);
  for (let v = core[core.length - 1]! + spacing; v <= half; v += spacing) out.push(v);
  return out;
}

/** The layout's street grid continued outward at the same spacing, with every block between roads. */
export function extendedGrid(streets: StreetGrid, half = CITY_HALF): ExtendedGrid {
  const spacing = streets.roadsX.length > 1 ? streets.roadsX[1]! - streets.roadsX[0]! : 20;
  const xs = extend(streets.roadsX, spacing, half);
  const zs = extend(streets.roadsZ, spacing, half);
  const coreX = [streets.roadsX[0]!, streets.roadsX[streets.roadsX.length - 1]!];
  const coreZ = [streets.roadsZ[0]!, streets.roadsZ[streets.roadsZ.length - 1]!];
  const blocks: Block[] = [];
  const bh = spacing / 2 - ROAD_HALF;
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < zs.length - 1; j++) {
      const x = (xs[i]! + xs[i + 1]!) / 2;
      const z = (zs[j]! + zs[j + 1]!) / 2;
      const core = x > coreX[0]! && x < coreX[1]! && z > coreZ[0]! && z < coreZ[1]!;
      blocks.push({ x, z, half: bh, core });
    }
  return { spacing, xs, zs, blocks };
}

/** Seeded PRNG (mulberry32): the same seed always builds the same city. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Blocks given over to plazas and parks instead of buildings (centre coordinates). */
export const PLAZAS: { x: number; z: number; kind: 'plaza' | 'park' }[] = [
  { x: 0, z: 40, kind: 'plaza' },
  { x: -60, z: 0, kind: 'park' },
  { x: 60, z: -40, kind: 'park' },
];
