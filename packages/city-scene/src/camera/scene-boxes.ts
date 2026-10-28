import type { CityLayout, CityMode } from '../types.ts';
import { type Box, cityBoxes, withMeasured } from './bounds.ts';
import { explodedExtra, floorLift } from './explode.ts';
import type { MeasuredBox } from './measure.ts';
import { floorBase } from './shots.ts';

/**
 * The camera's collision boxes for a mode: every building at its real (measured) size; the focused building grows
 * when its floors are exploded; an opened floor cuts its building, keeping a box for the floors below it (lifted
 * with them when exploded).
 */
export function boxesFor(
  layout: CityLayout,
  mode: CityMode,
  measured: ReadonlyMap<string, MeasuredBox> | null,
  explodeT: number,
): Box[] {
  const base = withMeasured(cityBoxes(layout), measured);
  if (mode.kind === 'explore' || mode.kind === 'arrival') return base;
  const b = layout.buildings.find(x => x.key === mode.building);
  if (!b) return base;
  const n = b.floors.length;
  const extra = explodedExtra(b.key, n, explodeT);
  return base.flatMap(box => {
    if (box.key !== b.key) return [box];
    if (mode.kind === 'building') return [{ ...box, top: box.top + extra }];
    const cut = floorBase(mode.level) + floorLift(b.key, mode.level, explodeT);
    // Everything above an opened floor is cut away, exploded or not: one box for the stack below it.
    return [{ ...box, top: cut, cut: true }];
  });
}
