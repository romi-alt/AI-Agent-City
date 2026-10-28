import { cityRoads, districtBounds } from '../streets/extent.ts';
import type { CityLayout } from '../types.ts';
import { PeopleSim } from './people/sim.ts';
import { TrafficSim, type Area } from './traffic/sim.ts';

/** Traffic and pedestrians share the crosswalks, so they are stepped together: cars first, then people. */
export class StreetSim {
  readonly traffic: TrafficSim;
  readonly people: PeopleSim;
  /** Simulated seconds so far. */
  elapsed = 0;

  constructor(layout: CityLayout, opts: { vehicles: number; pedestrians: number; roofWorkers: number; seed?: number }) {
    const seed = opts.seed ?? 1;
    this.traffic = new TrafficSim(cityStreets(layout), {
      count: opts.vehicles,
      seed: seed * 7 + 1,
      focus: districtBounds(layout),
      edgeFade: TRAFFIC_EDGE_FADE,
    });
    this.people = new PeopleSim(this.traffic.net, layout, this.traffic.pedsOnCrosswalk, this.traffic.carsOnCrosswalk, {
      count: opts.pedestrians,
      area: walkArea(layout),
      roofWorkers: opts.roofWorkers,
      seed: seed * 13 + 5,
    });
  }

  /** Advance by `dt` seconds at signal time `t`, in fixed sub-steps so a slow frame never tunnels a car. */
  step(dt: number, t: number) {
    const n = Math.max(1, Math.ceil(dt / (1 / 30)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const ti = t - dt + h * (i + 1);
      this.traffic.step(h, ti);
      this.people.step(h, ti);
    }
    this.elapsed += dt;
  }

  /** Run the city for a while before it is shown, so queues and crossings look mid-flow from the first frame. */
  warmUp(seconds: number, t0 = 0) {
    for (let t = 0; t < seconds; t += 1 / 15) this.step(1 / 15, t0 - seconds + t);
  }
}

/**
 * How far from the centre traffic runs on the generated city's grid (D1's `cityRoads`). Beyond this the streets are
 * deep in the fog, so simulating cars there would cost time and show nothing; vehicles fade out before the end.
 */
export const TRAFFIC_RADIUS = 220;
/** Distance over which a vehicle fades at the end of the simulated grid. */
export const TRAFFIC_EDGE_FADE = 30;

/**
 * The roads traffic drives on: the whole city's grid (`streets/extent.ts`, read-only) clipped to TRAFFIC_RADIUS.
 * The grid is open, so vehicles come out of the fog, drive through town and leave into the fog again.
 */
export function cityStreets(layout: CityLayout): CityLayout['streets'] {
  const roads = cityRoads(layout);
  const r = Math.min(TRAFFIC_RADIUS, roads.extent);
  const keep = (v: number[]) => v.filter(x => Math.abs(x) <= r - 6);
  return { roadsX: keep(roads.roadsX), roadsZ: keep(roads.roadsZ), extent: r + 10 };
}

/** Pedestrians walk the district and the first ring of generated blocks (one block beyond the district). */
export function walkArea(layout: CityLayout): Area {
  const d = districtBounds(layout);
  const sx = blockSpacing(layout.streets.roadsX);
  const sz = blockSpacing(layout.streets.roadsZ);
  return { minX: d.minX - sx, maxX: d.maxX + sx, minZ: d.minZ - sz, maxZ: d.maxZ + sz };
}

function blockSpacing(v: number[]) {
  const s = [...v].sort((a, b) => a - b);
  return s.length > 1 ? s[1]! - s[0]! : 20;
}

/**
 * Vehicles and people for a quality budget. The budget's counts are what the downtown should hold; the generated
 * city around it gets more of both, thinning out with distance.
 */
export function cityLifeCounts(budget: { vehicles: number; pedestrians: number }) {
  return { vehicles: Math.round(budget.vehicles * 5.5), pedestrians: Math.round(budget.pedestrians * 1.5) };
}
