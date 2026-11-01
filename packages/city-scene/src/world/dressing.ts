/**
 * Street dressing that says New York at street level, as plain data: steam vents on the roads, subway entrances,
 * fire hydrants and hot-dog carts on the sidewalks. Pure and seeded; `Dressing.tsx` draws it.
 */
import { ROAD_HALF } from '../streets/grid.ts';

export interface Dressing {
  /** Manhole vents the steam rises from (on the road surface). */
  vents: { x: number; z: number }[];
  /** Subway entrances: a railed stair with two green globe lamps, `ry` turns it to face the road. */
  kiosks: { x: number; z: number; ry: number }[];
  hydrants: { x: number; z: number }[];
  carts: { x: number; z: number; ry: number; color: string }[];
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where the kerb-side furniture stands, measured from a road's centre line: between the lamps and the trees. */
export const KERB_OFFSET = ROAD_HALF + 0.95;

/**
 * Dresses the roads inside `radius` of the centre. `roadsX` / `roadsZ` are road centre lines (roads along z at each x).
 * Everything sits mid-block, away from the junctions where signals, crossings and lamps already are.
 */
export function planDressing(roadsX: number[], roadsZ: number[], radius: number, scale = 1, seed = 5150): Dressing {
  const r = mulberry(seed);
  const out: Dressing = { vents: [], kiosks: [], hydrants: [], carts: [] };
  const inside = (x: number, z: number) => Math.hypot(x, z) <= radius;
  const cartColors = ['#c9a24a', '#d9d9d4', '#b5452f'];
  // Roads along z (avenues): mid-block is half a block past each cross street.
  for (const x of roadsX)
    for (let i = 0; i < roadsZ.length - 1; i++) {
      const z = (roadsZ[i]! + roadsZ[i + 1]!) / 2;
      if (!inside(x, z)) continue;
      if (r() < 0.4 * scale) out.vents.push({ x: x + (r() < 0.5 ? -0.8 : 0.8), z: z + (r() - 0.5) * 4 });
      const side = r() < 0.5 ? -1 : 1;
      if (r() < 0.16 * scale)
        out.kiosks.push({ x: x + side * KERB_OFFSET, z, ry: side === 1 ? Math.PI / 2 : -Math.PI / 2 });
      if (r() < 0.5 * scale) out.hydrants.push({ x: x - side * KERB_OFFSET, z: z + 3 + r() * 2 });
      if (r() < 0.2 * scale)
        out.carts.push({
          x: x - side * KERB_OFFSET,
          z: z - 3,
          ry: side === 1 ? -Math.PI / 2 : Math.PI / 2,
          color: cartColors[Math.floor(r() * 3)]!,
        });
    }
  // Cross streets (along x): the same, half a block past each avenue.
  for (const z of roadsZ)
    for (let i = 0; i < roadsX.length - 1; i++) {
      const x = (roadsX[i]! + roadsX[i + 1]!) / 2;
      if (!inside(x, z)) continue;
      if (r() < 0.3 * scale) out.vents.push({ x: x + (r() - 0.5) * 4, z: z + (r() < 0.5 ? -0.8 : 0.8) });
      const side = r() < 0.5 ? -1 : 1;
      if (r() < 0.1 * scale) out.kiosks.push({ x, z: z + side * KERB_OFFSET, ry: side === 1 ? Math.PI : 0 });
      if (r() < 0.35 * scale) out.hydrants.push({ x: x + 3 + r() * 2, z: z - side * KERB_OFFSET });
    }
  return out;
}
