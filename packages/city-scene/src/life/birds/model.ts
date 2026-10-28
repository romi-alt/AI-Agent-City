import * as THREE from 'three';
import { PartBuilder } from '../mesh-utils.ts';

/** Wing parts for the flap shader: 0 body, 1 inner wing, 2 outer wing (left wing has negative z). */
export const WING = { body: 0, inner: 1, outer: 2 } as const;

function wing(side: 1 | -1, inner: boolean) {
  // A flat quad from the root (or elbow) outwards, swept back a little.
  const z0 = inner ? 0.04 : 0.17;
  const z1 = inner ? 0.17 : 0.33;
  const chord0 = inner ? 0.11 : 0.09;
  const chord1 = inner ? 0.09 : 0.04;
  const sweep = inner ? 0.0 : -0.03;
  const g = new THREE.BufferGeometry();
  const v = [
    [0.03, 0, z0],
    [0.03 - chord0, 0, z0],
    [0.03 + sweep, 0, z1],
    [0.03 + sweep - chord1, 0, z1],
  ].map(([x, y, z]) => [x!, y!, z! * side]);
  const tri = side > 0 ? [0, 1, 2, 2, 1, 3] : [0, 2, 1, 2, 3, 1];
  const pos: number[] = [];
  for (const i of [...tri, ...[...tri].reverse()]) pos.push(...v[i]!);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A small bird facing +x, about 0.3 units long and 0.66 units across the wings. */
export function birdGeometry() {
  const b = new PartBuilder();
  b.add(new THREE.SphereGeometry(0.06, 6, 4), { at: [0, 0, 0], scale: [2.2, 0.9, 0.9], color: '#ffffff' });
  b.add(new THREE.SphereGeometry(0.04, 6, 4), { at: [0.13, 0.03, 0], color: '#ffffff' });
  b.add(new THREE.ConeGeometry(0.012, 0.04, 4), { at: [0.18, 0.025, 0], rot: [0, 0, -Math.PI / 2], color: '#e0a040' });
  b.add(new THREE.BoxGeometry(0.1, 0.01, 0.07), { at: [-0.15, 0.0, 0], color: '#ffffff' });
  for (const side of [1, -1] as const) {
    b.add(wing(side, true), { part: WING.inner, color: '#ffffff' });
    b.add(wing(side, false), { part: WING.outer, color: '#ffffff' });
  }
  return b.build();
}

export const BIRD_VERTEX_HEAD = /* glsl */ `
uniform float uTime;
attribute float aPart;
attribute vec4 iBird; // x wing-beat phase (radians, accumulated on the CPU), y amplitude, z beats per second (0: phase only), w folded (0..1)
mat3 bdRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
void bdPose(inout vec3 p, inout vec3 n) {
  float part = floor(aPart + 0.5);
  if (part < 0.5) return;
  float side = p.z < 0.0 ? -1.0 : 1.0;
  float beat = sin(uTime * iBird.z * 6.2831 + iBird.x);
  float up = beat * 0.9 * iBird.y + 0.1;
  // Folded wings lie along the body.
  float fold = iBird.w;
  p.z = mix(p.z, sign(p.z) * (0.04 + abs(p.z) * 0.15), fold);
  p.x = mix(p.x, p.x - abs(p.z) * 0.4, fold);
  float a = -mix(up, -0.25, fold) * side;
  mat3 r = bdRotX(a);
  vec3 root = vec3(0.0, 0.0, 0.04 * side);
  if (part > 1.5) {
    // The outer wing bends further at the elbow.
    vec3 elbow = vec3(0.0, 0.0, 0.17 * side);
    mat3 r2 = bdRotX(-mix(beat * 0.5 * iBird.y, 0.0, fold) * side);
    p = r2 * (p - elbow) + elbow;
    n = r2 * n;
  }
  p = r * (p - root) + root;
  n = r * n;
}
`;
