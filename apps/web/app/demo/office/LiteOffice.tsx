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
import { DaySummaryPanel, RunDayPanel } from '../../../components/demo/DayPanels';
import { FloorToolbar, type Pane } from '../../../components/demo/FloorToolbar';
import { LiteAgentPanel } from '../../../components/demo/LiteAgentPanel';
import { effectiveAgents, effectiveTasks, dayHeadline } from '../../../components/demo/scenario-view';
import { useImmersive } from '../../../components/demo/use-immersive';
import { useScenarios } from '../../../components/demo/use-scenarios';
import { WorkflowPanel } from '../../../components/demo/WorkflowPanel';
import { summariseDay } from '../../../lib/lite/scenario-types';
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
      body: 'AutoSalesCity is a city of office buildings. In each one, AI agents work alongside the people who supervise them. This one is a simulated demo.',
    },
    {
      id: 'building',
      title: `Your building: ${me.building.name}`,
      body: 'It is the one picked out in the city. Others are look-only; yours is the one you can walk into.',
    },
    {
      id: 'floor',
      title: `Your floor: level ${me.office.level}`,
      body: `This is ${me.office.name}. Use Whole floor to see every desk and agent at once, step between desks with the arrows, and press Enter full screen to fill your screen with the office.`,
    },
    {
      id: 'agents',
      title: 'Play each agent’s workflow',
      body: 'Pick an agent, then play their sample task step by step: what triggered it, what they checked, what they drafted, and your decision. Or use Run the day to play the whole team in order. Approvals here never send anything.',
    },
  ];
}

/** Moves the camera for a tour step; the scene's own transitions do the rest. */
function modeForStep(me: LiteMe, id: string): CityMode {
  const building = me.building.key;
  if (id === 'building') return { kind: 'building', building };
  if (id === 'floor') return officeMode(me, null);
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

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Office({ first }: { first: Loaded }) {
  const me = first.me;
  const office = useFreshOffice(first);
  const store = useStore(me);
  const selectedId = useSyncExternalStore(
    store.subscribe,
    () => store.get().selectedAgent,
    () => null,
  );
  const mode = useSyncExternalStore(
    store.subscribe,
    () => store.get().mode,
    () => store.get().mode,
  );
  const [tourOpen, setTourOpen] = useState(false);
  const [pane, setPane] = useState<Pane>(null);
  const tourButton = useRef<HTMLButtonElement>(null);
  const sceneBox = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const workflowBox = useRef<HTMLDivElement>(null);
  const sideBox = useRef<HTMLElement>(null);
  const { immersive, enter, exit } = useImmersive(shell);
  const flow = useScenarios(office.scenarios);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tour') === '1') setTourOpen(true);
  }, []);

  const agents = useMemo(
    () => effectiveAgents(office.agents, office.scenarios, flow.progress),
    [office.agents, office.scenarios, flow.progress],
  );
  const tasks = useMemo(
    () => effectiveTasks(office.tasks, office.scenarios, flow.progress),
    [office.tasks, office.scenarios, flow.progress],
  );
  const baseStatus = useCallback(
    (id: string) => office.agents.find(a => a.id === id)?.status ?? 'idle',
    [office.agents],
  );
  const dayView = useMemo(
    () =>
      summariseDay(
        office.counters ?? { repliesDrafted: 0, conversationsOpen: 0, waitingForYou: 0 },
        office.scenarios,
        flow.progress,
        baseStatus,
      ),
    [office.counters, office.scenarios, flow.progress, baseStatus],
  );

  const select = useCallback(
    (id: string) => {
      const index = office.agents.findIndex(a => a.id === id);
      if (index < 0) return;
      store.set({ mode: officeMode(me, index), selectedAgent: id });
    },
    [store, office.agents, me],
  );

  // Picking someone in the team list brings the city into view (the list sits below it).
  const pickFromRoster = useCallback(
    (id: string) => {
      select(id);
      if (!immersive)
        sceneBox.current?.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
    },
    [select, immersive],
  );

  // In full screen the workflow opens by itself when an agent is chosen, wherever the choice was made.
  useEffect(() => {
    if (immersive && selectedId) setPane('workflow');
  }, [immersive, selectedId]);

  // A different pane starts at its top, not wherever the last one was scrolled to.
  useEffect(() => {
    sideBox.current?.scrollTo({ top: 0 });
  }, [pane]);

  const wholeFloor = useCallback(() => {
    store.set({ mode: officeMode(me, null), selectedAgent: null });
  }, [store, me]);

  const stepDesk = useCallback(
    (delta: 1 | -1) => {
      const n = office.agents.length;
      if (n === 0) return;
      const at = office.agents.findIndex(a => a.id === selectedId);
      const next = at < 0 ? (delta > 0 ? 0 : n - 1) : (at + delta + n) % n;
      const target = office.agents[next];
      if (target) select(target.id);
    },
    [office.agents, selectedId, select],
  );

  const onStep = useCallback(
    (step: TourStep) => {
      store.set({ mode: modeForStep(me, step.id), selectedAgent: null });
      const firstAgent = office.agents[0];
      if (step.id === 'agents' && firstAgent) select(firstAgent.id);
    },
    [store, me, office.agents, select],
  );

  const closeTour = useCallback(() => {
    setTourOpen(false);
    requestAnimationFrame(() => tourButton.current?.focus());
  }, []);

  // ---- Run the day: each agent in turn stops at the point where it needs the visitor ----
  const visit = useCallback(
    (index: number) => {
      const s = office.scenarios[index];
      if (!s) {
        wholeFloor();
        setPane('day');
        return;
      }
      select(s.agentId);
      flow.act(s.id, { type: 'to-review' });
      setPane('workflow');
    },
    [office.scenarios, select, flow, wholeFloor],
  );
  const startDay = useCallback(() => {
    flow.setDay({ active: true, index: 0, skipped: [] });
    visit(0);
  }, [flow, visit]);
  const nextDay = useCallback(
    (skip: boolean) => {
      const current = office.scenarios[flow.day.index];
      const skipped = skip && current ? [...flow.day.skipped, current.id] : flow.day.skipped;
      const index = flow.day.index + 1;
      flow.setDay({ active: true, index, skipped });
      visit(index);
    },
    [office.scenarios, flow, visit],
  );
  const runDayFromToolbar = useCallback(() => {
    if (!flow.day.active) startDay();
    setPane('day');
    if (!immersive)
      document
        .querySelector('[data-testid="run-day"]')
        ?.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
  }, [flow.day.active, startDay, immersive]);

  const focusWorkflow = useCallback(() => {
    workflowBox.current?.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
    workflowBox.current?.querySelector<HTMLElement>('h2')?.focus();
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (immersive) await exit();
    else {
      // The floor is the first thing to see; the panel opens once there is an agent to show.
      setPane(selectedId ? 'workflow' : null);
      await enter();
    }
    requestAnimationFrame(() => fullscreenButton.current?.focus());
  }, [immersive, enter, exit, selectedId]);

  const agent = agents.find(a => a.id === selectedId) ?? null;
  const dayScenario = flow.day.active ? office.scenarios[flow.day.index] : undefined;
  const scenario = office.scenarios.find(s => s.agentId === selectedId) ?? dayScenario ?? null;
  const panelAgent = agents.find(a => a.id === scenario?.agentId) ?? null;
  const wholeNow = mode.kind === 'office' && mode.desk === null;
  const show = (p: Exclude<Pane, null>) => !immersive || pane === p;
  const headline = dayHeadline(me.company, agents);

  return (
    <main
      className={`dm-wide dm-lite-office${immersive ? ' is-immersive' : ''}`}
      data-testid="office"
      data-immersive={immersive}
      ref={shell}
    >
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
        <div className="dm-lite-stage">
          <FloorToolbar
            wholeFloor={wholeNow}
            viewLabel={agent ? `${agent.name}'s desk` : wholeNow ? 'Whole floor' : 'City view'}
            immersive={immersive}
            pane={pane}
            dayActive={flow.day.active}
            fullscreenRef={fullscreenButton}
            onWhole={wholeFloor}
            onStep={stepDesk}
            onFullscreen={() => void toggleFullscreen()}
            onRunDay={runDayFromToolbar}
            onPane={setPane}
            onHelp={() => setTourOpen(true)}
          />
          <div className="dm-scene dm-lite-scene" data-tour="scene" data-testid="lite-scene" ref={sceneBox}>
            <LiteCityView me={me} agents={agents} store={store} onSelect={select} />
          </div>
        </div>
        <aside
          ref={sideBox}
          className="dm-lite-side"
          aria-label="Your AI team"
          data-pane-open={immersive ? (pane ?? 'none') : 'all'}
        >
          {!immersive && agent && scenario && (
            <button
              type="button"
              className="mk-btn mk-btn-primary mk-btn-sm dm-lite-play"
              onClick={focusWorkflow}
              data-testid="play-workflow"
            >
              Play {agent.name}&apos;s workflow
            </button>
          )}
          {show('team') && (
            <>
              <Roster agents={agents} selectedId={selectedId} onSelect={pickFromRoster} />
              <LiteAgentPanel agent={agent} tasks={tasks} />
            </>
          )}
          {show('workflow') && (
            <div className="dm-lite-workflow" ref={workflowBox}>
              <WorkflowPanel
                scenario={scenario}
                agent={panelAgent}
                progress={scenario ? flow.progress[scenario.id] : undefined}
                onAction={flow.act}
              />
            </div>
          )}
          {show('day') && (
            <>
              <RunDayPanel
                scenarios={office.scenarios}
                progress={flow.progress}
                day={flow.day}
                onStart={startDay}
                onNext={() => nextDay(false)}
                onSkip={() => nextDay(true)}
                onStop={() => flow.setDay({ ...flow.day, active: false })}
              />
              <DaySummaryPanel
                headline={headline}
                view={dayView}
                plan={office.dayReport}
                scenarios={office.scenarios}
                progress={flow.progress}
                onResetAll={flow.resetAll}
              />
            </>
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
            href={talkToUsHref(`AutoSalesCity demo: ${me.company}`)}
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
