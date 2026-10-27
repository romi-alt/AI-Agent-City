'use client';
import { useFrame } from '@react-three/fiber';
import { useState } from 'react';
import { useCity } from '../context.tsx';
import type { TimeOfDay, Weather } from '../types.ts';

/**
 * The only place city life reads the environment. A1 owns the light rig and exports
 * `useEnvironmentLight(): { sunDirection, sunColor, ambient, nightFactor, wetness }` from `environment/palette.ts`;
 * until the integrator wires it here, this adapter derives the same two numbers from the store's time of day and
 * weather, eased so a change of time never pops the lights.
 *
 * Returns a stable object that is updated every frame: read it inside `useFrame`, never during render.
 */
export interface LifeEnv {
  /** 0 full day … 1 deep night: headlights, aircraft lights, warning beacons. */
  nightFactor: number;
  /** 0 dry … 1 wet streets. */
  wetness: number;
}

const NIGHT: Record<TimeOfDay, number> = { day: 0, golden: 0.25, evening: 0.72, night: 1 };
const WET: Record<Weather, number> = { clear: 0, 'partly-cloudy': 0, overcast: 0.1, 'light-rain': 0.85 };

export function nightFactorFor(time: TimeOfDay): number {
  return NIGHT[time];
}

export function useLifeEnv(): LifeEnv {
  const time = useCity(s => s.timeOfDay);
  const weather = useCity(s => s.weather);
  const [env] = useState<LifeEnv>(() => ({ nightFactor: NIGHT[time], wetness: WET[weather] }));
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 1.5);
    env.nightFactor += (NIGHT[time] - env.nightFactor) * k;
    env.wetness += (WET[weather] - env.wetness) * k;
  });
  return env;
}
