import { CURB_H } from '../streets/grid.ts';
import { type CityLayout, FLOOR_HEIGHT, type LayoutBuilding } from '../types.ts';
import { addPlant, addRoof, addTerrace, addVolume, type FacadeKind, type KitPart, type Volume } from './kit.ts';

/**
 * One designed building per layout lot (X02): real massing and facade depth from the facade kit, a detailed
 * entrance, rooftops with parapets, plant, terraces and greenery. Floors stack exactly: floor L spans
 * `BUILDING_BASE_Y + (L - 1) * FLOOR_HEIGHT` to `BUILDING_BASE_Y + L * FLOOR_HEIGHT` (1 unit ≈ 3.5 m).
 */

/** Where floor 1 of every layout building starts (the top of the sidewalk slab). */
export const BUILDING_BASE_Y = CURB_H;

export type Side = '+x' | '-x' | '+z' | '-z';

export interface SignSpec {
  text: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  face: Side;
  bg: string;
  fg: string;
  /** Floor it moves with when exploded. */
  lv: number;
  /** Owning building key (filled in by the designer). */
  b?: string;
}

/** A box the building occupies (for picking and the hover outline). */
export interface OutlineBox {
  x: number;
  z: number;
  w: number;
  d: number;
  y0: number;
  y1: number;
  /** Floor range, so the outline can follow exploded floors. */
  from: number;
  to: number;
}

export interface BuildingDesign {
  key: string;
  parts: KitPart[];
  signs: SignSpec[];
  outline: OutlineBox[];
  /** Highest point (crown, spire, sign frame). */
  top: number;
  /** Height of the roof of the last floor. */
  roof: number;
  entrance: Side;
}

const FH = FLOOR_HEIGHT;
const at = (level: number) => BUILDING_BASE_Y + (level - 1) * FH;

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map(s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

interface DealerSpec {
  kind: FacadeKind;
  frameMat: string;
  frame: string;
  glass: string;
  fin?: number;
  top: 'wedge' | 'setback' | 'lantern' | 'louvre' | 'plant' | 'terrace' | 'stepped';
  tw: number;
  td: number;
  tz: number;
}

/** Nine dealership towers, each with its own facade system and top. */
const DEALERS: DealerSpec[] = [
  { kind: 'curtain', frameMat: 'metal', frame: '#aab0b6', glass: '#6f8ea6', top: 'wedge', tw: 8, td: 8, tz: -0.3 },
  {
    kind: 'masonry',
    frameMat: 'concrete',
    frame: '#dcd7cd',
    glass: '#7b98ab',
    top: 'setback',
    tw: 8.2,
    td: 7.6,
    tz: -0.5,
  },
  { kind: 'ribbon', frameMat: 'panel', frame: '#dfe2e5', glass: '#5b88ad', top: 'plant', tw: 8.4, td: 8, tz: -0.2 },
  {
    kind: 'fins',
    frameMat: 'metal',
    frame: '#8b6b47',
    glass: '#4b5a64',
    fin: 0.45,
    top: 'louvre',
    tw: 8,
    td: 8,
    tz: -0.3,
  },
  {
    kind: 'masonry',
    frameMat: 'stone',
    frame: '#d9cfb9',
    glass: '#6a8595',
    top: 'stepped',
    tw: 8.4,
    td: 8.2,
    tz: -0.2,
  },
  { kind: 'curtain', frameMat: 'metal', frame: '#33404f', glass: '#86a8c0', top: 'plant', tw: 8.2, td: 8, tz: -0.3 },
  {
    kind: 'masonry',
    frameMat: 'brick',
    frame: '#a9543b',
    glass: '#566e7d',
    top: 'terrace',
    tw: 8.2,
    td: 7.8,
    tz: -0.4,
  },
  {
    kind: 'fins',
    frameMat: 'metal',
    frame: '#24324a',
    glass: '#64829c',
    fin: 0.3,
    top: 'lantern',
    tw: 7.8,
    td: 7.8,
    tz: -0.3,
  },
  { kind: 'curtain', frameMat: 'metal', frame: '#e2e3e0', glass: '#93b6c9', top: 'plant', tw: 8.2, td: 8.2, tz: -0.2 },
];

export function designBuilding(b: LayoutBuilding, kindIndex: number): BuildingDesign {
  const n = b.floors.length;
  const parts: KitPart[] = [];
  const signs: SignSpec[] = [];
  const outline: OutlineBox[] = [];
  const key = b.key;
  const hw = b.w / 2;
  const hd = b.d / 2;
  const vol = (v: Omit<Volume, 'b'>) => {
    const abs = { ...v, b: key, x: b.x + v.x, z: b.z + v.z };
    addVolume(parts, abs);
    outline.push({ x: abs.x, z: abs.z, w: v.w, d: v.d, y0: at(v.from), y1: at(v.to + 1), from: v.from, to: v.to });
  };
  const part = (p: Omit<KitPart, 'b'>) => parts.push({ ...p, b: key, x: b.x + p.x, z: b.z + p.z });
  const sign = (s: SignSpec) => signs.push({ ...s, b: key, x: b.x + s.x, z: b.z + s.z });
  const plant = (lv: number, x: number, z: number, w: number, d: number) =>
    addPlant(parts, key, lv, b.x + x, b.z + z, w, d);
  const terrace = (lv: number, x: number, z: number, w: number, d: number) =>
    addTerrace(parts, key, lv, b.x + x, b.z + z, w, d);
  const roofOf = (v: Omit<Volume, 'b'>) => addRoof(parts, { ...v, b: key, x: b.x + v.x, z: b.z + v.z });

  /** Entrance on the +z face: canopy with lit soffit, glazed doors in a dark frame, a step. */
  const entrance = (width: number, canopyMat: string, canopy: string, height = 1.2, depth = 1.6) => {
    const y = at(1) + height;
    part({
      shape: 'box',
      mat: canopyMat,
      color: canopy,
      x: 0,
      y: y + 0.09,
      z: hd + depth / 2,
      sx: width,
      sy: 0.18,
      sz: depth,
      lv: 1,
      cast: true,
    });
    part({
      shape: 'box',
      mat: 'glow',
      color: '#ffffff',
      x: 0,
      y: y - 0.005,
      z: hd + depth / 2,
      sx: width - 0.3,
      sy: 0.02,
      sz: depth - 0.3,
      lv: 1,
    });
    part({
      shape: 'box',
      mat: 'doorGlass',
      color: '#4d5a60',
      x: 0,
      y: at(1) + 0.5,
      z: hd + 0.02,
      sx: 1.8,
      sy: 1.0,
      sz: 0.04,
      lv: 1,
    });
    for (const sx of [-0.92, 0, 0.92])
      part({
        shape: 'box',
        mat: 'metal',
        color: '#2b2f34',
        x: sx,
        y: at(1) + 0.5,
        z: hd + 0.05,
        sx: 0.06,
        sy: 1.0,
        sz: 0.06,
        lv: 1,
      });
    part({
      shape: 'box',
      mat: 'concrete',
      color: '#cdc8bd',
      x: 0,
      y: at(1) + 0.03,
      z: hd + 0.5,
      sx: 2.6,
      sy: 0.06,
      sz: 1.0,
      lv: 1,
    });
  };

  if (b.kind === 'training') {
    // Limestone podium with a double-height glass lobby, a colonnade storey, and a gold-finned glass tower
    // crowned by a lit lantern and spire: the campus centrepiece.
    vol({
      x: 0,
      z: 0,
      w: b.w,
      d: b.d,
      from: 1,
      to: 2,
      storeys: 2,
      pinLevel: 1,
      kind: 'store',
      frameMat: 'stone',
      frame: '#ddd4c2',
      glass: '#41586a',
    });
    vol({
      x: 0,
      z: 0,
      w: b.w,
      d: b.d,
      from: 3,
      to: 3,
      kind: 'masonry',
      bay: 1.4,
      frameMat: 'stone',
      frame: '#ddd4c2',
      glass: '#9fbfd2',
      roof: true,
      roofMat: 'deck',
      parapet: '#ddd4c2',
    });
    const tw = 10.2;
    const td = 8.4;
    const tz = -0.9;
    vol({
      x: 0,
      z: tz,
      w: tw,
      d: td,
      from: 4,
      to: n,
      kind: 'fins',
      fin: 0.32,
      bay: 0.85,
      frameMat: 'gold',
      frame: '#c9a24a',
      glass: '#a7c7da',
    });
    // Podium roof garden in front of the tower.
    for (const x of [-4.8, -1.6, 1.6, 4.8]) {
      part({
        shape: 'box',
        mat: 'concrete',
        color: '#d8d2c6',
        x,
        y: at(4) + 0.45,
        z: hd - 0.9,
        sx: 2.6,
        sy: 0.5,
        sz: 1.0,
        lv: 3,
      });
      part({
        shape: 'box',
        mat: 'garden',
        color: '#5f9a4c',
        x,
        y: at(4) + 0.71,
        z: hd - 0.9,
        sx: 2.5,
        sy: 0.04,
        sz: 0.9,
        lv: 3,
      });
      part({
        shape: 'sphere',
        mat: 'foliage',
        color: '#5a9a48',
        x,
        y: at(4) + 1.25,
        z: hd - 0.9,
        sx: 1.2,
        sy: 1.1,
        sz: 1.0,
        lv: 3,
        lod: 1,
      });
    }
    // Lantern crown in two lit tiers with gold rims, then the spire and beacon.
    let y = at(n + 1);
    part({
      shape: 'box',
      mat: 'gold',
      color: '#c9a24a',
      x: 0,
      y: y + 0.12,
      z: tz,
      sx: tw + 0.2,
      sy: 0.24,
      sz: td + 0.2,
      lv: n,
      cast: true,
    });
    y += 0.24;
    for (const [k, h] of [
      [0.68, 2.6],
      [0.44, 2.2],
    ] as const) {
      part({
        shape: 'box',
        mat: 'lantern',
        color: '#f3e3b8',
        x: 0,
        y: y + h / 2,
        z: tz,
        sx: tw * k,
        sy: h,
        sz: td * k,
        lv: n,
        cast: true,
      });
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          part({
            shape: 'box',
            mat: 'gold',
            color: '#c9a24a',
            x: (sx * tw * k) / 2,
            y: y + h / 2,
            z: tz + (sz * td * k) / 2,
            sx: 0.16,
            sy: h,
            sz: 0.16,
            lv: n,
          });
      part({
        shape: 'box',
        mat: 'gold',
        color: '#c9a24a',
        x: 0,
        y: y + h + 0.1,
        z: tz,
        sx: tw * k + 0.3,
        sy: 0.2,
        sz: td * k + 0.3,
        lv: n,
        cast: true,
      });
      y += h + 0.2;
    }
    part({
      shape: 'cone',
      mat: 'gold',
      color: '#d9b35a',
      x: 0,
      y: y + 4.5,
      z: tz,
      sx: 0.7,
      sy: 9,
      sz: 0.7,
      lv: n,
      cast: true,
    });
    part({
      shape: 'sphere',
      mat: 'beacon',
      color: '#ffe2a0',
      x: 0,
      y: y + 9.1,
      z: tz,
      sx: 0.45,
      sy: 0.45,
      sz: 0.45,
      lv: n,
    });
    entrance(6.4, 'gold', '#c9a24a', 2.25, 2.2);
    sign({
      text: 'FAST SALES TRAINING CENTER',
      x: 0,
      y: at(3) + 0.8,
      z: hd + 0.29,
      w: 9,
      h: 0.5,
      face: '+z',
      bg: '#0f1b2d',
      fg: '#f5b335',
      lv: 3,
    });
  } else if (b.kind === 'dealership') {
    const s = DEALERS[kindIndex % DEALERS.length]!;
    // Double-height glass showroom with a brand-coloured fascia.
    vol({
      x: 0,
      z: 0,
      w: b.w,
      d: b.d,
      from: 1,
      to: 2,
      storeys: 2,
      pinLevel: 1,
      kind: 'store',
      frameMat: 'metal',
      frame: '#2c3035',
      glass: '#3e5560',
      roof: true,
      roofMat: 'deck',
      parapet: b.accent,
    });
    part({
      shape: 'box',
      mat: 'paint',
      color: b.accent,
      x: 0,
      y: at(3) - 0.33,
      z: 0,
      sx: b.w + 0.24,
      sy: 0.6,
      sz: b.d + 0.24,
      lv: 2,
      cast: true,
    });
    const brand = (b.brand ?? b.shortName).toUpperCase();
    sign({
      text: brand,
      x: 0,
      y: at(3) - 0.33,
      z: hd + 0.13,
      w: 5.2,
      h: 0.44,
      face: '+z',
      bg: b.accent,
      fg: '#ffffff',
      lv: 2,
    });
    sign({
      text: brand,
      x: hw + 0.13,
      y: at(3) - 0.33,
      z: 0,
      w: 5.2,
      h: 0.44,
      face: '+x',
      bg: b.accent,
      fg: '#ffffff',
      lv: 2,
    });
    // The tower.
    const top = s.top === 'setback' || s.top === 'stepped' ? n - 2 : n;
    const tower = {
      x: 0,
      z: s.tz,
      w: s.tw,
      d: s.td,
      kind: s.kind,
      frameMat: s.frameMat,
      frame: s.frame,
      glass: s.glass,
      fin: s.fin,
    };
    vol({ ...tower, from: 3, to: top, roof: top === n });
    // A brand-coloured fin up the front corner, floor by floor.
    for (let lv = 3; lv <= top; lv++)
      part({
        shape: 'box',
        mat: 'paint',
        color: b.accent,
        x: s.tw / 2 - 0.25,
        y: at(lv) + FH / 2,
        z: s.tz + s.td / 2 + 0.2,
        sx: 0.32,
        sy: FH,
        sz: 0.4,
        lv,
      });
    let roofY = at(n + 1);
    if (s.top === 'setback' || s.top === 'stepped') {
      roofOf({ ...tower, from: 3, to: top });
      const k = s.top === 'stepped' ? 0.82 : 0.74;
      vol({ ...tower, w: s.tw * k, d: s.td * k, z: s.tz - (s.td * (1 - k)) / 2, from: top + 1, to: n, roof: true });
      terrace(top, 0, s.tz + s.td / 2 - 0.9, s.tw - 1, 1.3);
    }
    if (s.top === 'wedge') {
      part({
        shape: 'wedge',
        mat: 'darkMetal',
        color: '#3a4048',
        x: 0,
        y: roofY + 1.6,
        z: s.tz,
        sx: s.tw,
        sy: 3.2,
        sz: s.td,
        ry: -Math.PI / 2,
        lv: n,
        cast: true,
      });
      roofY += 3.2;
    } else if (s.top === 'lantern') {
      part({
        shape: 'box',
        mat: 'lantern',
        color: '#dfe9f2',
        x: 0,
        y: roofY + 1.3,
        z: s.tz,
        sx: s.tw * 0.62,
        sy: 2.2,
        sz: s.td * 0.62,
        lv: n,
        cast: true,
      });
      part({
        shape: 'box',
        mat: 'metal',
        color: s.frame,
        x: 0,
        y: roofY + 2.5,
        z: s.tz,
        sx: s.tw * 0.66,
        sy: 0.2,
        sz: s.td * 0.66,
        lv: n,
      });
      roofY += 2.6;
    } else if (s.top === 'louvre') {
      part({
        shape: 'box',
        mat: 'louvre',
        color: s.frame,
        x: 0,
        y: roofY + 1.1,
        z: s.tz - 0.6,
        sx: s.tw * 0.7,
        sy: 1.8,
        sz: s.td * 0.55,
        lv: n,
        cast: true,
      });
      roofY += 2;
    } else if (s.top === 'terrace') {
      terrace(n, 0, s.tz + 1.2, s.tw - 1, s.td * 0.45);
      plant(n, 0, s.tz - 2.2, 3.2, 1.8);
    } else {
      plant(n, -1.4, s.tz - 1.6, 3.4, 2.2);
    }
    // Lit rooftop brand sign on a steel frame (in front of the wedge, or over the roof).
    const signZ = s.top === 'wedge' ? s.tz + s.td / 2 + 0.6 : s.tz + 1.8;
    const signY = (s.top === 'wedge' ? at(n + 1) : roofY) + 1.0;
    for (const x of [-1.9, 1.9])
      part({
        shape: 'box',
        mat: 'darkMetal',
        color: '#2b2f34',
        x,
        y: signY - 0.5,
        z: signZ - 0.12,
        sx: 0.1,
        sy: 1.6,
        sz: 0.1,
        lv: n,
      });
    part({
      shape: 'box',
      mat: 'darkMetal',
      color: '#1c1f23',
      x: 0,
      y: signY + 0.3,
      z: signZ - 0.12,
      sx: 4.8,
      sy: 1.0,
      sz: 0.16,
      lv: n,
    });
    sign({
      text: brand,
      x: 0,
      y: signY + 0.3,
      z: signZ - 0.03,
      w: 4.6,
      h: 0.86,
      face: '+z',
      bg: '#15181c',
      fg: '#ffffff',
      lv: n,
    });
    entrance(3.4, 'paint', b.accent, 1.35, 1.5);
  } else if (b.kind === 'associates') {
    // Pre-war mid-rise: stone base with shopfronts, brick (or limestone) shaft, setback crown, cornices, tank.
    const brick = kindIndex % 2 === 0;
    const body = brick
      ? { frameMat: 'brick', frame: mix('#b2573b', b.color, 0.06) }
      : { frameMat: 'stone', frame: '#d8ccb4' };
    vol({
      x: 0,
      z: 0,
      w: b.w,
      d: b.d,
      from: 1,
      to: 1,
      kind: 'store',
      frameMat: 'stone',
      frame: '#dcd2bf',
      glass: '#3c5460',
    });
    vol({
      x: 0,
      z: 0,
      w: b.w,
      d: b.d,
      from: 2,
      to: 2,
      kind: 'masonry',
      bay: 1.15,
      frameMat: 'stone',
      frame: '#dcd2bf',
      glass: '#5d7686',
    });
    vol({
      x: 0,
      z: 0,
      w: b.w,
      d: b.d,
      from: 3,
      to: n - 2,
      kind: 'masonry',
      bay: 1.0,
      ...body,
      glass: '#5a7383',
      roof: true,
      roofMat: 'deck',
      parapet: '#d8ccb4',
    });
    vol({
      x: 0,
      z: -0.5,
      w: b.w - 1.6,
      d: b.d - 2.2,
      from: n - 1,
      to: n,
      kind: 'masonry',
      bay: 1.0,
      ...body,
      glass: '#5a7383',
      roof: true,
    });
    // Cornice at the setback.
    part({
      shape: 'box',
      mat: 'stone',
      color: '#e8dfcd',
      x: 0,
      y: at(n - 1) + 0.12,
      z: 0,
      sx: b.w + 0.5,
      sy: 0.24,
      sz: b.d + 0.5,
      lv: n - 2,
      cast: true,
    });
    terrace(n - 2, 0, hd - 0.9, b.w - 1.2, 1.2);
    // Canvas awnings over the shopfronts.
    const awning = brick ? '#1f3d5c' : '#1f6f6f';
    for (const x of [-2.7, 2.7])
      part({
        shape: 'box',
        mat: 'canvas',
        color: awning,
        x,
        y: at(1) + 1.15,
        z: hd + 0.55,
        sx: 2.2,
        sy: 0.07,
        sz: 1.1,
        rx: 0.3,
        lv: 1,
      });
    // Timber water tank on steel legs.
    const tx = 1.5;
    const tz = -1.6;
    const ry = at(n + 1);
    for (const [lx, lz] of [
      [-0.6, -0.6],
      [0.6, -0.6],
      [-0.6, 0.6],
      [0.6, 0.6],
    ] as const)
      part({
        shape: 'box',
        mat: 'darkMetal',
        color: '#3b3f44',
        x: tx + lx,
        y: ry + 0.6,
        z: tz + lz,
        sx: 0.1,
        sy: 1.2,
        sz: 0.1,
        lv: n,
      });
    part({
      shape: 'octa',
      mat: 'wood',
      color: '#8a6243',
      x: tx,
      y: ry + 2.1,
      z: tz,
      sx: 2,
      sy: 1.8,
      sz: 2,
      lv: n,
      cast: true,
    });
    part({
      shape: 'cone',
      mat: 'darkMetal',
      color: '#3f3a36',
      x: tx,
      y: ry + 3.35,
      z: tz,
      sx: 2.15,
      sy: 0.75,
      sz: 2.15,
      lv: n,
      cast: true,
    });
    plant(n, -1.6, -1.0, 2.2, 1.6);
    sign({
      text: b.shortName.toUpperCase(),
      x: 0,
      y: at(2) - 0.2,
      z: hd + 0.06,
      w: 4.6,
      h: 0.32,
      face: '+z',
      bg: '#1b1f24',
      fg: '#f6f3ec',
      lv: 1,
    });
    entrance(1.9, 'darkMetal', '#24282d', 1.25, 1.2);
  } else {
    // Rentals: three contemporary residential towers.
    const v = kindIndex % 3;
    vol({
      x: 0,
      z: 0,
      w: b.w,
      d: b.d,
      from: 1,
      to: 1,
      kind: 'store',
      frameMat: 'metal',
      frame: '#2e3338',
      glass: '#3e5560',
    });
    if (v === 0) {
      // Wrap-around balconies: concrete slab edges, glass balustrades and timber soffits.
      vol({
        x: 0,
        z: 0,
        w: b.w - 1.4,
        d: b.d - 1.4,
        from: 2,
        to: n,
        kind: 'curtain',
        frameMat: 'metal',
        frame: '#bfc4c8',
        glass: '#9cb9ca',
        roof: true,
      });
      for (let lv = 2; lv <= n; lv++) {
        part({
          shape: 'box',
          mat: 'concrete',
          color: '#dcd8d0',
          x: 0,
          y: at(lv) + 0.08,
          z: 0,
          sx: b.w,
          sy: 0.16,
          sz: b.d,
          lv,
          cast: true,
        });
        part({
          shape: 'box',
          mat: 'wood',
          color: '#b07c50',
          x: 0,
          y: at(lv) - 0.01,
          z: 0,
          sx: b.w - 0.1,
          sy: 0.02,
          sz: b.d - 0.1,
          lv,
          lod: 1,
        });
        for (const [x, z, sx, sz] of [
          [0, hd - 0.04, b.w, 0.04],
          [0, -hd + 0.04, b.w, 0.04],
          [hw - 0.04, 0, 0.04, b.d],
          [-hw + 0.04, 0, 0.04, b.d],
        ] as const)
          part({
            shape: 'box',
            mat: 'railGlass',
            color: '#cfe2ea',
            x,
            y: at(lv) + 0.48,
            z,
            sx,
            sy: 0.64,
            sz,
            lv,
            lod: 1,
          });
      }
      terrace(n, 0, 0.8, b.w - 3, 2.4);
      plant(n, 0, -2, 3, 1.6);
    } else if (v === 1) {
      // The demo building: teal glass between timber fins, a setback garden crown.
      vol({
        x: 0,
        z: 0,
        w: b.w,
        d: b.d,
        from: 2,
        to: n - 2,
        kind: 'fins',
        fin: 0.38,
        bay: 0.8,
        frameMat: 'wood',
        frame: '#b98455',
        glass: '#6aa2ab',
        roof: true,
      });
      vol({
        x: 0,
        z: -0.8,
        w: b.w - 2,
        d: b.d - 2.6,
        from: n - 1,
        to: n,
        kind: 'curtain',
        frameMat: 'metal',
        frame: '#d4d9dc',
        glass: '#7fb0b7',
        roof: true,
      });
      terrace(n - 2, 0, hd - 0.85, b.w - 1.2, 1.3);
      terrace(n, 0, 0, b.w - 3.4, 2.2);
      plant(n, 0, -2.2, 2.6, 1.2);
    } else {
      // White ribbon bands stepping back in terraces.
      const band = { kind: 'ribbon' as const, frameMat: 'panel', frame: '#e3dfd7', glass: '#7fa1b3', roof: true };
      vol({ x: 0, z: 0, w: b.w, d: b.d, from: 2, to: 8, ...band });
      vol({ x: -0.8, z: 0, w: b.w - 1.6, d: b.d, from: 9, to: 10, ...band });
      vol({ x: -1.6, z: 0, w: b.w - 3.2, d: b.d, from: 11, to: n, ...band });
      terrace(8, hw - 0.8, 0, 1.4, b.d - 1);
      terrace(10, hw - 2.4, 0, 1.4, b.d - 1);
      plant(n, -1.6, -1.5, 2.6, 1.6);
    }
    entrance(3.2, 'metal', '#2e3338', 1.2, 1.5);
    sign({
      text: b.name.toUpperCase(),
      x: 0,
      y: at(1) + 1.27,
      z: hd + 1.51,
      w: 3.0,
      h: 0.2,
      face: '+z',
      bg: '#1b1f24',
      fg: '#f6f3ec',
      lv: 1,
    });
  }

  let top = at(n + 1);
  for (const p of parts) top = Math.max(top, p.y + p.sy / 2);
  for (const s of signs) top = Math.max(top, s.y + s.h / 2);
  return { key, parts, signs, outline, top, roof: at(n + 1), entrance: '+z' };
}

/** Every layout building with its design (kind index counts buildings of the same kind, for variants). */
export function designAll(layout: CityLayout): { building: LayoutBuilding; design: BuildingDesign }[] {
  const count: Record<string, number> = {};
  return layout.buildings.map(b => {
    const k = (count[b.kind] = (count[b.kind] ?? -1) + 1);
    return { building: b, design: designBuilding(b, k) };
  });
}
