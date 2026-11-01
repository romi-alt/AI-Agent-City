'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { liteMe, LiteError, type LiteMe } from '../../../lib/api-client';
import { clearDraft } from '../../../components/demo/lite-draft';
import { daysLeft, LiteNotice, talkToUsHref } from '../../../components/demo/LiteBits';
import { formatExpiry } from '../../../components/demo/demo-api';
import { Icon } from '../../../components/marketing/Primitives';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; me: LiteMe }
  | { kind: 'signed-out' }
  | { kind: 'expired' }
  | { kind: 'error'; text: string };

function describe(err: unknown): State {
  if (err instanceof LiteError && err.code === 'unauthorized') return { kind: 'signed-out' };
  if (err instanceof LiteError && err.code === 'expired') return { kind: 'expired' };
  return { kind: 'error', text: err instanceof LiteError ? err.message : 'Something went wrong. Please try again.' };
}

export function LiteWelcome() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    liteMe().then(
      me => {
        if (!live) return;
        clearDraft();
        setState({ kind: 'ready', me });
      },
      err => live && setState(describe(err)),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  if (state.kind === 'loading') {
    return (
      <p className="dm-status-line" role="status" aria-busy="true" data-testid="welcome-loading">
        <span className="dm-pulse" aria-hidden="true" /> Opening your demo office…
      </p>
    );
  }
  if (state.kind === 'signed-out') return <SignedOut />;
  if (state.kind === 'expired') return <Expired />;
  if (state.kind === 'error') return <Failed text={state.text} retry={() => setAttempt(n => n + 1)} />;
  return <Ready me={state.me} />;
}

function Ready({ me }: { me: LiteMe }) {
  const until = formatExpiry(me.expiresAt);
  const left = daysLeft(me.expiresAt);
  return (
    <>
      <section className="dm-welcome-head" aria-labelledby="welcome-title" data-testid="welcome">
        <span className="mk-pill">
          <span className="mk-pill-dot" aria-hidden="true" />
          Simulated demo · nothing is sent to real customers
        </span>
        <h1 id="welcome-title" className="mk-h2" data-testid="welcome-title">
          {me.firstName ? `Welcome to AutoSalesCity, ${me.firstName}.` : 'Welcome to AutoSalesCity.'}
        </h1>
        <p className="mk-lead">Your virtual AI office is ready to explore.</p>
        <div className="dm-actions">
          <Link className="mk-btn mk-btn-primary" href="/demo/office?tour=1" data-testid="welcome-start-tour">
            Take the short tour
            <Icon name="arrow" className="mk-btn-arrow" />
          </Link>
          <Link className="mk-btn mk-btn-secondary" href="/demo/office" data-testid="welcome-skip-tour">
            Skip to my office
          </Link>
        </div>
      </section>
      <dl className="dm-facts" data-testid="welcome-facts">
        <div className="dm-fact">
          <dt>Company</dt>
          <dd data-testid="welcome-company">{me.company || '—'}</dd>
        </div>
        <div className="dm-fact">
          <dt>Building</dt>
          <dd data-testid="welcome-building">{me.building.name}</dd>
        </div>
        <div className="dm-fact">
          <dt>Office</dt>
          <dd data-testid="welcome-office">
            Level {me.office.level} · {me.office.name}
          </dd>
        </div>
        {until && (
          <div className="dm-fact">
            <dt>Available until</dt>
            <dd data-testid="welcome-expiry">
              {until}
              {left && ` · ${left}`}
            </dd>
          </div>
        )}
      </dl>
    </>
  );
}

function SignedOut() {
  return (
    <LiteNotice
      eyebrow="Your demo"
      kind="signed-out"
      title="Open your confirmation link first"
      actions={
        <>
          <Link className="mk-btn mk-btn-primary" href="/demo/signin">
            Email me a sign-in link
          </Link>
          <Link className="dm-link" href="/city">
            Explore the city
          </Link>
        </>
      }
    >
      <p>
        Your demo office opens from the link in your email, in the browser you use to click it. If you already confirmed
        on another device, open the link here, or request a new one.
      </p>
    </LiteNotice>
  );
}

function Expired() {
  return (
    <LiteNotice
      eyebrow="Your demo"
      kind="expired"
      title="This demo office has expired"
      actions={
        <>
          <Link className="mk-btn mk-btn-primary" href="/#get-demo">
            Request a new demo office
          </Link>
          <a className="dm-link" href={talkToUsHref('Demo expired')}>
            Talk to us
          </a>
        </>
      }
    >
      <p>Demo offices are available for a limited time. You can request a new one at any time.</p>
    </LiteNotice>
  );
}

function Failed({ text, retry }: { text: string; retry: () => void }) {
  return (
    <LiteNotice
      eyebrow="Your demo"
      kind="error"
      title="Your demo office did not open"
      actions={
        <button type="button" className="mk-btn mk-btn-primary" onClick={retry} data-testid="welcome-retry">
          Try again
        </button>
      }
    >
      <p role="alert">{text}</p>
    </LiteNotice>
  );
}
