import { explodeRuntime, floorOffset } from '../buildings/explode.ts';
import type { CityStore } from '../store.ts';

/**
 * Exploded floors, read from A1's contract (buildings/explode.ts): the building is opened like a physical model;
 * lobby levels stay on the ground and each floor above lifts by A1's gap. A1 animates the progress per building;
 * the camera frames the end state (t = 0 or 1), labels and interiors follow the live progress.
 */
export function floorLift(buildingKey: string, level: number, t: number): number {
  return floorOffset(buildingKey, level, t);
}

/** Extra height the whole building gains (the roof moves with the top floor). */
export function explodedExtra(buildingKey: string, floors: number, t: number): number {
  return floorOffset(buildingKey, floors, t);
}

/** A building's live explode progress (0..1, before easing), as A1's <Buildings> animates it. */
export function liveExplode(store: CityStore, buildingKey: string): number {
  return explodeRuntime(store).progress.get(buildingKey) ?? 0;
}
