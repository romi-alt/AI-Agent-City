import * as THREE from 'three';
import { seeded } from '../textures.ts';
import type { DetailLevel, PlantType } from './detail.ts';

/** One leaf or frond of a potted plant, in the plant's own units (pot base at the origin, about 1.6 high). */
export interface LeafSpec {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  /** Index into the greens. */
  green: number;
}

/** How many leaves each plant type gets at each detail level. */
const LEAVES: Record<PlantType, Record<DetailLevel, number>> = {
  bush: { low: 6, full: 11, rich: 15 },
  snake: { low: 5, full: 8, rich: 10 },
  monstera: { low: 5, full: 9, rich: 12 },
  palm: { low: 6, full: 10, rich: 14 },
};

/**
 * Leaves for a plant, after the legacy room's plants: a bush fans out low and round, a snake plant sends up stiff
 * blades, a monstera has a few broad leaves on long stems, a palm arches long fronds from a trunk. Each leaf is a
 * pointed shape lying in the XY plane (tip up) that is turned about the vertical (`a`) and then tipped outwards,
 * like turning a leaf on its stem. Deterministic in `seed`.
 */
export function plantLeaves(type: PlantType, seed: number, level: DetailLevel): LeafSpec[] {
  const rnd = seeded(seed * 17 + 3);
  const n = LEAVES[type][level];
  const o = new THREE.Object3D();
  const out: LeafSpec[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
    let scale: [number, number, number];
    let pos: [number, number, number];
    if (type === 'snake') {
      scale = [0.35, 1.3 + rnd() * 0.5, 1];
      o.rotation.set(0, a, (rnd() - 0.5) * 0.25);
      pos = [Math.cos(a) * 0.08, 0.55, Math.sin(a) * 0.08];
    } else if (type === 'palm') {
      scale = [0.6, 1.5, 1];
      o.rotation.set(0, a, 0);
      o.rotateX(-0.6 - rnd() * 0.5);
      pos = [0, 0.9 + rnd() * 0.5, 0];
    } else if (type === 'monstera') {
      scale = [1.3, 1.1, 1];
      o.rotation.set(0, a, 0);
      o.rotateX(-0.35 - rnd() * 0.7);
      pos = [0, 0.6 + rnd() * 0.5, 0];
    } else {
      scale = [0.7, 0.7, 1];
      o.rotation.set(0, a, 0);
      o.rotateX(-0.2 - rnd() * 1.0);
      pos = [0, 0.55 + rnd() * 0.2, 0];
    }
    out.push({
      position: pos,
      rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
      scale,
      green: i % 4,
    });
  }
  return out;
}

export const GREENS = ['#3f9a5c', '#4ea457', '#5fb760', '#2f7a55'] as const;

/** The outline of one leaf: a pointed ellipse a little over three quarters of a unit long. */
export function leafShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.25, 0.15, 0.22, 0.6, 0, 0.8);
  s.bezierCurveTo(-0.22, 0.6, -0.25, 0.15, 0, 0);
  return s;
}
