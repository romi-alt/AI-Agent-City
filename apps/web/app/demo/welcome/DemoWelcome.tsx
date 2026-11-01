'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError, describeError, getMe, NavigatingAwayError } from '../../../lib/api-client';
import {
  forgetDemoEmail,
  formatExpiry,
  normaliseClaim,
  normaliseWorkspace,
  type DemoAgent,
  type DemoClaim,
} from '../../../components/demo/demo-api';
import { AgentAvatar, AgentStatus, ConversionCards, Simulated } from '../../../components/demo/DemoBits';
import { Icon } from '../../../components/marketing/Primitives';

type Problem = { kind: 'not-verified' | 'no-demo' | 'expired' | 'other'; text: string };

/** The API's refusal, turned into something the visitor can act on. */
export function explainClaimError(err: unknown, email: string | null): Problem {
  if (!(err instanceof ApiError)) return { kind: 'other', text: describeError(err) };
  const code = (err.code ?? '').toLowerCase();
  if (code.includes('verif'))
    return {
      kind: 'not-verified',
      text: 'Your email address isn’t confirmed yet. Open the email we sent you and select the confirmation link, then come back here.',
    };
  if (err.status === 410 || code.includes('expired') || code === 'gone')
    return {
      kind: 'expired',
      text: 'This demo office has expired and its sample data has been removed. You can request a new one at any time.',
    };
  if (err.status === 404 || code.includes('not_found') || code.includes('no_demo'))
    return {
      kind: 'no-demo',
      text: `We couldn’t find a demo office for ${email ?? 'the address you signed in with'}. If you requested it with a different email address, sign in with that one instead.`,
    };
  return { kind: 'other', text: describeError(err) };
}

export function DemoWelcome() {
  const [claim, setClaim] = useState<DemoClaim | null>(null);
  const [agents, setAgents] = useState<DemoAgent[] | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(true);
  const once = useRef(false);

  async function load() {
    setBusy(true);
    setProblem(null);
    try {
      let claimed: DemoClaim;
      try {
        claimed = normaliseClaim(await api('POST', '/api/demo/claim', { body: {} }));
      } catch (err) {
        // Already claimed on an earlier visit: the workspace answers with the same details.
        if (!(err instanceof ApiError && err.status === 409 && err.code !== 'no_tenant_selected')) throw err;
        claimed = { ...normaliseClaim({}), ...pickPlace(await api('GET', '/api/demo/workspace')) };
      }
      setClaim(claimed);
      forgetDemoEmail();
      try {
        setAgents(normaliseWorkspace(await api('GET', '/api/demo/workspace')).agents);
      } catch (err) {
        if (err instanceof NavigatingAwayError) return;
        setAgents([]); // the welcome still works without the agent preview
      }
    } catch (err) {
      if (err instanceof NavigatingAwayError) return;
      let email: string | null = null;
      try {
        email = (await getMe({ signedOut: 'throw' })).email;
      } catch {
        // not needed for the message
      }
      setProblem(explainClaimError(err, email));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    void load();
  }, []);

  if (problem) {
    const title =
      problem.kind === 'expired'
        ? 'This demo office has expired'
        : problem.kind === 'not-verified'
          ? 'Confirm your email address first'
          : problem.kind === 'no-demo'
            ? 'We couldn’t find your demo office'
            : 'Your demo office didn’t open';
    return (
      <div className="dm-narrow-col dm-stack-lg">
        <section
          className="dm-card"
          aria-labelledby="welcome-problem"
          data-testid="welcome-error"
          data-kind={problem.kind}
        >
          <div className="dm-stack">
            <p className="mk-eyebrow">Your demo</p>
            <h1 id="welcome-problem" className="dm-title">
              {title}
            </h1>
          </div>
          <div className="dm-notice dm-notice-error" role="alert">
            <p data-testid="welcome-error-text">{problem.text}</p>
          </div>
          <div className="dm-actions">
            {problem.kind === 'not-verified' && (
              <button type="button" className="mk-btn mk-btn-primary" onClick={() => void load()} disabled={busy}>
                I’ve confirmed it, try again
              </button>
            )}
            {problem.kind === 'no-demo' && (
              <a className="mk-btn mk-btn-primary" href="/signin?returnTo=%2Fdemo%2Fwelcome">
                Sign in with another address
              </a>
            )}
            {problem.kind === 'other' && (
              <button
                type="button"
                className="mk-btn mk-btn-primary"
                onClick={() => void load()}
                disabled={busy}
                data-testid="welcome-retry"
              >
                Try again
              </button>
            )}
            <a
              className={`mk-btn ${problem.kind === 'expired' ? 'mk-btn-primary' : 'mk-btn-secondary'}`}
              href="/#get-demo"
            >
              Request a new demo office
            </a>
            <a className="dm-link dm-muted" href="/city">
              Explore the city
            </a>
          </div>
        </section>
        {problem.kind === 'expired' && <ConversionCards only={['consultation', 'contactSales']} />}
      </div>
    );
  }

  if (!claim) {
    return (
      <p className="dm-status-line" role="status" aria-busy="true" data-testid="welcome-loading">
        <span className="dm-pulse" aria-hidden="true" /> Opening your demo office…
      </p>
    );
  }

  const level = claim.office.level;
  const expiry = formatExpiry(claim.expiresAt);
  return (
    <>
      <section className="dm-welcome-head" aria-labelledby="welcome-title" data-testid="welcome">
        <span className="mk-pill">
          <span className="mk-pill-dot" aria-hidden="true" />
          Your demo is ready · sample data
        </span>
        <h1 id="welcome-title" className="mk-h2" data-testid="welcome-title">
          {claim.firstName ? `Welcome to AutoSalesCity, ${claim.firstName}.` : 'Welcome to AutoSalesCity.'}
        </h1>
        <p className="mk-lead">Your virtual AI office is ready to explore.</p>
        <div className="dm-actions">
          <a className="mk-btn mk-btn-primary" href="/office?tour=start" data-testid="welcome-start-tour">
            Start tour
            <Icon name="arrow" className="mk-btn-arrow" />
          </a>
          <a
            className="mk-btn mk-btn-secondary"
            href={`/city?building=${encodeURIComponent(claim.building.key)}`}
            data-testid="welcome-explore-city"
          >
            Explore city
          </a>
        </div>
      </section>

      <dl className="dm-facts" data-testid="welcome-facts">
        <div className="dm-fact">
          <dt>Company</dt>
          <dd data-testid="welcome-company">{claim.company || '—'}</dd>
        </div>
        <div className="dm-fact">
          <dt>Building</dt>
          <dd data-testid="welcome-building">{claim.building.name}</dd>
        </div>
        <div className="dm-fact">
          <dt>Office</dt>
          <dd data-testid="welcome-office">
            {level !== null ? `Level ${level} · ` : ''}
            {claim.office.name}
          </dd>
        </div>
        {expiry && (
          <div className="dm-fact">
            <dt>Available until</dt>
            <dd data-testid="welcome-expiry">{expiry}</dd>
          </div>
        )}
      </dl>

      <section className="dm-mock" aria-labelledby="team-title">
        <div className="dm-mock-bar">
          <h2 id="team-title" className="dm-mock-title">
            Your sample team <Simulated label="Sample" />
          </h2>
          <a className="mk-btn mk-btn-dark mk-btn-sm" href="/office" data-testid="welcome-open-office">
            Go to my office
          </a>
        </div>
        {agents === null ? (
          <p className="dm-empty">Loading your team…</p>
        ) : agents.length === 0 ? (
          <p className="dm-empty">Your team is waiting in the office.</p>
        ) : (
          <ul className="dm-rows" data-testid="welcome-agents">
            {agents.map(a => (
              <li key={a.id}>
                <AgentAvatar name={a.name} />
                <span className="dm-row-main">
                  <b>{a.name}</b>
                  <span className="dm-row-sub">{a.role}</span>
                </span>
                <AgentStatus status={a.status} />
              </li>
            ))}
          </ul>
        )}
        <p className="dm-mock-foot">
          Made-up leads and conversations. These agents never contact anyone or change real records.
        </p>
      </section>

      <section className="dm-section" aria-labelledby="next-steps-title">
        <h2 id="next-steps-title" className="dm-h3">
          When you’re ready
        </h2>
        <ConversionCards />
      </section>
    </>
  );
}

function pickPlace(body: Record<string, unknown>): Partial<DemoClaim> {
  const w = normaliseWorkspace(body);
  return {
    building: w.building,
    office: w.office,
    firstName: w.firstName,
    company: w.company,
    expiresAt: w.expiresAt,
  };
}
