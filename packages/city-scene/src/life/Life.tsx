'use client';
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { useCity, useCityContext } from '../context.tsx';
import { useSharedUniforms } from '../environment/palette.ts';
import { QUALITY } from '../quality/quality.ts';
import { Air } from './air/Air.tsx';
import { Birds } from './birds/Birds.tsx';
import { createLifeClock, type LifeClock } from './clock.ts';
import { Details } from './details/Details.tsx';
import { useLifeEnv } from './env-adapter.ts';
import { People } from './people/People.tsx';
import { StreetSim } from './street-sim.ts';
import { Traffic } from './traffic/Traffic.tsx';

/** Simulated seconds run before the first frame, so the streets start mid-flow. */
const WARM_UP = 40;

function Stepper({ sim, clock, animate }: { sim: StreetSim; clock: LifeClock; animate: boolean }) {
  // Signals run on A1's animation clock (shared uTime), the same clock its signal heads read, so cars and lights
  // agree even after the city has been paused.
  const shared = useSharedUniforms();
  useFrame((_, delta) => {
    const signalT = shared.uTime.value;
    clock.signalT = signalT;
    clock.dt = animate ? Math.min(delta, 0.25) : 0;
    if (!animate) return;
    clock.t += clock.dt;
    sim.step(clock.dt, signalT);
  });
  return null;
}

/**
 * City life (workstream A2): traffic, pedestrians, aircraft, helicopters, birds and rooftop details. Every system
 * sizes itself from `QUALITY[store.quality]`; `paused` freezes everything; `reducedMotion` shows a calm, still but
 * populated city (vehicles and people hold their places, only resting birds, no aircraft, fans and screens still).
 */
export function Life() {
  const { layout } = useCityContext();
  const quality = useCity(s => s.quality);
  const paused = useCity(s => s.paused);
  const reduced = useCity(s => s.reducedMotion);
  const budget = QUALITY[quality];
  const env = useLifeEnv();
  const clock = useMemo(() => createLifeClock(), []);
  const roofWorkers = budget.microAnimations ? 1 : 0;
  const sim = useMemo(() => {
    const s = new StreetSim(layout, { vehicles: budget.vehicles, pedestrians: budget.pedestrians, roofWorkers });
    s.warmUp(WARM_UP);
    return s;
  }, [layout, budget.vehicles, budget.pedestrians, roofWorkers]);
  const animate = !paused && !reduced;
  return (
    <group name="life">
      <Stepper sim={sim} clock={clock} animate={animate} />
      <Traffic
        sim={sim}
        env={env}
        shadows={budget.shadows}
        pools={quality !== 'low'}
        animate={animate}
        detail={quality === 'low' ? 'low' : 'full'}
      />
      <People sim={sim} env={env} shadows={budget.shadows} animate={animate} />
      {!reduced && budget.aircraft + budget.helicopters > 0 && (
        <Air layout={layout} clock={clock} env={env} aircraft={budget.aircraft} helicopters={budget.helicopters} />
      )}
      {budget.birds > 0 && <Birds layout={layout} clock={clock} count={budget.birds} still={reduced} />}
      {budget.microAnimations && <Details layout={layout} clock={clock} env={env} still={reduced} />}
    </group>
  );
}
