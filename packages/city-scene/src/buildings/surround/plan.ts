/**
 * The generated city around the district, as plain data: where every surround building stands, how big it is and
 * how it looks. Pure and seeded, so the same layout always builds the same city and tests run without WebGL.
 *
 * The city is laid out like Midtown Manhattan seen from a low aerial camera:
 *  - Ring 1, the blocks beside the district: continuous street walls of pre-war brick, limestone and brownstone
 *    (shopfronts, awnings, cornices, rooftop water towers) mixed with stepped mid-rise slabs.
 *  - Ring 2: stepped towers, glass curtain-wall and art-deco stone, taller the further out.
 *  - Ring 3: the skyline proper, towers with setbacks, crowns, spires and red aircraft lights, plus a few landmarks
 *    (a stepped art-deco mast, a stainless crown, a tapered glass tower).
 *  - Ring 4: the far city, one simple box per block, lost in haze.
 * The island is bounded by two rivers (`world/waterfront.ts`); beyond them the far banks are lower.
 *
 * Heights follow two rules. Near the district they stay under the overview camera's eye line, so the client
 * buildings are never hidden; beyond it they rise with distance and with a Midtown / Downtown density field.
 * Everything stays inside the blocks between `cityRoads`, out of every `heroClearance` rectangle and off the water.
 */
import type { ClearRect, CityRoads, Rect } from '../../streets/extent.ts';
import { FLOOR_HEIGHT } from '../../types.ts';
import { bankSide, inWater } from '../../world/waterfront.ts';

/** Building colours: brick, limestone, brownstone, glass-wall tints and mid-century concrete. */
export const BRICKS = ['#8c4b39', '#7d4435', '#9a5a42', '#6f3f33', '#a46a50', '#84503f'] as const;
export const STONES = ['#cfc7b4', '#bdb49f', '#d6cfbf', '#b0a792', '#c4bba6'] as const;
export const BROWNSTONES = ['#6e4a3c', '#7b5444', '#5f4136', '#73503f'] as const;
export const GLASSES = ['#5d7487', '#4f6678', '#6b8396', '#7f8f9c', '#3f4d5a', '#58708a'] as const;
export const CONCRETES = ['#b5b0a6', '#9c9a94', '#c5c0b4', '#a8a69e'] as const;
/** Ring 3/4 towers: cool greys and blue-greys that read as a skyline in haze. */
export const TOWER_TONES = ['#8c9aaa', '#a3adb8', '#7b8998', '#b5bcc4', '#95a0ab', '#c2b8a6'] as const;
/** Awnings of a Manhattan shopfront: dark, restrained, a few bright ones. */
export const AWNINGS = ['#1f3b2d', '#5a1f1f', '#1d2f4d', '#2b2b2b', '#6b5a2e', '#7a2e2e', '#2d4a5a', '#c9a24a'];
/** Back-of-block fillers. */
const BACK = '#a39d92';

/** Facade tiles in the texture array (see facade.ts). */
export const STYLE = {
  classic: 0,
  brick: 1,
  ribbon: 2,
  shop: 3,
  plain: 4,
  tower: 5,
  glass: 6,
  stone: 7,
  crown: 8,
} as const;
export type StyleIndex = (typeof STYLE)[keyof typeof STYLE];

export type RoofItem = 'tank' | 'ac' | 'bulkhead' | 'antenna';
export const ROOF_ITEMS: readonly RoofItem[] = ['tank', 'ac', 'bulkhead', 'antenna'];

/** Building faces start this far from a road centre line: road (2) + curb + a sidewalk people walk on (2.7). */
export const SETBACK = 3.9;

/**
 * One generated box standing on the ground or on another box. Local +z is its street front; `yaw` turns it there.
 * `w` is the frontage (local x), `d` the depth (local z), `h` the height, `y0` the height of its base above the ground.
 */
export interface SurroundBox {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  y0: number;
  yaw: number;
  color: string;
  style: StyleIndex;
  /** Ground floor is a shopfront. */
  shop: boolean;
  /** Floodlit stone (a lit crown at night). */
  flood: boolean;
  /** Carries a stone cornice on top. */
  cap: boolean;
  /** 0..1, picks the night-lit window pattern and varies details. */
  seed: number;
  /** Share of windows lit at night, 0..1. */
  lit: number;
}

export interface Awning {
  x: number;
  z: number;
  /** Height of the awning's top edge. */
  y: number;
  yaw: number;
  w: number;
  color: string;
  stripes: boolean;
}

export interface RoofSpot {
  kind: RoofItem;
  x: number;
  z: number;
  /** Height of the roof it stands on. */
  y: number;
  yaw: number;
  scale: number;
}

export interface Spire {
  x: number;
  z: number;
  /** Height of its foot. */
  y: number;
  h: number;
  r: number;
}

/** A tall volume the camera must stay out of (centre, size, top). */
export interface Blocker {
  x: number;
  z: number;
  w: number;
  d: number;
  top: number;
}

export interface SurroundPlan {
  ring1: SurroundBox[];
  /** Ring 1 courtyard fillers: low back buildings closing the middle of each block, seen from above. */
  backs: SurroundBox[];
  ring2: SurroundBox[];
  ring3: SurroundBox[];
  ring4: SurroundBox[];
  awnings: Awning[];
  roofs: RoofSpot[];
  spires: Spire[];
  /** Tops of the tallest towers: red aircraft lights. */
  beacons: { x: number; y: number; z: number }[];
  blockers: Blocker[];
}

export interface SurroundOptions {
  /** World seed: change it for a different (still deterministic) city. */
  seed?: number;
  /** How many blocks deep Ring 1 reaches beyond the district. */
  ring1Blocks?: number;
  /** Ring 2 reaches this far (world units) beyond the district. */
  ring2Reach?: number;
  /** Ring 3 reaches this far; Ring 4 fills the rest out to the city extent. */
  ring3Reach?: number;
  /** Nothing is built further than this beyond the district (quality: low stops earlier, the fog hides the rest). */
  maxReach?: number;
  /** 0: towers are one or two tiers and Ring 4 is thinned; 1: reduced; 2: full. */
  detail?: 0 | 1 | 2;
  /** Extra areas to keep clear (e.g. a camera corridor), on top of `heroClearance`. */
  avoid?: Rect[];
  /** Blocks that are green instead of built (the park). */
  park?: Rect[];
}

const DEFAULTS = {
  seed: 2026,
  ring1Blocks: 2,
  ring2Reach: 200,
  ring3Reach: 520,
  maxReach: 1e9,
  detail: 2,
} as const;

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

/** Mix two hex colours (t = 0 → a). */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/**
 * How tall buildings may be (in floors) at a distance beyond the district. Near the district the cap sits under the
 * overview camera's eye line, so the client buildings stay in view; further out it climbs to supertall.
 */
export function floorCap(reach: number): number {
  if (reach <= 40) return 16;
  if (reach <= 120) return 16 + (reach - 40) * 0.36;
  return Math.min(96, 45 + (reach - 120) * 0.3);
}

/** Midtown (around the district, a little north) and Downtown (far south) raise the skyline; between them it dips. */
export function densityField(x: number, z: number): number {
  const g = (cx: number, cz: number, s: number) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));
  return Math.min(1, 0.34 + 0.85 * g(0, -40, 260) + 0.7 * g(30, 700, 200) + 0.3 * g(-40, -520, 150));
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

function blocks(roads: CityRoads, district: Rect, maxReach: number): Block[] {
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
      if (reach > maxReach) continue;
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

const FH = FLOOR_HEIGHT;

type Ring = 1 | 2 | 3 | 4;

interface Ctx {
  r: () => number;
  plan: SurroundPlan;
  list: SurroundBox[];
  ring: Ring;
  detail: 0 | 1 | 2;
  /** Reach of the block, for colour and height choices. */
  reach: number;
  /** Far banks (beyond the rivers) are low and plain. */
  far: boolean;
}

function newBox(over: Partial<SurroundBox> & Pick<SurroundBox, 'x' | 'z' | 'w' | 'd' | 'h' | 'color' | 'style'>) {
  const b: SurroundBox = {
    y0: 0,
    yaw: 0,
    shop: false,
    flood: false,
    cap: false,
    seed: 0,
    lit: 0.4,
    ...over,
  };
  return b;
}

/** Records the tall volumes the camera must avoid. Only tall boxes near the middle of the world matter. */
function block(plan: SurroundPlan, b: SurroundBox) {
  const top = b.y0 + b.h;
  if (top >= 60 && Math.abs(b.x) < 420 && Math.abs(b.z) < 420)
    plan.blockers.push({ x: b.x, z: b.z, w: b.w, d: b.d, top });
}

type StackStyle = {
  base: StyleIndex;
  up: StyleIndex;
  baseColor: string;
  upColor: string;
  /** Maximum number of tiers (a setback each). */
  tiers: number;
  crown: 'none' | 'flat' | 'deco' | 'spire';
  shop: boolean;
  roofItems: boolean;
};

/**
 * One building as stacked tiers: a street-wall base, then shafts stepping in (the Manhattan setback). A crown on top
 * is a flat roof with plant, stepped art-deco tiers with floodlighting, or those plus a spire.
 */
function stack(c: Ctx, at: { x: number; z: number; w: number; d: number }, floors: number, s: StackStyle) {
  const { r, plan, list } = c;
  const maxTiers = c.detail === 0 && c.ring >= 3 ? Math.min(s.tiers, 2) : s.tiers;
  const want = 1 + (floors > 12 ? 1 : 0) + (floors > 28 ? 1 : 0) + (floors > 46 ? 1 : 0);
  const n = Math.max(1, Math.min(maxTiers, want));
  const seed = r();
  let remain = floors;
  let y = 0;
  let w = at.w;
  let d = at.d;
  let x = at.x;
  let z = at.z;
  const stone = (st: StyleIndex) => st === STYLE.classic || st === STYLE.brick || st === STYLE.stone;
  for (let t = 0; t < n; t++) {
    const last = t === n - 1;
    const f = last
      ? remain
      : Math.max(3, Math.round(remain * (t === 0 ? between(r, 0.28, 0.42) : between(r, 0.4, 0.6))));
    const fl = Math.max(1, Math.min(remain, f));
    const style = t === 0 ? s.base : s.up;
    const box = newBox({
      x,
      z,
      w,
      d,
      h: fl * FH,
      y0: y,
      color: t === 0 ? s.baseColor : s.upColor,
      style,
      shop: t === 0 && s.shop,
      cap: stone(style) && !(last && s.crown === 'deco'),
      seed,
      lit: style === STYLE.glass ? 0.55 : 0.42,
    });
    list.push(box);
    block(plan, box);
    y += fl * FH;
    remain -= fl;
    if (!last) {
      const inset = between(r, 0.9, 2.1);
      w = Math.max(3.4, w - 2 * inset);
      d = Math.max(3.4, d - 2 * inset);
      // The step may lean toward one street, like a real zoning envelope.
      x += (r() - 0.5) * inset * 0.8;
      z += (r() - 0.5) * inset * 0.8;
    }
  }
  const topY = y;
  if (s.crown === 'deco' || s.crown === 'spire') {
    let cw = w;
    let cd = d;
    let cy = topY;
    const steps = c.detail === 0 ? 2 : 3;
    for (let k = 0; k < steps; k++) {
      cw *= 0.72;
      cd *= 0.72;
      const box = newBox({
        x,
        z,
        w: cw,
        d: cd,
        h: (k === steps - 1 ? 3 : 2) * FH,
        y0: cy,
        color: '#d9d2c0',
        style: STYLE.crown,
        flood: true,
        cap: false,
        seed,
        lit: 0.5,
      });
      list.push(box);
      cy += box.h;
    }
    if (s.crown === 'spire') plan.spires.push({ x, z, y: cy, h: between(r, 5, 11), r: 0.14 + r() * 0.1 });
    plan.beacons.push({ x, y: cy + (s.crown === 'spire' ? plan.spires[plan.spires.length - 1]!.h : 0.4), z });
    return;
  }
  // Flat roof: plant room, plus an aircraft light on the very tall ones.
  if (floors >= 24) {
    const pent = newBox({
      x,
      z,
      w: w * 0.5,
      d: d * 0.5,
      h: 1.3 * FH,
      y0: topY,
      color: '#8a8f96',
      style: STYLE.plain,
      cap: false,
      seed,
      lit: 0.1,
    });
    list.push(pent);
    if (floors >= 55) plan.beacons.push({ x, y: topY + pent.h + 0.3, z });
  } else if (s.roofItems && c.ring <= (c.detail === 0 ? 1 : 2)) {
    const kind = pick(r, ROOF_ITEMS);
    plan.roofs.push({
      kind,
      x: x + (r() - 0.5) * w * 0.4,
      z: z + (r() - 0.5) * d * 0.4,
      y: topY + (stone(s.up) ? 0.3 : 0),
      yaw: Math.floor(r() * 4) * (Math.PI / 2),
      scale: Math.min(1, 0.5 + w / 8),
    });
  }
}

interface Pal {
  base: StyleIndex;
  up: StyleIndex;
  baseColor: string;
  upColor: string;
}

/** A family of materials for one building: pre-war brick, limestone, glass, concrete or brownstone. */
function palette(r: () => number, kind: 'prewar' | 'stone' | 'glass' | 'modern'): Pal {
  switch (kind) {
    case 'prewar': {
      const brick = r() < 0.55;
      return brick
        ? { base: STYLE.brick, up: STYLE.brick, baseColor: pick(r, BRICKS), upColor: pick(r, BRICKS) }
        : { base: STYLE.classic, up: STYLE.classic, baseColor: pick(r, STONES), upColor: pick(r, STONES) };
    }
    case 'stone':
      return { base: STYLE.classic, up: STYLE.stone, baseColor: pick(r, STONES), upColor: pick(r, STONES) };
    case 'glass':
      return { base: STYLE.ribbon, up: STYLE.glass, baseColor: pick(r, CONCRETES), upColor: pick(r, GLASSES) };
    case 'modern':
      return { base: STYLE.ribbon, up: STYLE.ribbon, baseColor: pick(r, CONCRETES), upColor: pick(r, CONCRETES) };
  }
}

/** A street-wall block: narrow lots edge to edge on all four streets, closed by a low back building. */
function wallsBlock(b: Block, c: Ctx, cap: number) {
  const { r, plan } = c;
  const dNS = between(r, 4.2, 4.8);
  const dEW = between(r, 4.0, 4.6);
  const brownstone = c.reach > 150 || r() < 0.18;
  const hi = Math.max(4, Math.min(cap, brownstone ? 6 : 14));
  const lo = Math.max(3, Math.min(hi - 1, brownstone ? 4 : 6));
  let prev = '';
  const row = (side: Side, from: number, to: number, depth: number, cornerAwnings: boolean) => {
    const along = side === 'north' || side === 'south' ? 'x' : 'z';
    const widths = splitFrontage(r, to - from);
    let s = from;
    widths.forEach((w, k) => {
      const cc = s + w / 2;
      s += w;
      const x = along === 'x' ? cc : side === 'east' ? b.maxX - depth / 2 : b.minX + depth / 2;
      const z = along === 'z' ? cc : side === 'north' ? b.maxZ - depth / 2 : b.minZ + depth / 2;
      const floors = lo + Math.floor(r() * (hi - lo + 1));
      let pal: Pal = brownstone
        ? { base: STYLE.brick, up: STYLE.brick, baseColor: pick(r, BROWNSTONES), upColor: pick(r, BROWNSTONES) }
        : palette(r, 'prewar');
      if (pal.baseColor === prev) pal = { ...pal, baseColor: mixHex(pal.baseColor, '#ffffff', 0.12) };
      prev = pal.baseColor;
      const box = newBox({
        x,
        z,
        w,
        d: depth,
        h: floors * FH,
        color: pal.baseColor,
        style: pal.base,
        yaw: FACING[side],
        shop: true,
        cap: true,
        seed: r(),
        lit: 0.4,
      });
      c.list.push(box);
      // The awning hangs over the shopfront, and over the side street on corner lots.
      const first = k === 0;
      const last = k === widths.length - 1;
      const cos = Math.cos(box.yaw);
      const sin = Math.sin(box.yaw);
      const frontOff = box.d / 2 + 0.4;
      const color = pick(r, AWNINGS);
      const stripes = r() < 0.35;
      plan.awnings.push({
        x: box.x + frontOff * sin,
        z: box.z + frontOff * cos,
        y: FH * 0.8,
        yaw: box.yaw,
        w: box.w * 0.86,
        color,
        stripes,
      });
      const end = first ? -1 : last ? 1 : 0;
      if (cornerAwnings && end !== 0 && c.ring === 1) {
        const flip = side === 'south' ? -1 : 1;
        const sideSign = end * flip;
        const sx = box.x + sideSign * (box.w / 2 + 0.4) * cos;
        const sz = box.z - sideSign * (box.w / 2 + 0.4) * sin;
        plan.awnings.push({
          x: sx,
          z: sz,
          y: FH * 0.8,
          yaw: box.yaw + (sideSign * Math.PI) / 2,
          w: box.d * 0.62,
          color,
          stripes,
        });
      }
      if (c.ring <= (c.detail === 0 ? 1 : 2)) {
        const kind = pick(r, ROOF_ITEMS);
        plan.roofs.push({
          kind,
          x: box.x + (r() - 0.5) * box.w * 0.4,
          z: box.z + (r() - 0.5) * box.d * 0.4,
          y: floors * FH + 0.3,
          yaw: Math.floor(r() * 4) * (Math.PI / 2),
          scale: 0.72,
        });
      }
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
    plan.backs.push(
      newBox({
        x: (back.minX + back.maxX) / 2,
        z: (back.minZ + back.maxZ) / 2,
        w: back.maxX - back.minX + 0.4,
        d: back.maxZ - back.minZ + 0.4,
        h: 2 * FH,
        color: BACK,
        style: STYLE.plain,
        seed: r(),
        lit: 0.15,
      }),
    );
}

/** A mid-rise block: two or three stepped buildings side by side. */
function midriseBlock(b: Block, c: Ctx, cap: number) {
  const { r } = c;
  const long = b.maxX - b.minX >= b.maxZ - b.minZ ? 'x' : 'z';
  const n = r() < 0.5 ? 2 : 3;
  const widths = splitFrontage(r, long === 'x' ? b.maxX - b.minX : b.maxZ - b.minZ, 3, 9).slice(0, n);
  const total = widths.reduce((a, w) => a + w, 0);
  const span = long === 'x' ? b.maxX - b.minX : b.maxZ - b.minZ;
  let s = long === 'x' ? b.minX : b.minZ;
  for (const w0 of widths) {
    const w = (w0 / total) * span;
    const cc = s + w / 2;
    s += w;
    const x = long === 'x' ? cc : (b.minX + b.maxX) / 2;
    const z = long === 'z' ? cc : (b.minZ + b.maxZ) / 2;
    const floors = Math.max(Math.min(6, Math.floor(cap)), Math.round(between(r, cap * 0.45, cap)));
    const kind = c.far ? 'modern' : r() < 0.45 ? 'prewar' : r() < 0.5 ? 'stone' : 'glass';
    const pal = palette(r, kind);
    stack(
      c,
      { x, z, w: (long === 'x' ? w : b.maxX - b.minX) - 0.1, d: (long === 'z' ? w : b.maxZ - b.minZ) - 0.1 },
      floors,
      { ...pal, tiers: 2, crown: 'none', shop: c.ring <= 2, roofItems: true },
    );
  }
}

/** One tower filling the block: podium, shafts, and a crown on the tall ones. */
function towerBlock(b: Block, c: Ctx, cap: number, floorsWanted?: number) {
  const { r } = c;
  const floors = floorsWanted ?? Math.max(Math.min(12, Math.floor(cap)), Math.round(between(r, cap * 0.5, cap)));
  const kind = c.far ? 'modern' : r() < 0.46 ? 'glass' : r() < 0.7 ? 'stone' : r() < 0.7 ? 'modern' : 'prewar';
  const pal = palette(r, kind);
  const deco = kind === 'stone' && floors >= 30;
  stack(c, { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, w: b.maxX - b.minX, d: b.maxZ - b.minZ }, floors, {
    ...pal,
    tiers: 4,
    crown: deco ? (r() < 0.5 ? 'spire' : 'deco') : floors >= 40 && r() < 0.3 ? 'spire' : 'flat',
    shop: c.ring <= 2,
    roofItems: true,
  });
}

/** Ring 4: a single plain box per block. */
function farBlock(b: Block, c: Ctx, cap: number) {
  const { r } = c;
  const floors = Math.max(6, Math.round(between(r, cap * 0.3, cap)));
  const w = between(r, 8, b.maxX - b.minX);
  const d = between(r, 8, b.maxZ - b.minZ);
  const box = newBox({
    x: b.cx + between(r, -1, 1) * ((b.maxX - b.minX - w) / 2),
    z: b.cz + between(r, -1, 1) * ((b.maxZ - b.minZ - d) / 2),
    w,
    d,
    h: floors * FH,
    color: pick(r, TOWER_TONES),
    style: STYLE.tower,
    seed: r(),
    lit: 0.5,
  });
  c.list.push(box);
  if (floors >= 70 && c.detail > 0) c.plan.beacons.push({ x: box.x, y: box.h + 0.4, z: box.z });
}

/** The landmark towers, as world positions: each takes the nearest free block. */
export const LANDMARKS = [
  { kind: 'mast', x: -100, z: -150 },
  { kind: 'crown', x: 90, z: -230 },
  { kind: 'taper', x: -30, z: -330 },
  { kind: 'mast', x: 150, z: 150 },
  { kind: 'taper', x: -150, z: 190 },
  { kind: 'crown', x: 20, z: 330 },
] as const;
export type LandmarkKind = (typeof LANDMARKS)[number]['kind'];

/** A stepped art-deco mast (setbacks, floodlit crown, a long needle) or a stainless crown or a tapered glass tower. */
function landmark(kind: LandmarkKind, b: Block, c: Ctx) {
  const { r, plan } = c;
  const x = (b.minX + b.maxX) / 2;
  const z = (b.minZ + b.maxZ) / 2;
  const W = b.maxX - b.minX;
  const seed = r();
  const push = (
    w: number,
    d: number,
    f: number,
    y0: number,
    style: StyleIndex,
    color: string,
    extra?: Partial<SurroundBox>,
  ) => {
    const box = newBox({ x, z, w, d, h: f * FH, y0, color, style, seed, lit: 0.5, ...extra });
    c.list.push(box);
    block(plan, box);
    return y0 + f * FH;
  };
  let y = 0;
  if (kind === 'mast') {
    y = push(W, W, 6, y, STYLE.classic, '#c9c2b0', { shop: true, cap: true });
    y = push(W - 3.2, W - 3.2, 28, y, STYLE.stone, '#cfc8b6', { cap: true });
    y = push(W - 6.4, W - 6.4, 26, y, STYLE.stone, '#cfc8b6', { cap: true });
    y = push(W - 8.6, W - 8.6, 6, y, STYLE.crown, '#d9d2c0', { flood: true });
    y = push(W - 10, W - 10, 4, y, STYLE.crown, '#e2dbc8', { flood: true });
    y = push(2.4, 2.4, 3, y, STYLE.crown, '#e9e2d0', { flood: true });
    plan.spires.push({ x, z, y, h: 22, r: 0.3 });
    plan.beacons.push({ x, y: y + 22.4, z });
  } else if (kind === 'crown') {
    y = push(W, W, 6, y, STYLE.classic, '#b9b2a2', { shop: true, cap: true });
    y = push(W - 2.4, W - 2.4, 40, y, STYLE.stone, '#bcc2c8', { cap: true });
    let w = W - 3.6;
    for (let k = 0; k < 5; k++) {
      y = push(w, w, 2, y, STYLE.crown, '#d4d8dc', { flood: true });
      w *= 0.78;
    }
    plan.spires.push({ x, z, y, h: 16, r: 0.22 });
    plan.beacons.push({ x, y: y + 16.4, z });
  } else {
    y = push(W, W, 5, y, STYLE.ribbon, '#a8a69e', { shop: true });
    let w = W - 1.2;
    for (let k = 0; k < 8; k++) {
      y = push(w, w, 7, y, STYLE.glass, '#5d7487');
      w -= 0.85;
    }
    plan.spires.push({ x, z, y, h: 10, r: 0.2 });
    plan.beacons.push({ x, y: y + 10.4, z });
  }
}

/** Drops anything that would touch a clear rectangle (district, client lots, camera corridor). */
function keepClear<T extends SurroundBox>(list: T[], clear: Rect[]): T[] {
  return list.filter(b => {
    const f = footprint(b);
    return !clear.some(c => overlaps(f, c));
  });
}

/** Whether any part of a block's footprint is on water or within the quay. */
export function blockWet(b: Rect): boolean {
  const pts: [number, number][] = [
    [b.minX, b.minZ],
    [b.maxX, b.minZ],
    [b.minX, b.maxZ],
    [b.maxX, b.maxZ],
    [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2],
  ];
  return pts.some(([x, z]) => inWater(x, z, 12));
}

/**
 * Plans the rings around the district. `roads` and `clear` come from `cityRoads(layout)` and `heroClearance(layout)`;
 * the district rectangle is the `kind: 'district'` clearance.
 */
export function planSurround(roads: CityRoads, clear: ClearRect[], options: SurroundOptions = {}): SurroundPlan {
  const o = { ...DEFAULTS, ...options };
  const district = clear.find(c => c.kind === 'district') ?? { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  const plan: SurroundPlan = {
    ring1: [],
    backs: [],
    ring2: [],
    ring3: [],
    ring4: [],
    awnings: [],
    roofs: [],
    spires: [],
    beacons: [],
    blockers: [],
  };
  const allClear: Rect[] = [...clear, ...(o.avoid ?? [])];
  const all = blocks(roads, district, o.maxReach);
  // Each landmark takes the nearest block that is free, dry and in Ring 2 or 3.
  const taken = new Map<string, LandmarkKind>();
  if (o.detail > 0)
    for (const lm of LANDMARKS) {
      let best: Block | null = null;
      let bd = Infinity;
      for (const b of all) {
        if (b.reach < 60 || blockWet(b) || (o.park ?? []).some(p => overlaps(b, p))) continue;
        const dd = Math.hypot(b.cx - lm.x, b.cz - lm.z);
        if (dd < bd && !taken.has(`${b.i},${b.j}`)) {
          bd = dd;
          best = b;
        }
      }
      if (best) taken.set(`${best.i},${best.j}`, lm.kind);
    }
  for (const b of all) {
    if (b.maxX - b.minX < 4 || b.maxZ - b.minZ < 4) continue;
    if (allClear.some(c => overlaps(b, c))) continue;
    if (blockWet(b) || (o.park ?? []).some(p => overlaps(b, p))) continue;
    // Low detail leaves every other far block out (a lighter skyline: the haze hides the gaps).
    if (o.detail === 0 && b.reach > 260 && (b.i + b.j) % 2 === 1) continue;
    const r = rng(blockSeed(o.seed, b.i, b.j));
    const far = bankSide(b.cx, b.cz) !== 0;
    const ring: Ring = b.ring <= o.ring1Blocks ? 1 : b.reach <= o.ring2Reach ? 2 : b.reach <= o.ring3Reach ? 3 : 4;
    const list = ring === 1 ? plan.ring1 : ring === 2 ? plan.ring2 : ring === 3 ? plan.ring3 : plan.ring4;
    const ctx: Ctx = { r, plan, list, ring, detail: o.detail, reach: b.reach, far };
    // Under the overview camera's eye line in front of the district.
    const front = b.cz > district.maxZ - 5 && Math.abs(b.cx) < 130 && b.reach < 90;
    let cap = floorCap(b.reach) * (far ? 0.45 : densityField(b.cx, b.cz) * 1.15);
    cap = Math.max(5, front ? Math.min(cap, 9) : cap);
    const lm = taken.get(`${b.i},${b.j}`);
    if (lm) {
      landmark(lm, b, ctx);
      continue;
    }
    if (ring === 4) {
      farBlock(b, ctx, cap);
      continue;
    }
    const roll = r();
    if (ring === 1) {
      if (roll < 0.6 || far) wallsBlock(b, ctx, cap);
      else midriseBlock(b, ctx, cap);
    } else if (ring === 2) {
      if (roll < 0.16 || (far && roll < 0.5)) wallsBlock(b, ctx, cap);
      else if (roll < 0.5) midriseBlock(b, ctx, cap);
      else if (front) midriseBlock(b, ctx, cap);
      else towerBlock(b, ctx, cap);
    } else if (roll < 0.22) midriseBlock(b, ctx, cap);
    else towerBlock(b, ctx, cap);
  }
  const keep = (l: SurroundBox[]) => keepClear(l, allClear);
  return {
    ring1: keep(plan.ring1),
    backs: keep(plan.backs),
    ring2: keep(plan.ring2),
    ring3: keep(plan.ring3),
    ring4: keep(plan.ring4),
    awnings: plan.awnings,
    roofs: plan.roofs,
    spires: plan.spires,
    beacons: plan.beacons,
    blockers: plan.blockers,
  };
}

/** Triangles and draw calls the plan costs at a quality, for the budget test and the quality notes. */
export function planBudget(plan: SurroundPlan, includeRing2 = true) {
  const boxes =
    plan.ring1.length +
    plan.backs.length +
    (includeRing2 ? plan.ring2.length : 0) +
    plan.ring3.length +
    plan.ring4.length;
  const caps = [...plan.ring1, ...plan.ring2, ...plan.ring3].filter(b => b.cap).length;
  return { boxes, caps, awnings: plan.awnings.length, roofs: plan.roofs.length, spires: plan.spires.length };
}
