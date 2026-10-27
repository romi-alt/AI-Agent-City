// Small, dependency-free vector and easing helpers shared by the camera's pure modules (testable in node).

export type V3 = [number, number, number];

export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: V3, b: V3) => len(sub(a, b));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const normalize = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Angle in radians between two direction vectors. */
export function angleBetween(a: V3, b: V3): number {
  const na = normalize(a);
  const nb = normalize(b);
  return Math.acos(clamp(na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2], -1, 1));
}

/** Ease in and out: gentle start and stop, so flights never jolt. */
export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}
export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2;
}

/** Frame-rate independent exponential smoothing factor: how far to move towards the goal this frame. */
export function dampFactor(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * Math.max(0, dt));
}

/** Shortest signed difference between two angles (radians), in (-π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Uniform Catmull-Rom spline through the points; t in [0, 1] covers the whole curve. */
export function catmullRom(points: V3[], t: number): V3 {
  const n = points.length;
  if (n === 0) return [0, 0, 0];
  if (n === 1) return [...points[0]!];
  const seg = clamp(t, 0, 1) * (n - 1);
  const i = Math.min(n - 2, Math.floor(seg));
  const u = seg - i;
  const p0 = points[Math.max(0, i - 1)]!;
  const p1 = points[i]!;
  const p2 = points[i + 1]!;
  const p3 = points[Math.min(n - 1, i + 2)]!;
  const out: V3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const a = p0[k]!;
    const b = p1[k]!;
    const c = p2[k]!;
    const d = p3[k]!;
    out[k] = 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  }
  return out;
}
