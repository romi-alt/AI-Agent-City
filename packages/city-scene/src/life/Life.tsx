'use client';
import { useFrame, useStore, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { useCity, useCityContext } from '../context.tsx';
import { useSharedUniforms } from '../environment/palette.ts';
import { QUALITY } from '../quality/quality.ts';
import { Air } from './air/Air.tsx';
import { Birds } from './birds/Birds.tsx';
import { createLifeClock, type LifeClock } from './clock.ts';
import { Details } from './details/Details.tsx';
import { useLifeEnv } from './env-adapter.ts';
import { People } from './people/People.tsx';
import { cityLifeCounts, StreetSim } from './street-sim.ts';
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
 * Development only: exposes the scene on `window.__life`, and runs `window.__life.frame(scene, camera)` (if a
 * screenshot script sets it) after the camera rig each frame, so scripts can frame flocks and aircraft.
 */
function LifeDebug() {
  const store = useStore();
  const scene = useThree(s => s.scene);
  // Also frame before the life systems run (negative priority keeps automatic rendering), so their camera-based
  // culling and level of detail see the scripted camera, not the rig's.
  useFrame(state => {
    const debug = (window as unknown as { __life?: { frame?: (scene: unknown, camera: unknown) => void } }).__life;
    debug?.frame?.(state.scene, state.camera);
  }, -500);
  useEffect(() => {
    const debug: { scene: unknown; frame?: (scene: unknown, camera: unknown) => void } = { scene };
    (window as unknown as { __life?: unknown }).__life = debug;
    let unsubscribe: (() => void) | undefined;
    // Subscribe late, so this runs after the camera rig's frame callback.
    const timer = setTimeout(() => {
      unsubscribe = store
        .getState()
        .internal.subscribe({ current: state => debug.frame?.(state.scene, state.camera) }, 0, store);
    }, 1500);
    return () => {
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, [scene, store]);
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
    const s = new StreetSim(layout, { ...cityLifeCounts(budget), roofWorkers });
    s.warmUp(WARM_UP);
    return s;
    // The budget object is a constant per quality level.
  }, [layout, budget, roofWorkers]);
  const animate = !paused && !reduced;
  return (
    <group name="life">
      <Stepper sim={sim} clock={clock} animate={animate} />
      {process.env.NODE_ENV !== 'production' && <LifeDebug />}
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
