import { clamp, type V3 } from './math.ts';

/**
 * The camera as an orbit around a target: `theta` is the heading around the vertical axis (0 looks from +z towards
 * -z), `phi` the angle down from straight overhead, `radius` the distance. Explore input edits a goal orbit and the
 * rig eases the current orbit towards it.
 */
export interface Orbit {
  target: V3;
  theta: number;
  phi: number;
  radius: number;
}

export interface OrbitLimits {
  minRadius: number;
  maxRadius: number;
  /** Smallest angle from overhead (never quite top-down, so "up" on screen keeps meaning). */
  minPhi: number;
  /** Largest angle from overhead (just above the horizon). */
  maxPhi: number;
}

export const EXPLORE_LIMITS: OrbitLimits = { minRadius: 6, maxRadius: 240, minPhi: 0.18, maxPhi: 1.42 };
export const BUILDING_LIMITS: OrbitLimits = { minRadius: 4, maxRadius: 140, minPhi: 0.18, maxPhi: 1.45 };
export const OFFICE_LIMITS: OrbitLimits = { minRadius: 0.6, maxRadius: 40, minPhi: 0.12, maxPhi: 1.5 };

export function orbitPosition(o: Orbit): V3 {
  const s = Math.sin(o.phi);
  return [
    o.target[0] + o.radius * s * Math.sin(o.theta),
    o.target[1] + o.radius * Math.cos(o.phi),
    o.target[2] + o.radius * s * Math.cos(o.theta),
  ];
}

/** The orbit that puts the camera at `pos` looking at `target`. */
export function orbitFromPose(pos: V3, target: V3): Orbit {
  const dx = pos[0] - target[0];
  const dy = pos[1] - target[1];
  const dz = pos[2] - target[2];
  const radius = Math.max(1e-3, Math.hypot(dx, dy, dz));
  return { target: [...target], theta: Math.atan2(dx, dz), phi: Math.acos(clamp(dy / radius, -1, 1)), radius };
}

export function clampOrbit(o: Orbit, l: OrbitLimits): Orbit {
  return { ...o, radius: clamp(o.radius, l.minRadius, l.maxRadius), phi: clamp(o.phi, l.minPhi, l.maxPhi) };
}

/** Rotate by a drag: dx/dy are fractions of the view size (1 = a full width/height drag). */
export function rotate(o: Orbit, dx: number, dy: number, l: OrbitLimits): Orbit {
  return clampOrbit({ ...o, theta: o.theta - dx * Math.PI * 1.6, phi: o.phi - dy * Math.PI * 0.8 }, l);
}

/** Zoom by a factor (<1 moves closer). */
export function zoom(o: Orbit, factor: number, l: OrbitLimits): Orbit {
  return clampOrbit({ ...o, radius: o.radius * factor }, l);
}

/**
 * Pan in the ground plane relative to where the camera faces: `right` and `forward` are fractions of the current
 * distance, so a pan feels the same zoomed in or out.
 */
export function pan(o: Orbit, right: number, forward: number): Orbit {
  const k = o.radius;
  const fx = -Math.sin(o.theta);
  const fz = -Math.cos(o.theta);
  // Right is forward rotated a quarter turn clockwise seen from above.
  const rx = -fz;
  const rz = fx;
  return {
    ...o,
    target: [o.target[0] + (rx * right + fx * forward) * k, o.target[1], o.target[2] + (rz * right + fz * forward) * k],
  };
}
