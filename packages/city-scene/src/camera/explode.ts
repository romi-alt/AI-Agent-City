import { FLOOR_HEIGHT } from '../types.ts';

/**
 * Exploded floors: how far a floor is lifted when the building is opened up like a physical model. A1 renders the
 * building with the same rule (buildings/explode.ts once it lands); camera, labels and interiors use this one.
 * `t` is the eased explode amount, 0 (closed) to 1 (fully apart).
 */
export const EXPLODE_GAP = FLOOR_HEIGHT * 0.85;

export function floorLift(level: number, t: number): number {
  return Math.max(0, level - 1) * EXPLODE_GAP * t;
}

/** Extra height the whole building gains when exploded. */
export function explodedExtra(floors: number, t: number): number {
  return floorLift(floors, t);
}

/** The live, eased explode amount of one city (0..1), advanced by the camera rig each frame and read by labels and
 *  interiors. One per store, like the scene bus. */
export interface ExplodeState {
  t: number;
}
const states = new WeakMap<object, ExplodeState>();
export function explodeState(store: object): ExplodeState {
  let s = states.get(store);
  if (!s) states.set(store, (s = { t: 0 }));
  return s;
}
