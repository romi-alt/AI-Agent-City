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
import { liteMe } from '../../lib/api-client';
import { LITE_DEMO } from '../../lib/preview';
import { PresentButton, PresentMode } from './PresentMode';

type View = 'webgl' | 'map' | 'failed';

/** ?present=1 (the landing page's "Present the city" link) opens the explorer straight into Present mode. */
function presentRequested(): boolean {
  return new URLSearchParams(window.location.search).get('present') === '1';
}

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
  // A pitch starts on its own first stop, so it skips the arrival.
  const arrival = !presentRequested() && shouldPlayArrival(storage, params.get('tour') === '1');
  return {
    mode: arrival ? { kind: 'arrival' } : highlight ? { kind: 'building', building: highlight } : { kind: 'explore' },
    enterable: [],
    highlight,
    reducedMotion,
  };
}

const OWN_DEMO_CTA = {
  href: '/demo/office',
  label: 'Open my demo office',
  note: 'Your own simulated office is ready. It is the building picked out in the city.',
};

/**
 * A visitor who already has a demo office (lite demo only) sees their building picked out here, and the office
 * prompt takes them to it. Anyone else, or any failure, leaves the public city exactly as it was.
 */
function useOwnDemo(store: CityStore) {
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (!LITE_DEMO) return;
    let live = true;
    liteMe().then(
      me => {
        if (!live) return;
        store.set({ highlight: me.building.key });
        setHas(true);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [store]);
  return has ? OWN_DEMO_CTA : null;
}

export function CityClient() {
  const [store] = useState<CityStore>(() => createCityStore(initialState()));
  const [view, setView] = useState<View>(() => (detectWebGL() ? 'webgl' : 'map'));
  const [presenting, setPresenting] = useState(presentRequested);
  const startPresenting = () => {
    // Full screen needs the click that asked for it; refused, the city still fills the window.
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    setPresenting(true);
  };
  const stopPresenting = () => {
    setPresenting(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has('present')) {
      url.searchParams.delete('present');
      window.history.replaceState(null, '', url);
    }
  };

  // Follow the system's reduced-motion setting while the page is open (the HUD toggle can still override it).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => store.set({ reducedMotion: mq.matches });
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [store]);

  const mine = useOwnDemo(store);
  const panel = { officeCta: mine ?? DEFAULT_OFFICE_CTA };

  return (
    <main className="ac-city-page">
      {view === 'webgl' ? (
        <SceneErrorBoundary onShowMap={() => setView('failed')}>
          {/* The 2D map has its own visible heading. */}
          <h1 className="sr-only">Explore AgentCity</h1>
          <CityScene
            store={store}
            label="AgentCity: a 3D city of office towers where AI agents work. Use the panel or the list of buildings to explore."
            overlay={
              <>
                {presenting ? (
                  <PresentMode store={store} onExit={stopPresenting} />
                ) : (
                  <>
                    <CityHud {...panel} />
                    <PresentButton onStart={startPresenting} />
                  </>
                )}
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
          {presenting && <PresentMode store={store} onExit={stopPresenting} />}
        </div>
      )}
    </main>
  );
}
