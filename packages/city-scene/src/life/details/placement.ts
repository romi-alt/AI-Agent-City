import type { CityLayout } from '../../types.ts';
import { roofHeight, ROOF_TOP } from '../geometry.ts';

/**
 * Where the rooftop details go. Restraint: about half the roofs get a ventilation fan or two (a third of those are
 * idle), the tallest roofs get red aircraft-warning beacons, and the three rental towers carry one digital
 * billboard each, showing the AgentCity mark and ambient colour (no business claims).
 */
export interface FanSpot {
  x: number;
  y: number;
  z: number;
  /** Radians per second (0: idle fan). */
  speed: number;
  phase: number;
}
export interface BeaconSpot {
  x: number;
  y: number;
  z: number;
  phase: number;
}
export interface BillboardSpot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  w: number;
  h: number;
  board: number;
}

export const BILLBOARD_LINES = ['AgentCity', 'Welcome to AgentCity', 'Explore the city', 'AgentCity'] as const;

export function detailPlan(layout: CityLayout) {
  const fans: FanSpot[] = [];
  const beacons: BeaconSpot[] = [];
  const billboards: BillboardSpot[] = [];
  const sorted = [...layout.buildings].sort((a, b) => a.key.localeCompare(b.key));
  sorted.forEach((b, i) => {
    const y = roofHeight(b) + ROOF_TOP;
    const ix = b.w / 2 - 1.4;
    const iz = b.d / 2 - 1.4;
    const n = i % 3 === 0 ? 2 : i % 3 === 1 ? 1 : 0;
    const corners: [number, number][] = [
      [ix, -iz],
      [-ix, iz],
    ];
    for (let k = 0; k < n; k++) {
      const [cx, cz] = corners[k]!;
      fans.push({
        x: b.x + cx,
        y,
        z: b.z + cz,
        speed: (i * 7 + k) % 3 === 1 ? 0 : 2.2 + ((i * 7 + k * 3) % 5) * 0.6,
        phase: i + k,
      });
    }
  });
  const tallest = [...layout.buildings]
    .sort((a, b) => b.floors.length - a.floors.length || a.key.localeCompare(b.key))
    .slice(0, 6);
  tallest.forEach((b, i) => {
    const y = roofHeight(b) + ROOF_TOP + 1.3;
    beacons.push({ x: b.x - b.w / 2 + 0.4, y, z: b.z - b.d / 2 + 0.4, phase: i * 0.13 });
    beacons.push({ x: b.x + b.w / 2 - 0.4, y, z: b.z + b.d / 2 - 0.4, phase: i * 0.13 + 0.05 });
  });
  layout.buildings
    .filter(b => b.kind === 'rental')
    .sort((a, b) => a.key.localeCompare(b.key))
    .forEach((b, i) => {
      billboards.push({
        x: b.x,
        y: roofHeight(b) + ROOF_TOP + 1.0,
        z: b.z + 0.8,
        yaw: 0,
        w: Math.min(5, b.w - 3),
        h: 2.3,
        board: i,
      });
    });
  return { fans, beacons, billboards };
}
