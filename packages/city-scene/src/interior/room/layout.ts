import type { Rect } from '../plan.ts';

/**
 * Where the room's zones sit in the reference-look office (Office mode), in office-local metres: x east, z south,
 * centred on the building, with the camera on the +z side. Pure, so desks (R2) and the camera (R3) can use the same
 * rectangles, and tests can check them in node.
 *
 * Proportions follow the legacy floor view (apps/legacy/src/scene/officeView.ts, a 30 × 22 room): leadership
 * corner back-left, team rug in the middle-right, lounge front-left, round meeting table front-right, the timber
 * feature wall with the task board on the back glass and a freestanding live screen at the right.
 */
export interface RoomLayout {
  width: number;
  depth: number;
  /** Height of the glass walls (the room has no ceiling: it is seen from above, like a diorama). */
  glassHeight: number;
  /** Height of the timber handrail along the glass. */
  railHeight: number;
  /** Leadership corner rug (peach border, cream inside). */
  leadRug: Rect;
  /** The team rug: R2 places the team's desks on it. */
  teamRug: Rect;
  /** Lounge rug (coral outline) with the yellow sofa. */
  loungeRug: Rect;
  /** The teal ring around the round meeting table. */
  meeting: { x: number; z: number; radius: number };
  /** The slatted timber wall on the back glass: centre of its front face, width and height. */
  featureWall: { x: number; z: number; w: number; h: number };
  /** The freestanding live screen: floor position and yaw (it turns towards the room). */
  liveScreen: { x: number; z: number; yaw: number };
  /** Bookshelf wall against the west glass. */
  library: { x: number; z: number; w: number };
  /** Potted plants (floor positions and size factor). */
  plants: { x: number; z: number; size: number }[];
}

/** Width of the border band on each rug, in metres. */
export const RUG_BORDER = 0.3;

/** A rectangle from edges given as fractions of the room (-0.5 … 0.5 on each axis). */
function span(W: number, D: number, u0: number, u1: number, v0: number, v1: number): Rect {
  return { x: ((u0 + u1) / 2) * W, z: ((v0 + v1) / 2) * D, w: (u1 - u0) * W, d: (v1 - v0) * D };
}

export function roomLayout(width: number, depth: number): RoomLayout {
  const W = width;
  const D = depth;
  const wallW = Math.min(13, W * 0.38);
  const radius = Math.min(W, D) * 0.105;
  return {
    width: W,
    depth: D,
    glassHeight: 3.4,
    railHeight: 1.1,
    leadRug: span(W, D, -0.46, -0.17, -0.31, -0.05),
    teamRug: span(W, D, -0.12, 0.38, -0.28, 0.17),
    loungeRug: span(W, D, -0.46, -0.2, 0.12, 0.42),
    meeting: { x: 0.3 * W, z: 0.34 * D, radius },
    featureWall: { x: 0.04 * W, z: -D / 2 + 0.55, w: wallW, h: 3.9 },
    liveScreen: { x: 0.44 * W, z: -0.2 * D, yaw: -0.65 },
    library: { x: -W / 2 + 0.45, z: 0.0 * D, w: Math.min(4.6, D * 0.16) },
    plants: [
      { x: -W / 2 + 1.0, z: -D / 2 + 1.0, size: 1.25 },
      { x: W / 2 - 1.0, z: -D / 2 + 1.0, size: 1.2 },
      { x: -W / 2 + 1.0, z: D / 2 - 1.0, size: 1.1 },
      { x: W / 2 - 1.0, z: D * 0.05, size: 1.0 },
      { x: 0.04 * W - wallW / 2 - 0.9, z: -D / 2 + 0.95, size: 0.95 },
      { x: 0.04 * W + wallW / 2 + 0.9, z: -D / 2 + 0.95, size: 0.9 },
    ],
  };
}

/** The rug a desk zone belongs to, for desk placement: 'lead' for leadership and people, 'team' for the rest. */
export function rugFor(layout: RoomLayout, zone: 'lead' | 'team'): Rect {
  return zone === 'lead' ? layout.leadRug : layout.teamRug;
}
