'use client';
import { Canvas } from '@react-three/fiber';
import { type ReactNode, useMemo } from 'react';
import { CameraRig } from './camera/CameraRig.tsx';
import { CityContext, type CityContextValue } from './context.tsx';
import { Buildings } from './buildings/Buildings.tsx';
import { Surround } from './buildings/surround/index.ts';
import layoutJson from './data/city-layout.json';
import { Environment } from './environment/Environment.tsx';
import { Interior } from './interior/Interior.tsx';
import { Life } from './life/Life.tsx';
import { signalPhase } from './life/signals.ts';
import { QUALITY } from './quality/quality.ts';
import { QualityManager } from './quality/QualityManager.tsx';
import { createCityStore, type CityStore, useCityState } from './store.ts';
import { type SignalLight, type SignalSource, SignalSourceContext } from './streets/signal-source.ts';
import { Streets } from './streets/Streets.tsx';
import { CENTRAL_PARK } from './world/park.ts';
import { Dressing } from './world/Dressing.tsx';
import { Blimp } from './world/Blimp.tsx';
import { Billboards } from './world/Billboards.tsx';
import { Waterfront } from './world/Waterfront.tsx';
import type { CityLayout, CityState } from './types.ts';

export const CITY_LAYOUT = layoutJson as CityLayout;
/** Blocks the surround leaves green: the big park north of the district. */
const PARK = [CENTRAL_PARK];

const HEAD: Record<'green' | 'amber' | 'red', SignalLight> = { green: 'g', amber: 'y', red: 'r' };
/** The signal heads (A1) show the same phase the traffic (A2) obeys. A2's `ew` is traffic along x. */
const SIGNALS: SignalSource = {
  phase(t) {
    const p = signalPhase(t);
    return { x: HEAD[p.ew], z: HEAD[p.ns] };
  },
};

export interface CitySceneProps {
  store?: CityStore;
  initial?: Partial<CityState>;
  /** Extra DOM overlay (HUD, panels) rendered over the canvas, inside the city context. */
  overlay?: ReactNode;
  onNavigate?: CityContextValue['onNavigate'];
  /** Camera for the overview instead of the whole-city default. */
  homePose?: CityContextValue['homePose'];
  className?: string;
  /** Accessible description of the scene for screen readers. */
  label?: string;
}

/**
 * The whole city. Composition only: each part is owned by one workstream (see x01-cinematic-city/PLAN.md).
 * Render it inside a sized container; it fills it.
 */
export function CityScene({ store: given, initial, overlay, onNavigate, homePose, className, label }: CitySceneProps) {
  const store = useMemo(() => given ?? createCityStore(initial), [given, initial]);
  const quality = useCityState(store, s => s.quality);
  const budget = QUALITY[quality];
  const ctx = useMemo<CityContextValue>(
    () => ({ store, layout: CITY_LAYOUT, onNavigate, homePose }),
    [store, onNavigate, homePose],
  );
  return (
    <CityContext.Provider value={ctx}>
      <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
        <Canvas
          role="img"
          aria-label={label ?? 'A 3D city of office towers, streets and traffic'}
          dpr={budget.dpr}
          shadows={budget.shadows}
          gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
          camera={{ position: [70, 55, 90], fov: 42, near: 0.5, far: 2500 }}
        >
          <CityContext.Provider value={ctx}>
            <SignalSourceContext.Provider value={SIGNALS}>
              <QualityManager />
              <Environment />
              <Streets />
              <Buildings />
              <Surround park={PARK} />
              <Waterfront />
              <Billboards />
              <Dressing />
              <Blimp />
              <Life />
              <Interior />
              <CameraRig />
            </SignalSourceContext.Provider>
          </CityContext.Provider>
        </Canvas>
        {overlay}
      </div>
    </CityContext.Provider>
  );
}
