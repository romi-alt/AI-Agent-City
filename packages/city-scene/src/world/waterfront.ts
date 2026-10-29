/**
 * The island around the district, as plain data: two rivers (a wide western one and a narrower eastern one) that
 * bound the grid of streets, like the rivers either side of Manhattan. Pure, so planners and tests need no WebGL.
 *
 * Each river runs north to south (along z) with a gentle wander; the street grid carries on beyond them as the far
 * banks (low blocks), so the city never ends at a river. Nothing is built, and no curb slab is laid, on water.
 */
export interface River {
  name: 'west' | 'east';
  /** Centre line at z = 0. */
  x: number;
  /** Half the water width. */
  half: number;
  /** Slow and fast wander of the centre line (amplitude, wavelength) in world units. */
  wander: [number, number][];
}

export const RIVERS: readonly River[] = [
  {
    name: 'west',
    x: -440,
    half: 58,
    wander: [
      [12, 260],
      [2.5, 90],
    ],
  },
  {
    name: 'east',
    x: 470,
    half: 34,
    wander: [
      [10, 200],
      [2, 70],
    ],
  },
];

/** Where a river's centre line is at a given z. */
export function riverX(r: River, z: number): number {
  let x = r.x;
  for (const [amp, wave] of r.wander) x += amp * Math.sin(z / (wave / (2 * Math.PI)));
  return x;
}

/** Slope dx/dz of the centre line, for orienting things that follow the river. */
export function riverSlope(r: River, z: number): number {
  let s = 0;
  for (const [amp, wave] of r.wander) {
    const k = (2 * Math.PI) / wave;
    s += amp * k * Math.cos(z * k);
  }
  return s;
}

/** Signed distance outside the water of the nearest river (negative inside the water). */
export function waterDistance(x: number, z: number): number {
  let best = Infinity;
  for (const r of RIVERS) best = Math.min(best, Math.abs(x - riverX(r, z)) - r.half);
  return best;
}

/** Whether a point is on water, or within `margin` of it (the quay, the promenade). */
export function inWater(x: number, z: number, margin = 0): boolean {
  return waterDistance(x, z) < margin;
}

/** Which bank a point is on: 0 on the island between the rivers, -1 beyond the west one, 1 beyond the east one. */
export function bankSide(x: number, z: number): -1 | 0 | 1 {
  const w = RIVERS[0]!;
  const e = RIVERS[1]!;
  if (x < riverX(w, z) - w.half) return -1;
  if (x > riverX(e, z) + e.half) return 1;
  return 0;
}

/**
 * Points along a river's bank, `offset` from the centre line measured along x (so they agree with `waterDistance`),
 * for ribbons and lamps.
 */
export function bankLine(r: River, offset: number, z0: number, z1: number, step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let z = z0; z <= z1 + 1e-6; z += step) out.push([riverX(r, z) + offset, z]);
  return out;
}
