import { CURB_H } from '../streets/grid.ts';
import { FLOOR_HEIGHT, type LayoutBuilding } from '../types.ts';
import type { FacadeStyle, Mass } from './facade.ts';
import type { Part } from './parts.ts';

/**
 * One distinct design per layout building, by kind: the Fast Sales Training Center as a gold-accented HQ (podium,
 * tower, lantern crown and spire), dealerships as glass showrooms under branded towers, the associates' buildings
 * as pre-war brick mid-rises, and the rentals as contemporary curtain-wall towers. Floors stack exactly:
 * floor L spans `BUILDING_BASE_Y + (L - 1) * FLOOR_HEIGHT` to `BUILDING_BASE_Y + L * FLOOR_HEIGHT`.
 */

/** Where floor 1 of every layout building starts (the top of the sidewalk slab). */
export const BUILDING_BASE_Y = CURB_H;

export interface SignSpec {
  text: string;
  /** Centre of the sign in world space. */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  /** Direction the sign faces. */
  face: '+x' | '-x' | '+z' | '-z';
  bg: string;
  fg: string;
}

export interface BuildingDesign {
  key: string;
  masses: Mass[];
  parts: Part[];
  signs: SignSpec[];
  trees: [number, number, number, number][];
  /** Highest point (for labels and the camera). */
  top: number;
  /** Height of the roof of the last floor. */
  roof: number;
}

const FH = FLOOR_HEIGHT;
const at = (floor: number) => BUILDING_BASE_Y + floor * FH;

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map(s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}
/** Brand colours from the layout are bright; architecture takes only a hint of them. */
const mute = (c: string, k = 0.7) => mix(c, '#e2dccf', k);

const DEALER_STYLES: FacadeStyle[] = [
  'stone',
  'glass',
  'fins',
  'ribbon',
  'stone',
  'glass',
  'fins',
  'ribbon',
  'glass',
  'stone',
];

export function designBuilding(b: LayoutBuilding, kindIndex: number, seed: number): BuildingDesign {
  const n = b.floors.length;
  const d: BuildingDesign = { key: b.key, masses: [], parts: [], signs: [], trees: [], top: at(n), roof: at(n) };
  const base = { seed, lit: 0.32, baseY: BUILDING_BASE_Y, ground: 1 };
  const mass = (m: Omit<Mass, 'seed' | 'lit' | 'baseY' | 'ground'> & Partial<Mass>) =>
    d.masses.push({ ...base, ...m, x: b.x + m.x, z: b.z + m.z });
  const part = (p: Part) => d.parts.push({ ...p, x: b.x + p.x, z: b.z + p.z });
  const sign = (s: SignSpec) => d.signs.push({ ...s, x: b.x + s.x, z: b.z + s.z });
  const tree = (x: number, y: number, z: number, s: number) => d.trees.push([b.x + x, y, b.z + z, s]);
  const hw = b.w / 2;
  const hd = b.d / 2;

  if (b.kind === 'training') {
    const podium = 3;
    mass({
      x: 0,
      z: 0,
      w: b.w,
      d: b.d,
      y0: at(0),
      y1: at(podium),
      style: 'stone',
      wall: '#efe8da',
      glass: '#3f6a88',
      ground: 2,
      lit: 0.4,
    });
    const tw = b.w * 0.74;
    const td = b.d * 0.72;
    const tz = -0.6;
    mass({
      x: 0,
      z: tz,
      w: tw,
      d: td,
      y0: at(podium),
      y1: at(n),
      style: 'glass',
      wall: '#b8924a',
      glass: '#3d6a8e',
      lit: 0.4,
    });
    // Gold fins up the tower corners, and gold coping.
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        part({
          shape: 'box',
          mat: 'gold',
          x: sx * (tw / 2 + 0.1),
          y: (at(podium) + at(n) + 0.6) / 2,
          z: tz + sz * (td / 2 + 0.1),
          sx: 0.32,
          sy: at(n) - at(podium) + 0.6,
          sz: 0.32,
        });
    part({ shape: 'box', mat: 'gold', x: 0, y: at(podium) + 0.1, z: 0, sx: b.w + 0.25, sy: 0.2, sz: b.d + 0.25 });
    // Podium terrace: planting beds and trees along the front and sides.
    part({ shape: 'box', mat: 'garden', x: 0, y: at(podium) + 0.3, z: hd - 0.7, sx: b.w - 1.2, sy: 0.4, sz: 1 });
    for (let i = 0; i < 5; i++) tree(-5 + i * 2.5, at(podium) + 0.45, hd - 0.7, 0.55);
    for (const sx of [-1, 1]) {
      part({
        shape: 'box',
        mat: 'garden',
        x: sx * (hw - 0.6),
        y: at(podium) + 0.3,
        z: -0.5,
        sx: 0.8,
        sy: 0.4,
        sz: b.d - 3,
      });
      tree(sx * (hw - 0.6), at(podium) + 0.45, -2.5, 0.5);
      tree(sx * (hw - 0.6), at(podium) + 0.45, 1.5, 0.5);
    }
    // Lantern crown in two setbacks, gold rims, spire and beacon: the highest point of the lots.
    let y = at(n);
    for (const [k, h] of [
      [0.7, 2.6],
      [0.45, 2.3],
    ] as const) {
      mass({
        x: 0,
        z: tz,
        w: tw * k,
        d: td * k,
        y0: y,
        y1: y + h,
        style: 'crown',
        wall: '#b88a3a',
        glass: '#3a5468',
        ground: 0,
      });
      part({ shape: 'box', mat: 'gold', x: 0, y: y + h + 0.1, z: tz, sx: tw * k + 0.3, sy: 0.2, sz: td * k + 0.3 });
      y += h + 0.2;
    }
    part({ shape: 'cone', mat: 'gold', x: 0, y: y + 5, z: tz, sx: 0.8, sy: 10, sz: 0.8 });
    part({ shape: 'sphere', mat: 'hqBeacon', x: 0, y: y + 10.1, z: tz, sx: 0.55, sy: 0.55, sz: 0.55 });
    d.top = y + 10.5;
    // Entrance: canopy with a lit soffit and a gold edge.
    part({ shape: 'box', mat: 'darkMetal', x: 0, y: at(0) + 2.2, z: hd + 0.85, sx: 6, sy: 0.18, sz: 1.7 });
    part({ shape: 'box', mat: 'gold', x: 0, y: at(0) + 2.2, z: hd + 1.71, sx: 6.05, sy: 0.2, sz: 0.06 });
    part({ shape: 'box', mat: 'glow', x: 0, y: at(0) + 2.1, z: hd + 0.85, sx: 5.6, sy: 0.02, sz: 1.4 });
    sign({
      text: 'FAST SALES TRAINING CENTER',
      x: 0,
      y: at(podium) - 0.45,
      z: hd + 0.03,
      w: 9.5,
      h: 0.62,
      face: '+z',
      bg: '#0f1b2d',
      fg: '#f5b335',
    });
    return d;
  }

  if (b.kind === 'dealership') {
    const style = DEALER_STYLES[kindIndex % DEALER_STYLES.length]!;
    const glassy = style !== 'stone';
    const wall = glassy ? mix('#9aa2a8', b.color, 0.18) : mute(b.color, 0.72);
    const glass = mix('#3f6a88', b.color, 0.15);
    // Double-height glass showroom with a brand-coloured fascia.
    mass({
      x: 0,
      z: 0,
      w: b.w,
      d: b.d,
      y0: at(0),
      y1: at(2),
      style: 'glass',
      wall: '#2b2f33',
      glass: '#4a7a98',
      ground: 2,
      lit: 1,
    });
    part({
      shape: 'box',
      mat: 'accent',
      x: 0,
      y: at(2) - 0.26,
      z: 0,
      sx: b.w + 0.2,
      sy: 0.58,
      sz: b.d + 0.2,
      color: b.accent,
    });
    const tw = b.w - 1;
    mass({ x: 0, z: -0.3, w: tw, d: b.d - 1.2, y0: at(2), y1: at(n), style, wall, glass, lit: 0.35 });
    // A brand-coloured fin up one front corner.
    part({
      shape: 'box',
      mat: 'accent',
      x: tw / 2 - 0.1,
      y: (at(2) + at(n) + 1.2) / 2,
      z: -0.3 + (b.d - 1.2) / 2 + 0.12,
      sx: 0.36,
      sy: at(n) - at(2) + 1.2,
      sz: 0.36,
      color: b.accent,
    });
    // Fascia signs on the front and the side, and a lit rooftop sign.
    const brand = (b.brand ?? b.shortName).toUpperCase();
    sign({ text: brand, x: 0, y: at(2) - 0.28, z: hd + 0.115, w: 6, h: 0.46, face: '+z', bg: b.accent, fg: '#ffffff' });
    sign({ text: brand, x: hw + 0.115, y: at(2) - 0.28, z: 0, w: 6, h: 0.46, face: '+x', bg: b.accent, fg: '#ffffff' });
    const roof = at(n);
    for (const sx of [-1.8, 1.8])
      part({ shape: 'box', mat: 'steel', x: sx, y: roof + 0.5, z: 1.5, sx: 0.12, sy: 1, sz: 0.12 });
    part({ shape: 'box', mat: 'darkMetal', x: 0, y: roof + 1.6, z: 1.5, sx: 5.2, sy: 1.3, sz: 0.2 });
    sign({ text: brand, x: 0, y: roof + 1.6, z: 1.61, w: 5, h: 1.1, face: '+z', bg: '#121418', fg: '#ffffff' });
    mass({
      x: -1.2,
      z: -1.6,
      w: 3.4,
      d: 3,
      y0: roof,
      y1: roof + 1.4,
      style: 'louvre',
      wall: '#8f969c',
      glass: '#333',
      ground: 0,
    });
    d.top = roof + 2.3;
    return d;
  }

  if (b.kind === 'associates') {
    const brick = mix(kindIndex % 2 ? '#b0573c' : '#b86d50', b.color, 0.1);
    const stone = '#e6dbc6';
    mass({ x: 0, z: 0, w: b.w, d: b.d, y0: at(0), y1: at(2), style: 'stone', wall: stone, glass: '#3c5a70' });
    mass({
      x: 0,
      z: 0,
      w: b.w,
      d: b.d,
      y0: at(2),
      y1: at(n - 2),
      style: 'brick',
      wall: brick,
      glass: '#3c5a70',
      lit: 0.35,
    });
    mass({
      x: 0,
      z: -0.4,
      w: b.w - 1.4,
      d: b.d - 2.2,
      y0: at(n - 2),
      y1: at(n),
      style: 'brick',
      wall: brick,
      glass: '#3c5a70',
      lit: 0.35,
    });
    for (const [y, w, dd, z] of [
      [at(2), b.w, b.d, 0],
      [at(n - 2), b.w, b.d, 0],
      [at(n), b.w - 1.4, b.d - 2.2, -0.4],
    ] as const)
      part({ shape: 'box', mat: 'stone', x: 0, y: y - 0.2, z, sx: w + 0.4, sy: 0.28, sz: dd + 0.4 });
    // Awnings over the shop fronts and the entrance.
    const awning = kindIndex % 2 ? '#1f8a8a' : '#0f1b2d';
    part({
      shape: 'box',
      mat: 'awning',
      x: 0,
      y: at(0) + 1.15,
      z: hd + 0.5,
      sx: b.w * 0.75,
      sy: 0.08,
      sz: 1,
      rx: 0.22,
      color: awning,
    });
    part({
      shape: 'box',
      mat: 'awning',
      x: hw + 0.5,
      y: at(0) + 1.15,
      z: 0,
      sx: 1,
      sy: 0.08,
      sz: b.d * 0.6,
      rz: -0.22,
      color: awning,
    });
    sign({
      text: 'RICK CASE HONDA',
      x: 0,
      y: at(2) - 0.42,
      z: hd + 0.03,
      w: 5.2,
      h: 0.42,
      face: '+z',
      bg: '#1b1f24',
      fg: '#f6f3ec',
    });
    // Water tank on the roof.
    const roof = at(n);
    part({ shape: 'box', mat: 'steel', x: 1.3, y: roof + 0.6, z: -1.6, sx: 1.6, sy: 1.2, sz: 1.6 });
    part({ shape: 'octa', mat: 'tank', x: 1.3, y: roof + 2.1, z: -1.6, sx: 2, sy: 1.9, sz: 2 });
    part({ shape: 'cone', mat: 'tankRoof', x: 1.3, y: roof + 3.4, z: -1.6, sx: 2.15, sy: 0.8, sz: 2.15 });
    d.top = roof + 3.8;
    return d;
  }

  // Rentals: contemporary curtain-wall towers with a setback terrace.
  const variants: { style: FacadeStyle; wall: string; glass: string; canopy: string }[] = [
    { style: 'fins', wall: '#a89276', glass: '#7a6a52', canopy: '#ff7a5c' },
    { style: 'glass', wall: '#d5dbdf', glass: '#3d7f86', canopy: '#1f8a8a' },
    { style: 'ribbon', wall: '#eeeae2', glass: '#4c7676', canopy: '#5b9a5b' },
  ];
  const v = variants[kindIndex % variants.length]!;
  const setback = n - 2;
  mass({
    x: 0,
    z: 0,
    w: b.w,
    d: b.d,
    y0: at(0),
    y1: at(setback),
    style: v.style,
    wall: v.wall,
    glass: v.glass,
    lit: 0.35,
  });
  mass({
    x: 0,
    z: -0.7,
    w: b.w - 1.8,
    d: b.d - 2.4,
    y0: at(setback),
    y1: at(n),
    style: v.style,
    wall: v.wall,
    glass: v.glass,
    lit: 0.35,
  });
  // Terrace planting on the setback, and a mechanical penthouse on top.
  part({ shape: 'box', mat: 'garden', x: 0, y: at(setback) + 0.2, z: hd - 0.55, sx: b.w - 0.6, sy: 0.3, sz: 0.8 });
  for (const x of [-3, 0, 3]) tree(x, at(setback) + 0.3, hd - 0.55, 0.45);
  mass({
    x: 0.8,
    z: -1.4,
    w: 3.6,
    d: 3,
    y0: at(n),
    y1: at(n) + 1.5,
    style: 'louvre',
    wall: '#9aa1a7',
    glass: '#333',
    ground: 0,
  });
  part({ shape: 'box', mat: 'accent', x: 0, y: at(0) + 1.25, z: hd + 0.7, sx: 4, sy: 0.16, sz: 1.4, color: v.canopy });
  part({ shape: 'box', mat: 'glow', x: 0, y: at(0) + 1.16, z: hd + 0.7, sx: 3.6, sy: 0.02, sz: 1.1 });
  sign({
    text: b.name.toUpperCase(),
    x: 0,
    y: at(1) + 0.35,
    z: hd + 0.03,
    w: 4.2,
    h: 0.36,
    face: '+z',
    bg: '#1b1f24',
    fg: '#f6f3ec',
  });
  d.top = at(n) + 1.6;
  return d;
}
