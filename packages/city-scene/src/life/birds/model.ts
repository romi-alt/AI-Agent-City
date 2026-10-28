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

/**
 * A pigeon facing +x, about 0.3 units long and 0.66 across the wings in model units (drawn at about 0.4, so a real
 * 0.65 m wingspan). Plumage is painted per vertex: slate head, grey back and wings with dark wing tips and tail, a
 * pale belly and pale wing undersides. The per-instance colour only tints it.
 */
export function birdGeometry() {
  const b = new PartBuilder();
  b.add(new THREE.SphereGeometry(0.06, 8, 6), { at: [0, 0, 0], scale: [2.2, 0.9, 0.9], color: '#8d939a' });
  b.add(new THREE.SphereGeometry(0.04, 8, 6), { at: [0.13, 0.03, 0], color: '#5a6068', part: 3 });
  b.add(new THREE.ConeGeometry(0.012, 0.04, 4), { at: [0.18, 0.025, 0], rot: [0, 0, -Math.PI / 2], color: '#2b2b2b' });
  b.add(new THREE.BoxGeometry(0.1, 0.01, 0.07), { at: [-0.15, 0.0, 0], color: '#43474d' });
  for (const side of [1, -1] as const) {
    b.add(wing(side, true), { part: WING.inner, color: '#979ca3' });
    b.add(wing(side, false), { part: WING.outer, color: '#3d4147' });
  }
  const g = b.build();
  // Pale belly and wing undersides; keep the part tag 3 (head) as body for the flap shader.
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const col = g.getAttribute('color');
  const part = g.getAttribute('aPart');
  const pale = new THREE.Color('#dedcd7');
  for (let i = 0; i < pos.count; i++) {
    const p = part.getX(i);
    if (p === 3) part.setX(i, WING.body);
    const underside = nor.getY(i) < -0.25;
    if ((p === WING.body && underside && pos.getY(i) < 0.0) || (p === WING.inner && underside))
      col.setXYZ(i, pale.r, pale.g, pale.b);
    if (p === WING.outer && underside) col.setXYZ(i, 0.55, 0.57, 0.6);
  }
  return g;
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
