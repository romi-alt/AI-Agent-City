'use client';
import { Canvas } from '@react-three/fiber';
import { type ReactNode, useMemo } from 'react';
import { CameraRig } from './camera/CameraRig.tsx';
import { CityContext, type CityContextValue } from './context.tsx';
import { Buildings } from './buildings/Buildings.tsx';
import layoutJson from './data/city-layout.json';
import { Environment } from './environment/Environment.tsx';
import { Interior } from './interior/Interior.tsx';
import { Life } from './life/Life.tsx';
import { QUALITY } from './quality/quality.ts';
import { QualityManager } from './quality/QualityManager.tsx';
import { createCityStore, type CityStore, useCityState } from './store.ts';
import { Streets } from './streets/Streets.tsx';
import type { CityLayout, CityState } from './types.ts';

export const CITY_LAYOUT = layoutJson as CityLayout;

export interface CitySceneProps {
  store?: CityStore;
  initial?: Partial<CityState>;
  /** Extra DOM overlay (HUD, panels) rendered over the canvas, inside the city context. */
  overlay?: ReactNode;
  onNavigate?: CityContextValue['onNavigate'];
  className?: string;
  /** Accessible description of the scene for screen readers. */
  label?: string;
}

/**
 * The whole city. Composition only: each part is owned by one workstream (see x01-cinematic-city/PLAN.md).
 * Render it inside a sized container; it fills it.
 */
export function CityScene({ store: given, initial, overlay, onNavigate, className, label }: CitySceneProps) {
  const store = useMemo(() => given ?? createCityStore(initial), [given, initial]);
  const quality = useCityState(store, s => s.quality);
  const budget = QUALITY[quality];
  const ctx = useMemo<CityContextValue>(() => ({ store, layout: CITY_LAYOUT, onNavigate }), [store, onNavigate]);
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
            <QualityManager />
            <Environment />
            <Streets />
            <Buildings />
            <Life />
            <Interior />
            <CameraRig />
          </CityContext.Provider>
        </Canvas>
        {overlay}
      </div>
    </CityContext.Provider>
  );
}
