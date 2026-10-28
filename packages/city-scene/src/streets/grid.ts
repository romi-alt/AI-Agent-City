import type { CityLayout } from '../types.ts';
import { cityRoadsFor, districtRect } from './extent.ts';

/**
 * The street plan (X04): the layout's grid continued as one road grid to the horizon (`extent.ts`), with every
 * block between roads classified — the 15 client lots, the fountain plaza and one small park, decor blocks that
 * fill the rest of the district, and the city blocks beyond it (the generated surround). Street geometry matches the
 * legacy `street.ts` so traffic (lanes at ±1) and pedestrians (2.7 from the road centre) line up.
 */
export const ROAD_HALF = 2;
export const LANE = 1;
export const SIDEWALK = 2.7;
/** Height of the curb / sidewalk slabs; buildings stand on it. */
export const CURB_H = 0.15;

export type StreetGrid = CityLayout['streets'];

export type CellKind = 'lot' | 'plaza' | 'park' | 'decor' | 'city';

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
  /** Road centre lines of the whole city: along z at each x, along x at each z. */
  xs: number[];
  zs: number[];
  /** Half-size of the generated city (roads end here, well inside the fog). */
  extent: number;
  /** The downtown district (road centre lines around it). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  cells: Cell[];
}

/** Block centres (relative to the district) kept open: the fountain plaza and one small park. */
const PLAZA_AT: [number, number] = [0, 1];
const PARK_AT: [number, number] = [-1, 1];

export function districtPlan(streets: StreetGrid): District {
  const roads = cityRoadsFor(streets);
  const bounds = districtRect(streets);
  const { roadsX: xs, roadsZ: zs } = roads;
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
      const lot = cx > cx0 && cx < cx1 && cz > cz0 && cz < cz1;
      const inDistrict = cx > bounds.minX && cx < bounds.maxX && cz > bounds.minZ && cz < bounds.maxZ;
      // Plaza on the middle block of the near (+z) edge; the park beside it, on the corner.
      const edgeZ = cz > cz1 ? 1 : cz < cz0 ? -1 : 0;
      const plaza = inDistrict && !lot && Math.abs(cx) < 1 && edgeZ === PLAZA_AT[1];
      const park = inDistrict && !lot && edgeZ === PARK_AT[1] && cx < cx0 && cx > bounds.minX;
      const kind: CellKind = lot ? 'lot' : plaza ? 'plaza' : park ? 'park' : inDistrict ? 'decor' : 'city';
      cells.push({ x0, x1, z0, z1, cx, cz, kind });
    }
  return { xs, zs, extent: roads.extent, bounds, cells };
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
