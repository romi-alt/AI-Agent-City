import type { CityLayout } from '../types.ts';

/**
 * The district plan (X02): the layout's 5 × 3 street grid closed by a perimeter parkway, its 15 building lots,
 * landscaped edge blocks with a central plaza, and a waterfront to the north and west. Street geometry matches
 * the legacy `street.ts` so A2's traffic (lanes at ±1) and pedestrians (2.7 from the road centre) line up.
 */
export const ROAD_HALF = 2;
export const LANE = 1;
export const SIDEWALK = 2.7;
/** Height of the curb / sidewalk slabs; buildings stand on it. */
export const CURB_H = 0.15;
/** Water lies beyond the parkway by this margin (embankment promenade in between), north and west. */
export const PROMENADE = 8;

export type StreetGrid = CityLayout['streets'];

export type CellKind = 'lot' | 'plaza' | 'park' | 'strip';

/** A block between roads, curb to curb. */
export interface Cell {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  cx: number;
  cz: number;
  kind: CellKind;
}

export interface District {
  /** Road centre lines: along z at each x, along x at each z (the layout roads plus the parkway). */
  xs: number[];
  zs: number[];
  /** Half-size of the parkway ring (= the traffic extent). */
  ring: number;
  cells: Cell[];
  /** Waterline: water at z < waterZ and x < waterX. */
  waterZ: number;
  waterX: number;
}

export function districtPlan(streets: StreetGrid): District {
  const ring = streets.extent;
  const xs = [...new Set([-ring, ...streets.roadsX, ring])].sort((a, b) => a - b);
  const zs = [...new Set([-ring, ...streets.roadsZ, ring])].sort((a, b) => a - b);
  const cx0 = Math.min(...streets.roadsX);
  const cx1 = Math.max(...streets.roadsX);
  const cz0 = Math.min(...streets.roadsZ);
  const cz1 = Math.max(...streets.roadsZ);
  const cells: Cell[] = [];
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < zs.length - 1; j++) {
      const x0 = xs[i]! + ROAD_HALF;
      const x1 = xs[i + 1]! - ROAD_HALF;
      const z0 = zs[j]! + ROAD_HALF;
      const z1 = zs[j + 1]! - ROAD_HALF;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const core = cx > cx0 && cx < cx1 && cz > cz0 && cz < cz1;
      const narrow = Math.min(x1 - x0, z1 - z0) < 9;
      const plaza = !core && Math.abs(cx) < 1 && cz > cz1;
      cells.push({ x0, x1, z0, z1, cx, cz, kind: core ? 'lot' : plaza ? 'plaza' : narrow ? 'strip' : 'park' });
    }
  return { xs, zs, ring, cells, waterZ: -(ring + PROMENADE), waterX: -(ring + PROMENADE) };
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
