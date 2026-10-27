import type { QualityBudget } from '../quality/quality.ts';
import { CITY_HALF, CURB_H, extendedGrid, PLAZAS, rng, type StreetGrid } from '../streets/grid.ts';
import { FLOOR_HEIGHT } from '../types.ts';
import type { FacadeStyle, Mass } from './facade.ts';
import type { Part } from './parts.ts';

/**
 * The background skyline: every street block outside the 15 lots gets one to four buildings with Manhattan
 * silhouettes (setbacks, crowns, spires, water tanks, mechanical penthouses, rooftop gardens), and a sparse far ring
 * of towers shows through the haze. Pure and seeded, so it is testable and identical on every load.
 */

export interface SkylinePlan {
  masses: Mass[];
  parts: Part[];
  /** Rooftop trees (x, y, z, scale). */
  trees: [number, number, number, number][];
}

/** Inset of buildings from the curb: keeps lamps, trees and the walking line (2.7 from the road) clear. */
export const BLOCK_INSET = 2.6;

const BRICKS = ['#b4583d', '#a64f36', '#c06a4c', '#9c4a34', '#b86b4f', '#a85d45'];
const STONES = ['#efe7d8', '#e6dcc8', '#f3efe6', '#ddd3c1', '#e9dfcb', '#d8d2c6'];
const GLASS_FRAMES = ['#b9c1c8', '#8b98a3', '#d5d9dc', '#6f7c87', '#a6b0b8', '#55616b'];
const GLASS_TINTS = ['#3f6d93', '#4a7f99', '#3a6382', '#5683a5', '#3f7a82', '#46708f', '#5f8098'];
const DARK_FRAMES = ['#2b2e33', '#3a3128', '#24272b', '#43392d'];
const DARK_TINTS = ['#4a3b2a', '#2a2d31', '#3b3026', '#22262b', '#3d3a34'];
const AWNINGS = ['#0f1b2d', '#1f8a8a', '#7a2e2e', '#2f5d3a', '#3b3f45', '#b5462f', '#5b4a3a'];

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

interface Lot {
  cx: number;
  cz: number;
  w: number;
  d: number;
  /** Which faces touch the block edge (and so face a street): +x, -x, +z, -z. */
  street: [boolean, boolean, boolean, boolean];
}

function splitBlock(r: () => number, bx: number, bz: number, half: number): Lot[] {
  const h = half - BLOCK_INSET;
  const gap = 0.35;
  const k = r();
  const all: [boolean, boolean, boolean, boolean] = [true, true, true, true];
  if (k < 0.22) return [{ cx: bx, cz: bz, w: h * 2, d: h * 2, street: all }];
  if (k < 0.5) {
    const alongX = r() < 0.5;
    const a = h - gap / 2;
    return [-1, 1].map(s =>
      alongX
        ? { cx: bx + s * (a / 2 + gap / 2), cz: bz, w: a, d: h * 2, street: [s > 0, s < 0, true, true] }
        : { cx: bx, cz: bz + s * (a / 2 + gap / 2), w: h * 2, d: a, street: [true, true, s > 0, s < 0] },
    );
  }
  const q = h - gap / 2;
  const lots: Lot[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      lots.push({
        cx: bx + sx * (q / 2 + gap / 2),
        cz: bz + sz * (q / 2 + gap / 2),
        w: q,
        d: q,
        street: [sx > 0, sx < 0, sz > 0, sz < 0],
      });
  // Sometimes two quarters become one wider building.
  if (k > 0.8) {
    const [a, b] = [lots[0]!, lots[1]!];
    lots.splice(0, 2, { cx: a.cx, cz: (a.cz + b.cz) / 2, w: q, d: h * 2, street: [false, true, true, true] });
  }
  return lots;
}

type Archetype = 'plain' | 'glass' | 'cake' | 'dark' | 'deco' | 'pyramid';
function archetype(r: () => number, floors: number): Archetype {
  const k = r();
  if (floors >= 26 && k < 0.1) return 'deco';
  if (k < 0.36) return 'cake';
  if (k < 0.58) return 'dark';
  if (floors >= 20 && k < 0.66) return 'pyramid';
  return 'glass';
}

function styleFor(r: () => number, floors: number): FacadeStyle {
  const k = r();
  if (floors < 10) return k < 0.55 ? 'brick' : k < 0.85 ? 'stone' : 'ribbon';
  if (floors < 22) return k < 0.3 ? 'stone' : k < 0.6 ? 'glass' : k < 0.8 ? 'ribbon' : k < 0.92 ? 'fins' : 'brick';
  return k < 0.55 ? 'glass' : k < 0.8 ? 'fins' : 'stone';
}

function colours(r: () => number, style: FacadeStyle) {
  if (style === 'brick') return { wall: pick(r, BRICKS), glass: pick(r, GLASS_TINTS) };
  if (style === 'stone') return { wall: pick(r, STONES), glass: pick(r, GLASS_TINTS) };
  return { wall: pick(r, GLASS_FRAMES), glass: pick(r, GLASS_TINTS) };
}

/**
 * Height in floors for a building at (x, z): low walk-ups right around the lots (so the 15 lots stay the focus),
 * rising ring by ring, tallest behind the campus (-z), where the skyline frames the view.
 */
/** Tower clusters behind and beside the campus: heights swell around them, so the skyline has peaks and valleys. */
const HUBS: [number, number, number][] = [
  [-95, -150, 1],
  [75, -170, 0.85],
  [-175, -55, 0.65],
  [165, -95, 0.55],
  [5, -125, 0.45],
];

function floorsAt(r: () => number, x: number, z: number): number {
  const ring = Math.max(Math.max(0, Math.abs(x) - 50), Math.max(0, Math.abs(z) - 30));
  let [lo, hi] = [3, 7];
  if (ring > 20) [lo, hi] = [5, 11];
  if (ring > 40) [lo, hi] = [7, 16];
  if (ring > 70) [lo, hi] = [8, 18];
  let f = lo + Math.floor(r() * (hi - lo + 1));
  let hub = 0;
  for (const [hx, hz, w] of HUBS) hub += w * Math.exp(-((x - hx) ** 2 + (z - hz) ** 2) / (2 * 42 * 42));
  if (ring > 20) f = Math.round(f * (1 + 1.7 * Math.min(1, hub)));
  if (z > 30 && ring < 60) f = Math.round(f * 0.85);
  if (ring > 50 && r() < 0.03 + 0.3 * hub) f = 34 + Math.floor(r() * 22);
  return Math.max(3, f);
}

/**
 * Level of detail of a generated piece: 0 always drawn, 1 from 'reduced' up, 2 only on 'full', 3 never (far ring).
 * Everything is always generated (same random sequence at every quality), then filtered, so changing the quality
 * never reshuffles the city.
 */
type Lod = 0 | 1 | 2 | 3;
interface Tagged {
  masses: [Mass, Lod][];
  parts: [Part, Lod][];
  trees: [[number, number, number, number], Lod][];
}

function addBuilding(out: Tagged, r: () => number, lot: Lot, floors: number, far = false) {
  const cap = (l: Lod): Lod => (far ? (l === 0 ? 0 : 3) : l);
  const plan = {
    masses: { push: (m: Mass, l: Lod = 0) => out.masses.push([m, cap(l)]) },
    parts: { push: (p: Part, l: Lod = 2) => out.parts.push([p, cap(l)]) },
    trees: { push: (t: [number, number, number, number], l: Lod = 2) => out.trees.push([t, cap(l)]) },
  };
  // Tall buildings take one of several archetypes, so the skyline is not a wall of similar glass slabs.
  const kind = floors >= 16 ? archetype(r, floors) : 'plain';
  let style = styleFor(r, floors);
  let { wall, glass } = colours(r, style);
  if (kind === 'cake' || kind === 'deco') {
    style = kind === 'deco' || r() < 0.6 ? 'stone' : 'brick';
    wall = pick(r, style === 'stone' ? STONES : BRICKS);
    glass = pick(r, GLASS_TINTS);
  } else if (kind === 'dark') {
    style = r() < 0.6 ? 'glass' : 'fins';
    wall = pick(r, DARK_FRAMES);
    glass = pick(r, DARK_TINTS);
  }
  const seed = Math.floor(r() * 997);
  const lit = 0.1 + r() * 0.22;
  const base: Omit<Mass, 'x' | 'z' | 'w' | 'd' | 'y0' | 'y1'> = {
    style,
    wall,
    glass,
    seed,
    lit,
    baseY: CURB_H,
    ground: 1,
  };
  // Tiers: [from floor, to floor, inset per side].
  const tiers: [number, number, number][] = [];
  const stepped = (steps: number, insetLo: number, insetHi: number, firstShare: number) => {
    let from = 0;
    let inset = 0;
    for (let i = 0; i <= steps && from < floors; i++) {
      const left = floors - from;
      const to =
        i === steps ? floors : from + Math.max(3, Math.round(left * (i === 0 ? firstShare : 0.45 + r() * 0.15)));
      tiers.push([from, Math.min(to, floors), inset]);
      from = Math.min(to, floors);
      inset += insetLo + r() * (insetHi - insetLo);
    }
  };
  if (kind === 'cake') stepped(2 + Math.floor(r() * 2), 0.9, 1.6, 0.4 + r() * 0.15);
  else if (kind === 'deco') stepped(3, 0.8, 1.3, 0.45);
  else if (kind === 'pyramid') {
    const body = Math.round(floors * 0.7);
    tiers.push([0, body, 0]);
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const f0 = body + Math.round(((floors - body) * i) / steps);
      const f1 = body + Math.round(((floors - body) * (i + 1)) / steps);
      if (f1 > f0) tiers.push([f0, f1, 0.7 * (i + 1)]);
    }
  } else if (kind === 'dark') stepped(r() < 0.5 ? 0 : 1, 0.5, 0.9, 0.7);
  else if (floors > 14 && r() < 0.55) stepped(floors > 26 ? 2 : 1, 0.6, 1.4, 0.5);
  else tiers.push([0, floors, 0]);
  let top = CURB_H;
  let tw = lot.w;
  let td = lot.d;
  for (const [f0, f1, inset] of tiers) {
    tw = Math.max(2.5, lot.w - inset * 2);
    td = Math.max(2.5, lot.d - inset * 2);
    const y0 = CURB_H + f0 * FLOOR_HEIGHT;
    const y1 = CURB_H + f1 * FLOOR_HEIGHT;
    plan.masses.push({ ...base, x: lot.cx, z: lot.cz, w: tw, d: td, y0, y1 });
    if (style === 'brick' || style === 'stone')
      plan.parts.push(
        { shape: 'box', mat: 'stone', x: lot.cx, y: y1 - 0.2, z: lot.cz, sx: tw + 0.3, sy: 0.26, sz: td + 0.3 },
        1,
      );
    top = y1;
  }
  // Signature tops (always drawn: they are the silhouette).
  let crowned = false;
  if (kind === 'deco') {
    // Art-deco lantern: three narrowing lit tiers and a needle spire.
    let y = top;
    for (const [k, h] of [
      [0.7, 2.2],
      [0.48, 2.0],
      [0.28, 2.6],
    ] as const) {
      plan.masses.push({
        ...base,
        style: 'crown',
        wall: '#c9a86a',
        x: lot.cx,
        z: lot.cz,
        w: tw * k,
        d: td * k,
        y0: y,
        y1: y + h,
        ground: 0,
      });
      y += h;
    }
    plan.parts.push({ shape: 'cone', mat: 'steel', x: lot.cx, y: y + 5, z: lot.cz, sx: 0.4, sy: 10, sz: 0.4 }, 0);
    plan.parts.push(
      { shape: 'sphere', mat: 'beacon', x: lot.cx, y: y + 10.1, z: lot.cz, sx: 0.25, sy: 0.25, sz: 0.25 },
      1,
    );
    crowned = true;
  } else if (kind === 'cake' && r() < 0.5) {
    plan.parts.push(
      {
        shape: 'pyramid',
        mat: 'copper',
        x: lot.cx,
        y: top + Math.min(tw, td) * 0.45,
        z: lot.cz,
        sx: tw * 0.9,
        sy: Math.min(tw, td) * 0.9,
        sz: td * 0.9,
      },
      0,
    );
    crowned = true;
  } else if (kind === 'dark' && r() < 0.5) {
    // Slanted top, sloping one way or the other.
    const h = Math.min(tw, td) * (0.5 + r() * 0.4);
    plan.parts.push(
      {
        shape: 'wedge',
        mat: 'darkGlass',
        x: lot.cx,
        y: top + h / 2,
        z: lot.cz,
        sx: tw,
        sy: h,
        sz: td,
        ry: Math.floor(r() * 4) * (Math.PI / 2),
      },
      0,
    );
    crowned = true;
  } else if (kind === 'pyramid') {
    plan.parts.push({ shape: 'cone', mat: 'steel', x: lot.cx, y: top + 3, z: lot.cz, sx: 0.35, sy: 6, sz: 0.35 }, 0);
    crowned = true;
  }

  // Street-level awnings on brick and stone buildings.
  if ((style === 'brick' || style === 'stone') && r() < 0.7) {
    const color = pick(r, AWNINGS);
    const y = CURB_H + FLOOR_HEIGHT * 0.82;
    const [px, nx, pz, nz] = lot.street;
    if (pz)
      plan.parts.push({
        shape: 'box',
        mat: 'awning',
        x: lot.cx,
        y,
        z: lot.cz + lot.d / 2 + 0.4,
        sx: lot.w * 0.7,
        sy: 0.08,
        sz: 0.8,
        rx: 0.22,
        color,
      });
    if (nz)
      plan.parts.push({
        shape: 'box',
        mat: 'awning',
        x: lot.cx,
        y,
        z: lot.cz - lot.d / 2 - 0.4,
        sx: lot.w * 0.7,
        sy: 0.08,
        sz: 0.8,
        rx: -0.22,
        color,
      });
    if (px)
      plan.parts.push({
        shape: 'box',
        mat: 'awning',
        x: lot.cx + lot.w / 2 + 0.4,
        y,
        z: lot.cz,
        sx: 0.8,
        sy: 0.08,
        sz: lot.d * 0.7,
        rz: -0.22,
        color,
      });
    if (nx)
      plan.parts.push({
        shape: 'box',
        mat: 'awning',
        x: lot.cx - lot.w / 2 - 0.4,
        y,
        z: lot.cz,
        sx: 0.8,
        sy: 0.08,
        sz: lot.d * 0.7,
        rz: 0.22,
        color,
      });
  }

  // Roof features: about half survive on 'reduced', none on 'minimal'.
  const roof: Lod = r() < 0.45 ? 2 : 1;
  const k = crowned ? 2 : r();
  const cx = lot.cx;
  const cz = lot.cz;
  if (crowned) {
    // The signature top is the roof.
  } else if (floors >= 38) {
    // Supertall: lantern crown and spire.
    const cw = tw * 0.62;
    const cd = td * 0.62;
    plan.masses.push({ ...base, style: 'crown', x: cx, z: cz, w: cw, d: cd, y0: top, y1: top + 3.2, ground: 0 }, roof);
    plan.masses.push(
      { ...base, style: 'crown', x: cx, z: cz, w: cw * 0.6, d: cd * 0.6, y0: top + 3.2, y1: top + 5.6, ground: 0 },
      roof,
    );
    plan.parts.push({ shape: 'cone', mat: 'steel', x: cx, y: top + 5.6 + 6, z: cz, sx: 0.5, sy: 12, sz: 0.5 }, roof);
    plan.parts.push(
      { shape: 'sphere', mat: 'beacon', x: cx, y: top + 5.6 + 12.1, z: cz, sx: 0.3, sy: 0.3, sz: 0.3 },
      roof,
    );
  } else if ((style === 'brick' || style === 'stone') && floors < 16 && k < 0.6) {
    // New York water tank on steel legs.
    const tx = cx + (r() - 0.5) * tw * 0.4;
    const tz = cz + (r() - 0.5) * td * 0.4;
    const s = 0.75 + r() * 0.35;
    plan.parts.push(
      { shape: 'box', mat: 'steel', x: tx, y: top + 0.55 * s, z: tz, sx: 1.3 * s, sy: 1.1 * s, sz: 1.3 * s },
      roof,
    );
    plan.parts.push(
      { shape: 'octa', mat: 'tank', x: tx, y: top + (1.1 + 0.85) * s, z: tz, sx: 1.6 * s, sy: 1.7 * s, sz: 1.6 * s },
      roof,
    );
    plan.parts.push(
      { shape: 'cone', mat: 'tankRoof', x: tx, y: top + 3.05 * s, z: tz, sx: 1.75 * s, sy: 0.7 * s, sz: 1.75 * s },
      roof,
    );
  } else if (k < 0.3 && tw > 5) {
    // Rooftop garden.
    plan.parts.push(
      { shape: 'box', mat: 'garden', x: cx, y: top + 0.12, z: cz, sx: tw - 1, sy: 0.22, sz: td - 1 },
      roof,
    );
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++)
      plan.trees.push([cx + (r() - 0.5) * (tw - 2), top + 0.22, cz + (r() - 0.5) * (td - 2), 0.45 + r() * 0.3], roof);
  } else if (k < 0.62) {
    // Mechanical penthouse.
    const pw = tw * (0.4 + r() * 0.2);
    const pd = td * (0.4 + r() * 0.2);
    plan.masses.push(
      {
        ...base,
        style: 'louvre',
        x: cx + (r() - 0.5) * 1.2,
        z: cz + (r() - 0.5) * 1.2,
        w: pw,
        d: pd,
        y0: top,
        y1: top + 1.5,
        ground: 0,
      },
      roof,
    );
  } else if (k < 0.75 && style === 'stone' && floors > 12) {
    // Art-deco pyramid top.
    plan.parts.push(
      {
        shape: 'pyramid',
        mat: 'copper',
        x: cx,
        y: top + Math.min(tw, td) * 0.4,
        z: cz,
        sx: tw * 0.8,
        sy: Math.min(tw, td) * 0.8,
        sz: td * 0.8,
      },
      roof,
    );
  } else if (k < 0.85) {
    // Antenna mast with an aircraft warning light.
    const h = 2 + r() * 2.5;
    plan.parts.push(
      { shape: 'cyl', mat: 'steel', x: cx + tw * 0.2, y: top + h / 2, z: cz - td * 0.2, sx: 0.12, sy: h, sz: 0.12 },
      roof,
    );
    plan.parts.push(
      { shape: 'sphere', mat: 'beacon', x: cx + tw * 0.2, y: top + h, z: cz - td * 0.2, sx: 0.2, sy: 0.2, sz: 0.2 },
      roof,
    );
  }
  // Rooftop AC units scattered on flat roofs.
  if (r() < 0.5) {
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++)
      plan.parts.push({
        shape: 'box',
        mat: 'hvac',
        x: cx + (r() - 0.5) * (tw - 1.5),
        y: top + 0.3,
        z: cz + (r() - 0.5) * (td - 1.5),
        sx: 0.8,
        sy: 0.6,
        sz: 0.8,
      });
  }
}

export function planSkyline(
  streets: StreetGrid,
  detail: QualityBudget['decorBuildingDetail'],
  seed = 1907,
): SkylinePlan {
  const r = rng(seed);
  const grid = extendedGrid(streets);
  const out: Tagged = { masses: [], parts: [], trees: [] };
  for (const b of grid.blocks) {
    if (b.core) continue;
    if (PLAZAS.some(p => p.x === b.x && p.z === b.z)) continue;
    const lots = splitBlock(r, b.x, b.z, b.half);
    const heights = lots.map(l => floorsAt(r, l.cx, l.cz));
    // A tower's neighbours on its block stay mid-rise, so towers stand out instead of merging into a wall.
    const tallest = Math.max(...heights);
    const first = heights.indexOf(tallest);
    lots.forEach((lot, i) => {
      const f = tallest > 22 && i !== first ? Math.min(heights[i]!, Math.round(tallest * 0.4)) : heights[i]!;
      addBuilding(out, r, lot, f);
    });
  }
  // Far ring: sparse towers beyond the street grid, seen through the haze (never overlapping one another).
  const FAR = 90;
  const placed: [number, number, number, number][] = [];
  for (let tries = 0; placed.length < FAR && tries < FAR * 20; tries++) {
    const a = r() * Math.PI * 2;
    const rad = 215 + r() * 260;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad * 0.9;
    const w = 8 + r() * 10;
    const d = 8 + r() * 10;
    if (Math.max(Math.abs(x) - w / 2, Math.abs(z) - d / 2) < CITY_HALF + 12) continue;
    if (placed.some(([px, pz, pw, pd]) => Math.abs(px - x) < (pw + w) / 2 + 2 && Math.abs(pz - z) < (pd + d) / 2 + 2))
      continue;
    placed.push([x, z, w, d]);
    const floors = Math.round((14 + r() * 30) * (1 + Math.max(0, -z / 300)));
    const before = out.masses.length;
    addBuilding(out, r, { cx: x, cz: z, w, d, street: [false, false, false, false] }, floors, true);
    // 'minimal' keeps the first 40 far towers.
    if (placed.length > 40)
      for (let i = before; i < out.masses.length; i++) out.masses[i]![1] = Math.max(1, out.masses[i]![1]) as Lod;
  }
  const max: Lod = detail === 'full' ? 2 : detail === 'reduced' ? 1 : 0;
  return {
    masses: out.masses.filter(([, l]) => l <= max).map(([m]) => m),
    parts: out.parts.filter(([, l]) => l <= max).map(([p]) => p),
    trees: out.trees.filter(([, l]) => l <= max).map(([t]) => t),
  };
}
