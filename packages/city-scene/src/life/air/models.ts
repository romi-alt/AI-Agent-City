import * as THREE from 'three';
import { PartBuilder, taperedBox } from '../mesh-utils.ts';

/**
 * A flat, swept surface in the x–z plane: leading/trailing edge x at the root (z = z0) and at the tip (z = z1),
 * mirrored by `side`.
 */
function planform(side: 1 | -1, root: [number, number], tip: [number, number], z0: number, z1: number, thick: number) {
  const shape = new THREE.Shape();
  shape.moveTo(root[0], z0 * side);
  shape.lineTo(tip[0], z1 * side);
  shape.lineTo(tip[1], z1 * side);
  shape.lineTo(root[1], z0 * side);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  // Shape space is (x, y) with extrusion along z: lay it flat so shape-y becomes world z.
  g.rotateX(Math.PI / 2);
  g.translate(0, thick / 2, 0);
  return g;
}

/** A twin-engine airliner facing +x, about 11 units long (≈ 38 m at the city's scale). White with a grey belly. */
export function airlinerGeometry() {
  const b = new PartBuilder();
  const white = '#eef1f4';
  const grey = '#9aa3ad';
  b.add(new THREE.CylinderGeometry(0.5, 0.5, 8.4, 10), { at: [0, 0, 0], rot: [0, 0, -Math.PI / 2], color: white });
  b.add(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), {
    at: [4.2, 0, 0],
    rot: [0, 0, -Math.PI / 2],
    scale: [1, 1.6, 1],
    color: white,
  });
  b.add(new THREE.ConeGeometry(0.5, 2.2, 10), {
    at: [-5.3, 0.12, 0],
    rot: [0, 0, Math.PI / 2],
    scale: [1, 1, 0.9],
    color: white,
  });
  b.add(new THREE.BoxGeometry(7.4, 0.12, 0.6), { at: [0, -0.32, 0], color: grey });
  // Swept wings and tailplane, with the engines slung under the wings.
  for (const s of [-1, 1] as const) {
    b.add(planform(s, [1.3, -0.9], [-2.7, -3.5], 0.4, 5.7, 0.12), { at: [0, -0.22, 0], color: '#dfe3e8' });
    b.add(planform(s, [-4.6, -5.6], [-5.9, -6.3], 0.3, 2.1, 0.07), { at: [0, 0.25, 0], color: '#dfe3e8' });
    b.add(new THREE.CylinderGeometry(0.3, 0.26, 1.3, 10), {
      at: [0.55, -0.55, s * 1.85],
      rot: [0, 0, -Math.PI / 2],
      color: grey,
    });
    b.add(new THREE.BoxGeometry(0.7, 0.3, 0.08), { at: [0.2, -0.36, s * 1.85], color: grey });
  }
  b.add(taperedBox(1.6, 1.9, 0.12, 0.9, -0.1), { at: [-5.3, 1.25, 0], color: '#1f8a8a' });
  return b.build();
}

/** A light helicopter facing +x, about 4 units long, and its two-blade main rotor (spun per instance). */
export function helicopterGeometry() {
  const b = new PartBuilder();
  const body = '#24384f';
  b.add(new THREE.SphereGeometry(0.7, 10, 8), { at: [0.3, 0.75, 0], scale: [1.35, 0.85, 0.75], color: body });
  b.add(new THREE.SphereGeometry(0.62, 10, 8, 0, Math.PI, 0, Math.PI / 2), {
    at: [0.75, 0.8, 0],
    rot: [0, -Math.PI / 2, 0],
    scale: [0.7, 0.75, 0.9],
    color: '#1a2630',
  });
  b.add(taperedBox(2.3, 0.22, 0.18, 0, 0, 0.03), { at: [-1.5, 0.95, 0], color: body });
  b.add(taperedBox(0.5, 0.7, 0.06, 0.25, -0.05), { at: [-2.6, 1.25, 0], color: '#f5b335' });
  b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 10), {
    at: [-2.62, 1.05, 0.08],
    rot: [Math.PI / 2, 0, 0],
    color: '#4b5560',
  });
  for (const s of [-1, 1]) {
    b.add(new THREE.BoxGeometry(1.9, 0.05, 0.05), { at: [0.2, 0.05, s * 0.45], color: '#2b2f33' });
    b.add(new THREE.BoxGeometry(0.05, 0.3, 0.05), { at: [0.6, 0.2, s * 0.42], color: '#2b2f33' });
    b.add(new THREE.BoxGeometry(0.05, 0.3, 0.05), { at: [-0.2, 0.2, s * 0.42], color: '#2b2f33' });
  }
  b.add(new THREE.CylinderGeometry(0.08, 0.1, 0.25, 6), { at: [0.25, 1.4, 0], color: '#2b2f33' });
  return b.build();
}

export function rotorGeometry() {
  const b = new PartBuilder();
  b.add(new THREE.BoxGeometry(4.6, 0.025, 0.16), { color: '#1b1d20' });
  b.add(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8), { color: '#1b1d20' });
  return b.build();
}
