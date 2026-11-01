import type { QualityLevel } from '../../types.ts';
import { seeded } from '../textures.ts';
import type { RoomLayout } from './layout.ts';

/**
 * Pure placement and data for the office's extra detail (everything that is not the room shell, rugs, desks or
 * people): the back-wall panels with the CRM and content screens, the coffee corner, the ledge under the task board,
 * wall art, lamps, plants. Kept free of three.js and the DOM so tests can check the layout in node.
 *
 * Coordinates are office-local metres (x east, z south, centred on the floor, back glass at z = -depth / 2). Spots
 * are first written in the legacy room's units (a 30 × 22 room) and multiplied by the room's scale, so the detail
 * lines up with the zones the plan placed in the same way.
 */

/**
 * How much detail the room carries. 'low' keeps the room's few big pieces; 'full' (balanced) adds the furniture
 * detail and wall screens; 'rich' (ultra) adds the small things (mugs, fruit, papers) and finer geometry.
 */
export type DetailLevel = 'low' | 'full' | 'rich';

export function detailLevelFor(quality: QualityLevel): DetailLevel {
  return quality === 'ultra' ? 'rich' : quality === 'balanced' ? 'full' : 'low';
}

export type PlantType = 'bush' | 'snake' | 'monstera' | 'palm';

export interface PlantSpot {
  x: number;
  z: number;
  /** Height of the floor it stands on (a ledge or counter top), metres. */
  y: number;
  size: number;
  type: PlantType;
}

export type ArtKind = 'hills' | 'abstract' | 'chart';

export interface WallArt {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  art: ArtKind;
}

/** A freestanding plaster panel in front of the back glass, carrying a screen and pictures. */
export interface WallPanel {
  id: 'crm' | 'content';
  /** Centre of the panel's face. */
  x: number;
  z: number;
  w: number;
  h: number;
  /** The screen on it: centre height and size. */
  screen: { y: number; w: number; h: number };
}

export interface DetailLayout {
  panels: WallPanel[];
  art: WallArt[];
  coffee: { x: number; z: number; w: number; d: number };
  ledge: { x: number; z: number; w: number };
  printer: { x: number; z: number; yaw: number };
  cooler: { x: number; z: number; yaw: number };
  cabinet: { x: number; z: number; yaw: number };
  lamps: { x: number; z: number }[];
  plants: PlantSpot[];
  /** Back-wall pieces left to right as [from, to] spans along x, for overlap checks. */
  backWall: { id: string; from: number; to: number }[];
}

/** Thickness of the back panels and the ledge's depth, metres. */
export const PANEL_DEPTH = 0.16;

export function detailLayout(room: RoomLayout): DetailLayout {
  const s = room.scale;
  const D = room.depth;
  const f = room.featureWall;
  // Legacy (x, z) to office metres, like the plan: centred on x, back glass at legacy z = -11.
  const at = (x: number, z: number): [number, number] => [x * s, -D / 2 + (z + 11) * s];
  const backZ = f.z;

  const panelH = Math.min(f.h * 0.84, 4.5 * s);
  const crmX = -8.1 * s;
  const crmW = 6.6 * s;
  const contentX = 10.5 * s;
  const contentW = 6.6 * s;
  const crmScreen = { y: panelH * 0.62, w: 4.2 * s, h: 2.36 * s };
  const contentScreen = { y: panelH * 0.62, w: 4.2 * s, h: 1.68 * s };
  const panels: WallPanel[] = [
    { id: 'crm', x: crmX, z: backZ, w: crmW, h: panelH, screen: crmScreen },
    { id: 'content', x: contentX, z: backZ, w: contentW, h: panelH, screen: contentScreen },
  ];

  const artZ = backZ + PANEL_DEPTH / 2 + 0.03;
  const art: WallArt[] = [
    { x: crmX - 2.75 * s, y: panelH * 0.62, z: artZ, w: 0.85 * s, h: 1.15 * s, art: 'hills' },
    { x: crmX + 2.75 * s, y: panelH * 0.62, z: artZ, w: 0.85 * s, h: 1.15 * s, art: 'abstract' },
    { x: contentX + 2.8 * s, y: panelH * 0.62, z: artZ, w: 0.8 * s, h: 1.1 * s, art: 'chart' },
  ];

  const [cx, cz] = at(-13.4, -10.3);
  const coffee = { x: cx, z: cz, w: 3.0 * s, d: 0.75 * s };
  const ledge = { x: f.x, z: f.z + 0.5 * s, w: f.w * 0.88 };

  const [px, pz] = at(14.3, -2.4);
  const [wx, wz] = at(14.4, -0.9);
  const [kx, kz] = at(14.4, 1.4);
  const [l1x, l1z] = at(-11.9, 8.9);
  const [l2x, l2z] = at(14.4, 8.0);

  const plant = (lx: number, lz: number, size: number, type: PlantType, y = 0): PlantSpot => {
    const [x, z] = at(lx, lz);
    return { x, z, y, size, type };
  };
  const ledgeTop = 0.84 * s;
  const plants: PlantSpot[] = [
    plant(-14.4, 10.1, 1.1, 'monstera'),
    plant(14.5, 10.2, 1.2, 'palm'),
    plant(14.5, -10.2, 1.2, 'palm'),
    plant(-12.6, 9.9, 0.9, 'bush'),
    plant(14.5, 3.9, 0.9, 'snake'),
    plant(-14.2, -4.4, 0.85, 'bush'),
  ];
  // On the ledge under the task board: a bush and a snake plant at its ends, books between them.
  plants.push(
    { x: ledge.x - ledge.w / 2 + 0.7 * s, z: ledge.z, y: ledgeTop, size: 0.6 * s, type: 'bush' },
    { x: ledge.x + ledge.w / 2 - 0.7 * s, z: ledge.z, y: ledgeTop, size: 0.6 * s, type: 'snake' },
  );

  return {
    panels,
    art,
    coffee,
    ledge,
    printer: { x: px, z: pz, yaw: -Math.PI / 2 },
    cooler: { x: wx, z: wz, yaw: -Math.PI / 2 },
    cabinet: { x: kx, z: kz, yaw: -Math.PI / 2 },
    lamps: [
      { x: l1x, z: l1z },
      { x: l2x, z: l2z },
    ],
    plants,
    backWall: [
      { id: 'coffee', from: coffee.x - coffee.w / 2, to: coffee.x + coffee.w / 2 },
      { id: 'crm', from: crmX - crmW / 2, to: crmX + crmW / 2 },
      { id: 'feature', from: f.x - f.w / 2, to: f.x + f.w / 2 },
      { id: 'content', from: contentX - contentW / 2, to: contentX + contentW / 2 },
    ],
  };
}

// ── Books ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ShelfBook {
  /** Along the shelf from its left end, metres. */
  x: number;
  /** Height of the shelf the book stands on (its row). */
  row: number;
  w: number;
  h: number;
  d: number;
  /** Index into the book colours. */
  colour: number;
  /** Lean in radians (a book tipped against its neighbour), 0 for most. */
  lean: number;
}

/**
 * Books for a shelf: each row filled left to right with spines of varied height, now and then a gap and now and
 * then one leaning on its neighbour (as the legacy room's shelves). Deterministic in `seed`.
 */
export function shelfBooks(seed: number, width: number, rows: number, rowHeight: number, colours: number): ShelfBook[] {
  const rnd = seeded(seed);
  const out: ShelfBook[] = [];
  const maxH = rowHeight - 0.1;
  for (let r = 0; r < rows; r++) {
    let x = 0.1;
    while (x < width - 0.2) {
      if (rnd() < 0.12) {
        x += 0.25 + rnd() * 0.3;
        continue;
      }
      const w = 0.05 + rnd() * 0.06;
      const h = Math.min(maxH, 0.28 + rnd() * 0.18);
      const lean = rnd() < 0.08 ? 0.25 : 0;
      out.push({
        x: x + w / 2,
        row: r,
        w,
        h,
        d: 0.26 + rnd() * 0.08,
        colour: Math.floor(rnd() * colours),
        lean,
      });
      x += w + 0.008 + (lean ? 0.08 : 0);
    }
  }
  return out;
}

// ── Clock, accents, screen data ───────────────────────────────────────────────────────────────────────────────

/** Hand angles in radians clockwise from twelve for an analogue clock showing hours and minutes. */
export function clockHands(hours: number, minutes: number): { hour: number; minute: number } {
  const m = ((minutes % 60) + 60) % 60;
  const h = (((hours % 12) + 12) % 12) + m / 60;
  return { hour: (h / 12) * Math.PI * 2, minute: (m / 60) * Math.PI * 2 };
}

/** The accent a desk's mug, lamp shade and drawer pulls take, one per agent slot (the legacy room's agent colours). */
export const DESK_ACCENTS = [
  '#e8604c',
  '#3fb6a8',
  '#f5b83d',
  '#6aa8ff',
  '#b78be6',
  '#7cc36b',
  '#f29c38',
  '#e58bb0',
] as const;

export function deskAccent(slot: number): string {
  return DESK_ACCENTS[((slot % DESK_ACCENTS.length) + DESK_ACCENTS.length) % DESK_ACCENTS.length]!;
}

/** The seven day cards of the content-week wall. */
export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Stages of the CRM wall's pipeline, in order. */
export const PIPELINE_STAGES = ['New lead', 'Contacted', 'Booked', 'Proposal', 'Won'] as const;

/**
 * Bar lengths (0..1) for the CRM wall's pipeline sketch: a funnel that narrows stage by stage. The wall is a
 * picture of a pipeline, labelled as a sample; it never shows a made-up count.
 */
export function funnelShape(stages: number): number[] {
  return Array.from({ length: stages }, (_, i) => Math.round((1 - (i / Math.max(1, stages)) * 0.78) * 100) / 100);
}

/** What a day card says: the channel it posts to (a fixed rotation), never an invented figure. */
export const WEEK_CHANNELS = ['Email', 'Social', 'Video', 'Social', 'Email', 'Story', 'Rest'] as const;

// ── The task board's frame ────────────────────────────────────────────────────────────────────────────────────

/** Where the task board sits on the feature wall: centre height and size, clear of the ledge beneath it. */
export function featureBoard(f: { w: number; h: number }, scale: number): { w: number; h: number; y: number } {
  const w = f.w * 0.78;
  const h = Math.min(f.h * 0.5, w * 0.43);
  return { w, h, y: 1.05 * scale + h / 2 };
}

// ── People ────────────────────────────────────────────────────────────────────────────────────────────────────

export type HairStyle = 'side' | 'quiff' | 'buzz' | 'long' | 'bob' | 'bun' | 'pony';

export interface PersonLook {
  female: boolean;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  bottom: string;
  shoes: string;
  /** A tie colour, or null. */
  tie: string | null;
  /** A jacket colour for the lapels, or null. */
  jacket: string | null;
  glasses: boolean;
  beard: boolean;
  skirt: boolean;
}

const SKINS = ['#f1c7a5', '#e0ac85', '#c98e66', '#a86f4c', '#8a5536', '#f5d3b8'];
const HAIRS = ['#1d1612', '#3a2618', '#5b3a22', '#8a5a2b', '#c99a5b', '#2a2a2e', '#6b2f1f'];
const MALE_STYLES: HairStyle[] = ['side', 'quiff', 'buzz'];
const FEMALE_STYLES: HairStyle[] = ['long', 'bob', 'bun', 'pony'];
const BOTTOMS = ['#2b2f3a', '#3a3f4f', '#4a4036', '#2f3b4f'];
const TIES = ['#e8604c', '#26324d', '#3fb6a8', '#f5b83d'];

/**
 * A person's look from their seat number: skin, hair and clothes drawn from the legacy room's palettes, so every
 * desk has a different face. Deterministic (no randomness), and it never depends on who the person is: names and
 * roles are not used to pick looks.
 */
export function personLook(seed: number): PersonLook {
  const rnd = seeded(seed * 97 + 13);
  const female = rnd() < 0.5;
  const styles = female ? FEMALE_STYLES : MALE_STYLES;
  const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)]!;
  const skirt = female && rnd() < 0.4;
  return {
    female,
    skin: pick(SKINS),
    hair: pick(HAIRS),
    hairStyle: pick(styles),
    bottom: pick(BOTTOMS),
    shoes: rnd() < 0.5 ? '#1c1c20' : '#f4eee6',
    tie: !female && rnd() < 0.35 ? pick(TIES) : null,
    jacket: rnd() < 0.3 ? pick(['#26324d', '#4a4036', '#2b2f3a']) : null,
    glasses: rnd() < 0.3,
    beard: !female && rnd() < 0.25,
    skirt,
  };
}
