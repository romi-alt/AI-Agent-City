import { type CityLayout, FLOOR_HEIGHT, type LayoutBuilding } from '../types.ts';
import { type Box, buildingHeight, segmentHitsBox } from './bounds.ts';
import { add, clamp, type V3 } from './math.ts';
import { type Orbit, orbitPosition } from './orbit.ts';

/** A camera framing: where it stands and what it looks at. */
export interface Pose {
  pos: V3;
  target: V3;
}

/** One world unit is about 3.5 m (see types.ts). Interiors are modelled in metres and scaled by this. */
export const METRES_PER_UNIT = 3.5;

/** The camera's vertical field of view (degrees), as set on the Canvas. */
export const FOV = 42;

export function poseFromOrbit(o: Orbit): Pose {
  return { pos: orbitPosition(o), target: [...o.target] };
}

/** Distance at which an object of the given height and width fits in view with some air around it. */
export function fitDistance(height: number, width: number, aspect: number, fov = FOV): number {
  const vHalf = (fov * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(0.3, aspect));
  const byHeight = height / 2 / Math.tan(vHalf);
  const byWidth = width / 2 / Math.tan(hHalf);
  return Math.max(byHeight, byWidth) * 1.25;
}

/** The overview of the whole city, from the south-east, like the first look over a skyline. */
export function homeShot(layout: CityLayout, aspect = 16 / 9): Pose {
  const e = layout.streets.extent;
  const r = clamp(fitDistance(e * 0.9, e * 1.7, aspect), 80, 230);
  return poseFromOrbit({ target: [0, 3, 2], theta: 0.62, phi: 1.0, radius: r });
}

/** Entrances face the street on the +z side of each lot. */
export function entrance(b: LayoutBuilding): V3 {
  return [b.x, 0, b.z + b.d / 2];
}

/** Headings tried for a building shot, entrance side first. */
const HEADINGS = [0.42, -0.42, 0.8, -0.8, 0.1, 1.25, -1.25, 1.7, -1.7, 2.4, -2.4, Math.PI];
const ELEVATIONS = [1.08, 0.95, 0.82, 0.7];

/** How many sight lines from the camera to the building are blocked by other buildings. */
export function blockedSightLines(pos: V3, b: LayoutBuilding, others: Box[]): number {
  const h = buildingHeight(b);
  const points: V3[] = [
    [b.x, h * 0.5, b.z],
    [b.x, h * 0.95, b.z],
    [b.x, h * 0.2, b.z + b.d / 2],
    [b.x - b.w / 2, h * 0.6, b.z + b.d / 2],
    [b.x + b.w / 2, h * 0.6, b.z + b.d / 2],
  ];
  let n = 0;
  for (const p of points) if (others.some(o => segmentHitsBox(pos, p, o, 0.2))) n++;
  return n;
}

/**
 * Frames a whole building from its entrance side, a little off-axis so its depth reads. When other buildings
 * would block the view, tries other headings, then higher angles, and keeps the clearest.
 */
export function buildingShot(b: LayoutBuilding, aspect = 16 / 9, others: Box[] = []): Pose {
  const h = buildingHeight(b);
  const r = Math.max(fitDistance(h * 1.7 + 4, Math.max(b.w, b.d) * 3, aspect), 30);
  const target: V3 = [b.x, h * 0.45, b.z];
  let best: { pose: Pose; blocked: number } | null = null;
  for (const phi of ELEVATIONS) {
    for (const theta of HEADINGS) {
      const pose = poseFromOrbit({ target, theta, phi, radius: r });
      const blocked = others.length ? blockedSightLines(pose.pos, b, others) : 0;
      if (blocked === 0) return pose;
      if (!best || blocked < best.blocked) best = { pose, blocked };
    }
  }
  return best!.pose;
}

/** Height of a floor's slab (bottom) in world units. */
export function floorBase(level: number): number {
  return (level - 1) * FLOOR_HEIGHT;
}

/**
 * Looks down into a floor once the building is cut open above it: high enough to read the whole plan, at an angle
 * that still shows the windows and the city behind.
 */
export function floorShot(b: LayoutBuilding, level: number, aspect = 16 / 9): Pose {
  const y = floorBase(level);
  const span = Math.max(b.w, b.d);
  const r = fitDistance(span * 1.25, span * 1.6, aspect);
  return poseFromOrbit({ target: [b.x, y + 0.2, b.z + 0.3], theta: 0.5, phi: 0.82, radius: Math.max(r, span * 1.9) });
}

/** Inside the office: a high corner view over the whole floor plan (the ceiling is hidden from above). */
export function officeShot(b: LayoutBuilding, level: number, aspect = 16 / 9): Pose {
  const y = floorBase(level);
  const span = Math.max(b.w, b.d);
  const r = clamp(fitDistance(span * 0.6, span * 1.05, aspect), 6, 14);
  return poseFromOrbit({ target: [b.x, y + 0.25, b.z + 0.2], theta: 0.55, phi: 0.95, radius: r });
}

/**
 * Close look at one desk, from behind and to the side of the person sitting there (over their shoulder, at the
 * screen), below the ceiling. `deskWorld` is the desk top's centre; `facing` the sitter's yaw (see interior/plan).
 */
export function deskShot(deskWorld: V3, facing: number): Pose {
  const target = add(deskWorld, [0, 0.06, 0]);
  return poseFromOrbit({ target, theta: facing + Math.PI + 0.55, phi: 1.2, radius: 1.05 });
}

/**
 * The arrival flight: from a distant skyline, glide over the districts, reveal the street grid from above, then
 * settle at the visitor's building (or the overview when there is none). Every keyframe stays above the roofs
 * until the last one.
 */
export function arrivalKeyframes(
  layout: CityLayout,
  highlight: LayoutBuilding | null,
  aspect = 16 / 9,
  others: Box[] = [],
): Pose[] {
  const e = layout.streets.extent;
  const end = highlight ? buildingShot(highlight, aspect, others) : homeShot(layout, aspect);
  const focus: V3 = highlight ? [highlight.x, 0, highlight.z] : [0, 0, 0];
  const tallest = Math.max(...layout.buildings.map(buildingHeight), 10);
  return [
    { pos: [-e * 2.6, tallest * 1.4, e * 4.2], target: [0, tallest * 0.7, 0] },
    { pos: [-e * 1.1, tallest * 3.2, e * 2.1], target: [0, tallest * 0.25, 0] },
    { pos: [focus[0] * 0.4 + e * 0.35, tallest * 3.6, focus[2] + e * 1.15], target: [focus[0] * 0.7, 0, focus[2]] },
    end,
  ];
}
