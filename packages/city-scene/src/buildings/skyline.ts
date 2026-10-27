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
function floorsAt(r: () => number, x: number, z: number): number {
  const ring = Math.max(Math.max(0, Math.abs(x) - 50), Math.max(0, Math.abs(z) - 30));
  const back = Math.min(1, Math.max(0, -z / 140));
  let [lo, hi] = [3, 7];
  if (ring > 20) [lo, hi] = [5, 12];
  if (ring > 40) [lo, hi] = [8, 20];
  if (ring > 70) [lo, hi] = [10, 24];
  let f = lo + Math.floor(r() * (hi - lo + 1));
  f = Math.round(f * (1 + back * (ring > 20 ? 0.6 : 0.25)) * (z > 30 && ring < 60 ? 0.85 : 1));
  if (ring > 50 && r() < 0.06) f = 36 + Math.floor(r() * 20);
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
  const style = styleFor(r, floors);
  const { wall, glass } = colours(r, style);
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
  // Setbacks: tall buildings step back once or twice (zoning-law wedding cakes).
  const tiers: [number, number, number][] = [];
  if (floors > 14 && r() < 0.65) {
    const steps = floors > 26 ? 2 + Math.floor(r() * 2) : 1;
    let from = 0;
    let inset = 0;
    for (let i = 0; i <= steps; i++) {
      const to = i === steps ? floors : from + Math.max(4, Math.round((floors - from) * (0.45 + r() * 0.2)));
      tiers.push([from, Math.min(to, floors), inset]);
      from = Math.min(to, floors);
      inset += 0.6 + r() * 0.9;
      if (from >= floors) break;
    }
  } else tiers.push([0, floors, 0]);
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
  const k = r();
  const cx = lot.cx;
  const cz = lot.cz;
  if (floors >= 38) {
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
    for (const lot of splitBlock(r, b.x, b.z, b.half)) addBuilding(out, r, lot, floorsAt(r, lot.cx, lot.cz));
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
