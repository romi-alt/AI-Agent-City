// Dev-only test harness for workstream A3: the real <CityScene> (A1's architecture and environment, A2's life)
// with A3's camera, interior and HUD, driven by query parameters, with the store and the R3F state exposed on
// window for the browser checks. Never shipped.
import { _roots } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { CityScene } from '../../src/CityScene.tsx';
import { shouldPlayArrival } from '../../src/camera/arrival.ts';
import layoutJson from '../../src/data/city-layout.json';
import { DemoOfficeScene } from '../../src/interior/DemoOfficeScene.tsx';
import { type OfficeOccupants, OfficeOccupantsContext } from '../../src/interior/occupants.ts';
import { createCityStore } from '../../src/store.ts';
import type { CityLayout, CityMode } from '../../src/types.ts';
import { CityHud } from '../../src/ui/CityHud.tsx';
import { LoadingVeil } from '../../src/ui/LoadingVeil.tsx';
import { NoWebGL } from '../../src/ui/NoWebGL.tsx';
import { detectWebGL } from '../../src/ui/webgl.ts';

const layout = layoutJson as CityLayout;
const w = window as unknown as Record<string, unknown>;
w.__layout = layout;
const params = new URLSearchParams(location.search);

// The demo seed's team (C): eight agents, mixed statuses.
const AGENTS = [
  {
    id: 'a1',
    name: 'Wren',
    role: 'web leads',
    status: 'working',
    summary: 'Replies to website enquiries within minutes.',
  },
  { id: 'a2', name: 'Nora', role: 'chat', status: 'working', summary: 'Answers chat questions day and night.' },
  { id: 'a3', name: 'Kai', role: 'follow-up', status: 'needs-you', summary: 'Waiting for your approval on 2 drafts.' },
  { id: 'a4', name: 'Vera', role: 'closer', status: 'working', summary: 'Prepares proposals and next steps.' },
  { id: 'a5', name: 'Hana', role: 'CSI', status: 'idle', summary: 'Checks in after every visit.' },
  { id: 'a6', name: 'Dex', role: 'service visits', status: 'working', summary: 'Fills empty service slots.' },
  { id: 'a7', name: 'Luna', role: 'content', status: 'needs-you', summary: 'Drafted 3 posts for your approval.' },
  { id: 'a8', name: 'Rio', role: 'reviews', status: 'idle', summary: 'Drafts replies to new reviews.' },
].slice(0, Number(params.get('agents') ?? 8));

/** Expose the canvas's R3F state (camera, scene) for the checks. */
function useExposeThree() {
  useEffect(() => {
    const t = setInterval(() => {
      const c = document.querySelector('canvas');
      const root = c ? _roots.get(c) : undefined;
      if (root) w.three = root.store.getState();
    }, 200);
    return () => clearInterval(t);
  }, []);
}

function Harness() {
  useExposeThree();
  const demo = params.get('demo') === '1';
  const level = Number(params.get('l') ?? 3);
  const enterable = (params.get('enter') ?? '').split(',').filter(Boolean);
  const highlight = params.get('highlight');
  const start = params.get('mode');
  const reduced = params.get('reduced') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const b = params.get('b') ?? 'rental-2';
  const initialMode: CityMode =
    start === 'office'
      ? { kind: 'office', building: b, level, desk: null }
      : start === 'building'
        ? { kind: 'building', building: b }
        : start === 'floor'
          ? { kind: 'floor', building: b, level }
          : params.get('noarrival') !== '1' && shouldPlayArrival(sessionStorage, params.get('tour') === '1')
            ? { kind: 'arrival' }
            : { kind: 'explore' };
  const store = useMemo(
    () =>
      createCityStore({
        mode: initialMode,
        enterable,
        highlight,
        reducedMotion: reduced,
        ...(params.get('time') ? { timeOfDay: params.get('time') as never } : {}),
      }),
    [],
  );
  w.cityStore = store;
  const occupants = useMemo<OfficeOccupants | null>(
    () =>
      demo
        ? {
            building: b,
            level,
            agents: AGENTS.map(a => ({ ...a, kind: 'ai' as const })),
            onSelect: id => (w.selected = id),
          }
        : null,
    [demo],
  );
  if (params.get('real') === '1') {
    // The shipped DemoOfficeScene as the demo frontend uses it.
    return (
      <div style={{ position: 'fixed', inset: 0 }}>
        <DemoOfficeScene
          agents={AGENTS}
          building={b}
          level={level}
          onSelectAgent={id => (w.selected = id)}
          deskTestId={id => `office-desk-${id}`}
        />
      </div>
    );
  }
  if (!detectWebGL() || params.get('nowebgl') === '1') {
    return <NoWebGL store={store} layout={layout} title="Explore AgentCity" />;
  }
  return (
    <OfficeOccupantsContext.Provider value={occupants}>
      <div style={{ position: 'fixed', inset: 0 }}>
        <CityScene
          store={store}
          overlay={
            <>
              <CityHud entry={demo ? { building: b, level } : undefined} />
              <LoadingVeil />
            </>
          }
        />
      </div>
    </OfficeOccupantsContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
