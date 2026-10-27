'use client';
import { useEnvironmentLight } from '../environment/palette.ts';

/**
 * The only place city life reads the environment: A1's light rig (`environment/palette.ts`). The returned object is
 * stable and updated every frame by the environment, so read it inside `useFrame`, never during render.
 */
export interface LifeEnv {
  /** 0 full day … 1 deep night: headlights, aircraft lights, warning beacons. */
  readonly nightFactor: number;
  /** 0 dry … 1 wet streets. */
  readonly wetness: number;
}

export function useLifeEnv(): LifeEnv {
  return useEnvironmentLight();
}
