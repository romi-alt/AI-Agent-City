import * as THREE from 'three';
import { PartBuilder, taperedBox } from '../mesh-utils.ts';
import { HIP_HEIGHT, HIP_SWING } from './proportions.ts';

/**
 * A low-poly person facing +x with feet on y = 0, 1.3 model units tall (drawn at PERSON_SCALE). Limbs are tagged with `aPart` and posed
 * entirely in the vertex shader (hip and knee for each leg, shoulder for each arm, a neck turn), so thousands of
 * people cost one draw call. Colour slots (`aSlot`) pick skin, top, trousers or hair from per-instance colours.
 */
export const PART = {
  rigid: 0,
  thighL: 1,
  shinL: 2,
  thighR: 3,
  shinR: 4,
  armL: 5,
  armR: 6,
  head: 7,
  coat: 8,
  bag: 9,
  longHair: 10,
} as const;
export const PSLOT = { skin: 0, top: 1, bottom: 2, hair: 3, fixed: 4 } as const;

export const BODY = {
  hip: HIP_HEIGHT,
  knee: 0.36,
  shoulder: 1.05,
  neck: 1.12,
  legGap: 0.064,
  armGap: 0.195,
  hand: 0.58,
  /** Where the coat hem and long hair collapse to when an instance has none. */
  waist: 0.8,
  crown: 1.3,
} as const;

/** A limb segment: a tapered six-sided cylinder from y0 (top) down to y1, slightly flattened front to back. */
function limb(
  b: PartBuilder,
  rTop: number,
  rBottom: number,
  y0: number,
  y1: number,
  z: number,
  slot: number,
  part: number,
  x = 0,
) {
  b.add(new THREE.CylinderGeometry(rTop, rBottom, y0 - y1, 6, 1), {
    at: [x, (y0 + y1) / 2, z],
    scale: [0.9, 1, 1],
    slot,
    part,
  });
}

/**
 * Proportions of an adult about 7.5 heads tall: head 0.17 of 1.3 units, hips at half height, shoulders broader
 * than the hips, a tapered torso, slim limbs with hands and shoes.
 */
export function personGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder();
  for (const [side, thigh, shin] of [
    [-1, PART.thighL, PART.shinL],
    [1, PART.thighR, PART.shinR],
  ] as const) {
    const z = side * BODY.legGap;
    limb(b, 0.076, 0.056, BODY.hip + 0.02, BODY.knee - 0.01, z, PSLOT.bottom, thigh);
    limb(b, 0.055, 0.041, BODY.knee + 0.01, 0.06, z, PSLOT.bottom, shin);
    // Shoe: a low wedge, longer in front of the ankle.
    b.add(taperedBox(0.17, 0.055, 0.082, 0.05, 0.01, 0.006), {
      at: [0.03, 0.028, z],
      color: '#1a1a1c',
      slot: PSLOT.fixed,
      part: shin,
    });
  }
  // Hips and seat.
  b.add(taperedBox(0.15, 0.13, 0.25, 0.0, 0.0, 0.0), { at: [0, BODY.hip + 0.02, 0], slot: PSLOT.bottom });
  // Torso: waist to shoulders, widening, with a slightly deeper chest.
  b.add(taperedBox(0.15, 0.27, 0.22, -0.01, -0.005, -0.05), { at: [0, BODY.waist + 0.115, 0], slot: PSLOT.top });
  // Belt line.
  b.add(taperedBox(0.152, 0.05, 0.232, 0, 0, 0.005), { at: [0, BODY.waist - 0.03, 0], slot: PSLOT.top });
  // Rounded shoulders.
  for (const s of [-1, 1])
    b.add(new THREE.SphereGeometry(0.052, 6, 4), {
      at: [0, BODY.shoulder - 0.015, s * (BODY.armGap - 0.03)],
      scale: [1.05, 0.85, 1],
      slot: PSLOT.top,
    });
  // Coat hem (some people): from the waist to above the knee.
  b.add(taperedBox(0.19, 0.3, 0.27, -0.0, 0.0, 0.02), {
    at: [0, BODY.waist - 0.15, 0],
    slot: PSLOT.top,
    part: PART.coat,
  });
  // Neck and head (head height ≈ 1/7.5 of the body).
  b.add(new THREE.CylinderGeometry(0.03, 0.034, 0.07, 6), { at: [0, BODY.neck, 0], slot: PSLOT.skin });
  b.add(new THREE.IcosahedronGeometry(0.075, 1), {
    at: [0.006, BODY.crown - 0.087, 0],
    scale: [1.02, 1.15, 0.9],
    slot: PSLOT.skin,
    part: PART.head,
  });
  b.add(new THREE.BoxGeometry(0.02, 0.02, 0.02), {
    at: [0.078, BODY.crown - 0.1, 0],
    slot: PSLOT.skin,
    part: PART.head,
  });
  b.add(new THREE.SphereGeometry(0.08, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), {
    at: [-0.01, BODY.crown - 0.083, 0],
    rot: [0, 0, 0.22],
    scale: [1.02, 1.05, 0.95],
    slot: PSLOT.hair,
    part: PART.head,
  });
  b.add(new THREE.SphereGeometry(0.075, 7, 5), {
    at: [-0.035, BODY.crown - 0.16, 0],
    scale: [0.55, 1.25, 0.95],
    slot: PSLOT.hair,
    part: PART.longHair,
  });
  // Arms: upper arm, forearm, hand.
  for (const [side, part] of [
    [-1, PART.armL],
    [1, PART.armR],
  ] as const) {
    const z = side * BODY.armGap;
    limb(b, 0.045, 0.037, BODY.shoulder, 0.8, z, PSLOT.top, part);
    limb(b, 0.036, 0.029, 0.81, BODY.hand + 0.03, z, PSLOT.top, part, 0.008);
    b.add(new THREE.BoxGeometry(0.045, 0.07, 0.03), { at: [0.01, BODY.hand - 0.005, z], slot: PSLOT.skin, part });
  }
  b.add(taperedBox(0.17, 0.15, 0.05, 0.01, 0.01), {
    at: [0, BODY.hand - 0.11, BODY.armGap + 0.04],
    color: '#2a2320',
    slot: PSLOT.fixed,
    part: PART.bag,
  });
  return b.build();
}

export const PERSON_VERTEX_HEAD = /* glsl */ `
uniform float uTime;
attribute float aPart;
attribute float aSlot;
attribute vec4 iTop;
attribute vec4 iBottom;
attribute vec4 iSkin;
attribute vec4 iHair;
attribute vec4 iAnim;
mat3 acRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
mat3 acRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
void acLimb(inout vec3 p, inout vec3 n, float a, vec3 pivot) {
  mat3 r = acRotZ(a);
  p = r * (p - pivot) + pivot;
  n = r * n;
}
// iAnim: x walk phase (radians, advanced by distance), y gait 0..1, z mode (0 walk, 1 talk, 2 seated, 3 wait), w seed.
void acPose(inout vec3 p, inout vec3 n) {
  float part = floor(aPart + 0.5);
  float phase = iAnim.x;
  float gait = iAnim.y;
  float mode = floor(iAnim.z + 0.5);
  float seed = iAnim.w;
  float t = uTime;
  float sw = sin(phase);
  float cw = cos(phase);
  float hipL = sw * ${HIP_SWING} * gait;
  float hipR = -hipL;
  float kneeL = -max(0.0, cw) * 0.9 * gait;
  float kneeR = -max(0.0, -cw) * 0.9 * gait;
  float armL = -sw * 0.42 * gait;
  float armR = -armL;
  float head = 0.0;
  float bob = (abs(cw) - 0.6) * 0.045 * gait;
  float hide = 1.0;
  if (mode == 2.0) {
    hipL = 1.5; hipR = 1.5; kneeL = -1.5; kneeR = -1.5;
    armL = 0.55 + sin(t * 0.4 + seed * 9.0) * 0.05; armR = 0.5;
    head = sin(t * 0.21 + seed * 7.0) * 0.4;
    bob = 0.0;
    hide = 0.0;
  } else if (mode == 1.0) {
    float g = pow(max(0.0, sin(t * 0.8 + seed * 11.0)), 3.0);
    armR += g * 0.75;
    armL += sin(t * 0.47 + seed * 5.0) * 0.06;
    head = sin(t * 0.33 + seed * 5.0) * 0.45;
    bob = sin(t * 0.9 + seed) * 0.006;
  } else if (mode == 3.0) {
    armL += sin(t * 0.6 + seed * 3.0) * 0.04;
    armR -= sin(t * 0.55 + seed * 2.0) * 0.04;
    head = sin(t * 0.27 + seed * 3.0) * 0.6 * step(0.0, sin(t * 0.13 + seed));
  }
  if (part == ${PART.coat}.0) { p = mix(vec3(0.0, ${BODY.waist}, 0.0), p, iTop.w * hide); }
  if (part == ${PART.bag}.0) { p = mix(vec3(0.0, ${BODY.hand}, ${BODY.armGap}), p, iBottom.w * hide); }
  if (part == ${PART.longHair}.0) { p = mix(vec3(-0.04, ${BODY.crown - 0.09}, 0.0), p, iSkin.w); }
  vec3 hip = vec3(0.0, ${BODY.hip}, 0.0);
  vec3 knee = vec3(0.0, ${BODY.knee}, 0.0);
  vec3 shoulder = vec3(0.0, ${BODY.shoulder}, 0.0);
  if (part == ${PART.shinL}.0) acLimb(p, n, kneeL, knee);
  if (part == ${PART.shinR}.0) acLimb(p, n, kneeR, knee);
  if (part == ${PART.thighL}.0 || part == ${PART.shinL}.0) acLimb(p, n, hipL, hip);
  if (part == ${PART.thighR}.0 || part == ${PART.shinR}.0) acLimb(p, n, hipR, hip);
  if (part == ${PART.armL}.0) acLimb(p, n, armL, shoulder);
  if (part == ${PART.armR}.0 || part == ${PART.bag}.0) acLimb(p, n, armR, shoulder);
  if (part == ${PART.head}.0 || part == ${PART.longHair}.0) {
    mat3 r = acRotY(head);
    vec3 pv = vec3(0.0, ${BODY.neck}, 0.0);
    p = r * (p - pv) + pv;
    n = r * n;
  }
  p.y += bob;
}
`;

export const PERSON_COLOR = /* glsl */ `
  float acSlot = floor(aSlot + 0.5);
  vColor = vec4(color, 1.0);
  if (acSlot == ${PSLOT.skin}.0) vColor.rgb = iSkin.rgb;
  else if (acSlot == ${PSLOT.top}.0) vColor.rgb = iTop.rgb;
  else if (acSlot == ${PSLOT.bottom}.0) vColor.rgb = iBottom.rgb;
  else if (acSlot == ${PSLOT.hair}.0) vColor.rgb = iHair.rgb;
`;

/** Applies the pose to a standard (colour) material and to the shadow depth material. */
export function personMaterials(uTime: THREE.IUniform<number>, uNight: THREE.IUniform<number>) {
  const color = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  color.onBeforeCompile = shader => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uNight = uNight;
    // Street-lamp fill at night (A1's lamps are emissive, not lights), so people never read as black cut-outs.
    shader.fragmentShader =
      'uniform float uNight;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uNight * 0.2;',
      );
    shader.vertexShader = (PERSON_VERTEX_HEAD + shader.vertexShader)
      .replace(
        '#include <beginnormal_vertex>',
        'vec3 objectNormal = vec3(normal);\n{ vec3 acP = vec3(position); acPose(acP, objectNormal); }',
      )
      .replace(
        '#include <begin_vertex>',
        'vec3 transformed = vec3(position);\n{ vec3 acN = vec3(0.0, 1.0, 0.0); acPose(transformed, acN); }',
      )
      .replace('#include <color_vertex>', PERSON_COLOR);
  };
  color.customProgramCacheKey = () => 'agentcity-person';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = shader => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = (PERSON_VERTEX_HEAD + shader.vertexShader).replace(
      '#include <begin_vertex>',
      'vec3 transformed = vec3(position);\n{ vec3 acN = vec3(0.0, 1.0, 0.0); acPose(transformed, acN); }',
    );
  };
  depth.customProgramCacheKey = () => 'agentcity-person-depth';
  return { color, depth };
}

const SKIN = [
  '#f3d6c1',
  '#eac4a6',
  '#e0b08c',
  '#cf9a74',
  '#b97f58',
  '#9c6646',
  '#7d4f36',
  '#5e3a28',
  '#f0cdb4',
  '#c28b66',
];
const HAIR = [
  '#141110',
  '#1f1813',
  '#2e2219',
  '#3d2a1c',
  '#55392a',
  '#6e4a30',
  '#8c6a43',
  '#b79a6b',
  '#8e8b86',
  '#c9c6c0',
];
/** City clothing: mostly navy, charcoal, black, grey, camel, white and denim, with the odd muted colour. */
const TOPS = [
  '#1e2635',
  '#232a38',
  '#2f3238',
  '#3a3d43',
  '#18191c',
  '#5f646b',
  '#8a8e94',
  '#a3865f',
  '#b39a74',
  '#e7e4dc',
  '#d9d6cf',
  '#a9b8c9',
  '#4b5d78',
  '#3f5068',
  '#5a5e48',
  '#6a3b3f',
  '#3e5f5d',
  '#8a6a55',
];
const BOTTOMS = ['#1c212b', '#24272d', '#16171a', '#3b4f6b', '#34465f', '#565b62', '#8d8068', '#3a3029', '#2c2f35'];

/** Deterministic look for person `i`. */
export function personLook(rng: () => number) {
  const pick = (xs: string[]) => xs[Math.floor(rng() * xs.length)]!;
  return {
    top: pick(TOPS),
    bottom: pick(BOTTOMS),
    skin: pick(SKIN),
    hair: pick(HAIR),
    coat: rng() < 0.3 ? 1 : 0,
    bag: rng() < 0.35 ? 1 : 0,
    longHair: rng() < 0.35 ? 1 : 0,
  };
}
