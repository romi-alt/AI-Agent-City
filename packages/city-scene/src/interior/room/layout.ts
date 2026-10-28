import type { ReferencePlan, Rect } from '../plan.ts';

/**
 * Where the room's zones sit in the reference-look office (Office mode), in office-local metres: x east, z south,
 * centred on the building, with the camera on the +z side. Pure, so desks (R2) and the camera (R3) can use the same
 * rectangles, and tests can check them in node.
 *
 * Proportions follow the legacy floor view (apps/legacy/src/scene/officeView.ts, a 30 × 22 room): leadership
 * corner back-left, team rug in the middle-right, lounge front-left, round meeting table front-right, the timber
 * feature wall with the task board on the back glass and a freestanding live screen at the right.
 * Zone rectangles come from R2's `planReferenceOffice`, so rugs and desks always line up.
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
  meeting: { x: number; z: number; radius: number; table: number };
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

/**
 * The room around R2's reference plan: rugs, meeting ring, feature wall, live screen and corner plants come from the
 * plan (so they line up with the desks); glass height, handrail, the bookshelf wall and extra plants are the room's.
 * Heights follow the legacy room (5-unit glass, rail at 1.1) at the plan's scale.
 */
export function roomLayout(plan: ReferencePlan): RoomLayout {
  const W = plan.width;
  const D = plan.depth;
  const s = plan.scale;
  const f = plan.featureWall;
  const lead = plan.leadRug;
  const lounge = plan.loungeRug;
  // The bookshelf stands on the west glass between the leadership and lounge rugs.
  const gapFrom = lead.z + lead.d / 2;
  const gapTo = lounge.z - lounge.d / 2;
  return {
    width: W,
    depth: D,
    glassHeight: 5 * s,
    railHeight: 1.1 * s,
    leadRug: rectOf(lead),
    teamRug: rectOf(plan.teamRug),
    loungeRug: rectOf(lounge),
    meeting: { x: plan.meeting.x, z: plan.meeting.z, radius: plan.meeting.outer, table: plan.meeting.table },
    featureWall: { x: f.x, z: f.z + 0.25 * s, w: f.w, h: f.h },
    liveScreen: plan.liveScreen,
    library: { x: -W / 2 + 0.45, z: (gapFrom + gapTo) / 2, w: Math.max(2.4, Math.min(4.6, gapTo - gapFrom - 0.6)) },
    plants: [
      ...plan.plants.map(p => ({ ...p, size: 1.25 })),
      { x: W / 2 - 1.0, z: D / 2 - 1.0, size: 1.1 },
      { x: f.x - f.w / 2 - 0.9, z: -D / 2 + 0.95, size: 0.95 },
      { x: f.x + f.w / 2 + 0.9, z: -D / 2 + 0.95, size: 0.9 },
    ],
  };
}

function rectOf(r: Rect): Rect {
  return { x: r.x, z: r.z, w: r.w, d: r.d };
}

/** The rug a desk zone belongs to, for desk placement: 'lead' for leadership and people, 'team' for the rest. */
export function rugFor(layout: RoomLayout, zone: 'lead' | 'team'): Rect {
  return zone === 'lead' ? layout.leadRug : layout.teamRug;
}
