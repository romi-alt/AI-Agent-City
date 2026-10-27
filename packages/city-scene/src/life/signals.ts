/**
 * Traffic-signal timing for every junction (A2 owns it; A1 lights the signal heads from it).
 *
 * `ew` is traffic driving along x (the roads at `layout.streets.roadsZ`), `ns` is traffic driving along z (the roads
 * at `roadsX`). The cycle is the legacy one (apps/legacy/src/scene/street.ts): 16 s, east-west first.
 *
 * Pass the same clock everywhere, the R3F `state.clock.elapsedTime`, so heads, cars and walkers agree.
 */
export type SignalColor = 'green' | 'amber' | 'red';
export interface SignalPhase {
  ns: SignalColor;
  ew: SignalColor;
}
export type WalkColor = 'walk' | 'flash' | 'dont';

export const SIGNAL_CYCLE = 16;
const EW_GREEN = 6.5;
const EW_AMBER = 8;
const NS_GREEN = 14.5;

function cyclePos(t: number) {
  return ((t % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
}

export function signalPhase(t: number): SignalPhase {
  const p = cyclePos(t);
  if (p < EW_GREEN) return { ew: 'green', ns: 'red' };
  if (p < EW_AMBER) return { ew: 'amber', ns: 'red' };
  if (p < NS_GREEN) return { ew: 'red', ns: 'green' };
  return { ew: 'red', ns: 'amber' };
}

/** Seconds of green left for traffic along `axis` (0 when it is not green). */
export function greenRemaining(t: number, axis: 'ns' | 'ew'): number {
  const p = cyclePos(t);
  if (axis === 'ew') return p < EW_GREEN ? EW_GREEN - p : 0;
  return p >= EW_AMBER && p < NS_GREEN ? NS_GREEN - p : 0;
}

/** The time a pedestrian needs to cross one 4-unit road at a calm pace, plus a margin. */
export const CROSSING_TIME = 4.2;

/**
 * Pedestrian signals. Walkers parallel to a green flow may cross the road that is red: `walk.ew` covers people
 * walking along x (crossing the north-south roads). They may start while enough green is left to finish.
 */
export function walkSignal(t: number): { ns: WalkColor; ew: WalkColor } {
  const one = (axis: 'ns' | 'ew'): WalkColor => {
    const left = greenRemaining(t, axis);
    if (left >= CROSSING_TIME) return 'walk';
    return left > 0 ? 'flash' : 'dont';
  };
  return { ns: one('ns'), ew: one('ew') };
}
