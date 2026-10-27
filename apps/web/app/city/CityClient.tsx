'use client';
import {
  CITY_LAYOUT,
  CityHud,
  CityScene,
  type CityState,
  type CityStore,
  createCityStore,
  DEFAULT_OFFICE_CTA,
  detectWebGL,
  LoadingVeil,
  NoWebGL,
  SceneErrorBoundary,
  shouldPlayArrival,
} from '@agentcity/city-scene';
import { useEffect, useState } from 'react';

type View = 'webgl' | 'map' | 'failed';

/** The public explorer's starting state: catalog only, nothing enterable, the arrival once per session. */
function initialState(): Partial<CityState> {
  const params = new URLSearchParams(window.location.search);
  // ?building=<key> calls out a building (e.g. a link from the landing page); unknown keys are ignored.
  const wanted = params.get('building');
  const highlight = CITY_LAYOUT.buildings.some(b => b.key === wanted) ? wanted : null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  const arrival = shouldPlayArrival(storage, params.get('tour') === '1');
  return {
    mode: arrival ? { kind: 'arrival' } : highlight ? { kind: 'building', building: highlight } : { kind: 'explore' },
    enterable: [],
    highlight,
    reducedMotion,
  };
}

export function CityClient() {
  const [store] = useState<CityStore>(() => createCityStore(initialState()));
  const [view, setView] = useState<View>(() => (detectWebGL() ? 'webgl' : 'map'));

  // Follow the system's reduced-motion setting while the page is open (the HUD toggle can still override it).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => store.set({ reducedMotion: mq.matches });
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [store]);

  const panel = { officeCta: DEFAULT_OFFICE_CTA };

  return (
    <main className="ac-city-page">
      <h1 className="sr-only">Explore AgentCity</h1>
      {view === 'webgl' ? (
        <SceneErrorBoundary onShowMap={() => setView('failed')}>
          <CityScene
            store={store}
            label="AgentCity: a 3D city of office towers where AI agents work. Use the panel or the list of buildings to explore."
            overlay={
              <>
                <CityHud {...panel} />
                <LoadingVeil />
              </>
            }
          />
        </SceneErrorBoundary>
      ) : (
        <div style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>
          <NoWebGL
            store={store}
            layout={CITY_LAYOUT}
            title="Explore AgentCity"
            reason={
              view === 'failed'
                ? 'The 3D view stopped on this device, so here is the city map. Everything you can do in 3D works here too.'
                : undefined
            }
            {...panel}
          />
        </div>
      )}
    </main>
  );
}
