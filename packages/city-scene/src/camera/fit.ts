import { add, scale, type V3 } from './math.ts';
import type { Orbit } from './orbit.ts';

/** The part of the canvas that is not covered by HUD panels, and the camera's vertical field of view. */
export interface Viewport {
  width: number;
  height: number;
  /** Pixels covered on the right (side panel) and at the bottom (phone sheet). */
  right: number;
  bottom: number;
  /** Pixels covered at the top (the office's title and legend on phones); none when left out. */
  top?: number;
  /** Vertical field of view, degrees. */
  fov: number;
}

export const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800, right: 0, bottom: 0, fov: 42 };

/** Unit vector from the target towards the camera for an orbit heading/tilt (same convention as orbit.ts). */
export function orbitDir(theta: number, phi: number): V3 {
  return [Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)];
}

function basis(theta: number, phi: number) {
  const d = orbitDir(theta, phi);
  // Camera right = up × back (looking along -d), camera up = back × right.
  let r: V3 = [d[2], 0, -d[0]];
  const rl = Math.hypot(r[0], r[2]);
  r = rl > 1e-6 ? [r[0] / rl, 0, r[2] / rl] : [Math.cos(theta), 0, -Math.sin(theta)];
  const u: V3 = [d[1] * r[2] - d[2] * r[1], d[2] * r[0] - d[0] * r[2], d[0] * r[1] - d[1] * r[0]];
  return { d, r, u };
}

/** Half-extents (as tangents) of the part of the view left visible by the HUD. */
export function visibleTangents(vp: Viewport): { tx: number; ty: number } {
  const t = Math.tan((vp.fov * Math.PI) / 360);
  const h = Math.max(1, vp.height - vp.bottom - (vp.top ?? 0));
  const w = Math.max(1, vp.width - vp.right);
  return { tx: (t * w) / vp.height, ty: (t * h) / vp.height };
}

/**
 * Frame a set of points from a given heading and tilt: returns the orbit (target and distance) that fits them all
 * into the visible part of the view with a margin, centred on their projected extent rather than on their middle,
 * so the picture has no lopsided empty space. Closed form, then one refinement for perspective.
 */
export function fitPoints(points: V3[], theta: number, phi: number, vp: Viewport, margin = 0.06): Orbit {
  const { d, r, u } = basis(theta, phi);
  const { tx, ty } = visibleTangents(vp);
  const sx = tx * (1 - margin);
  const sy = ty * (1 - margin);
  let target: V3 = centroid(points);
  let radius = 1;
  for (let pass = 0; pass < 3; pass++) {
    // Distance: every point inside the frustum. For a point at offset v, depth = radius - v·d.
    radius = 0;
    for (const p of points) {
      const v: V3 = [p[0] - target[0], p[1] - target[1], p[2] - target[2]];
      const along = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
      const x = Math.abs(v[0] * r[0] + v[1] * r[1] + v[2] * r[2]);
      const y = Math.abs(v[0] * u[0] + v[1] * u[1] + v[2] * u[2]);
      radius = Math.max(radius, along + Math.max(x / sx, y / sy));
    }
    // Centre the projected extent: shift the target by the midpoint of the screen-space bounds.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      const v: V3 = [p[0] - target[0], p[1] - target[1], p[2] - target[2]];
      const depth = Math.max(0.1, radius - (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]));
      const x = (v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / depth;
      const y = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / depth;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const cx = ((minX + maxX) / 2) * radius;
    const cy = ((minY + maxY) / 2) * radius;
    target = add(target, add(scale(r, cx), scale(u, cy)));
  }
  return { target, theta, phi, radius };
}

export function centroid(points: V3[]): V3 {
  const c: V3 = [0, 0, 0];
  for (const p of points) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  const n = Math.max(1, points.length);
  return [c[0] / n, c[1] / n, c[2] / n];
}

/** The 8 corners of an axis-aligned box. */
export function boxCorners(minX: number, maxX: number, y0: number, y1: number, minZ: number, maxZ: number): V3[] {
  const out: V3[] = [];
  for (const x of [minX, maxX]) for (const y of [y0, y1]) for (const z of [minZ, maxZ]) out.push([x, y, z]);
  return out;
}

/** Where the projected points fall in the visible part of the view (-1..1 on each axis), for tests. */
export function projectToVisible(o: Orbit, p: V3, vp: Viewport): [number, number] {
  const { d, r, u } = basis(o.theta, o.phi);
  const { tx, ty } = visibleTangents(vp);
  const v: V3 = [p[0] - o.target[0], p[1] - o.target[1], p[2] - o.target[2]];
  const depth = o.radius - (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]);
  return [
    (v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / depth / tx,
    (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / depth / ty,
  ];
}
