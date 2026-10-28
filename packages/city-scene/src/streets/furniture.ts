import type { CityLayout } from '../types.ts';
import { CURB_H, type District, districtPlan, ROAD_HALF, rng } from './grid.ts';
import { LAMP_OFFSET, LAMP_STEP } from './ground.ts';

/**
 * Where the street furniture goes. Pure, so tests can check that nothing stands in a road, on the pedestrians'
 * walking line (2.7 from the road centre) or inside a building.
 */
export const TREE_OFFSET = 3.7;
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
  sx: 1 | -1;
  sz: 1 | -1;
}
export interface FurniturePlan {
  lamps: Lamp[];
  /** Trees: x, y, z, scale. */
  trees: [number, number, number, number][];
  signals: Signal[];
}

function inBuilding(layout: CityLayout, x: number, z: number, margin: number): boolean {
  return layout.buildings.some(b => Math.abs(x - b.x) < b.w / 2 + margin && Math.abs(z - b.z) < b.d / 2 + margin);
}

function nearJunction(d: District, x: number, z: number, r: number): boolean {
  return d.xs.some(jx => d.zs.some(jz => Math.abs(x - jx) < r && Math.abs(z - jz) < r));
}

export function planFurniture(layout: CityLayout, district = districtPlan(layout.streets)): FurniturePlan {
  const d = district;
  const plan: FurniturePlan = { lamps: [], trees: [], signals: [] };
  const B = d.bounds;
  // Furniture lines the district's streets and the first ring around it; beyond that the fog takes over.
  const reachX = B.maxX + 20;
  const reachZ = B.maxZ + 20;
  const blocked = (x: number, z: number, m: number) =>
    inBuilding(layout, x, z, m) || d.cells.some(c => c.kind === 'decor' && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && Math.min(x - c.x0, c.x1 - x, z - c.z0, c.z1 - z) > 1.2);
  let n = 0;
  const along = (lines: number[], axis: 'x' | 'z') => {
    const reach = axis === 'z' ? reachZ : reachX;
    for (const r of lines) {
      if (Math.abs(r) > (axis === 'z' ? reachX : reachZ)) continue;
      for (const side of [-1, 1] as const) {
        for (let s = -reach + LAMP_STEP; s <= reach - LAMP_STEP; s += LAMP_STEP) {
          const a = r + side * LAMP_OFFSET;
          const [x, z] = axis === 'z' ? [a, s] : [s, a];
          if (nearJunction(d, x, z, 4.6) || blocked(x, z, 0.4)) continue;
          const ry = axis === 'z' ? (side > 0 ? Math.PI : 0) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
          plan.lamps.push({ x, z, ry });
        }
        // Street trees only along the client lots and the open blocks (decor blocks have shopfronts at the curb).
        for (let s = -reach + 2.5; s <= reach - 2.5; s += 5) {
          const a = r + side * TREE_OFFSET;
          const [x, z] = axis === 'z' ? [a, s] : [s, a];
          if (nearJunction(d, x, z, 6) || blocked(x, z, 1.0)) continue;
          const cell = d.cells.find(c => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
          if (!cell || cell.kind === 'decor' || cell.kind === 'city') continue;
          plan.trees.push([x, CURB_H, z, 0.9 + ((n++ * 7) % 5) * 0.06]);
        }
      }
    }
  };
  along(d.xs, 'z');
  along(d.zs, 'x');
  // Two signal poles on opposite corners of every junction of the traffic grid.
  for (const x of layout.streets.roadsX)
    for (const z of layout.streets.roadsZ) {
      plan.signals.push({ x: x + SIGNAL_CORNER, z: z + SIGNAL_CORNER, sx: 1, sz: 1 });
      plan.signals.push({ x: x - SIGNAL_CORNER, z: z - SIGNAL_CORNER, sx: -1, sz: -1 });
    }
  // The small park: a loose grove away from its walks.
  const r = rng(41);
  for (const c of d.cells) {
    if (c.kind !== 'park') continue;
    const inner = { x0: c.x0 + 4.6, x1: c.x1 - 4.6, z0: c.z0 + 4.6, z1: c.z1 - 4.6 };
    for (let i = 0; i < 6; i++) {
      const x = inner.x0 + r() * (inner.x1 - inner.x0);
      const z = inner.z0 + r() * (inner.z1 - inner.z0);
      if (Math.abs(x - c.cx) < 4.5 && Math.abs(z - c.cz) < 3.8) continue;
      plan.trees.push([x, CURB_H, z, 1.0 + r() * 0.5]);
    }
  }
  return plan;
}

/** True when (x, z) lies on a road surface. */
export function onRoad(d: District, x: number, z: number): boolean {
  if (Math.abs(x) > d.extent + ROAD_HALF || Math.abs(z) > d.extent + ROAD_HALF) return false;
  return d.xs.some(r => Math.abs(x - r) < ROAD_HALF) || d.zs.some(r => Math.abs(z - r) < ROAD_HALF);
}
