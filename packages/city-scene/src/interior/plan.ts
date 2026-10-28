import { METRES_PER_UNIT, floorBase } from '../camera/shots.ts';
import type { V3 } from '../camera/math.ts';
import type { BuildingKind, LayoutBuilding } from '../types.ts';

/**
 * The office floor plan, in metres, centred on the building (x east, z south: the entrance and the default camera
 * are on the +z side). Pure so the layout (no overlaps, every desk inside the glass) is tested in node.
 */

export type OfficeVariant = 'office' | 'showroom' | 'classroom';

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Workstation {
  /** Index into the occupants (the floor's desks or the host's agents); the rest are free desks. */
  slot: number;
  x: number;
  z: number;
  /** Yaw of the seated person's forward direction: (sin f, cos f) on x/z. 0 looks south (+z). */
  facing: number;
}

export interface OfficePlan {
  variant: OfficeVariant;
  width: number;
  depth: number;
  /** Floor to ceiling (the slab and plenum above make up the rest of the storey). */
  ceiling: number;
  storey: number;
  core: Rect;
  reception: { x: number; z: number };
  lounge: Rect;
  meeting: Rect;
  /** The team area: workstations (office, showroom) or classroom rows (classroom). */
  work: Rect;
  workstations: Workstation[];
  plants: { x: number; z: number; size: number }[];
}

export function variantFor(kind: BuildingKind): OfficeVariant {
  if (kind === 'dealership') return 'showroom';
  if (kind === 'training') return 'classroom';
  return 'office';
}

const DESK_W = 1.6;
const DESK_D = 0.8;
/** Distance from a desk's centre to its sitter's chair. */
export const SEAT_OFFSET = 0.78;

export function planOffice(widthM: number, depthM: number, occupants: number, variant: OfficeVariant): OfficePlan {
  const W = widthM;
  const D = depthM;
  const storey = 1.4 * METRES_PER_UNIT;
  const core: Rect = { x: 0, z: -D * 0.2, w: Math.min(9, W * 0.27), d: Math.min(6.5, D * 0.2) };
  const reception = { x: 0, z: core.z + core.d / 2 + 2.3 };
  const sideW = (W - core.w) / 2 - 2.2;
  const lounge: Rect = { x: -(core.w / 2 + 1 + sideW / 2), z: core.z - 0.2, w: sideW, d: Math.min(D * 0.36, 11) };
  const meeting: Rect = { x: core.w / 2 + 1 + sideW / 2, z: core.z - 0.4, w: sideW, d: Math.min(D * 0.34, 10) };
  const workTop = Math.max(reception.z + 2.4, lounge.z + lounge.d / 2 + 1.2, meeting.z + meeting.d / 2 + 1.2);
  const work: Rect = { x: 0, z: (workTop + (D / 2 - 1.6)) / 2, w: W - 4, d: D / 2 - 1.6 - workTop };
  const workstations = variant === 'classroom' ? classroom(work, occupants) : pods(work, occupants);
  const plants = [
    { x: -W / 2 + 1.3, z: -D / 2 + 1.3, size: 1.2 },
    { x: W / 2 - 1.3, z: D / 2 - 1.3, size: 1.1 },
    { x: -W / 2 + 1.3, z: D / 2 - 1.3, size: 1.25 },
    { x: reception.x - 3.6, z: reception.z - 0.6, size: 0.9 },
    { x: reception.x + 3.6, z: reception.z - 0.6, size: 0.95 },
    { x: W / 2 - 1.2, z: work.z - work.d / 2 - 0.4, size: 0.85 },
    { x: -W / 2 + 1.2, z: work.z - work.d / 2 - 0.4, size: 0.9 },
  ];
  return {
    variant,
    width: W,
    depth: D,
    ceiling: 3.3,
    storey,
    core,
    reception,
    lounge,
    meeting,
    work,
    workstations,
    plants,
  };
}

/**
 * Pods of four desks (two facing two across a low screen), front rows first so occupied desks are the ones the
 * camera sees best. At least two pods, so a small team still sits in a believable office.
 */
function pods(work: Rect, occupants: number): Workstation[] {
  const podW = DESK_W * 2 + 1.1;
  const podD = DESK_D * 2 + SEAT_OFFSET * 2 + 1.6;
  const cols = Math.max(1, Math.floor(work.w / podW));
  const rows = Math.max(1, Math.floor(work.d / podD));
  // A believable team area: at least four pods; up to eight people each get a pod of their own (so their name
  // tags stay apart), larger teams share pods with a few free desks left over.
  const podCount = Math.min(cols * rows, Math.max(4, Math.min(occupants, 8), Math.ceil(occupants / 4) + 1));
  // Fill a compact block from the centre out (columns nearest the middle first, front row before back row), so
  // the occupied desks sit together where the camera looks.
  const centre = (cols - 1) / 2;
  const cells: { c: number; r: number }[] = [];
  const colOrder = [...Array(cols).keys()].sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre) || a - b);
  for (let i = 0; i < colOrder.length; i += 2) {
    const pair = colOrder.slice(i, i + 2).sort((a, b) => a - b);
    for (let r = rows - 1; r >= 0; r--) for (const c of pair) cells.push({ c, r });
  }
  const used = cells.slice(0, podCount);
  const usedCols = [...new Set(used.map(u => u.c))].sort((a, b) => a - b);
  const usedRows = [...new Set(used.map(u => u.r))].sort((a, b) => a - b);
  const span = (usedCols.length - 1) * podW;
  const spanZ = (usedRows.length - 1) * podD;
  const podSeats = used.map(({ c, r }) => {
    const px = work.x - span / 2 + usedCols.indexOf(c) * podW;
    const pz = work.z - spanZ / 2 + usedRows.indexOf(r) * podD;
    const seats: [number, number, number][] = [
      [px - DESK_W / 2, pz + DESK_D / 2, Math.PI],
      [px + DESK_W / 2, pz - DESK_D / 2, 0],
      [px + DESK_W / 2, pz + DESK_D / 2, Math.PI],
      [px - DESK_W / 2, pz - DESK_D / 2, 0],
    ];
    return seats;
  });
  // Slots go round the pods (one seat per pod, then the next), so a small team spreads across the room instead of
  // crowding one pod, and their name tags don't overlap.
  const out: Workstation[] = [];
  let slot = 0;
  for (let s = 0; s < 4; s++) {
    for (const seats of podSeats) {
      const [x, z, facing] = seats[s]!;
      out.push({ slot: slot++, x, z, facing });
    }
  }
  return out;
}

/** Classroom: rows of two-seat tables facing the screen at the front (north side of the work area). */
function classroom(work: Rect, occupants: number): Workstation[] {
  const rowGap = 2.4;
  const seatW = 1.4;
  const perRow = Math.max(2, Math.floor((work.w - 3) / (seatW + 0.25)));
  const rows = Math.max(1, Math.min(4, Math.floor((work.d - 3) / rowGap)));
  const total = Math.min(perRow * rows, Math.max(occupants, 12));
  const out: Workstation[] = [];
  for (let i = 0; i < total; i++) {
    const r = Math.floor(i / perRow);
    const k = i % perRow;
    // An aisle down the middle.
    const half = perRow / 2;
    const offset = (k - (perRow - 1) / 2) * (seatW + 0.25) + (k < half ? -0.5 : 0.5);
    out.push({ slot: i, x: work.x + offset, z: work.z - work.d / 2 + 3 + r * rowGap, facing: Math.PI });
  }
  return out;
}

/** Where a person sits at a workstation (metres, office-local). */
export function seatPosition(w: Workstation): [number, number] {
  return [w.x - Math.sin(w.facing) * SEAT_OFFSET, w.z - Math.cos(w.facing) * SEAT_OFFSET];
}

/** Office-local metres to world units for a building's floor. */
export function officeToWorld(b: LayoutBuilding, level: number, x: number, y: number, z: number): V3 {
  return [b.x + x / METRES_PER_UNIT, floorBase(level) + y / METRES_PER_UNIT, b.z + z / METRES_PER_UNIT];
}

export function officeSize(b: LayoutBuilding): { width: number; depth: number } {
  return { width: b.w * METRES_PER_UNIT, depth: b.d * METRES_PER_UNIT };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.z - b.z) * 2 < a.d + b.d;
}

// ── Reference office (the Office view's toy-diorama look) ─────────────────────────────────────────────────────
//
// The legacy office scene this look comes from was built in its own units on a 30 × 22 room. Positions here are
// those coordinates scaled uniformly to the floor (one factor, so desks and people keep their toy proportions),
// with the back wall on the floor's back glass: any spare depth opens up in front, on the camera side.

/** Who sits at a desk, as far as placement cares: people and leadership sit on the corner rug. */
export interface SeatKind {
  kind: 'ai' | 'human';
  lead: boolean;
}

export interface RefRug extends Rect {
  /** Border colour; the inside is cream. */
  border: string;
}

export interface RefDesk {
  /** Index into the occupants. */
  slot: number;
  x: number;
  z: number;
  /** The sitter faces the back wall (north), with the chair on the camera side. */
  facing: number;
  zone: 'lead' | 'team';
}

export interface ReferencePlan {
  width: number;
  depth: number;
  /** Metres per legacy unit: every desk, chair and person is drawn at this scale. */
  scale: number;
  leadRug: RefRug;
  teamRug: RefRug;
  loungeRug: RefRug;
  /** The teal ring round the meeting table. */
  meeting: { x: number; z: number; inner: number; outer: number; table: number };
  /** The slatted feature wall at the back, centred on x. */
  featureWall: { x: number; z: number; w: number; h: number };
  liveScreen: { x: number; z: number; yaw: number };
  plants: { x: number; z: number }[];
  desks: RefDesk[];
}

/** Desk spacing in legacy units: along a row, between rows, and between lead desks. */
const REF_COL = 4.6;
const REF_ROW = 5;
const REF_LEAD_COL = 4.2;
const REF_LEAD_ROW = 3.4;
const REF_PER_ROW = 4;
const REF_LEAD_PER_ROW = 2;

/** Leadership roles sit with the people on the corner rug. */
export function isLeadRole(role: string): boolean {
  return /\b(ceo|coo|cfo|founder|owner|director|head|lead|manager|gm)\b/i.test(role);
}

export function planReferenceOffice(widthM: number, depthM: number, seats: readonly SeatKind[]): ReferencePlan {
  const s = Math.min(widthM / 30, depthM / 22);
  // Legacy (x, z) to floor metres: centred on x, the legacy back wall (z = -11) on the floor's back glass.
  const at = (x: number, z: number): [number, number] => [x * s, -depthM / 2 + (z + 11) * s];
  const rect = (x: number, z: number, w: number, d: number, border: string): RefRug => {
    const [cx, cz] = at(x, z);
    return { x: cx, z: cz, w: w * s, d: d * s, border };
  };
  const lead = seats.map((k, slot) => ({ k, slot })).filter(e => e.k.kind === 'human' || e.k.lead);
  const team = seats.map((k, slot) => ({ k, slot })).filter(e => !(e.k.kind === 'human' || e.k.lead));
  // Room in front of the back wall for the team rows, however deep the floor is.
  const frontLimit = (depthM / 2 / s) * 2 - 11 - 3;
  const teamRows = Math.max(1, Math.ceil(team.length / REF_PER_ROW));
  const rowGap = Math.min(REF_ROW, teamRows > 1 ? (frontLimit - -2) / (teamRows - 1) : REF_ROW);
  const desks: RefDesk[] = [];
  lead.forEach(({ slot }, i) => {
    const row = Math.floor(i / REF_LEAD_PER_ROW);
    const col = i % REF_LEAD_PER_ROW;
    const [x, z] = at(-11.5 + col * REF_LEAD_COL, -5.6 + row * REF_LEAD_ROW);
    desks.push({ slot, x, z, facing: Math.PI, zone: 'lead' });
  });
  team.forEach(({ slot }, i) => {
    const row = Math.floor(i / REF_PER_ROW);
    const col = i % REF_PER_ROW;
    const inRow = Math.min(REF_PER_ROW, team.length - row * REF_PER_ROW);
    const [x, z] = at(4 + (col - (inRow - 1) / 2) * REF_COL, -2 + row * rowGap);
    desks.push({ slot, x, z, facing: Math.PI, zone: 'team' });
  });
  const leadRows = Math.max(1, Math.ceil(lead.length / REF_LEAD_PER_ROW));
  const leadDepth = Math.max(6.5, 3.2 + leadRows * REF_LEAD_ROW);
  const teamDepth = Math.max(11, 2.5 + (teamRows - 1) * rowGap + 4);
  const roomFront = depthM / s - 11;
  // The meeting table sits in front of the team rug where the floor is deep enough (on a shallow floor its ring
  // tucks under the rug's corner, as in the legacy room).
  const [mx, mz] = at(11, Math.min(Math.max(7, -4.5 + teamDepth + 3.5), roomFront - 3.4));
  const [wx, wz] = at(1, -11 + 0.3);
  const [sx, sz] = at(12.2, -5.5);
  return {
    width: widthM,
    depth: depthM,
    scale: s,
    leadRug: rect(-9.5, -7.75 + leadDepth / 2, 9, leadDepth, '#e3a868'),
    teamRug: rect(4, -4.5 + teamDepth / 2, 19, teamDepth, '#e3a868'),
    loungeRug: rect(-10, Math.min(7.5, roomFront - 3), 8, 5, '#e9806b'),
    meeting: { x: mx, z: mz, inner: 2.6 * s, outer: 3.2 * s, table: 1.6 * s },
    featureWall: { x: wx, z: wz, w: 11 * s, h: 5.5 * s },
    liveScreen: { x: sx, z: sz, yaw: -0.6 },
    plants: [at(-13.5, -9.5), at(13.5, -9.5), at(-13.5, 9.5)].map(([x, z]) => ({ x, z })),
    desks,
  };
}

/** Where the person at a reference desk sits (metres, office-local): on the camera side, 1.05 legacy units out. */
export function refSeatPosition(d: RefDesk, scale: number): [number, number] {
  return [d.x - 0.2 * scale, d.z + 1.0 * scale];
}
