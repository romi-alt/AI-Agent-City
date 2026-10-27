'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, describeError, getMe, NavigatingAwayError } from '../../../lib/api-client';
import {
  describeAgentStatus,
  formatExpiry,
  formatWhen,
  normaliseWorkspace,
  type DemoWorkspace,
} from '../../../components/demo/demo-api';
import { DemoAgentPanel } from '../../../components/demo/DemoAgentPanel';
import { AgentAvatar, ConversionCards, Simulated } from '../../../components/demo/DemoBits';
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
      <main className="dm dm-office">
        <section className="dm-card" data-testid="office-error" data-kind={problem.kind}>
          <h1 style={{ margin: 0, fontSize: 26 }}>
            {problem.kind === 'expired' ? 'This demo office has expired' : 'No demo office here'}
          </h1>
          <div className="dm-notice dm-notice-error" role="alert">
            <p>{problem.text}</p>
          </div>
          <div className="dm-actions">
            {problem.kind === 'other' && (
              <button type="button" className="dm-btn dm-btn-primary" onClick={() => void load()}>
                Try again
              </button>
            )}
            {problem.kind === 'not-demo' && (
              <a className="dm-btn dm-btn-primary" href="/demo/welcome">
                Open my demo
              </a>
            )}
            <a className={`dm-btn${problem.kind === 'expired' ? ' dm-btn-primary' : ''}`} href="/#get-demo">
              Request a demo office
            </a>
          </div>
        </section>
      </main>
    );
  }

  if (!ws) {
    return (
      <main className="dm dm-office" aria-busy="true">
        <p className="dm-status-line" role="status" data-testid="office-loading">
          <span className="dm-pulse" aria-hidden="true" /> Opening your office…
        </p>
      </main>
    );
  }

  const agent = ws.agents.find(a => a.id === selected) ?? null;
  const expiry = formatExpiry(ws.expiresAt);
  return (
    <main className="dm dm-office" data-testid="office">
      <div className="dm-office-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="dm-eyebrow">
            Demo office <Simulated label="Sample data" />
          </span>
          <h1 data-testid="office-title">{ws.company ? `${ws.company}’s AI office` : 'Your AI office'}</h1>
          <p data-tour="place" data-testid="office-place" style={{ margin: 0 }}>
            {ws.building.name}
            {ws.office.level !== null ? ` · Level ${ws.office.level}` : ''} · {ws.office.name}
            {expiry ? ` · Available until ${expiry}` : ''}
          </p>
        </div>
        <div className="dm-actions">
          <button
            type="button"
            className="dm-btn"
            ref={tourButton}
            onClick={() => setTour({ open: true, startAt: 0 })}
            data-testid="office-tour-button"
          >
            Take the tour
          </button>
          <a className="dm-btn" href={`/city?building=${encodeURIComponent(ws.building.key)}`}>
            View in the city
          </a>
        </div>
      </div>

      <div className="dm-office-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div className="dm-scene" data-tour="scene">
            <DemoOfficeScene
              agents={ws.agents}
              building={ws.building}
              level={ws.office.level}
              onSelectAgent={setSelected}
            />
          </div>
          <section className="dm-panel" aria-labelledby="office-activity-title">
            <h2
              id="office-activity-title"
              style={{ margin: 0, fontSize: 18, display: 'flex', gap: 8, alignItems: 'center' }}
            >
              Office activity <Simulated />
            </h2>
            {ws.activity.length === 0 ? (
              <p className="small">It’s quiet in the office right now.</p>
            ) : (
              <ul className="dm-list" data-testid="office-activity">
                {ws.activity.slice(0, 8).map((a, i) => {
                  const who = ws.agents.find(x => x.id === a.agentId);
                  return (
                    <li key={i}>
                      <span>
                        {who ? <strong>{who.name}: </strong> : null}
                        {a.text}
                      </span>
                      {a.when && <small>{formatWhen(a.when)}</small>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <section className="dm-panel" aria-labelledby="roster-title" data-tour="roster">
            <h2 id="roster-title" style={{ margin: 0, fontSize: 18 }}>
              Your team
            </h2>
            <ul className="dm-list" data-testid="office-roster">
              {ws.agents.map(a => (
                <li key={a.id} style={{ padding: 0, background: 'none' }}>
                  <button
                    type="button"
                    className="dm-btn"
                    style={{ width: '100%', justifyContent: 'flex-start', gap: 12, textAlign: 'left' }}
                    aria-pressed={selected === a.id}
                    onClick={() => setSelected(a.id)}
                    data-testid={`office-agent-${a.id}`}
                  >
                    <AgentAvatar name={a.name} id={a.id} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {a.name}
                      <span className="small" style={{ display: 'block', fontWeight: 400 }}>
                        {a.role}
                      </span>
                    </span>
                    <span className="dm-state" data-state={describeAgentStatus(a.status)}>
                      {describeAgentStatus(a.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <DemoAgentPanel agent={agent} company={ws.company} activity={ws.activity} />
        </div>
      </div>

      <section
        aria-labelledby="office-next-title"
        data-tour="ctas"
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <h2 id="office-next-title" style={{ margin: 0, fontSize: 20 }}>
          Take it further
        </h2>
        <p style={{ margin: 0 }}>
          Like what you see? We can set up an office around your real products, team and rules.
        </p>
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
  );
}
