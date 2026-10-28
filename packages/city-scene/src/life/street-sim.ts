import type { CityLayout } from '../types.ts';
import { PeopleSim } from './people/sim.ts';
import { TrafficSim } from './traffic/sim.ts';

/** Traffic and pedestrians share the crosswalks, so they are stepped together: cars first, then people. */
export class StreetSim {
  readonly traffic: TrafficSim;
  readonly people: PeopleSim;
  /** Simulated seconds so far. */
  elapsed = 0;

  constructor(layout: CityLayout, opts: { vehicles: number; pedestrians: number; roofWorkers: number; seed?: number }) {
    const seed = opts.seed ?? 1;
    this.traffic = new TrafficSim(districtStreets(layout), { count: opts.vehicles, seed: seed * 7 + 1 });
    this.people = new PeopleSim(this.traffic.net, layout, this.traffic.pedsOnCrosswalk, this.traffic.carsOnCrosswalk, {
      count: opts.pedestrians,
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
 * The roads traffic drives on: the layout's grid plus A1's parkway ring at the district edge (read-only from
 * streets/grid.ts), which closes the network so vehicles circulate inside the district.
 */
export function districtStreets(layout: CityLayout): CityLayout['streets'] {
  // X04 (D1 interim fix, until D3 moves traffic onto cityRoads): the street grid now runs to the horizon, so
  // traffic keeps to the layout's own roads, which all exist in the extended grid.
  return layout.streets;
}
