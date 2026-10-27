/** The arrival plays once per browser session; reloading or coming back to the city starts in explore. */
export const ARRIVAL_KEY = 'agentcity:arrival-played';

/** Seconds of the cinematic arrival, and of its reduced-motion fade. */
export const ARRIVAL_SECONDS = 11;
export const ARRIVAL_FADE_SECONDS = 0.6;

type SessionLike = Pick<Storage, 'getItem' | 'setItem'>;

export function arrivalPlayed(storage: SessionLike | null | undefined): boolean {
  try {
    return storage?.getItem(ARRIVAL_KEY) === '1';
  } catch {
    // Storage can be blocked (private mode, sandboxed frames): then the arrival may play again, which is harmless.
    return false;
  }
}

export function markArrivalPlayed(storage: SessionLike | null | undefined): void {
  try {
    storage?.setItem(ARRIVAL_KEY, '1');
  } catch {
    /* see arrivalPlayed */
  }
}

/** Whether a fresh scene should start with the arrival. `force` is for hosts that always want it (a guided tour). */
export function shouldPlayArrival(storage: SessionLike | null | undefined, force = false): boolean {
  return force || !arrivalPlayed(storage);
}
