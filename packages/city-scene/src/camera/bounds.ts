import { type CityLayout, FLOOR_HEIGHT, type LayoutBuilding } from '../types.ts';
import { CURB_H } from '../streets/grid.ts';
import { clamp, type V3 } from './math.ts';

/** Axis-aligned box of a building's mass, in world units. */
export interface Box {
  key: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Ground is y = 0. */
  top: number;
  /** The building is cut open at `top` (an opened floor): the camera may come close to the cut from above. */
  cut?: boolean;
}

export interface CityBounds {
  /** Camera must stay within ±extent on x and z. */
  extent: number;
  /** Lowest camera height (above the street). */
  minY: number;
  maxY: number;
  /** Targets stay inside the street grid. */
  targetExtent: number;
}

/**
 * Roofs, crowns and spires rise above the last floor (A1's architecture); keep the camera this far clear of a
 * building's floor stack so it never clips into a crown it cannot know about.
 */
export const ROOF_ALLOWANCE = 4;
/** Clearance kept from facades. */
export const FACADE_MARGIN = 0.9;
/** Clearance kept above an opened floor (inside the office the camera stands just above its floor). */
export const CUT_MARGIN = 0.12;

export function buildingHeight(b: LayoutBuilding): number {
  return b.floors.length * FLOOR_HEIGHT;
}

export function buildingBox(b: LayoutBuilding, cutAt?: number): Box {
  return {
    ...(cutAt === undefined ? {} : { cut: true }),
    key: b.key,
    minX: b.x - b.w / 2,
    maxX: b.x + b.w / 2,
    minZ: b.z - b.d / 2,
    maxZ: b.z + b.d / 2,
    top: cutAt ?? buildingHeight(b) + ROOF_ALLOWANCE,
  };
}

/**
 * Collision boxes for the camera. When a floor is opened, its building is cut open at that floor (`cut`): the
 * box then only covers the floors below, so the camera may look into (and enter) the open floor.
 */
export function cityBoxes(layout: CityLayout, cut?: { building: string; level: number }): Box[] {
  return layout.buildings.map(b =>
    cut && cut.building === b.key ? buildingBox(b, CURB_H + (cut.level - 1) * FLOOR_HEIGHT) : buildingBox(b),
  );
}

export function cityBounds(layout: CityLayout): CityBounds {
  const e = layout.streets.extent;
  return { extent: e + 70, minY: 1.2, maxY: 260, targetExtent: e };
}

/**
 * Push a camera position out of any building it would be inside, then keep it inside the city and above the
 * ground. Each box is grown by the facade margin; the point leaves through the nearest side or over the top.
 */
export function clampPosition(p: V3, boxes: Box[], bounds: CityBounds, margin = FACADE_MARGIN): V3 {
  let [x, y, z] = p;
  x = clamp(x, -bounds.extent, bounds.extent);
  z = clamp(z, -bounds.extent, bounds.extent);
  y = clamp(y, bounds.minY, bounds.maxY);
  // Two passes: leaving one box can, rarely, put the point in a neighbour.
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      const minX = b.minX - margin;
      const maxX = b.maxX + margin;
      const minZ = b.minZ - margin;
      const maxZ = b.maxZ + margin;
      const top = b.top + (b.cut ? CUT_MARGIN : margin);
      if (b.top <= 0) continue;
      if (x <= minX || x >= maxX || z <= minZ || z >= maxZ || y >= top) continue;
      const exits = [
        { d: x - minX, apply: () => (x = minX) },
        { d: maxX - x, apply: () => (x = maxX) },
        { d: z - minZ, apply: () => (z = minZ) },
        { d: maxZ - z, apply: () => (z = maxZ) },
        { d: top - y, apply: () => (y = top) },
      ];
      exits.sort((a, c) => a.d - c.d);
      exits[0]!.apply();
    }
  }
  return [x, y, z];
}

export function isInsideBox(p: V3, b: Box, margin = 0): boolean {
  return (
    p[0] > b.minX - margin &&
    p[0] < b.maxX + margin &&
    p[2] > b.minZ - margin &&
    p[2] < b.maxZ + margin &&
    p[1] < b.top + margin &&
    b.top > 0
  );
}

/** Keep the point the camera looks at inside the street grid and not underground. */
export function clampTarget(t: V3, bounds: CityBounds): V3 {
  return [
    clamp(t[0], -bounds.targetExtent, bounds.targetExtent),
    clamp(t[1], 0, 60),
    clamp(t[2], -bounds.targetExtent, bounds.targetExtent),
  ];
}

/** Whether the segment from a to b passes through the box (slab test). */
export function segmentHitsBox(a: V3, b: V3, box: Box, margin = 0): boolean {
  const min = [box.minX - margin, 0, box.minZ - margin];
  const max = [box.maxX + margin, box.top + margin, box.maxZ + margin];
  let t0 = 0;
  let t1 = 1;
  for (let k = 0; k < 3; k++) {
    const d = b[k]! - a[k]!;
    if (Math.abs(d) < 1e-9) {
      if (a[k]! < min[k]! || a[k]! > max[k]!) return false;
      continue;
    }
    let ta = (min[k]! - a[k]!) / d;
    let tb = (max[k]! - a[k]!) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Merge boxes measured from the rendered architecture (crowns, spires, canopies that the layout does not know)
 * into the layout's boxes: each building keeps the larger extent.
 */
export function withMeasured(boxes: Box[], measured: ReadonlyMap<string, Omit<Box, 'key'>> | null): Box[] {
  if (!measured) return boxes;
  return boxes.map(b => {
    const m = measured.get(b.key);
    if (!m) return b;
    const out: Box = {
      ...b,
      minX: Math.min(b.minX, m.minX),
      maxX: Math.max(b.maxX, m.maxX),
      minZ: Math.min(b.minZ, m.minZ),
      maxZ: Math.max(b.maxZ, m.maxZ),
    };
    // A cut box keeps its cut height; otherwise the real top plus a little headroom.
    if (!b.cut) out.top = Math.max(b.top, m.top + 1.2);
    return out;
  });
}

/**
 * Raise each keyframe (all but the last) until it, the path to the next keyframe and its own line of sight are
 * clear of every box: the arrival never grazes a tower of the background skyline.
 */
export function liftClear<T extends { pos: V3; target: V3 }>(keys: T[], boxes: Box[], step = 6, maxLift = 160): T[] {
  const out = keys.map(k => ({ ...k, pos: [...k.pos] as V3 }));
  for (let i = 0; i < out.length - 1; i++) {
    const k = out[i]!;
    const next = out[i + 1]!;
    for (let lifted = 0; lifted <= maxLift; lifted += step) {
      const blocked = boxes.some(
        b =>
          isInsideBox(k.pos, b, 1) || segmentHitsBox(k.pos, next.pos, b, 1) || segmentHitsBox(k.pos, k.target, b, 0.5),
      );
      if (!blocked) break;
      k.pos[1] += step;
    }
  }
  return out;
}
