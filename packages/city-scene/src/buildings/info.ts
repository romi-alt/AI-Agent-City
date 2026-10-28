/**
 * Per-building facts for the camera, interiors and labels (A3), so they never measure the scene. X02.
 *
 *   designsForLayout(layout?): BuildingInfo[]   one entry per layout building, in layout order.
 *
 * All values are world units. Pure; the same numbers the meshes are built from.
 */
import layoutJson from '../data/city-layout.json';
import { FLOOR_HEIGHT, type CityLayout } from '../types.ts';
import { BUILDING_BASE_Y, designAll } from './designs.ts';
import { lobbyLevels } from './explode.ts';

export type Side = '+x' | '-x' | '+z' | '-z';

export interface BuildingInfo {
  key: string;
  /** Lot centre and footprint (the widest volume, usually the ground floor). */
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  /** Where floor 1 starts (top of the sidewalk). Floor L's slab: baseY + (L - 1) * FLOOR_HEIGHT. */
  baseY: number;
  /** Top of the last floor (the roof slab). */
  roof: number;
  /** Highest point including parapets, crown and spire. */
  height: number;
  /** Side of the main entrance and a point on the pavement in front of the doors. */
  entrance: Side;
  entrancePoint: [number, number, number];
  /** Floors that stay on the ground when exploded. */
  lobbyLevels: number;
}

export function designsForLayout(layout: CityLayout = layoutJson as CityLayout): BuildingInfo[] {
  return designAll(layout).map(({ building: b, design: d }) => {
    const entrance: Side = d.entrance;
    const [ex, ez] =
      entrance === '+z'
        ? [0, b.d / 2 + 1.2]
        : entrance === '-z'
          ? [0, -b.d / 2 - 1.2]
          : entrance === '+x'
            ? [b.w / 2 + 1.2, 0]
            : [-b.w / 2 - 1.2, 0];
    return {
      key: b.key,
      x: b.x,
      z: b.z,
      w: b.w,
      d: b.d,
      floors: b.floors.length,
      baseY: BUILDING_BASE_Y,
      roof: BUILDING_BASE_Y + b.floors.length * FLOOR_HEIGHT,
      height: d.top,
      entrance,
      entrancePoint: [b.x + ex, BUILDING_BASE_Y, b.z + ez],
      lobbyLevels: lobbyLevels(b.kind),
    };
  });
}
