/**
 * The size of the generated city (X04): one road grid that continues the layout's streets at the same spacing far
 * past the district, the district's bounds, and the areas generated buildings must keep clear of. Pure; shared by
 * D1 (district), D2 (surround rings), D3 (traffic) and D4 (camera clamps).
 *
 *   cityRoads(layout)      -> { roadsX, roadsZ, extent }  road centre lines of the whole city (sorted)
 *   districtBounds(layout) -> Rect                        the downtown district (road centre lines around it)
 *   heroClearance(layout)  -> Rect[]                      rectangles generated buildings must avoid
 *
 * Roads along z sit at each `roadsX`, roads along x at each `roadsZ` (as in `layout.streets`); every road runs from
 * -extent to +extent. Road half-width is 2 (`streets/grid.ts` ROAD_HALF).
 */
import type { CityLayout } from '../types.ts';

type Streets = CityLayout['streets'];

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ClearRect extends Rect {
  /** 'district': the downtown, owned by D1; 'hero': a client building's lot (with margin). */
  kind: 'district' | 'hero';
  /** Building key for 'hero' rectangles. */
  key?: string;
}

export interface CityRoads {
  roadsX: number[];
  roadsZ: number[];
  /** Half-size of the generated city: roads run to ±extent; fog hides everything before it. */
  extent: number;
}

/** Half-size of the generated city (world units; 1 unit ≈ 3.5 m, so about 3.5 km each way: Midtown, both rivers and the far banks). */
export const CITY_EXTENT = 1000;
/** Blocks of decor around the 15 lots that still belong to the district (one block deep on every side). */
export const DISTRICT_MARGIN_BLOCKS = 1;

function spacing(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s.length > 1 ? s[1]! - s[0]! : 20;
}

function extend(core: number[], step: number, half: number): number[] {
  const s = [...core].sort((a, b) => a - b);
  const out = [...s];
  for (let v = s[0]! - step; v >= -half; v -= step) out.unshift(v);
  for (let v = s[s.length - 1]! + step; v <= half; v += step) out.push(v);
  return out;
}

export function cityRoads(layout: CityLayout, extent = CITY_EXTENT): CityRoads {
  return cityRoadsFor(layout.streets, extent);
}

/** As `cityRoads`, from the street grid alone. */
export function cityRoadsFor(streets: Streets, extent = CITY_EXTENT): CityRoads {
  const { roadsX, roadsZ } = streets;
  return {
    roadsX: extend(roadsX, spacing(roadsX), extent),
    roadsZ: extend(roadsZ, spacing(roadsZ), extent),
    extent,
  };
}

/** The district: the 15 lots plus one block on every side, measured between road centre lines. */
export function districtBounds(layout: CityLayout): Rect {
  return districtRect(layout.streets);
}

/** As `districtBounds`, from the street grid alone. */
export function districtRect(streets: Streets): Rect {
  const { roadsX, roadsZ } = streets;
  const sx = spacing(roadsX) * DISTRICT_MARGIN_BLOCKS;
  const sz = spacing(roadsZ) * DISTRICT_MARGIN_BLOCKS;
  return {
    minX: Math.min(...roadsX) - sx,
    maxX: Math.max(...roadsX) + sx,
    minZ: Math.min(...roadsZ) - sz,
    maxZ: Math.max(...roadsZ) + sz,
  };
}

/**
 * Where generated (surround) buildings may not go: the whole district (D1 fills it itself), plus every client
 * building's footprint with a margin, so nothing ever lands on a hero even if the district shrinks later.
 */
export function heroClearance(layout: CityLayout, margin = 2): ClearRect[] {
  const d = districtBounds(layout);
  return [
    { kind: 'district', ...d },
    ...layout.buildings.map(b => ({
      kind: 'hero' as const,
      key: b.key,
      minX: b.x - b.w / 2 - margin,
      maxX: b.x + b.w / 2 + margin,
      minZ: b.z - b.d / 2 - margin,
      maxZ: b.z + b.d / 2 + margin,
    })),
  ];
}
