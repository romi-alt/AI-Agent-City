import * as THREE from 'three';
import { PartBuilder, taperedBox } from '../mesh-utils.ts';
import { VEHICLE_SPEC, type VehicleKind } from './sim.ts';

/** Shader slots: what a vertex is. Paint takes the per-instance colour; lights glow from the shader. */
export const SLOT = { paint: 0, fixed: 1, head: 2, tail: 3, beaconRed: 4, beaconBlue: 5, sign: 6, glass: 7 } as const;

const GLASS = '#3a4d5e';
const TRIM = '#24272b';
const TYRE = '#151618';
const RIM = '#8d949b';

function wheels(b: PartBuilder, xs: number[], halfW: number, r: number) {
  for (const x of xs)
    for (const z of [-halfW, halfW]) {
      b.add(new THREE.CylinderGeometry(r, r, 0.13, 10), {
        at: [x, r, z],
        rot: [Math.PI / 2, 0, 0],
        color: TYRE,
        slot: SLOT.fixed,
      });
      b.add(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.135, 8), {
        at: [x, r, z],
        rot: [Math.PI / 2, 0, 0],
        color: RIM,
        slot: SLOT.fixed,
      });
    }
}

function lamps(b: PartBuilder, len: number, y: number, z: number, h = 0.07) {
  for (const s of [-1, 1]) {
    b.add(new THREE.BoxGeometry(0.04, h, 0.17), { at: [len / 2 + 0.005, y, s * z], color: '#fff6dc', slot: SLOT.head });
    b.add(new THREE.BoxGeometry(0.04, h, 0.19), {
      at: [-len / 2 - 0.005, y, s * z],
      color: '#c0141c',
      slot: SLOT.tail,
    });
  }
}

function bumpers(b: PartBuilder, len: number, w: number, y: number) {
  b.add(new THREE.BoxGeometry(0.07, 0.1, w * 0.98), { at: [len / 2 - 0.01, y, 0], color: TRIM, slot: SLOT.fixed });
  b.add(new THREE.BoxGeometry(0.07, 0.1, w * 0.98), { at: [-len / 2 + 0.01, y, 0], color: TRIM, slot: SLOT.fixed });
}

function sedan(b: PartBuilder, len: number, w: number, taxi: boolean) {
  b.add(taperedBox(len, 0.34, w, 0.12, 0.05, 0.02), { at: [0, 0.31, 0], slot: SLOT.paint });
  b.add(taperedBox(0.98, 0.29, w * 0.86, 0.26, 0.16, 0.06), { at: [-0.1, 0.62, 0], color: GLASS, slot: SLOT.glass });
  b.add(new THREE.BoxGeometry(0.5, 0.035, w * 0.72), { at: [-0.13, 0.775, 0], slot: SLOT.paint });
  bumpers(b, len, w, 0.2);
  lamps(b, len, 0.38, w * 0.33);
  wheels(b, [-len * 0.31, len * 0.31], w / 2 - 0.04, 0.18);
  if (taxi) {
    b.add(new THREE.BoxGeometry(0.32, 0.1, 0.18), { at: [-0.12, 0.84, 0], color: '#fff3c0', slot: SLOT.sign });
    b.add(new THREE.BoxGeometry(len * 0.9, 0.04, w + 0.01), { at: [0, 0.4, 0], color: '#1b1b1b', slot: SLOT.fixed });
  }
}

function suv(b: PartBuilder, len: number, w: number) {
  b.add(taperedBox(len, 0.44, w, 0.1, 0.03, 0.02), { at: [0, 0.37, 0], slot: SLOT.paint });
  b.add(taperedBox(1.3, 0.33, w * 0.9, 0.2, 0.06, 0.04), { at: [-0.12, 0.75, 0], color: GLASS, slot: SLOT.glass });
  b.add(new THREE.BoxGeometry(1.0, 0.04, w * 0.8), { at: [-0.16, 0.93, 0], slot: SLOT.paint });
  for (const s of [-1, 1])
    b.add(new THREE.BoxGeometry(0.9, 0.03, 0.04), { at: [-0.16, 0.97, s * w * 0.34], color: TRIM, slot: SLOT.fixed });
  bumpers(b, len, w, 0.22);
  lamps(b, len, 0.47, w * 0.34);
  wheels(b, [-len * 0.31, len * 0.31], w / 2 - 0.04, 0.2);
}

function van(b: PartBuilder, len: number, w: number) {
  const cargo = len * 0.7;
  b.add(new THREE.BoxGeometry(cargo, 0.98, w), { at: [-len / 2 + cargo / 2, 0.66, 0], slot: SLOT.paint });
  const cab = len - cargo;
  b.add(taperedBox(cab, 0.42, w * 0.97, 0.02, 0, 0.01), { at: [len / 2 - cab / 2, 0.38, 0], slot: SLOT.paint });
  b.add(taperedBox(cab * 0.95, 0.4, w * 0.95, 0.24, 0, 0.02), {
    at: [len / 2 - cab / 2 - 0.01, 0.79, 0],
    color: GLASS,
    slot: SLOT.glass,
  });
  // A plain logo-free side band so the box reads as a delivery van.
  for (const s of [-1, 1])
    b.add(new THREE.BoxGeometry(cargo * 0.86, 0.1, 0.01), {
      at: [-len / 2 + cargo / 2, 0.55, s * (w / 2 + 0.005)],
      color: '#f5b335',
      slot: SLOT.fixed,
    });
  bumpers(b, len, w, 0.2);
  lamps(b, len, 0.4, w * 0.36);
  for (const s of [-1, 1])
    b.add(new THREE.BoxGeometry(0.04, 0.12, 0.12), {
      at: [-len / 2 - 0.005, 0.95, s * w * 0.38],
      color: '#c0141c',
      slot: SLOT.tail,
    });
  wheels(b, [-len * 0.3, len * 0.3], w / 2 - 0.04, 0.2);
}

function bus(b: PartBuilder, len: number, w: number) {
  b.add(new THREE.BoxGeometry(len, 1.06, w), { at: [0, 0.72, 0], slot: SLOT.paint });
  b.add(new THREE.BoxGeometry(len * 0.98, 0.07, w * 0.92), { at: [0, 1.28, 0], color: '#d9dde1', slot: SLOT.fixed });
  b.add(new THREE.BoxGeometry(len * 0.4, 0.14, w * 0.6), {
    at: [-len * 0.18, 1.36, 0],
    color: '#c9ced3',
    slot: SLOT.fixed,
  });
  for (const s of [-1, 1]) {
    b.add(new THREE.BoxGeometry(len * 0.86, 0.38, 0.01), {
      at: [-0.12, 0.92, s * (w / 2 + 0.005)],
      color: GLASS,
      slot: SLOT.glass,
    });
    b.add(new THREE.BoxGeometry(len * 0.98, 0.1, 0.01), {
      at: [0, 0.48, s * (w / 2 + 0.005)],
      color: '#1f5fa8',
      slot: SLOT.fixed,
    });
  }
  b.add(new THREE.BoxGeometry(0.01, 0.5, w * 0.86), { at: [len / 2 + 0.005, 0.86, 0], color: GLASS, slot: SLOT.glass });
  b.add(new THREE.BoxGeometry(0.01, 0.1, w * 0.6), {
    at: [len / 2 + 0.008, 1.17, 0],
    color: '#ffb347',
    slot: SLOT.sign,
  });
  bumpers(b, len, w, 0.22);
  lamps(b, len, 0.4, w * 0.38, 0.09);
  wheels(b, [-len * 0.3, len * 0.33], w / 2 - 0.04, 0.24);
}

function emergency(b: PartBuilder, len: number, w: number) {
  const box = len * 0.66;
  b.add(new THREE.BoxGeometry(box, 1.0, w), { at: [-len / 2 + box / 2, 0.68, 0], slot: SLOT.paint });
  const cab = len - box;
  b.add(taperedBox(cab, 0.42, w * 0.97, 0.03, 0, 0.01), { at: [len / 2 - cab / 2, 0.38, 0], slot: SLOT.paint });
  b.add(taperedBox(cab * 0.95, 0.36, w * 0.95, 0.26, 0, 0.02), {
    at: [len / 2 - cab / 2 - 0.01, 0.77, 0],
    color: GLASS,
    slot: SLOT.glass,
  });
  for (const s of [-1, 1])
    b.add(new THREE.BoxGeometry(len * 0.96, 0.12, 0.01), {
      at: [0, 0.52, s * (w / 2 + 0.005)],
      color: '#c8102e',
      slot: SLOT.fixed,
    });
  // Light bar over the cab and two rear beacons.
  b.add(new THREE.BoxGeometry(0.16, 0.08, w * 0.36), {
    at: [len / 2 - cab * 0.55, 0.99, -w * 0.2],
    color: '#ff2030',
    slot: SLOT.beaconRed,
  });
  b.add(new THREE.BoxGeometry(0.16, 0.08, w * 0.36), {
    at: [len / 2 - cab * 0.55, 0.99, w * 0.2],
    color: '#2a5bff',
    slot: SLOT.beaconBlue,
  });
  b.add(new THREE.BoxGeometry(0.08, 0.1, 0.12), {
    at: [-len / 2 + 0.06, 1.22, -w * 0.4],
    color: '#ff2030',
    slot: SLOT.beaconRed,
  });
  b.add(new THREE.BoxGeometry(0.08, 0.1, 0.12), {
    at: [-len / 2 + 0.06, 1.22, w * 0.4],
    color: '#2a5bff',
    slot: SLOT.beaconBlue,
  });
  bumpers(b, len, w, 0.2);
  lamps(b, len, 0.4, w * 0.36);
  wheels(b, [-len * 0.3, len * 0.3], w / 2 - 0.04, 0.2);
}

/** One merged geometry per kind, facing +x, wheels on y = 0. */
export function vehicleGeometry(kind: VehicleKind): THREE.BufferGeometry {
  const { len, width } = VEHICLE_SPEC[kind];
  const b = new PartBuilder();
  if (kind === 'sedan' || kind === 'taxi') sedan(b, len, width, kind === 'taxi');
  else if (kind === 'suv') suv(b, len, width);
  else if (kind === 'van') van(b, len, width);
  else if (kind === 'bus') bus(b, len, width);
  else emergency(b, len, width);
  return b.build();
}

/** Paint per kind: muted city colours for private cars, yellow cabs, white/grey fleet vans, white buses. */
export const PAINTS: Record<VehicleKind, string[]> = {
  sedan: ['#1d2733', '#e7e4dd', '#7c8590', '#3d4b5c', '#8a1f24', '#2f4f46', '#c9c4ba', '#101215', '#5b6f8a'],
  suv: ['#121417', '#d8d6d0', '#4a5561', '#2d3a2f', '#6b6f75', '#1f3550'],
  taxi: ['#f2b705', '#f5bd12', '#efb000'],
  van: ['#f1f1ee', '#e4e6e8', '#c9ccd0', '#5b3a24', '#1f3550'],
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
  if (slot == 2.0) glow = vec3(1.0, 0.93, 0.78) * (0.12 + uNight * 2.6);
  else if (slot == 3.0) glow = vec3(1.0, 0.08, 0.06) * (0.18 + uNight * 0.9 + vState.x * 1.6);
  else if (slot == 6.0) glow = vec3(1.0, 0.82, 0.45) * (0.25 + uNight * 1.4);
  else if (slot == 4.0 || slot == 5.0) {
    float f = fract(uTime * 1.6 + vState.y + (slot == 5.0 ? 0.5 : 0.0));
    float on = step(f, 0.18) + step(0.3, f) * step(f, 0.42);
    glow = (slot == 4.0 ? vec3(1.0, 0.1, 0.1) : vec3(0.15, 0.3, 1.0)) * on * (1.2 + uNight * 2.5);
  }
  totalEmissiveRadiance += glow;
  if (slot == 7.0) roughnessFactor = 0.22;
}
`;
