import { FLOOR_HEIGHT, type CityLayout, type LayoutBuilding } from '../types.ts';

/**
 * Street and building measurements shared by every life system. The road constants match the legacy city
 * (apps/legacy/src/scene/street.ts) and A1's roads: a road is 4 units wide, one lane each way.
 */
export const ROAD_HALF = 2;
export const LANE = 1;
/** Sidewalk walking line, measured from the road centre line. */
export const SIDEWALK = 2.7;
/** Crosswalk centre, measured from the junction centre (legacy: at the sidewalk line). */
export const CROSSWALK_AT = SIDEWALK;
export const CROSSWALK_HALF_WIDTH = 0.55;
/** Where a car's front stops: just behind the crosswalk. A junction "box" is everything within this distance. */
export const STOP_FRONT = SIDEWALK + 0.7;
/** Road surface height (cars sit on it). */
export const ROAD_Y = 0.03;
/** Sidewalk surface height (people stand on it). A1's kerb height; adjust here only. */
export const SIDEWALK_Y = 0.12;

export interface Box {
  key: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

/** Height of a building's main roof (A1 may add crowns and spires above it). */
export function roofHeight(b: LayoutBuilding): number {
  return b.floors.length * FLOOR_HEIGHT;
}

export function buildingBoxes(layout: CityLayout): Box[] {
  return layout.buildings.map(b => ({
    key: b.key,
    minX: b.x - b.w / 2,
    maxX: b.x + b.w / 2,
    minZ: b.z - b.d / 2,
    maxZ: b.z + b.d / 2,
    height: roofHeight(b),
  }));
}

export function tallestRoof(layout: CityLayout): number {
  return Math.max(...layout.buildings.map(roofHeight));
}

export function insideBox(b: Box, x: number, y: number, z: number, pad = 0): boolean {
  return x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad && y < b.height + pad;
}

export interface Door {
  building: string;
  /** Door position on the facade. */
  x: number;
  z: number;
  /** Unit vector pointing out of the building, towards the street. */
  nx: number;
  nz: number;
}

/**
 * Lobby doors: the middle of the facade facing the nearest east-west road (the larger buildings get a second door
 * on the opposite side). Pedestrians walk in and out here; A1's lobbies should line up with these.
 */
export function buildingDoors(layout: CityLayout): Door[] {
  const doors: Door[] = [];
  const { roadsZ } = layout.streets;
  for (const b of layout.buildings) {
    const south = roadsZ.filter(z => z > b.z).sort((a, c) => a - c)[0];
    const north = roadsZ.filter(z => z < b.z).sort((a, c) => c - a)[0];
    const faces: number[] = [];
    if (south !== undefined && (north === undefined || south - b.z <= b.z - north)) faces.push(1);
    else faces.push(-1);
    if (b.w * b.d >= 120 && faces[0] === 1 && north !== undefined) faces.push(-1);
    for (const nz of faces) doors.push({ building: b.key, x: b.x, z: b.z + (nz * b.d) / 2, nx: 0, nz });
  }
  return doors;
}

/** Height of the walkable roof surface above `roofHeight` (A1's roof cap). Rooftop life stands on it. */
export const ROOF_TOP = 0.3;
