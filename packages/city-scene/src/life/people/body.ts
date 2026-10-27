import * as THREE from 'three';
import { PartBuilder, taperedBox } from '../mesh-utils.ts';

/**
 * A low-poly person facing +x with feet on y = 0, about 1.3 units tall. Limbs are tagged with `aPart` and posed
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
  hip: 0.56,
  knee: 0.29,
  shoulder: 0.99,
  neck: 1.06,
  legGap: 0.085,
  armGap: 0.215,
  hand: 0.6,
} as const;

export function personGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder();
  // Legs: thigh from hip to knee, shin (with shoe) from knee to the ground.
  for (const [side, thigh, shin] of [
    [-1, PART.thighL, PART.shinL],
    [1, PART.thighR, PART.shinR],
  ] as const) {
    const z = side * BODY.legGap;
    b.add(new THREE.BoxGeometry(0.14, BODY.hip - BODY.knee + 0.02, 0.13), {
      at: [0, (BODY.hip + BODY.knee) / 2, z],
      slot: PSLOT.bottom,
      part: thigh,
    });
    b.add(new THREE.BoxGeometry(0.12, BODY.knee - 0.05, 0.115), {
      at: [0, (BODY.knee + 0.05) / 2 + 0.01, z],
      slot: PSLOT.bottom,
      part: shin,
    });
    b.add(new THREE.BoxGeometry(0.21, 0.06, 0.12), {
      at: [0.035, 0.03, z],
      color: '#1c1c1f',
      slot: PSLOT.fixed,
      part: shin,
    });
  }
  b.add(new THREE.BoxGeometry(0.19, 0.13, 0.3), { at: [0, BODY.hip, 0], slot: PSLOT.bottom });
  // Torso narrows to the waist; a coat hem is added on some people.
  b.add(taperedBox(0.21, 0.44, 0.36, 0.01, 0.01, -0.025), { at: [0, 0.82, 0], slot: PSLOT.top });
  b.add(taperedBox(0.24, 0.32, 0.35, -0.0, 0.0, 0.015), { at: [0, 0.5, 0], slot: PSLOT.top, part: PART.coat });
  b.add(new THREE.BoxGeometry(0.08, 0.07, 0.08), { at: [0, BODY.neck, 0], slot: PSLOT.skin });
  b.add(new THREE.IcosahedronGeometry(0.12, 1), {
    at: [0.005, 1.17, 0],
    scale: [1, 1.08, 0.95],
    slot: PSLOT.skin,
    part: PART.head,
  });
  b.add(new THREE.SphereGeometry(0.128, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), {
    at: [-0.012, 1.185, 0],
    rot: [0, 0, 0.18],
    slot: PSLOT.hair,
    part: PART.head,
  });
  b.add(new THREE.SphereGeometry(0.12, 8, 6), {
    at: [-0.055, 1.08, 0],
    scale: [0.62, 1.25, 0.98],
    slot: PSLOT.hair,
    part: PART.longHair,
  });
  // Arms hang from the shoulders, sleeve plus hand.
  for (const [side, part] of [
    [-1, PART.armL],
    [1, PART.armR],
  ] as const) {
    const z = side * BODY.armGap;
    b.add(new THREE.BoxGeometry(0.09, 0.36, 0.09), { at: [0, BODY.shoulder - 0.17, z], slot: PSLOT.top, part });
    b.add(new THREE.BoxGeometry(0.075, 0.09, 0.07), { at: [0.005, BODY.hand - 0.02, z], slot: PSLOT.skin, part });
  }
  b.add(new THREE.BoxGeometry(0.2, 0.2, 0.06), {
    at: [0, BODY.hand - 0.15, BODY.armGap + 0.05],
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
  float hipL = sw * 0.52 * gait;
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
  if (part == ${PART.coat}.0) { p = mix(vec3(0.0, 0.66, 0.0), p, iTop.w * hide); }
  if (part == ${PART.bag}.0) { p = mix(vec3(0.0, ${BODY.hand}, ${BODY.armGap}), p, iBottom.w * hide); }
  if (part == ${PART.longHair}.0) { p = mix(vec3(-0.06, 1.17, 0.0), p, iSkin.w); }
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
export function personMaterials(uTime: THREE.IUniform<number>) {
  const color = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  color.onBeforeCompile = shader => {
    shader.uniforms.uTime = uTime;
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

const SKIN = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673c', '#5c3a21', '#d4a07a'];
const HAIR = ['#1f1611', '#3b2618', '#0f0f10', '#b08a55', '#6a3f22', '#8f8f8f', '#2c2c2e'];
/** Office wear first (navy, charcoal, camel, white shirts), then a few colourful visitors in the city palette. */
const TOPS = [
  '#1f2a3a',
  '#2e3238',
  '#4a4f57',
  '#f2efe8',
  '#b9a07a',
  '#0f1b2d',
  '#6f7d8c',
  '#e7e1d6',
  '#1f8a8a',
  '#ff7a5c',
  '#6fb7e8',
  '#f5b335',
  '#5b9a5b',
  '#8b2f3c',
];
const BOTTOMS = ['#1d2430', '#2b2b2e', '#3f4752', '#5a4a3a', '#1c2f4a', '#6b6e73', '#c9bba3', '#22262c'];

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
