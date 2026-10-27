import * as THREE from 'three';
import { PartBuilder } from '../mesh-utils.ts';
import { VEHICLE_SPEC, type VehicleKind } from './sim.ts';

/**
 * Vehicle models, facing +x with the wheels on y = 0. Bodies are side profiles extruded across the width with a
 * small bevel: the profile has real wheel arches (the wheels sit inside the body), a hood, a boot and a sloped
 * windscreen on a narrower, tapered glasshouse. Proportions follow real cars at the city's scale (a 4.7 m sedan is
 * 1.8 units long, so it is about 0.56 units tall).
 *
 * Shader slots: paint takes the per-instance colour, `paintLight` a lighter shade of it (the body-side
 * highlight line), lights glow from the shader.
 */
export const SLOT = {
  paint: 0,
  fixed: 1,
  head: 2,
  tail: 3,
  beaconRed: 4,
  beaconBlue: 5,
  sign: 6,
  glass: 7,
  paintLight: 8,
} as const;

/** `low` drops bevels and uses fewer wheel segments, for the lowest quality. */
export type VehicleDetail = 'full' | 'low';

const GLASS = '#1c262f';
const TRIM = '#1b1d20';
const TYRE = '#121314';
const RIM = '#7d848b';

interface Profile {
  len: number;
  /** Underside height between the wheels. */
  sill: number;
  wheelR: number;
  /** Wheel centres along x. */
  wheels: number[];
  /** Points from the front bumper over the top to the rear, as [x, y]; the underside and arches are added. */
  top: [number, number][];
}

/** A closed side silhouette: underside with an arch over every wheel, then the given top line. */
function profileShape(p: Profile, detail: VehicleDetail): THREE.Shape {
  const s = new THREE.Shape();
  const half = p.len / 2;
  const ra = p.wheelR + 0.035;
  const dy = Math.max(-0.99, Math.min(0.99, (p.sill - p.wheelR) / ra));
  s.moveTo(-half, p.sill);
  for (const x of [...p.wheels].sort((a, b) => a - b)) {
    const left = Math.PI - Math.asin(dy);
    const right = Math.asin(dy);
    s.lineTo(x + ra * Math.cos(left), p.sill);
    const steps = detail === 'low' ? 4 : 7;
    for (let i = 0; i <= steps; i++) {
      const a = left + ((right - left) * i) / steps;
      s.lineTo(x + ra * Math.cos(a), p.wheelR + ra * Math.sin(a));
    }
  }
  s.lineTo(half, p.sill);
  for (const [x, y] of p.top) s.lineTo(x, y);
  s.lineTo(-half, p.sill);
  return s;
}

/** Extrude a side shape across the width, centred on z = 0. */
function extrude(shape: THREE.Shape, width: number, detail: VehicleDetail, bevel = 0.035) {
  const b = detail === 'low' ? 0 : bevel;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, width - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    curveSegments: 4,
  });
  g.translate(0, 0, -(width - 2 * b) / 2);
  return g;
}

function quad(pts: [number, number][]) {
  const s = new THREE.Shape();
  s.moveTo(pts[0]![0], pts[0]![1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  s.closePath();
  return s;
}

function wheels(b: PartBuilder, xs: number[], halfW: number, r: number, detail: VehicleDetail, tread = 0.12) {
  const seg = detail === 'low' ? 8 : 14;
  for (const x of xs)
    for (const z of [-halfW, halfW]) {
      b.add(new THREE.CylinderGeometry(r, r, tread, seg, 1), {
        at: [x, r, z],
        rot: [Math.PI / 2, 0, 0],
        color: TYRE,
        slot: SLOT.fixed,
      });
      if (detail === 'full')
        b.add(new THREE.CylinderGeometry(r * 0.62, r * 0.62, tread + 0.006, 8, 1), {
          at: [x, r, z],
          rot: [Math.PI / 2, 0, 0],
          color: RIM,
          slot: SLOT.fixed,
        });
    }
}

/** Head and tail lamps, slightly proud of the bumper faces. */
function lamps(
  b: PartBuilder,
  front: number,
  rear: number,
  y: number,
  z: number,
  opts: { h?: number; w?: number; tailW?: number } = {},
) {
  const h = opts.h ?? 0.05;
  for (const s of [-1, 1]) {
    b.add(new THREE.BoxGeometry(0.03, h, opts.w ?? 0.15), {
      at: [front + 0.004, y, s * z],
      color: '#f4f1e6',
      slot: SLOT.head,
    });
    b.add(new THREE.BoxGeometry(0.03, h, opts.tailW ?? 0.18), {
      at: [rear - 0.004, y, s * z],
      color: '#8e0d14',
      slot: SLOT.tail,
    });
  }
}

function bumpers(b: PartBuilder, front: number, rear: number, w: number, y: number, h = 0.08) {
  b.add(new THREE.BoxGeometry(0.05, h, w * 0.96), { at: [front, y, 0], color: TRIM, slot: SLOT.fixed });
  b.add(new THREE.BoxGeometry(0.05, h, w * 0.96), { at: [rear, y, 0], color: TRIM, slot: SLOT.fixed });
}

/** Side highlight line along the body (a lighter crease catching the light) and a dark sill. */
function sideLines(b: PartBuilder, len: number, w: number, y: number, sillY: number, detail: VehicleDetail) {
  if (detail === 'low') return;
  for (const s of [-1, 1]) {
    b.add(new THREE.BoxGeometry(len, 0.014, 0.004), { at: [0, y, s * (w / 2 + 0.002)], slot: SLOT.paintLight });
    b.add(new THREE.BoxGeometry(len * 0.92, 0.035, 0.004), {
      at: [0, sillY, s * (w / 2 + 0.001)],
      color: TRIM,
      slot: SLOT.fixed,
    });
  }
}

interface CarShape {
  len: number;
  w: number;
  sill: number;
  wheelR: number;
  axle: number;
  /** Shoulder (belt line) height and hood/boot shape. */
  belt: number;
  nose: number;
  tail: number;
  hood: number;
  boot: number;
  /** Glasshouse: roof height, windscreen and rear-window runs, roof length. */
  roof: number;
  screen: number;
  rearRun: number;
  cabinShift: number;
}

function car(b: PartBuilder, c: CarShape, detail: VehicleDetail) {
  const half = c.len / 2;
  const wheelXs = [-c.axle, c.axle];
  const body = profileShape(
    {
      len: c.len,
      sill: c.sill,
      wheelR: c.wheelR,
      wheels: wheelXs,
      top: [
        [half, c.nose],
        [half - 0.06, c.belt - 0.035],
        [half - c.hood, c.belt],
        [-half + c.boot, c.belt + 0.01],
        [-half + 0.03, c.belt - 0.02],
        [-half, c.tail],
      ],
    },
    detail,
  );
  b.add(extrude(body, c.w, detail), { slot: SLOT.paint });
  // Glasshouse: narrower and tapered, windscreen sloped back from the end of the hood.
  const front = half - c.hood + c.cabinShift;
  const rear = -half + c.boot + c.cabinShift;
  const glass = quad([
    [front, c.belt - 0.01],
    [front - c.screen, c.roof],
    [rear + c.rearRun, c.roof],
    [rear, c.belt - 0.01],
  ]);
  b.add(extrude(glass, c.w * 0.84, detail, 0.025), { color: GLASS, slot: SLOT.glass });
  // Roof skin over the glass, and B-pillars, both in body colour.
  const roof = quad([
    [front - c.screen + 0.02, c.roof - 0.035],
    [front - c.screen - 0.01, c.roof + 0.005],
    [rear + c.rearRun + 0.01, c.roof + 0.005],
    [rear + c.rearRun - 0.02, c.roof - 0.035],
  ]);
  b.add(extrude(roof, c.w * 0.86, detail, 0.02), { slot: SLOT.paint });
  const pillarX = (front - c.screen + rear + c.rearRun) / 2 + 0.02;
  for (const s of [-1, 1])
    b.add(new THREE.BoxGeometry(0.05, c.roof - c.belt - 0.02, 0.006), {
      at: [pillarX, (c.roof + c.belt) / 2 - 0.01, s * (c.w * 0.42 + 0.005)],
      slot: SLOT.paint,
    });
  sideLines(b, c.len * 0.8, c.w + (detail === 'low' ? 0 : 0.0), c.belt - 0.05, c.sill + 0.03, detail);
  bumpers(b, half + 0.01, -half - 0.01, c.w, c.sill + 0.07);
  lamps(b, half - 0.01, -half + 0.005, c.belt - 0.06, c.w * 0.33);
  wheels(b, wheelXs, c.w / 2 - 0.065, c.wheelR, detail);
}

const SEDAN: Omit<CarShape, 'len' | 'w'> = {
  sill: 0.11,
  wheelR: 0.135,
  axle: 0.56,
  belt: 0.36,
  nose: 0.25,
  tail: 0.27,
  hood: 0.52,
  boot: 0.3,
  roof: 0.56,
  screen: 0.3,
  rearRun: 0.22,
  cabinShift: 0,
};

function sedan(b: PartBuilder, len: number, w: number, detail: VehicleDetail, taxi: boolean) {
  car(b, { ...SEDAN, len, w }, detail);
  if (taxi) {
    // Roof sign and a dark checker band: a New York cab.
    b.add(new THREE.BoxGeometry(0.26, 0.07, 0.14), { at: [-0.08, 0.6, 0], color: '#fff3c0', slot: SLOT.sign });
    b.add(new THREE.BoxGeometry(0.3, 0.015, 0.16), { at: [-0.08, 0.565, 0], color: TRIM, slot: SLOT.fixed });
    for (const s of [-1, 1])
      b.add(new THREE.BoxGeometry(len * 0.5, 0.028, 0.004), {
        at: [-0.05, 0.27, s * (w / 2 + 0.004)],
        color: '#141414',
        slot: SLOT.fixed,
      });
  }
}

function suv(b: PartBuilder, len: number, w: number, detail: VehicleDetail) {
  car(
    b,
    {
      len,
      w,
      sill: 0.15,
      wheelR: 0.16,
      axle: 0.6,
      belt: 0.45,
      nose: 0.34,
      tail: 0.38,
      hood: 0.45,
      boot: 0.08,
      roof: 0.71,
      screen: 0.26,
      rearRun: 0.06,
      cabinShift: 0,
    },
    detail,
  );
  if (detail === 'full')
    for (const s of [-1, 1])
      b.add(new THREE.BoxGeometry(len * 0.5, 0.02, 0.025), {
        at: [-0.18, 0.735, s * w * 0.33],
        color: TRIM,
        slot: SLOT.fixed,
      });
}

/** A box van: short sloped cab, tall cargo body (about 2.6 m high, 5.7 m long at city scale). */
function van(b: PartBuilder, len: number, w: number, detail: VehicleDetail, livery: string) {
  const half = len / 2;
  const sill = 0.13;
  const r = 0.15;
  const axles = [-half + 0.42, half - 0.42];
  const cab = 0.6;
  const cabTop = 0.62;
  // Cab lower body with arches; cargo box above and behind.
  const body = profileShape(
    {
      len,
      sill,
      wheelR: r,
      wheels: axles,
      top: [
        [half, 0.27],
        [half - 0.04, 0.42],
        [half - 0.2, 0.46],
        [half - cab, 0.46],
        [half - cab, cabTop],
        [-half, cabTop],
        [-half, 0.25],
      ],
    },
    detail,
  );
  b.add(extrude(body, w, detail), { slot: SLOT.paint });
  b.add(
    extrude(
      quad([
        [half - cab - 0.02, cabTop - 0.02],
        [half - cab - 0.02, 1.0],
        [-half, 1.0],
        [-half, cabTop - 0.02],
      ]),
      w * 1.0,
      detail,
      0.025,
    ),
    {
      slot: SLOT.paint,
    },
  );
  // Cab glasshouse with a raked windscreen up to the cargo box.
  b.add(
    extrude(
      quad([
        [half - 0.2, 0.45],
        [half - 0.38, 0.8],
        [half - cab + 0.01, 0.8],
        [half - cab + 0.01, 0.45],
      ]),
      w * 0.9,
      detail,
      0.02,
    ),
    { color: GLASS, slot: SLOT.glass },
  );
  b.add(
    extrude(
      quad([
        [half - 0.4, 0.79],
        [half - 0.42, 0.84],
        [half - cab, 0.84],
        [half - cab, 0.79],
      ]),
      w * 0.92,
      detail,
      0.015,
    ),
    {
      slot: SLOT.paint,
    },
  );
  for (const s of [-1, 1])
    b.add(new THREE.BoxGeometry(len - cab - 0.15, 0.08, 0.004), {
      at: [-cab / 2 + 0.05, 0.48, s * (w / 2 + 0.006)],
      color: livery,
      slot: SLOT.fixed,
    });
  sideLines(b, len * 0.85, w, 0.4, sill + 0.03, detail);
  bumpers(b, half + 0.01, -half - 0.01, w, sill + 0.07);
  lamps(b, half - 0.01, -half + 0.005, 0.37, w * 0.36);
  for (const s of [-1, 1])
    b.add(new THREE.BoxGeometry(0.03, 0.1, 0.06), {
      at: [-half - 0.006, 0.9, s * w * 0.42],
      color: '#8e0d14',
      slot: SLOT.tail,
    });
  wheels(b, axles, w / 2 - 0.07, r, detail, 0.13);
}

/** A city bus: 12 m long, 2.55 m wide, about 3.3 m high at city scale, with a window band and destination sign. */
function bus(b: PartBuilder, len: number, w: number, detail: VehicleDetail) {
  const half = len / 2;
  const r = 0.19;
  const axles = [-half + 1.25, half - 1.0];
  const body = profileShape(
    {
      len,
      sill: 0.17,
      wheelR: r,
      wheels: axles,
      top: [
        [half, 0.28],
        [half + 0.0, 1.2],
        [half - 0.06, 1.27],
        [-half + 0.04, 1.27],
        [-half, 1.2],
        [-half, 0.28],
      ],
    },
    detail,
  );
  b.add(extrude(body, w, detail, 0.05), { slot: SLOT.paint });
  b.add(new THREE.BoxGeometry(len * 0.4, 0.1, w * 0.6), {
    at: [-len * 0.18, 1.32, 0],
    color: '#c9ced3',
    slot: SLOT.fixed,
  });
  for (const s of [-1, 1]) {
    b.add(new THREE.BoxGeometry(len * 0.84, 0.36, 0.006), {
      at: [-0.14, 0.9, s * (w / 2 + 0.004)],
      color: GLASS,
      slot: SLOT.glass,
    });
    b.add(new THREE.BoxGeometry(len * 0.97, 0.08, 0.006), {
      at: [0, 0.5, s * (w / 2 + 0.004)],
      color: '#1f5fa8',
      slot: SLOT.fixed,
    });
    // Doors: darker glass panels.
    for (const x of [half - 0.35, -0.1])
      b.add(new THREE.BoxGeometry(0.34, 0.72, 0.008), {
        at: [x, 0.62, s * (w / 2 + 0.005)],
        color: '#10161c',
        slot: SLOT.glass,
      });
  }
  b.add(new THREE.BoxGeometry(0.008, 0.58, w * 0.88), { at: [half + 0.005, 0.83, 0], color: GLASS, slot: SLOT.glass });
  b.add(new THREE.BoxGeometry(0.008, 0.09, w * 0.6), { at: [half + 0.01, 1.18, 0], color: '#ffb347', slot: SLOT.sign });
  bumpers(b, half + 0.02, -half - 0.02, w, 0.24, 0.1);
  lamps(b, half, -half, 0.36, w * 0.38, { h: 0.07, w: 0.14, tailW: 0.12 });
  wheels(b, axles, w / 2 - 0.08, r, detail, 0.15);
}

function emergency(b: PartBuilder, len: number, w: number, detail: VehicleDetail) {
  van(b, len, w, detail, '#c8102e');
  const half = len / 2;
  const barX = half - 0.47;
  b.add(new THREE.BoxGeometry(0.12, 0.06, w * 0.34), {
    at: [barX, 0.875, -w * 0.19],
    color: '#ff2030',
    slot: SLOT.beaconRed,
  });
  b.add(new THREE.BoxGeometry(0.12, 0.06, w * 0.34), {
    at: [barX, 0.875, w * 0.19],
    color: '#2a5bff',
    slot: SLOT.beaconBlue,
  });
  b.add(new THREE.BoxGeometry(0.06, 0.08, 0.1), {
    at: [-half + 0.05, 1.04, -w * 0.4],
    color: '#ff2030',
    slot: SLOT.beaconRed,
  });
  b.add(new THREE.BoxGeometry(0.06, 0.08, 0.1), {
    at: [-half + 0.05, 1.04, w * 0.4],
    color: '#2a5bff',
    slot: SLOT.beaconBlue,
  });
}

/** One merged geometry per kind, facing +x, wheels on y = 0. */
export function vehicleGeometry(kind: VehicleKind, detail: VehicleDetail = 'full'): THREE.BufferGeometry {
  const { len, width } = VEHICLE_SPEC[kind];
  const b = new PartBuilder();
  if (kind === 'sedan' || kind === 'taxi') sedan(b, len, width, detail, kind === 'taxi');
  else if (kind === 'suv') suv(b, len, width, detail);
  else if (kind === 'van') van(b, len, width, detail, '#f5b335');
  else if (kind === 'bus') bus(b, len, width, detail);
  else emergency(b, len, width, detail);
  return b.build();
}

/**
 * Paint per kind, weighted like a real city street: mostly white, silver, black, grey and dark blue, a few
 * colours, yellow cabs, white fleet vans and buses.
 */
export const PAINTS: Record<VehicleKind, string[]> = {
  sedan: [
    '#ececea',
    '#e2e3e1',
    '#b4b8bc',
    '#a3a8ad',
    '#16171a',
    '#1c1d20',
    '#6a6f75',
    '#53585e',
    '#1e2b42',
    '#26344d',
    '#6f1f24',
    '#2b3e35',
    '#b8ac92',
  ],
  suv: ['#efefed', '#16171a', '#a9aeb3', '#5c6167', '#1e2b42', '#2d2f33', '#e4e4e2', '#3c4a3e'],
  taxi: ['#f3b81a', '#f1b413', '#f4bc20'],
  van: ['#f2f2f0', '#ebecec', '#d9dbdd', '#f2f2f0', '#1f2c44'],
  bus: ['#f2f3f4', '#eceef0'],
  emergency: ['#f6f6f4'],
};

export const VEHICLE_VERTEX_HEAD = /* glsl */ `
attribute float aSlot;
attribute vec2 iState;
varying float vSlot;
varying vec2 vState;
`;

export const VEHICLE_FRAGMENT_HEAD = /* glsl */ `
uniform float uNight;
uniform float uTime;
varying float vSlot;
varying vec2 vState;
`;

/** Glow per slot: headlights and signs scale with night; brake lights add to the tail lights; beacons flash. */
export const VEHICLE_EMISSIVE = /* glsl */ `
{
  float slot = floor(vSlot + 0.5);
  vec3 glow = vec3(0.0);
  if (slot == 2.0) glow = vec3(1.0, 0.93, 0.78) * (0.15 + uNight * 2.6);
  else if (slot == 3.0) glow = vec3(1.0, 0.06, 0.05) * (0.12 + uNight * 0.9 + vState.x * 1.6);
  else if (slot == 6.0) glow = vec3(1.0, 0.82, 0.45) * (0.25 + uNight * 1.4);
  else if (slot == 4.0 || slot == 5.0) {
    float f = fract(uTime * 1.6 + vState.y + (slot == 5.0 ? 0.5 : 0.0));
    float on = step(f, 0.18) + step(0.3, f) * step(f, 0.42);
    glow = (slot == 4.0 ? vec3(1.0, 0.1, 0.1) : vec3(0.15, 0.3, 1.0)) * on * (1.2 + uNight * 2.5);
  }
  totalEmissiveRadiance += glow;
  // Street-lamp fill at night: A1's lamps are emissive, so bodies would otherwise read as black cut-outs.
  if (slot != 7.0) totalEmissiveRadiance += diffuseColor.rgb * uNight * 0.13;
  if (slot == 7.0) { roughnessFactor = 0.08; metalnessFactor = 0.0; }
  else if (slot == 1.0) { roughnessFactor = 0.7; metalnessFactor = 0.0; }
}
`;
