'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, describeError, getMe, NavigatingAwayError } from '../../../lib/api-client';
import { formatExpiry, formatWhen, normaliseWorkspace, type DemoWorkspace } from '../../../components/demo/demo-api';
import { DemoAgentPanel } from '../../../components/demo/DemoAgentPanel';
import { AgentAvatar, AgentStatus, ConversionCards, Simulated } from '../../../components/demo/DemoBits';
import { GuidedTour, readTour, type TourStep } from '../../../components/demo/GuidedTour';
import { DemoOfficeScene } from '../../../components/demo/office-scene';
import '../../../components/demo/demo.css';

type Problem = { kind: 'not-demo' | 'expired' | 'other'; text: string };

function explainWorkspaceError(err: unknown): Problem {
  if (err instanceof ApiError) {
    const code = (err.code ?? '').toLowerCase();
    if (err.status === 410 || code.includes('expired') || code === 'gone')
      return { kind: 'expired', text: 'This demo office has expired and its sample data has been removed.' };
    if (err.status === 404 || err.status === 403 || err.status === 409 || code.includes('demo'))
      return {
        kind: 'not-demo',
        text: 'This page shows a demo office, and you aren’t working in one right now. Open your demo from its welcome page, or switch to it in the header.',
      };
  }
  return { kind: 'other', text: describeError(err) };
}

export function DemoOffice() {
  const [ws, setWs] = useState<DemoWorkspace | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [tour, setTour] = useState<{ open: boolean; startAt: number }>({ open: false, startAt: 0 });
  const tourButton = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      const body = normaliseWorkspace(await api('GET', '/api/demo/workspace'));
      setWs(body);
    } catch (err) {
      if (!(err instanceof NavigatingAwayError)) setProblem(explainWorkspaceError(err));
    }
  }, []);

  useEffect(() => {
    void load();
    getMe({ signedOut: 'throw' }).then(
      me => setPerson(me.subject),
      () => setPerson('this-browser'),
    );
    // Switching organisation in the header changes what this page should show.
    const reload = () => void load();
    window.addEventListener('agentcity:tenant-changed', reload);
    return () => window.removeEventListener('agentcity:tenant-changed', reload);
  }, [load]);

  // Decide about the tour once we know who this is and the office has loaded: first visit opens it, an unfinished
  // tour resumes, and "Start tour" on the welcome page (?tour=start) always opens it.
  useEffect(() => {
    if (!ws || !person) return;
    const params = new URLSearchParams(window.location.search);
    const asked = params.get('tour') === 'start';
    if (asked) {
      params.delete('tour');
      const rest = params.toString();
      history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }
    const saved = readTour(person);
    if (asked) setTour({ open: true, startAt: saved?.status === 'active' ? saved.step : 0 });
    else if (!saved) setTour({ open: true, startAt: 0 });
    else if (saved.status === 'active') setTour({ open: true, startAt: saved.step });
  }, [ws, person]);

  const steps = useMemo<TourStep[]>(() => {
    if (!ws) return [];
    const level = ws.office.level !== null ? `Level ${ws.office.level}` : 'Your floor';
    return [
      {
        id: 'arrival',
        title: 'Welcome to AgentCity',
        body: 'Every building in this city is a business, and every floor is an office where AI agents work alongside the people who supervise them.',
        target: 'scene',
      },
      {
        id: 'building',
        title: `${ws.building.name} is your building`,
        body: 'Demo offices are in this building. You can find it again any time from the city map.',
        target: 'place',
      },
      {
        id: 'floor',
        title: `${level}: your office`,
        body: `This is ${ws.office.name}. Each desk belongs to one of your agents; select one to see what they’re doing.`,
        target: 'scene',
      },
      {
        id: 'agents',
        title: 'Meet your agents',
        body: 'Your sample team handles different parts of the sales process. Their status shows who is working and who is waiting for a person.',
        target: 'roster',
      },
      {
        id: 'activity',
        title: 'See what an agent is doing',
        body: 'Each agent shows its activity, tasks and conversations. In this demo all of it is simulated sample data.',
        target: 'agent-panel',
      },
      {
        id: 'approvals',
        title: 'People approve, agents prepare',
        body: 'Agents draft follow-ups and offers, but a person approves anything that would leave the office. In this demo, nothing is ever sent.',
        target: 'try-it',
      },
      {
        id: 'consult',
        title: 'Want this for your business?',
        body: 'Book a consultation and we’ll show you an office set up around your own products and team.',
        target: 'ctas',
      },
    ];
  }, [ws]);

  const onStep = useCallback(
    (step: TourStep) => {
      // From "see what an agent is doing" onwards the panel needs someone in it.
      if (['activity', 'approvals'].includes(step.id) && ws?.agents[0]) setSelected(s => s ?? ws.agents[0]!.id);
    },
    [ws],
  );

  const closeTour = useCallback(() => {
    setTour(t => ({ ...t, open: false }));
    requestAnimationFrame(() => tourButton.current?.focus());
  }, []);

  if (problem) {
    return (
      <div className="mk dm-page">
        <main className="dm-main dm-narrow">
          <section className="dm-card" data-testid="office-error" data-kind={problem.kind}>
            <div className="dm-stack">
              <p className="mk-eyebrow">Demo office</p>
              <h1 className="dm-title">
                {problem.kind === 'expired' ? 'This demo office has expired' : 'No demo office here'}
              </h1>
            </div>
            <div className="dm-notice dm-notice-error" role="alert">
              <p>{problem.text}</p>
            </div>
            <div className="dm-actions">
              {problem.kind === 'other' && (
                <button type="button" className="mk-btn mk-btn-primary" onClick={() => void load()}>
                  Try again
                </button>
              )}
              {problem.kind === 'not-demo' && (
                <a className="mk-btn mk-btn-primary" href="/demo/welcome">
                  Open my demo
                </a>
              )}
              <a
                className={`mk-btn ${problem.kind === 'expired' ? 'mk-btn-primary' : 'mk-btn-secondary'}`}
                href="/#get-demo"
              >
                Request a demo office
              </a>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (!ws) {
    return (
      <div className="mk dm-page">
        <main className="dm-wide" aria-busy="true">
          <p className="dm-status-line" role="status" data-testid="office-loading">
            <span className="dm-pulse" aria-hidden="true" /> Opening your office…
          </p>
        </main>
      </div>
    );
  }

  const agent = ws.agents.find(a => a.id === selected) ?? null;
  const expiry = formatExpiry(ws.expiresAt);
  return (
    <div className="mk dm-page">
      <main className="dm-wide" data-testid="office">
        <div className="dm-office-head">
          <div>
            <p className="mk-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Demo office <Simulated label="Sample data" />
            </p>
            <h1 className="dm-title" data-testid="office-title">
              {ws.company ? `${ws.company}’s AI office` : 'Your AI office'}
            </h1>
            <p className="dm-muted" data-tour="place" data-testid="office-place">
              {ws.building.name}
              {ws.office.level !== null ? ` · Level ${ws.office.level}` : ''} · {ws.office.name}
              {expiry ? ` · Available until ${expiry}` : ''}
            </p>
          </div>
          <div className="dm-actions">
            <button
              type="button"
              className="mk-btn mk-btn-secondary"
              ref={tourButton}
              onClick={() => setTour({ open: true, startAt: 0 })}
              data-testid="office-tour-button"
            >
              Take the tour
            </button>
            <a className="mk-btn mk-btn-secondary" href={`/city?building=${encodeURIComponent(ws.building.key)}`}>
              View in the city
            </a>
          </div>
        </div>

        <div className="dm-office-grid">
          <div>
            <div className="dm-scene" data-tour="scene">
              <DemoOfficeScene
                agents={ws.agents}
                building={ws.building}
                level={ws.office.level}
                onSelectAgent={setSelected}
                selectedAgentId={selected}
              />
            </div>
            <section className="dm-mock" aria-labelledby="office-activity-title">
              <div className="dm-mock-bar">
                <h2 id="office-activity-title" className="dm-mock-title">
                  Office activity
                </h2>
                <Simulated />
              </div>
              {ws.activity.length === 0 ? (
                <p className="dm-empty">It’s quiet in the office right now.</p>
              ) : (
                <ul className="dm-rows dm-rows-2" data-testid="office-activity">
                  {ws.activity.slice(0, 8).map((a, i) => {
                    const who = ws.agents.find(x => x.id === a.agentId);
                    return (
                      <li key={i}>
                        <span className="dm-row-main">
                          {a.text}
                          {who && <span className="dm-row-sub">{who.name}</span>}
                        </span>
                        {a.when && <span className="dm-row-when">{formatWhen(a.when)}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <div>
            <section className="dm-mock" aria-labelledby="roster-title" data-tour="roster">
              <div className="dm-mock-bar">
                <h2 id="roster-title" className="dm-mock-title">
                  Your team
                </h2>
                <span className="dm-row-when">{ws.agents.length} agents</span>
              </div>
              <ul className="dm-roster" data-testid="office-roster">
                {ws.agents.map(a => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="dm-row-btn"
                      aria-pressed={selected === a.id}
                      onClick={() => setSelected(a.id)}
                      data-testid={`office-agent-${a.id}`}
                    >
                      <AgentAvatar name={a.name} />
                      <span className="dm-row-main">
                        <b>{a.name}</b>
                        <span className="dm-row-sub">{a.role}</span>
                      </span>
                      <AgentStatus status={a.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <DemoAgentPanel agent={agent} company={ws.company} activity={ws.activity} />
          </div>
        </div>

        <section className="dm-section" aria-labelledby="office-next-title" data-tour="ctas">
          <div className="dm-stack" style={{ gap: 4 }}>
            <h2 id="office-next-title" className="dm-h3">
              Take it further
            </h2>
            <p className="dm-muted">An office set up around your real products, team and rules.</p>
          </div>
          <ConversionCards />
        </section>

        {person && steps.length > 0 && (
          <GuidedTour
            steps={steps}
            person={person}
            open={tour.open}
            startAt={tour.startAt}
            onStep={onStep}
            onClose={closeTour}
          />
        )}
      </main>
    </div>
  );
}
