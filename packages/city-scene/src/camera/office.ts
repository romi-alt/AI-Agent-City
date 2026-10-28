import { type LayoutBuilding } from '../types.ts';
import { boxCorners, DEFAULT_VIEWPORT, fitPoints, type Viewport } from './fit.ts';
import { add, clamp, type V3 } from './math.ts';
import { type Orbit, type OrbitLimits, OFFICE_LIMITS } from './orbit.ts';
import { floorBase, METRES_PER_UNIT, poseFromOrbit, type Pose, sideHeading } from './shots.ts';

/** A wall of the room by the direction it faces away from the centre. */
export type RoomSide = '+x' | '-x' | '+z' | '-z';

/**
 * The office room in world units, as the camera frames it: its floor rectangle, how high its walls stand, and the
 * side of the feature wall (the wall the reference frame keeps at the back centre of the picture).
 */
export interface OfficeRoom {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  floor: number;
  wallTop: number;
  feature: RoomSide;
  /** West and east edges of the team (desks and feature wall), for narrow views that can't fit the whole width. */
  team?: { minX: number; maxX: number };
}

/** Storey-height walls (metres), when no plan says how tall the feature wall is. */
const WALL_M = 3.3;

/** The feature wall from the reference plan (office-local metres, centred on the building), as R2 lays it out. */
export interface FeatureWall {
  x: number;
  z: number;
  w: number;
  h: number;
}

/**
 * The room of an office floor: the building's footprint at the floor's slab, feature wall at the back (-z) so the
 * camera looks in from the entrance side (interior/plan.ts: entrance on +z, the reference plan's back wall at
 * -depth/2). The wall's height comes from the reference plan when given.
 */
export function officeRoom(
  b: LayoutBuilding,
  level: number,
  plan?: { featureWall: FeatureWall; desks: readonly { x: number }[] },
  lift = 0,
): OfficeRoom {
  const floor = floorBase(level) + lift;
  const wall = plan?.featureWall;
  const xs = [...(plan?.desks.map(d => d.x) ?? []), ...(wall ? [wall.x - wall.w / 2, wall.x + wall.w / 2] : [])];
  // A desk's own width and a little floor round it (metres).
  const pad = 1.6;
  return {
    minX: b.x - b.w / 2,
    maxX: b.x + b.w / 2,
    minZ: b.z - b.d / 2,
    maxZ: b.z + b.d / 2,
    floor,
    wallTop: floor + Math.max(WALL_M, wall?.h ?? 0) / METRES_PER_UNIT,
    feature: '-z',
    ...(xs.length
      ? {
          team: {
            minX: Math.max(b.x - b.w / 2, b.x + (Math.min(...xs) - pad) / METRES_PER_UNIT),
            maxX: Math.min(b.x + b.w / 2, b.x + (Math.max(...xs) + pad) / METRES_PER_UNIT),
          },
        }
      : {}),
  };
}

const OPPOSITE: Record<RoomSide, RoomSide> = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' };

/** About 40° down from the horizon (the angle is measured from straight overhead). */
export const OFFICE_PHI = 0.87;

/** Heading that stands on the side opposite the feature wall, so the wall sits at the back centre. */
export function officeHeading(room: OfficeRoom): number {
  return sideHeading(OPPOSITE[room.feature]);
}

/**
 * The office overview: an elevated three-quarter view from the front framing the whole room, its floor and the
 * full height of the feature wall behind, centred in the part of the view the panel leaves visible.
 */
export function officeOverviewOrbit(room: OfficeRoom, vp: Viewport = DEFAULT_VIEWPORT): Orbit {
  // A portrait view (a phone above its bottom sheet) fitting the whole width would shrink the room to a strip:
  // there the team's width is framed instead, the room's depth still in full.
  const portrait = (vp.width - vp.right) / Math.max(1, vp.height - vp.bottom) < 1;
  const span = portrait && room.team && room.feature.endsWith('z') ? room.team : room;
  const floor = boxCorners(span.minX, span.maxX, room.floor, room.floor, room.minZ, room.maxZ);
  const wall = featureWallTop(room).map(([x, y, z]): V3 => [clamp(x, span.minX, span.maxX), y, z]);
  return fitPoints([...floor, ...wall], officeHeading(room), OFFICE_PHI, vp, 0.02);
}

export function officeOverview(room: OfficeRoom, vp: Viewport = DEFAULT_VIEWPORT): Pose {
  return poseFromOrbit(officeOverviewOrbit(room, vp));
}

function featureWallTop(room: OfficeRoom): V3[] {
  const y = room.wallTop;
  switch (room.feature) {
    case '-z':
      return [
        [room.minX, y, room.minZ],
        [room.maxX, y, room.minZ],
      ];
    case '+z':
      return [
        [room.minX, y, room.maxZ],
        [room.maxX, y, room.maxZ],
      ];
    case '-x':
      return [
        [room.minX, y, room.minZ],
        [room.minX, y, room.maxZ],
      ];
    case '+x':
      return [
        [room.maxX, y, room.minZ],
        [room.maxX, y, room.maxZ],
      ];
  }
}

/**
 * A chosen desk, seen from the same side as the overview and a little lower, close enough that the person and
 * their screens read: the move is a dolly in rather than a swing round, so a short ease stays comfortable.
 */
export function officeDeskShot(desk: V3, room: OfficeRoom): Pose {
  return poseFromOrbit({ target: add(desk, [0, 0.05, 0]), theta: officeHeading(room), phi: 0.9, radius: 1.7 });
}

/** Seconds for moves inside one office (choosing a desk, back to the room): short, eased, interruptible. */
export const OFFICE_EASE_SECONDS = 0.8;

/**
 * Office limits: never down to the floor's level (the polar angle stops well above the horizon) and never so far
 * out that the room becomes a speck; the far limit follows the room's own overview.
 */
export function officeLimits(overview: Orbit): OrbitLimits {
  return {
    ...OFFICE_LIMITS,
    minRadius: 0.8,
    maxRadius: Math.max(4, overview.radius * 1.6),
    minPhi: 0.2,
    maxPhi: 1.2,
  };
}

/**
 * Keep a look-at point over the room, with a quarter of its size to spare (framings centre on the picture, which
 * can put the look-at point a little past the front edge), so a pan can't drift the office off screen.
 */
export function clampToRoom(target: V3, room: OfficeRoom): V3 {
  const mx = (room.maxX - room.minX) * 0.25;
  const mz = (room.maxZ - room.minZ) * 0.25;
  return [
    clamp(target[0], room.minX - mx, room.maxX + mx),
    target[1],
    clamp(target[2], room.minZ - mz, room.maxZ + mz),
  ];
}
