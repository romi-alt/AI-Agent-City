import type { CityLayout } from '../types.ts';
import { CURB_H, extendedGrid, PLAZAS, ROAD_HALF, SIDEWALK, type StreetGrid } from './grid.ts';

/**
 * Where street furniture goes. Pure, so tests can check that nothing stands in a road, on the pedestrians' walking
 * line (SIDEWALK from the road centre) or inside a building.
 */

/** Lamp poles stand just behind the walking line; street trees a little further in. */
export const LAMP_OFFSET = 3.15;
export const TREE_OFFSET = 3.7;
/** Along each block side (measured from the junction before it): lamps and trees alternate. */
const LAMP_AT = [5.2, 14.8];
const TREE_AT = [8, 12];
/** Distance of a signal pole from the junction centre, on both axes. */
export const SIGNAL_CORNER = 3.3;

export interface Lamp {
  x: number;
  z: number;
  /** Rotation about y so the arm (local +x) points over the road. */
  ry: number;
}
export interface Signal {
  x: number;
  z: number;
  /** The heads face away from the junction along +x/-x and +z/-z: sign of each. */
  sx: 1 | -1;
  sz: 1 | -1;
}
export interface FurniturePlan {
  lamps: Lamp[];
  trees: [number, number, number, number][];
  signals: Signal[];
}

function blocked(layout: CityLayout, x: number, z: number, margin: number): boolean {
  for (const b of layout.buildings)
    if (Math.abs(x - b.x) < b.w / 2 + margin && Math.abs(z - b.z) < b.d / 2 + margin) return true;
  return false;
}

export function planFurniture(layout: CityLayout, reach: number): FurniturePlan {
  const streets: StreetGrid = layout.streets;
  const grid = extendedGrid(streets);
  const plan: FurniturePlan = { lamps: [], trees: [], signals: [] };
  const sp = grid.spacing;
  const inPlaza = (x: number, z: number) => PLAZAS.some(p => Math.abs(x - p.x) < sp / 2 && Math.abs(z - p.z) < sp / 2);
  let n = 0;
  const along = (roads: number[], cross: number[], axis: 'x' | 'z') => {
    for (const r of roads) {
      if (Math.abs(r) > reach) continue;
      for (let j = 0; j < cross.length - 1; j++) {
        const c0 = cross[j]!;
        if (Math.abs(c0) > reach || Math.abs(cross[j + 1]!) > reach) continue;
        for (const side of [-1, 1] as const) {
          for (const s of LAMP_AT) {
            const a = r + side * LAMP_OFFSET;
            const [x, z] = axis === 'z' ? [a, c0 + s] : [c0 + s, a];
            if (blocked(layout, x, z, 0.4)) continue;
            // Arm points back over the road: toward -side on the cross axis.
            const ry = axis === 'z' ? (side > 0 ? Math.PI : 0) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
            plan.lamps.push({ x, z, ry });
          }
          for (const s of TREE_AT) {
            const a = r + side * TREE_OFFSET;
            const [x, z] = axis === 'z' ? [a, c0 + s] : [c0 + s, a];
            if (blocked(layout, x, z, 1.1) || inPlaza(x, z)) continue;
            plan.trees.push([x, CURB_H, z, 0.95 + ((n++ * 7) % 5) * 0.06]);
          }
        }
      }
    }
  };
  along(grid.xs, grid.zs, 'z');
  along(grid.zs, grid.xs, 'x');
  for (const x of streets.roadsX)
    for (const z of streets.roadsZ) {
      plan.signals.push({ x: x + SIGNAL_CORNER, z: z + SIGNAL_CORNER, sx: 1, sz: 1 });
      plan.signals.push({ x: x - SIGNAL_CORNER, z: z - SIGNAL_CORNER, sx: -1, sz: -1 });
    }
  return plan;
}

/** True when (x, z) lies on a road surface of the grid. */
export function onRoad(streets: StreetGrid, x: number, z: number): boolean {
  const g = extendedGrid(streets);
  return g.xs.some(r => Math.abs(x - r) < ROAD_HALF) || g.zs.some(r => Math.abs(z - r) < ROAD_HALF);
}

export { SIDEWALK };
