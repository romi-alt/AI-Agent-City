import { readFileSync } from 'node:fs';
import type { CityLayout } from '../src/types.ts';

export const layout = JSON.parse(
  readFileSync(new URL('../src/data/city-layout.json', import.meta.url), 'utf8'),
) as CityLayout;

export interface Rect {
  x: number;
  z: number;
  yaw: number;
  hl: number;
  hw: number;
}

/** Separating-axis test for two oriented rectangles in the ground plane. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2].map(y => [Math.cos(y), -Math.sin(y)] as const);
  const proj = (r: Rect, ax: readonly [number, number]) => {
    const c = r.x * ax[0] + r.z * ax[1];
    const ux = Math.cos(r.yaw);
    const uz = -Math.sin(r.yaw);
    const ext = r.hl * Math.abs(ux * ax[0] + uz * ax[1]) + r.hw * Math.abs(-uz * ax[0] + ux * ax[1]);
    return [c - ext, c + ext] as const;
  };
  for (const ax of axes) {
    const [a0, a1] = proj(a, ax);
    const [b0, b1] = proj(b, ax);
    if (a1 <= b0 || b1 <= a0) return false;
  }
  return true;
}
