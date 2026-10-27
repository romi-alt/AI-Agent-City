import { createContext } from 'react';

/**
 * Where the traffic-signal heads get their colours. A2 owns the real phase (`life/signals.ts`, which also stops its
 * cars); the integrator wires it in with `<SignalSourceContext.Provider value={…}>`. Until then the heads run the
 * legacy fixed cycle below, which is the same one the legacy traffic used.
 *
 * `x` is the light shown to traffic driving along x (on the roads at each `roadsZ`), `z` to traffic along z.
 */
export type SignalLight = 'g' | 'y' | 'r';
export interface SignalPhase {
  x: SignalLight;
  z: SignalLight;
}
export interface SignalSource {
  /** The phase at `time` seconds of the scene's animation clock (which stops while paused). */
  phase(time: number): SignalPhase;
}

export const DEFAULT_SIGNAL_CYCLE = 16;

/** Legacy cycle: x-traffic green 6.5 s, amber 1.5 s, then z-traffic green 6.5 s, amber 1.5 s. */
export function defaultSignalPhase(time: number): SignalPhase {
  const p = ((time % DEFAULT_SIGNAL_CYCLE) + DEFAULT_SIGNAL_CYCLE) % DEFAULT_SIGNAL_CYCLE;
  if (p < 6.5) return { x: 'g', z: 'r' };
  if (p < 8) return { x: 'y', z: 'r' };
  if (p < 14.5) return { x: 'r', z: 'g' };
  return { x: 'r', z: 'y' };
}

export const defaultSignalSource: SignalSource = { phase: defaultSignalPhase };

export const SignalSourceContext = createContext<SignalSource>(defaultSignalSource);
