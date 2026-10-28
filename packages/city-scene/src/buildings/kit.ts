import { CURB_H } from '../streets/grid.ts';
import { FLOOR_HEIGHT } from '../types.ts';
import type { Part } from './parts.ts';

/**
 * The facade kit: real 3D facades assembled per floor from a few instanced shapes — recessed glazing, floor-edge
 * spandrels, mullions, piers or fins, slab caps, roofs with parapets — so a building has depth, shadow and a
 * separable floor stack (for exploded floors) without a single window texture. Pure and testable.
 */

export const FH = FLOOR_HEIGHT;
export const BASE_Y = CURB_H;

/** A part of one building on one floor (level 1-based; the roof uses the top level). */
export interface KitPart extends Part {
  /** Owning building key. */
  b: string;
  /** Floor it moves with when exploded. */
  lv: number;
  /** Level of detail: 0 always, 1 balanced and ultra, 2 ultra only. */
  lod?: 0 | 1 | 2;
  /** Casts shadows (big volumes only). */
  cast?: boolean;
}

export type FacadeKind =
  /** Curtain wall: thin brushed-metal mullions in front of clear glass, slim dark spandrel at each slab. */
  | 'curtain'
  /** Glass behind deep vertical fins (metal, bronze or wood). */
  | 'fins'
  /** Punched windows: deep masonry piers and spandrels (stone, brick or concrete), glass set well back. */
  | 'masonry'
  /** Horizontal ribbon windows between solid bands. */
  | 'ribbon'
  /** Storefront / lobby: tall clear glazing with slim mullions and a transom band. */
  | 'store';

export interface Volume {
  b: string;
  /** Centre and footprint. */
  x: number;
  z: number;
  w: number;
  d: number;
  /** First and last floor (inclusive, 1-based) this volume spans. */
  from: number;
  to: number;
  kind: FacadeKind;
  /** Material keys and instance colours (sRGB hex). */
  frameMat: string;
  frame: string;
  glass: string;
  /** Bay width (world units) between mullions/piers. */
  bay?: number;
  /** Treat consecutive floors as one tall storey (double-height lobby or showroom). */
  storeys?: number;
  /** Floor the volume's parts move with (default: their own floor). Lobby volumes pass their lobby level. */
  pinLevel?: number;
  /** Fin depth for 'fins'. */
  fin?: number;
  /** Cap with a roof slab and parapet (the top of a stack). */
  roof?: boolean;
  roofMat?: string;
  parapet?: string;
}

const yOf = (level: number) => BASE_Y + (level - 1) * FH;

/** Bay positions along a face of length `len`: centres of the gaps, evenly divided. */
function bays(len: number, bay: number): number[] {
  const n = Math.max(1, Math.round(len / bay));
  const step = len / n;
  return Array.from({ length: n + 1 }, (_, i) => -len / 2 + i * step);
}

/**
 * Adds one volume's facade, floor by floor. Each floor contributes a slab band, a recessed glass core and the
 * vertical members on all four faces; masonry adds sills/lintels through its deep spandrels.
 */
export function addVolume(out: KitPart[], v: Volume): void {
  const storeys = v.storeys ?? 1;
  const kind = v.kind;
  const bay =
    v.bay ??
    (kind === 'curtain' ? 0.75 : kind === 'fins' ? 0.7 : kind === 'masonry' ? 1.05 : kind === 'store' ? 1.3 : 1.2);
  const inset = kind === 'masonry' ? 0.24 : kind === 'ribbon' ? 0.16 : kind === 'store' ? 0.08 : 0.12;
  const band = kind === 'masonry' ? 0.42 : kind === 'ribbon' ? 0.55 : kind === 'store' ? 0.16 : 0.13;
  const push = (p: Omit<KitPart, 'b'>) => out.push({ b: v.b, ...p });
  for (let level = v.from; level <= v.to; level += storeys) {
    const top = Math.min(v.to, level + storeys - 1);
    const lv = v.pinLevel ?? level;
    const y0 = yOf(level);
    const h = (top - level + 1) * FH;
    // Floor-edge band: the spandrel (masonry/ribbon) or the slab edge (glass); its top is the floor plate.
    push({
      shape: 'box',
      mat: v.frameMat,
      color: v.frame,
      x: v.x,
      y: y0 + band / 2,
      z: v.z,
      sx: v.w,
      sy: band,
      sz: v.d,
      lv,
      cast: true,
    });
    // Recessed glass core.
    const gh = h - band - (kind === 'masonry' ? 0.14 : 0.02);
    push({
      shape: 'box',
      mat: kind === 'store' ? 'lobbyGlass' : 'glass',
      color: v.glass,
      x: v.x,
      y: y0 + band + gh / 2,
      z: v.z,
      sx: v.w - inset * 2,
      sy: gh,
      sz: v.d - inset * 2,
      lv,
      // Lobby glazing lets sun into the lobby (it does not shade its own interior).
      cast: kind !== 'store',
    });
    // Ceiling slab inside the glass (seen when floors are exploded or from above through clear glass).
    push({
      shape: 'box',
      mat: 'slab',
      color: '#d8d4cc',
      x: v.x,
      y: y0 + h - 0.03,
      z: v.z,
      sx: v.w - inset * 2 - 0.02,
      sy: 0.06,
      sz: v.d - inset * 2 - 0.02,
      lv,
      lod: 1,
    });
    if (kind === 'masonry') {
      // Lintel band at the top of the opening.
      push({
        shape: 'box',
        mat: v.frameMat,
        color: v.frame,
        x: v.x,
        y: y0 + h - 0.07,
        z: v.z,
        sx: v.w,
        sy: 0.14,
        sz: v.d,
        lv,
        cast: true,
      });
    }
    if (kind === 'store') {
      // Transom band above the shop glass.
      push({
        shape: 'box',
        mat: v.frameMat,
        color: v.frame,
        x: v.x,
        y: y0 + h - 0.12,
        z: v.z,
        sx: v.w - inset * 2 + 0.08,
        sy: 0.24,
        sz: v.d - inset * 2 + 0.08,
        lv,
      });
    }
    // Masonry openings get a slim centre mullion and transom in front of the glass.
    if (kind === 'masonry') {
      for (const face of [0, 1, 2, 3] as const) {
        const alongX = face < 2;
        const len = alongX ? v.w : v.d;
        const sign = face % 2 === 0 ? 1 : -1;
        const off = (alongX ? v.d / 2 : v.w / 2) - inset + 0.03;
        const pts = bays(len, bay);
        for (let i = 0; i < pts.length - 1; i++) {
          const t = (pts[i]! + pts[i + 1]!) / 2;
          const p = alongX ? [v.x + t, v.z + sign * off] : [v.x + sign * off, v.z + t];
          const sz = alongX ? [0.04, 0.05] : [0.05, 0.04];
          push({
            shape: 'box',
            mat: 'metal',
            color: '#3a3f44',
            x: p[0]!,
            y: y0 + band + gh / 2,
            z: p[1]!,
            sx: sz[0]!,
            sy: gh,
            sz: sz[1]!,
            lv,
            lod: 1,
          });
        }
        const tp = alongX ? [v.x, v.z + sign * off] : [v.x + sign * off, v.z];
        const ts = alongX ? [v.w - inset * 2, 0.05] : [0.05, v.d - inset * 2];
        push({
          shape: 'box',
          mat: 'metal',
          color: '#3a3f44',
          x: tp[0]!,
          y: y0 + band + gh * 0.72,
          z: tp[1]!,
          sx: ts[0]!,
          sy: 0.04,
          sz: ts[1]!,
          lv,
          lod: 2,
        });
      }
    }
    // Vertical members on the four faces.
    const memberH = gh;
    const my = y0 + band + gh / 2;
    for (const face of [0, 1, 2, 3] as const) {
      const alongX = face < 2;
      const len = alongX ? v.w : v.d;
      const sign = face % 2 === 0 ? 1 : -1;
      const halfDepth = alongX ? v.d / 2 : v.w / 2;
      for (const t of bays(len, bay)) {
        let width: number;
        let depth: number;
        let offset: number; // centre of the member, measured outward from the volume centre
        let mat = v.frameMat;
        if (kind === 'masonry') {
          const corner = Math.abs(Math.abs(t) - len / 2) < 1e-6;
          width = corner ? 0.5 : bay * 0.34;
          depth = inset + 0.01;
          offset = halfDepth - depth / 2 + 0.04;
        } else if (kind === 'fins') {
          width = 0.07;
          depth = v.fin ?? 0.42;
          offset = halfDepth - inset + depth / 2;
        } else {
          width = kind === 'store' ? 0.07 : 0.055;
          depth = kind === 'ribbon' ? 0.12 : 0.16;
          offset = halfDepth - inset + depth / 2;
          mat = v.frameMat === 'stone' || v.frameMat === 'brick' || v.frameMat === 'concrete' ? 'metal' : v.frameMat;
        }
        const pos = alongX ? [v.x + t, v.z + sign * offset] : [v.x + sign * offset, v.z + t];
        const size = alongX ? [width, depth] : [depth, width];
        push({
          shape: 'box',
          mat,
          color: v.frame,
          x: pos[0]!,
          y: my,
          z: pos[1]!,
          sx: size[0]!,
          sy: memberH,
          sz: size[1]!,
          lv,
        });
      }
    }
  }
  if (v.roof) addRoof(out, v);
}

/** Roof slab, parapet and coping over a volume. */
export function addRoof(out: KitPart[], v: Volume): void {
  const y = yOf(v.to + 1);
  const lv = v.to;
  const push = (p: Omit<KitPart, 'b'>) => out.push({ b: v.b, ...p });
  push({
    shape: 'box',
    mat: v.roofMat ?? 'roof',
    color: '#9a978f',
    x: v.x,
    y: y + 0.1,
    z: v.z,
    sx: v.w - 0.02,
    sy: 0.2,
    sz: v.d - 0.02,
    lv,
    cast: true,
  });
  const ph = 0.5;
  const pt = 0.16;
  const pm = v.parapet ?? v.frame;
  const pmat = v.frameMat === 'glass' ? 'metal' : v.frameMat;
  for (const [x, z, sx, sz] of [
    [v.x, v.z + v.d / 2 - pt / 2, v.w, pt],
    [v.x, v.z - v.d / 2 + pt / 2, v.w, pt],
    [v.x + v.w / 2 - pt / 2, v.z, pt, v.d - pt * 2],
    [v.x - v.w / 2 + pt / 2, v.z, pt, v.d - pt * 2],
  ] as const)
    push({ shape: 'box', mat: pmat, color: pm, x, y: y + ph / 2, z, sx, sy: ph, sz, lv, cast: true });
}

/** Rooftop plant: units, a turning fan, ducts. */
export function addPlant(out: KitPart[], b: string, lv: number, x: number, z: number, w: number, d: number): void {
  const y = yOf(lv + 1) + 0.2;
  out.push({
    b,
    lv,
    shape: 'box',
    mat: 'mech',
    color: '#c3c7cb',
    x,
    y: y + 0.45,
    z,
    sx: w,
    sy: 0.9,
    sz: d,
    cast: true,
  });
  // Louvre lines on the enclosure.
  out.push({
    b,
    lv,
    lod: 1,
    shape: 'box',
    mat: 'metal',
    color: '#8d939a',
    x,
    y: y + 0.55,
    z: z + d / 2 + 0.01,
    sx: w * 0.9,
    sy: 0.5,
    sz: 0.02,
  });
  const fans = Math.max(1, Math.floor(w / 1.4));
  for (let i = 0; i < fans; i++) {
    const fx = x - w / 2 + (i + 0.5) * (w / fans);
    out.push({
      b,
      lv,
      lod: 1,
      shape: 'cyl',
      mat: 'metal',
      color: '#9aa0a6',
      x: fx,
      y: y + 0.97,
      z,
      sx: 0.9,
      sy: 0.12,
      sz: 0.9,
    });
    out.push({
      b,
      lv,
      lod: 1,
      shape: 'fan',
      mat: 'fan',
      color: '#3a3f45',
      x: fx,
      y: y + 1.05,
      z,
      sx: 0.8,
      sy: 0.05,
      sz: 0.8,
    });
  }
}

/** A planted roof terrace: planter boxes with shrubs and a deck. */
export function addTerrace(out: KitPart[], b: string, lv: number, x: number, z: number, w: number, d: number): void {
  const y = yOf(lv + 1) + 0.2;
  out.push({ b, lv, shape: 'box', mat: 'wood', color: '#a8774e', x, y: y + 0.03, z, sx: w, sy: 0.06, sz: d });
  for (const sx of [-1, 1]) {
    out.push({
      b,
      lv,
      shape: 'box',
      mat: 'concrete',
      color: '#cfcac0',
      x: x + sx * (w / 2 - 0.35),
      y: y + 0.25,
      z,
      sx: 0.6,
      sy: 0.5,
      sz: d - 0.3,
    });
    out.push({
      b,
      lv,
      shape: 'box',
      mat: 'garden',
      color: '#5f9a4c',
      x: x + sx * (w / 2 - 0.35),
      y: y + 0.51,
      z,
      sx: 0.5,
      sy: 0.04,
      sz: d - 0.4,
    });
    const n = Math.max(2, Math.round(d / 1.3));
    for (let i = 0; i < n; i++) {
      const zz = z - d / 2 + 0.6 + (i * (d - 1.2)) / Math.max(1, n - 1);
      out.push({
        b,
        lv,
        lod: 1,
        shape: 'sphere',
        mat: 'foliage',
        color: i % 2 ? '#5d9b4a' : '#4f8c43',
        x: x + sx * (w / 2 - 0.35),
        y: y + 0.85,
        z: zz,
        sx: 0.75,
        sy: 0.65,
        sz: 0.75,
      });
    }
  }
}
