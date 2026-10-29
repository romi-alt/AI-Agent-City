/**
 * The big park north of the district (the Central Park of this city): a block of blocks left green, with a
 * reservoir, ponds and tree clusters. Pure rectangles and counts, shared by the surround planner (no buildings
 * there), the street grid (lawn blocks) and the landscape planner (trees and water).
 */
import type { Rect } from '../streets/extent.ts';

/** Road centre lines on all four sides (roads are every 20 units at odd tens), so whole blocks are green. */
export const CENTRAL_PARK: Rect = { minX: -130, maxX: 130, minZ: -330, maxZ: -190 };

/** The reservoir: a large pond in the middle of the park. */
export const RESERVOIR = { x: 0, z: -260, r: 16 };

export function inCentralPark(x: number, z: number): boolean {
  return x > CENTRAL_PARK.minX && x < CENTRAL_PARK.maxX && z > CENTRAL_PARK.minZ && z < CENTRAL_PARK.maxZ;
}
