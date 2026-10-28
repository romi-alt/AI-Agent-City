'use client';

import { createCityStore, type CityMode, type CityStore } from '@agentcity/city-scene';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  liteMe,
  liteOffice,
  LiteError,
  liteSignOut,
  type LiteAgent,
  type LiteMe,
  type LiteOffice as OfficeData,
} from '../../../lib/api-client';
import { AgentAvatar } from '../../../components/demo/DemoBits';
import { formatExpiry } from '../../../components/demo/demo-api';
import { GuidedTour, type TourStep } from '../../../components/demo/GuidedTour';
import { LiteAgentPanel } from '../../../components/demo/LiteAgentPanel';
import { daysLeft, LiteNotice, LiteStatus, talkToUsHref } from '../../../components/demo/LiteBits';
import '../../../components/demo/demo.css';

// WebGL needs the browser, so the city never renders on the server.
const LiteCityView = dynamic(() => import('../../../components/demo/LiteCityView').then(m => m.LiteCityView), {
  ssr: false,
  loading: () => (
    <p className="dm-status-line" style={{ padding: 24 }}>
      Loading the city…
    </p>
  ),
});

type Loaded = { me: LiteMe; office: OfficeData };
type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: Loaded }
  | { kind: 'signed-out' }
  | { kind: 'expired' }
  | { kind: 'error'; text: string };

const REFRESH_MS = 60_000;
const TOUR_PERSON = 'lite-demo';

async function loadAll(): Promise<Loaded> {
  const [me, office] = await Promise.all([liteMe(), liteOffice()]);
  return { me, office };
}

function describe(err: unknown): State {
  if (err instanceof LiteError && err.code === 'unauthorized') return { kind: 'signed-out' };
  if (err instanceof LiteError && err.code === 'expired') return { kind: 'expired' };
  return { kind: 'error', text: err instanceof LiteError ? err.message : 'Something went wrong. Please try again.' };
}

export function LiteOffice() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    loadAll().then(
      data => live && setState({ kind: 'ready', data }),
      err => live && setState(describe(err)),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  if (state.kind === 'ready') return <Office first={state.data} />;
  if (state.kind === 'loading') {
    return (
      <main className="dm-wide" aria-busy="true">
        <p className="dm-status-line" role="status" data-testid="office-loading">
          <span className="dm-pulse" aria-hidden="true" /> Opening your office…
        </p>
      </main>
    );
  }
  return (
    <main className="dm-main dm-narrow">
      <Problem state={state} retry={() => setAttempt(n => n + 1)} />
    </main>
  );
}

function Problem({ state, retry }: { state: Exclude<State, { kind: 'loading' | 'ready' }>; retry: () => void }) {
  const expired = state.kind === 'expired';
  const signedOut = state.kind === 'signed-out';
  return (
    <LiteNotice
      eyebrow="Demo office"
      kind={state.kind}
      title={
        expired
          ? 'This demo office has expired'
          : signedOut
            ? 'Open your confirmation link first'
            : 'Your office did not open'
      }
      actions={
        <>
          {state.kind === 'error' && (
            <button type="button" className="mk-btn mk-btn-primary" onClick={retry}>
              Try again
            </button>
          )}
          <Link
            className={`mk-btn ${state.kind === 'error' ? 'mk-btn-secondary' : 'mk-btn-primary'}`}
            href={expired ? '/#get-demo' : '/demo/signin'}
          >
            {expired ? 'Request a new demo office' : 'Email me a sign-in link'}
          </Link>
        </>
      }
    >
      <p>
        {expired
          ? 'Demo offices are available for a limited time.'
          : signedOut
            ? 'Your demo office opens from the link in your email, in the browser you use to click it.'
            : state.kind === 'error'
              ? state.text
              : ''}
      </p>
    </LiteNotice>
  );
}

function officeMode(me: LiteMe, desk: number | null): CityMode {
  return { kind: 'office', building: me.building.key, level: me.office.level, desk };
}

function tourSteps(me: LiteMe): TourStep[] {
  return [
    {
      id: 'city',
      title: 'Your city',
      body: 'AgentCity is a city of office buildings. In each one, AI agents work alongside the people who supervise them. This one is a simulated demo.',
    },
    {
      id: 'building',
      title: `Your building: ${me.building.name}`,
      body: 'It is the one picked out in the city. Others are look-only; yours is the one you can walk into.',
    },
    {
      id: 'floor',
      title: `Your floor: level ${me.office.level}`,
      body: `This is ${me.office.name}, the floor your sample office sits on.`,
    },
    {
      id: 'agents',
      title: 'Meet your AI team',
      body: 'Each desk belongs to an agent. Pick one to see its role, what it is doing and a short summary. All of it is simulated.',
    },
  ];
}

/** Moves the camera for a tour step; the scene's own transitions do the rest. */
function modeForStep(me: LiteMe, id: string): CityMode {
  const building = me.building.key;
  if (id === 'building') return { kind: 'building', building };
  if (id === 'floor') return { kind: 'floor', building, level: me.office.level };
  if (id === 'agents') return officeMode(me, null);
  return { kind: 'explore' };
}

function useStore(me: LiteMe): CityStore {
  return useMemo(
    () =>
      createCityStore({
        mode: { kind: 'explore' },
        enterable: [me.building.key],
        highlight: me.building.key,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      }),
    [me.building.key],
  );
}

function useFreshOffice(first: Loaded) {
  const [office, setOffice] = useState(first.office);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      liteOffice().then(setOffice, () => undefined); // a missed refresh just keeps the last picture
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, []);
  return office;
}

function Office({ first }: { first: Loaded }) {
  const me = first.me;
  const office = useFreshOffice(first);
  const store = useStore(me);
  const selectedId = useSyncExternalStore(
    store.subscribe,
    () => store.get().selectedAgent,
    () => null,
  );
  const [tourOpen, setTourOpen] = useState(false);
  const tourButton = useRef<HTMLButtonElement>(null);
  const sceneBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tour') === '1') setTourOpen(true);
  }, []);

  const select = useCallback(
    (id: string) => {
      const index = office.agents.findIndex(a => a.id === id);
      if (index < 0) return;
      store.set({ mode: officeMode(me, index), selectedAgent: id });
    },
    [store, office.agents, me],
  );

  // The team list sits below the city on every screen size: picking someone there brings the city into view.
  const pickFromRoster = useCallback(
    (id: string) => {
      select(id);
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      sceneBox.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    },
    [select],
  );

  const onStep = useCallback(
    (step: TourStep) => {
      store.set({ mode: modeForStep(me, step.id), selectedAgent: null });
      const first = office.agents[0];
      if (step.id === 'agents' && first) select(first.id);
    },
    [store, me, office.agents, select],
  );

  const closeTour = useCallback(() => {
    setTourOpen(false);
    requestAnimationFrame(() => tourButton.current?.focus());
  }, []);

  const agent = office.agents.find(a => a.id === selectedId) ?? null;
  return (
    <main className="dm-wide dm-lite-office" data-testid="office">
      <Banner me={me} onTour={() => setTourOpen(true)} tourRef={tourButton} />
      <GuidedTour
        steps={tourSteps(me)}
        person={TOUR_PERSON}
        open={tourOpen}
        startAt={0}
        onStep={onStep}
        onClose={closeTour}
      />
      <div className="dm-lite-grid">
        <div className="dm-scene dm-lite-scene" data-tour="scene" data-testid="lite-scene" ref={sceneBox}>
          <LiteCityView me={me} agents={office.agents} store={store} onSelect={select} />
        </div>
        <aside className="dm-lite-side" aria-label="Your AI team">
          <Roster agents={office.agents} selectedId={selectedId} onSelect={pickFromRoster} />
          <LiteAgentPanel agent={agent} tasks={office.tasks} />
          {office.daySummary && (
            <section className="dm-mock" aria-labelledby="day-title" data-testid="day-summary">
              <div className="dm-mock-bar">
                <h2 id="day-title" className="dm-mock-title">
                  Today in the office
                </h2>
              </div>
              <p className="dm-panel-body dm-muted">{office.daySummary}</p>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

function Banner({
  me,
  onTour,
  tourRef,
}: {
  me: LiteMe;
  onTour: () => void;
  tourRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const until = formatExpiry(me.expiresAt);
  const left = daysLeft(me.expiresAt);
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    setLeaving(true);
    try {
      await liteSignOut();
    } finally {
      window.location.assign('/');
    }
  }

  return (
    <header className="dm-lite-head">
      <p className="dm-lite-banner" role="note" data-testid="sim-banner">
        <span className="mk-tag">Simulated</span> Simulated demo — nothing is sent to real customers.
      </p>
      <div className="dm-office-head">
        <div>
          <h1 className="dm-title dm-lite-title" data-testid="office-title">
            {me.company ? `${me.company}’s AI office` : 'Your AI office'}
          </h1>
          <p className="dm-muted" data-testid="demo-expiry">
            {until ? `Your demo is available until ${until}` : 'Your demo is available for a limited time'}
            {left && ` · ${left}`}
          </p>
        </div>
        <div className="dm-actions">
          <button
            type="button"
            className="mk-btn mk-btn-secondary mk-btn-sm"
            ref={tourRef}
            onClick={onTour}
            data-testid="office-tour-button"
          >
            Take the tour
          </button>
          <a
            className="mk-btn mk-btn-primary mk-btn-sm"
            href={talkToUsHref(`AgentCity demo: ${me.company}`)}
            data-testid="talk-to-us"
          >
            Talk to us
          </a>
          <button
            type="button"
            className="mk-btn mk-btn-secondary mk-btn-sm"
            onClick={() => void signOut()}
            disabled={leaving}
            data-testid="sign-out"
          >
            {leaving ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </header>
  );
}

function Roster({
  agents,
  selectedId,
  onSelect,
}: {
  agents: LiteAgent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="dm-mock" aria-labelledby="roster-title" data-tour="roster">
      <div className="dm-mock-bar">
        <h2 id="roster-title" className="dm-mock-title">
          Your team
        </h2>
        <span className="dm-row-when">{agents.length} agents</span>
      </div>
      <ul className="dm-roster" data-testid="office-roster">
        {agents.map(a => (
          <li key={a.id}>
            <button
              type="button"
              className="dm-row-btn"
              aria-pressed={selectedId === a.id}
              onClick={() => onSelect(a.id)}
              data-testid={`office-agent-${a.id}`}
            >
              <AgentAvatar name={a.name} />
              <span className="dm-row-main">
                <b>{a.name}</b>
                <span className="dm-row-sub">{a.role}</span>
              </span>
              <LiteStatus status={a.status} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
