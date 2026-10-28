/**
 * The generated city around the district (X04 D2), as plain data: where every surround building stands, how big it
 * is and how it looks. Pure and seeded, so the same layout always builds the same city and tests run without WebGL.
 *
 *  - Ring 1, the blocks next to the district: continuous street walls of 4–7 floor pastel mid-rises, edge to edge
 *    along every street, each with a shopfront, an awning and a roof item.
 *  - Ring 2, the middle distance: a few simple boxes per block, no props.
 *  - Ring 3, the horizon: sparse tall pale towers, mostly lost in fog.
 *
 * Everything stays inside the blocks between `cityRoads` and out of every `heroClearance` rectangle (the district and
 * the client lots), so nothing ever lands on a road, a client building or the hero view of the district.
 */
import type { ClearRect, CityRoads, Rect } from '../../streets/extent.ts';
import { FLOOR_HEIGHT } from '../../types.ts';

/** Ring 1 pastels (owner brief). */
export const PASTELS = [
  '#C8503F',
  '#E98A6B',
  '#F0B84A',
  '#8FD3A6',
  '#4FB6A6',
  '#F2A2B8',
  '#7BAAD6',
  '#9B8BD6',
] as const;
/** Ring 3 towers: pale, between these two. */
export const TOWER_PALE = ['#D9DEE6', '#EEF1F5'] as const;
/** Awning colours (the legacy decorBuilding set, plus white-friendly greens). */
export const AWNINGS = ['#e74c3c', '#2e86de', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400', '#2f9e6e'];

/** Facade tiles in the texture array (see facade.ts). Ring 1 picks among the first three. */
export const STYLE = { classic: 0, brick: 1, ribbon: 2, shop: 3, plain: 4, tower: 5 } as const;
export type StyleIndex = (typeof STYLE)[keyof typeof STYLE];

export type RoofItem = 'tank' | 'ac' | 'garden' | 'antenna';
export const ROOF_ITEMS: readonly RoofItem[] = ['tank', 'ac', 'garden', 'antenna'];

/** Building faces start this far from a road centre line: road (2) + curb + a sidewalk people walk on (2.7). */
export const SETBACK = 3.9;

/**
 * One generated building: a box standing on the ground. Local +z is its street front; `yaw` turns it there.
 * `w` is the frontage (local x), `d` the depth (local z), `h` the height.
 */
export interface SurroundBox {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  yaw: number;
  color: string;
  style: StyleIndex;
  /** Ground floor is a shopfront (Ring 1 street walls). */
  shop: boolean;
  /** 0..1, picks the night-lit window pattern and varies details. */
  seed: number;
}

export interface Ring1Building extends SurroundBox {
  floors: number;
  awning: string;
  /** Striped (with white) or plain canvas. */
  stripes: boolean;
  /** Corner buildings also get an awning on the side street (local +x when 1, -x when -1, none when 0). */
  sideAwning: -1 | 0 | 1;
  roof: RoofItem;
  /** Roof item position in the building's local frame (x, z), within the roof. */
  roofAt: [number, number];
}

export interface SurroundPlan {
  ring1: Ring1Building[];
  /** Ring 1 courtyard fillers: low back buildings closing the middle of each block, seen from above. */
  backs: SurroundBox[];
  ring2: SurroundBox[];
  ring3: SurroundBox[];
}

export interface SurroundOptions {
  /** World seed: change it for a different (still deterministic) city. */
  seed?: number;
  /** How many blocks deep Ring 1 reaches beyond the district. */
  ring1Blocks?: number;
  /** Ring 2 reaches this far (world units) beyond the district; Ring 3 fills the rest out to the city extent. */
  ring2Reach?: number;
  /** Fraction of Ring 3 blocks that get a tower. */
  ring3Density?: number;
  /** Extra areas to keep clear (e.g. a camera corridor), on top of `heroClearance`. */
  avoid?: Rect[];
}

const DEFAULTS = { seed: 2026, ring1Blocks: 2, ring2Reach: 170, ring3Density: 0.42 } as const;

/** Seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One seed per block, from its position: a change in one block never reshuffles the others. */
function blockSeed(world: number, i: number, j: number): number {
  let h = Math.imul(world ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (i * 374761393), 0xc2b2ae35);
  h = Math.imul(h ^ (j * 668265263), 0x27d4eb2f);
  return (h ^ (h >>> 16)) >>> 0;
}

const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length]!;
const between = (r: () => number, a: number, b: number) => a + (b - a) * r();

export function overlaps(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** The ground rectangle a box covers (any quarter-turn yaw). */
export function footprint(b: Pick<SurroundBox, 'x' | 'z' | 'w' | 'd' | 'yaw'>): Rect {
  const quarter = Math.abs(Math.round(b.yaw / (Math.PI / 2))) % 2 === 1;
  const hx = (quarter ? b.d : b.w) / 2;
  const hz = (quarter ? b.w : b.d) / 2;
  return { minX: b.x - hx, maxX: b.x + hx, minZ: b.z - hz, maxZ: b.z + hz };
}

/** Splits a street frontage into building widths that add up exactly (no side gaps). */
export function splitFrontage(r: () => number, length: number, min = 3.2, max = 5.6): number[] {
  const n = Math.max(1, Math.round(length / between(r, (min + max) / 2 - 0.4, (min + max) / 2 + 0.4)));
  const weights = Array.from({ length: n }, () => between(r, 0.75, 1.25));
  const sum = weights.reduce((s, w) => s + w, 0);
  return weights.map(w => (w / sum) * length);
}

interface Block extends Rect {
  i: number;
  j: number;
  cx: number;
  cz: number;
  /** Blocks beyond the district edge (Chebyshev), 1 = touching it. */
  ring: number;
  /** World units beyond the district edge. */
  reach: number;
}

function blocks(roads: CityRoads, district: Rect): Block[] {
  const out: Block[] = [];
  const { roadsX: xs, roadsZ: zs } = roads;
  const step = Math.min(xs[1]! - xs[0]!, zs[1]! - zs[0]!);
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i]! + xs[i + 1]!) / 2;
      const cz = (zs[j]! + zs[j + 1]!) / 2;
      const dx = Math.max(0, district.minX - cx, cx - district.maxX);
      const dz = Math.max(0, district.minZ - cz, cz - district.maxZ);
      const reach = Math.max(dx, dz);
      out.push({
        i,
        j,
        cx,
        cz,
        reach,
        ring: Math.ceil(reach / step - 1e-6),
        minX: xs[i]! + SETBACK,
        maxX: xs[i + 1]! - SETBACK,
        minZ: zs[j]! + SETBACK,
        maxZ: zs[j + 1]! - SETBACK,
      });
    }
  return out;
}

/** Yaw that turns local +z toward a street on the given side. */
const FACING = { south: Math.PI, north: 0, east: Math.PI / 2, west: -Math.PI / 2 } as const;
type Side = keyof typeof FACING;

function ring1Building(
  r: () => number,
  at: { x: number; z: number; w: number; d: number; yaw: number },
  prevColor: string | null,
  sideAwning: -1 | 0 | 1,
): Ring1Building {
  let color = pick(r, PASTELS);
  if (color === prevColor) color = PASTELS[(PASTELS.indexOf(color as (typeof PASTELS)[number]) + 3) % PASTELS.length]!;
  const floors = 4 + Math.floor(r() * 4);
  const roof = pick(r, ROOF_ITEMS);
  // Keep the roof item off the parapet; gardens cover the roof, so they sit in the middle.
  const roofAt: [number, number] =
    roof === 'garden' ? [0, 0] : [between(r, -0.22, 0.22) * at.w, between(r, -0.25, 0.1) * at.d];
  return {
    ...at,
    h: floors * FLOOR_HEIGHT,
    floors,
    color,
    style: pick(r, [STYLE.classic, STYLE.classic, STYLE.brick, STYLE.ribbon] as const),
    shop: true,
    seed: r(),
    awning: pick(r, AWNINGS),
    stripes: r() < 0.5,
    sideAwning,
    roof,
    roofAt,
  };
}

/**
 * A Ring 1 block: north and south street walls run the full block, east and west walls close the middle, and a low
 * back building fills the courtyard so the block reads solid from above.
 */
function ring1Block(b: Block, r: () => number, plan: SurroundPlan) {
  const dNS = between(r, 4.2, 4.8);
  const dEW = between(r, 4.0, 4.6);
  let prev: string | null = null;
  const row = (side: Side, from: number, to: number, depth: number, cornerAwnings: boolean) => {
    const along = side === 'north' || side === 'south' ? 'x' : 'z';
    const widths = splitFrontage(r, to - from);
    let s = from;
    widths.forEach((w, k) => {
      const c = s + w / 2;
      s += w;
      const x = along === 'x' ? c : side === 'east' ? b.maxX - depth / 2 : b.minX + depth / 2;
      const z = along === 'z' ? c : side === 'north' ? b.maxZ - depth / 2 : b.minZ + depth / 2;
      const first = k === 0;
      const last = k === widths.length - 1;
      // Row ends are corner buildings: their side faces the cross street too. Local +x points to the right of the
      // front; which end that is depends on the facing.
      const end = first ? -1 : last ? 1 : 0;
      const flip = side === 'south' ? -1 : 1;
      const corner = cornerAwnings && end !== 0 ? ((end * flip) as -1 | 1) : 0;
      const bld = ring1Building(r, { x, z, w, d: depth, yaw: FACING[side] }, prev, corner);
      prev = bld.color;
      plan.ring1.push(bld);
    });
  };
  row('south', b.minX, b.maxX, dNS, true);
  row('north', b.minX, b.maxX, dNS, true);
  const z0 = b.minZ + dNS;
  const z1 = b.maxZ - dNS;
  if (z1 - z0 > 2.5) {
    row('east', z0, z1, dEW, false);
    row('west', z0, z1, dEW, false);
  }
  const back = { minX: b.minX + dEW, maxX: b.maxX - dEW, minZ: z0, maxZ: z1 };
  if (back.maxX - back.minX > 1 && back.maxZ - back.minZ > 1)
    plan.backs.push({
      x: (back.minX + back.maxX) / 2,
      z: (back.minZ + back.maxZ) / 2,
      w: back.maxX - back.minX + 0.4,
      d: back.maxZ - back.minZ + 0.4,
      h: 2 * FLOOR_HEIGHT,
      yaw: 0,
      color: '#d8d2c8',
      style: STYLE.plain,
      shop: false,
      seed: r(),
    });
}

/** Mix two hex colours (t = 0 → a). */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** A Ring 2 block: two to four simple boxes, pastel washed toward the haze, taller further out. */
function ring2Block(b: Block, r: () => number, plan: SurroundPlan) {
  const splitX = r() < 0.75;
  const splitZ = r() < 0.75;
  const xs = splitX ? [b.minX, (b.minX + b.maxX) / 2 + between(r, -1.5, 1.5), b.maxX] : [b.minX, b.maxX];
  const zs = splitZ ? [b.minZ, (b.minZ + b.maxZ) / 2 + between(r, -1.5, 1.5), b.maxZ] : [b.minZ, b.maxZ];
  const far = Math.min(1, b.reach / 200);
  for (let a = 0; a < xs.length - 1; a++)
    for (let c = 0; c < zs.length - 1; c++) {
      const floors = Math.round(between(r, 4, 9 + far * 8));
      plan.ring2.push({
        x: (xs[a]! + xs[a + 1]!) / 2,
        z: (zs[c]! + zs[c + 1]!) / 2,
        w: xs[a + 1]! - xs[a]! - 0.3,
        d: zs[c + 1]! - zs[c]! - 0.3,
        h: floors * FLOOR_HEIGHT,
        yaw: 0,
        color: mixHex(pick(r, PASTELS), '#e9edf2', 0.35 + 0.25 * far),
        style: STYLE.plain,
        shop: false,
        seed: r(),
      });
    }
}

/** A Ring 3 block: sometimes one tall pale tower (the far skyline). */
function ring3Block(b: Block, r: () => number, plan: SurroundPlan, density: number) {
  if (r() > density) return;
  const w = between(r, 6, b.maxX - b.minX);
  const d = between(r, 6, b.maxZ - b.minZ);
  const floors = Math.round(between(r, 16, 46));
  plan.ring3.push({
    x: b.cx + between(r, -1, 1) * ((b.maxX - b.minX - w) / 2),
    z: b.cz + between(r, -1, 1) * ((b.maxZ - b.minZ - d) / 2),
    w,
    d,
    h: floors * FLOOR_HEIGHT,
    yaw: 0,
    color: mixHex(TOWER_PALE[0], TOWER_PALE[1], r()),
    style: STYLE.tower,
    shop: false,
    seed: r(),
  });
}

/** Drops anything that would touch a clear rectangle (district, client lots, camera corridor). */
function keepClear<T extends SurroundBox>(list: T[], clear: Rect[]): T[] {
  return list.filter(b => {
    const f = footprint(b);
    return !clear.some(c => overlaps(f, c));
  });
}

/**
 * Plans the three rings around the district. `roads` and `clear` come from D1's `cityRoads(layout)` and
 * `heroClearance(layout)`; the district rectangle is the `kind: 'district'` clearance.
 */
export function planSurround(roads: CityRoads, clear: ClearRect[], options: SurroundOptions = {}): SurroundPlan {
  const o = { ...DEFAULTS, ...options };
  const district = clear.find(c => c.kind === 'district') ?? { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  const plan: SurroundPlan = { ring1: [], backs: [], ring2: [], ring3: [] };
  const allClear: Rect[] = [...clear, ...(o.avoid ?? [])];
  for (const b of blocks(roads, district)) {
    if (b.maxX - b.minX < 4 || b.maxZ - b.minZ < 4) continue;
    if (allClear.some(c => overlaps(b, c))) continue;
    const r = rng(blockSeed(o.seed, b.i, b.j));
    if (b.ring <= o.ring1Blocks) ring1Block(b, r, plan);
    else if (b.reach <= o.ring2Reach) ring2Block(b, r, plan);
    else ring3Block(b, r, plan, o.ring3Density);
  }
  return {
    ring1: keepClear(plan.ring1, allClear),
    backs: keepClear(plan.backs, allClear),
    ring2: keepClear(plan.ring2, allClear),
    ring3: keepClear(plan.ring3, allClear),
  };
}
