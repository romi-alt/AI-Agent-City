/**
 * Ring 1 roof items, ported from the legacy decorBuilding rooftops: a timber water tank on legs, a cluster of AC
 * units, a rooftop garden and an antenna. Each is one merged, vertex-coloured geometry (origin at roof level), drawn
 * as one InstancedMesh per kind with the shared props material.
 */
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RoofItem } from './plan.ts';

function part(geo: BufferGeometry, color: string, x = 0, y = 0, z = 0): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.translate(x, y, z);
  const c = new Color(color);
  const n = g.getAttribute('position').count;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) rgb.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(rgb, 3));
  g.deleteAttribute('uv');
  return g;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('surround: roof item parts do not merge');
  for (const p of parts) p.dispose();
  return g;
}

/** Water tank on four legs (about 2.3 units tall). */
function tank(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const [x, z] of [
    [-0.42, -0.42],
    [0.42, -0.42],
    [-0.42, 0.42],
    [0.42, 0.42],
  ] as const)
    parts.push(part(new BoxGeometry(0.1, 0.8, 0.1), '#5c4a3a', x, 0.4, z));
  parts.push(part(new BoxGeometry(1.0, 0.08, 1.0), '#5c4a3a', 0, 0.8, 0));
  parts.push(part(new CylinderGeometry(0.62, 0.62, 1.15, 12, 1), '#8a6a4a', 0, 1.42, 0));
  parts.push(part(new ConeGeometry(0.68, 0.38, 12, 1), '#6b513a', 0, 2.19, 0));
  return merge(parts);
}

/** Two or three boxy condenser units with dark fan tops. */
function ac(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const [x, z] of [
    [-0.6, 0],
    [0.45, -0.2],
    [0.45, 0.65],
  ] as const) {
    parts.push(part(new BoxGeometry(0.8, 0.5, 0.7), '#d7dbe0', x, 0.25, z));
    parts.push(part(new CylinderGeometry(0.24, 0.24, 0.04, 10, 1), '#5b6168', x, 0.52, z));
  }
  return merge(parts);
}

/** A unit-square lawn (scaled to the roof) with low planters and a few round shrubs. */
function garden(): BufferGeometry {
  const parts: BufferGeometry[] = [part(new BoxGeometry(1, 0.18, 1), '#7cc36b', 0, 0.09, 0)];
  parts.push(part(new BoxGeometry(1, 0.26, 0.06), '#b98e62', 0, 0.13, 0.47));
  parts.push(part(new BoxGeometry(1, 0.26, 0.06), '#b98e62', 0, 0.13, -0.47));
  for (const [x, z, s, c] of [
    [-0.25, -0.2, 0.2, '#4f9d4a'],
    [0.22, 0.18, 0.24, '#5fae54'],
    [0.28, -0.25, 0.15, '#6fbf5f'],
  ] as const)
    parts.push(part(new IcosahedronGeometry(s, 0), c, x, 0.18 + s * 0.8, z));
  return merge(parts);
}

/** A mast with two crossbars and a small dish. */
function antenna(): BufferGeometry {
  return merge([
    part(new BoxGeometry(0.5, 0.12, 0.5), '#8f969e', 0, 0.06, 0),
    part(new CylinderGeometry(0.05, 0.08, 3, 6, 1), '#9aa1a9', 0, 1.6, 0),
    part(new BoxGeometry(0.9, 0.05, 0.05), '#9aa1a9', 0, 2.3, 0),
    part(new BoxGeometry(0.6, 0.05, 0.05), '#9aa1a9', 0, 2.75, 0),
    part(new ConeGeometry(0.3, 0.18, 8, 1, true).rotateX(Math.PI / 2), '#e6e8ea', 0.2, 1.4, 0.2),
    part(new IcosahedronGeometry(0.1, 0), '#e0453a', 0, 3.15, 0),
  ]);
}

export const ROOF_GEOMETRY: Record<RoofItem, () => BufferGeometry> = { tank, ac, garden, antenna };
