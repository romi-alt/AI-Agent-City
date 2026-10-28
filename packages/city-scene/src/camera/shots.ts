import { FLOOR_HEIGHT, type LayoutBuilding } from '../types.ts';
import { CURB_H } from '../streets/grid.ts';
import { type Box, buildingHeight, segmentHitsBox } from './bounds.ts';
import { boxCorners, DEFAULT_VIEWPORT, fitPoints, type Viewport } from './fit.ts';
import { add, type V3 } from './math.ts';
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

/** Overview style: heading from the south-east so front (+z) and east facades read, tilt for a 45–55° aerial. */
export const OVERVIEW_THETA = 0.62;
export const OVERVIEW_PHI = 0.7;
/** Top view: almost straight down, north up. */
export const TOP_PHI = 0.04;

/** Corners of every building's real box (measured or designed), for framing the district. */
export function districtPoints(boxes: Box[]): V3[] {
  return boxes
    .filter(b => !b.key.startsWith('skyline:'))
    .flatMap(b => boxCorners(b.minX, b.maxX, 0, b.top, b.minZ, b.maxZ));
}

/** The elevated aerial overview of the whole district (City Overview). */
export function overviewOrbit(boxes: Box[], vp: Viewport = DEFAULT_VIEWPORT, theta = OVERVIEW_THETA): Orbit {
  return fitPoints(districtPoints(boxes), theta, OVERVIEW_PHI, vp, 0.04);
}
export function homeShot(boxes: Box[], vp: Viewport = DEFAULT_VIEWPORT): Pose {
  return poseFromOrbit(overviewOrbit(boxes, vp));
}

/** The plan view: straight down over the district, north up. */
export function topShot(boxes: Box[], vp: Viewport = DEFAULT_VIEWPORT): Pose {
  return poseFromOrbit(fitPoints(districtPoints(boxes), 0, TOP_PHI, vp, 0.05));
}

/** Entrances face the street on the +z side of each lot. */
export function entrance(b: LayoutBuilding): V3 {
  return [b.x, 0, b.z + b.d / 2];
}

/** Headings tried for a building shot: three-quarter views from the entrance side first, then the others. */
const HEADINGS = [0.62, -0.62, 0.35, -0.35, 0.95, -0.95, 1.35, -1.35, 1.9, -1.9, 2.5, -2.5];
const ELEVATIONS = [1.08, 0.98, 0.88, 0.78, 0.68];

/** How many sight lines from the camera to the building are blocked by other buildings. */
export function blockedSightLines(pos: V3, b: LayoutBuilding, others: Box[], top = buildingHeight(b)): number {
  const h = top;
  const points: V3[] = [
    [b.x, h * 0.5, b.z],
    [b.x, h * 0.95, b.z],
    [b.x, h * 0.2, b.z + b.d / 2],
  ];
  // Every corner low and half-way up: a tower in front that hides the lower half counts as much as one hiding the top.
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    for (const f of [0.12, 0.55]) points.push([b.x + (sx * b.w) / 2, h * f, b.z + (sz * b.d) / 2]);
  }
  let n = 0;
  for (const p of points) if (others.some(o => segmentHitsBox(pos, p, o, 0.2))) n++;
  return n;
}

/**
 * Building Focus: a three-quarter view of the complete building (its real height, plus the lift of exploded
 * floors and the floor labels beside it), from the entrance side when nothing blocks it.
 */
export function buildingShot(
  b: LayoutBuilding,
  vp: Viewport = DEFAULT_VIEWPORT,
  others: Box[] = [],
  top = buildingHeight(b),
  extra = 0,
  /** Heading of the entrance side (0 for +z, π/2 for +x, π for -z, -π/2 for -x). */
  facing = 0,
): Pose {
  const pts = boxCorners(b.x - b.w / 2, b.x + b.w / 2, 0, top + extra, b.z - b.d / 2, b.z + b.d / 2);
  // Room for the floor labels standing beside the building (on its right in the three-quarter view).
  const labels = (theta: number): V3[] => {
    const rx = Math.cos(theta);
    const rz = -Math.sin(theta);
    const off = Math.max(b.w, b.d) / 2 + 6;
    return [
      [b.x + rx * off, 0, b.z + rz * off],
      [b.x + rx * off, top + extra, b.z + rz * off],
    ];
  };
  let best: { pose: Pose; blocked: number } | null = null;
  for (const heading of HEADINGS) {
    const theta = heading + facing;
    for (const phi of ELEVATIONS) {
      const pose = poseFromOrbit(fitPoints([...pts, ...labels(theta)], theta, phi, vp, 0.08));
      const blocked = others.length ? blockedSightLines(pose.pos, b, others, top) : 0;
      if (blocked === 0) return pose;
      if (!best || blocked < best.blocked) best = { pose, blocked };
    }
  }
  return best!.pose;
}

/** Height of a floor's slab (bottom) in world units. */
export function floorBase(level: number): number {
  // Buildings stand on the curb (A1: BUILDING_BASE_Y = CURB_H).
  return CURB_H + (level - 1) * FLOOR_HEIGHT;
}

/**
 * Floor View: the building cut open at the selected floor, seen from above and in front so the whole plan reads
 * like an architectural section. `lift` raises the floor when the building is exploded.
 */
export function floorShot(b: LayoutBuilding, level: number, vp: Viewport = DEFAULT_VIEWPORT, lift = 0): Pose {
  const y = floorBase(level) + lift;
  const pts = boxCorners(b.x - b.w / 2, b.x + b.w / 2, y, y + FLOOR_HEIGHT, b.z - b.d / 2, b.z + b.d / 2);
  return poseFromOrbit(fitPoints(pts, 0.55, 0.74, vp, 0.1));
}

/** Office Interior: a close dollhouse view into the floor (the ceiling is hidden from above). */
export function officeShot(b: LayoutBuilding, level: number, vp: Viewport = DEFAULT_VIEWPORT, lift = 0): Pose {
  const y = floorBase(level) + lift;
  const pts = boxCorners(b.x - b.w / 2, b.x + b.w / 2, y, y + 0.5, b.z - b.d / 2, b.z + b.d / 2);
  return poseFromOrbit(fitPoints(pts, 0.6, 0.86, vp, 0.02));
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
 * The entrance reveal: a short descent from high above, sweeping round the district to settle on the overview
 * (or on the visitor's building). Every keyframe but the last stays well above the roofs.
 */
export function arrivalKeyframes(
  boxes: Box[],
  vp: Viewport,
  highlight: LayoutBuilding | null,
  others: Box[] = [],
): Pose[] {
  const end = highlight ? buildingShot(highlight, vp, others) : homeShot(boxes, vp);
  const over = overviewOrbit(boxes, vp);
  const tallest = Math.max(10, ...boxes.map(b => b.top));
  const high = (o: Orbit, theta: number, phi: number, k: number): Pose =>
    poseFromOrbit({ ...o, theta, phi, radius: Math.max(o.radius * k, tallest * 4) });
  return [high(over, over.theta - 1.25, 0.28, 1.7), high(over, over.theta - 0.55, 0.48, 1.25), end];
}

/** Orbit heading that looks at a building's entrance side. */
export function sideHeading(side: '+x' | '-x' | '+z' | '-z'): number {
  return side === '+z' ? 0 : side === '+x' ? Math.PI / 2 : side === '-z' ? Math.PI : -Math.PI / 2;
}
