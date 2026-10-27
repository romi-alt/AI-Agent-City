import { angleBetween, angleDelta, catmullRom, clamp, dist, easeInOutCubic, lerp, lerp3, sub } from './math.ts';
import { orbitFromPose, orbitPosition } from './orbit.ts';
import type { Pose } from './shots.ts';

/**
 * Comfort limits: the view never turns faster than MAX_TURN radians per second and the point of interest never
 * slides faster than MAX_TRAVEL units per second (both at the eased peak), so flights don't cause motion sickness.
 */
export const MAX_TURN = 0.9;
export const MAX_TRAVEL = 55;
export const MIN_FLIGHT = 0.9;
export const MAX_FLIGHT = 5.5;

export interface Flight {
  from: Pose;
  to: Pose;
  duration: number;
  /** How much to pull back mid-flight when travelling between distant points (fraction of the radius). */
  pullBack: number;
}

/** Peak view-turn rate (rad/s) and look-at slide rate (units/s) along a path sampled over `duration` seconds. */
export function peakRates(sample: (t: number) => Pose, duration: number, steps = 90): { turn: number; travel: number } {
  const dt = duration / steps;
  let turn = 0;
  let travel = 0;
  let prev = sample(0);
  for (let i = 1; i <= steps; i++) {
    const p = sample(i * dt);
    turn = Math.max(turn, angleBetween(sub(prev.target, prev.pos), sub(p.target, p.pos)) / dt);
    travel = Math.max(travel, dist(prev.target, p.target) / dt);
    prev = p;
  }
  return { turn, travel };
}

/**
 * Seconds needed to go between two framings within the comfort limits: the path is sampled once at unit speed
 * and stretched until its fastest turn and slide fit (rates scale inversely with duration).
 */
export function flightDuration(from: Pose, to: Pose): number {
  const unit: Flight = { from, to, duration: 1, pullBack: pullBackFor(from, to) };
  const peak = peakRates(t => sampleFlight(unit, t), 1);
  const a = orbitFromPose(from.pos, from.target);
  const b = orbitFromPose(to.pos, to.target);
  const zoom = Math.abs(Math.log(b.radius / a.radius));
  return clamp(Math.max(peak.turn / MAX_TURN, peak.travel / MAX_TRAVEL, zoom * 0.7), MIN_FLIGHT, MAX_FLIGHT);
}

function pullBackFor(from: Pose, to: Pose): number {
  const a = orbitFromPose(from.pos, from.target);
  return clamp(dist(from.target, to.target) / Math.max(a.radius, 1) - 0.3, 0, 0.6);
}

export function planFlight(from: Pose, to: Pose): Flight {
  return { from, to, duration: flightDuration(from, to), pullBack: pullBackFor(from, to) };
}

/**
 * Where the camera is `elapsed` seconds into a flight. The look-at point moves along a straight line while the
 * camera orbits around it (heading by the shortest way, distance in log space), so the view turns smoothly and
 * never swings through the target.
 */
export function sampleFlight(f: Flight, elapsed: number): Pose {
  const u = easeInOutCubic(f.duration <= 0 ? 1 : elapsed / f.duration);
  const a = orbitFromPose(f.from.pos, f.from.target);
  const b = orbitFromPose(f.to.pos, f.to.target);
  const target = lerp3(f.from.target, f.to.target, u);
  const theta = a.theta + angleDelta(a.theta, b.theta) * u;
  const phi = lerp(a.phi, b.phi, u);
  const radius = Math.exp(lerp(Math.log(a.radius), Math.log(b.radius), u)) * (1 + f.pullBack * Math.sin(Math.PI * u));
  return { pos: orbitPosition({ target, theta, phi, radius }), target };
}

export function flightDone(f: Flight, elapsed: number): boolean {
  return elapsed >= f.duration;
}

/** A multi-keyframe glide (the arrival): one smooth spline through every keyframe, eased once end to end. */
export interface Glide {
  keys: Pose[];
  duration: number;
}

export function planGlide(keys: Pose[], seconds = 11): Glide {
  return { keys, duration: seconds };
}

export function sampleGlide(g: Glide, elapsed: number): Pose {
  const u = easeInOutCubic(g.duration <= 0 ? 1 : elapsed / g.duration);
  return {
    pos: catmullRom(
      g.keys.map(k => k.pos),
      u,
    ),
    target: catmullRom(
      g.keys.map(k => k.target),
      u,
    ),
  };
}
