/**
 * Time for city life. It advances only while life is animating (not paused, no reduced motion), so flights,
 * flocks and fans freeze in place instead of jumping when the tab comes back. Signals use the R3F clock instead
 * (see signals.ts), because A1's signal heads read it too.
 */
export interface LifeClock {
  /** Seconds of animated life so far. */
  t: number;
  /** R3F elapsed time this frame (for signals). */
  signalT: number;
  /** Seconds advanced this frame (0 while frozen). */
  dt: number;
}

export function createLifeClock(start = 0): LifeClock {
  return { t: start, signalT: 0, dt: 0 };
}
