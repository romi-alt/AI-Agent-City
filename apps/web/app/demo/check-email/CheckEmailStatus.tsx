'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../lib/api-client';
import { publicApi, type DemoRequestStatus } from '../../../components/demo/demo-api';

type View = DemoRequestStatus | 'unknown' | 'not-found' | 'stopped';

const FIRST_DELAY_MS = 4000;
const MAX_DELAY_MS = 30_000;
const GIVE_UP_AFTER_MS = 20 * 60 * 1000;

/**
 * Explains what happens next and checks the request's status gently: 4 s, then 1.5× longer each time up to 30 s,
 * paused while the tab is hidden, stopping on `ready` or `expired` and after 20 minutes.
 */
export function CheckEmailStatus({
  requestId,
  devMailboxUrl,
}: {
  requestId: string | null;
  devMailboxUrl: string | null;
}) {
  const [view, setView] = useState<View>(requestId ? 'verification-sent' : 'unknown');
  const [checks, setChecks] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delay = useRef(FIRST_DELAY_MS);
  const started = useRef(Date.now());
  const done = useRef(!requestId);

  const check = useCallback(async () => {
    if (!requestId || done.current) return;
    try {
      const body = await publicApi<{ status?: unknown }>('GET', `/api/demo/requests/${encodeURIComponent(requestId)}`);
      const status = body.status;
      if (status === 'ready' || status === 'expired') {
        done.current = true;
        setView(status);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
        done.current = true;
        setView('not-found');
      }
      // Anything else (network, 5xx, rate limit) is passing: keep checking, more slowly.
    } finally {
      setChecks(n => n + 1);
    }
  }, [requestId]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (done.current) return;
    if (Date.now() - started.current > GIVE_UP_AFTER_MS) {
      setView('stopped');
      return;
    }
    timer.current = setTimeout(async () => {
      // Hidden tab: skip this check but stay scheduled (the visibility listener also checks on return).
      if (document.visibilityState !== 'hidden') await check();
      delay.current = Math.min(delay.current * 1.5, MAX_DELAY_MS);
      schedule();
    }, delay.current);
  }, [check]);

  useEffect(() => {
    if (!requestId) return;
    schedule();
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || done.current) return;
      // Back on the tab (perhaps from the email): check straight away, then carry on gently.
      delay.current = FIRST_DELAY_MS;
      void check().then(schedule);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [requestId, check, schedule]);

  function checkAgain() {
    started.current = Date.now();
    delay.current = FIRST_DELAY_MS;
    setView('verification-sent');
    void check().then(schedule);
  }

  return (
    <>
      <section className="dm-card" aria-labelledby="check-title" data-testid="check-email" data-status={view}>
        <svg width="64" height="48" viewBox="0 0 64 48" aria-hidden="true" focusable="false">
          <rect x="1" y="1" width="62" height="46" rx="8" fill="#0f1b2d" />
          <path
            d="M8 10 L32 28 L56 10"
            fill="none"
            stroke="#f5b335"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="54" cy="38" r="4" fill="#6fb7e8" />
        </svg>
        <span className="dm-eyebrow">One more step</span>
        <h1 id="check-title" className="dm-title">
          {view === 'ready' ? 'Your demo office is ready' : 'Your demo office is being prepared'}
        </h1>
        <p className="dm-lede">
          {view === 'ready'
            ? 'Your email address is confirmed. Sign in with a code and we’ll take you straight to your office.'
            : 'We’ve sent you an email. Confirm your address and we’ll open your private AI office in AgentCity.'}
        </p>

        <div className="dm-status-line" role="status" aria-live="polite" data-testid="check-status">
          <span
            className={`dm-pulse${view === 'ready' ? ' dm-done' : view === 'verification-sent' ? '' : ' dm-stopped'}`}
            aria-hidden="true"
          />
          {view === 'verification-sent' && 'Waiting for you to confirm your email address…'}
          {view === 'ready' && 'Email confirmed. Your office is ready.'}
          {view === 'expired' && 'This demo request has expired.'}
          {view === 'not-found' && 'We couldn’t find this demo request.'}
          {view === 'stopped' && 'We’ve stopped checking automatically.'}
          {view === 'unknown' && 'Check your inbox for the email from AgentCity.'}
        </div>

        {view === 'ready' && (
          <div className="dm-actions">
            <a className="dm-btn dm-btn-primary" href="/demo/verified" data-testid="check-signin">
              Sign in to your demo office
            </a>
          </div>
        )}
        {(view === 'expired' || view === 'not-found') && (
          <div className="dm-notice" data-testid="check-restart">
            <p>
              {view === 'expired'
                ? 'Demo links last a limited time. Request a new demo office and we’ll send a fresh link.'
                : 'The link you followed may be incomplete. If you’ve requested a demo, the email we sent still works; otherwise request a new one.'}
            </p>
            <div className="dm-actions">
              <a className="dm-btn dm-btn-dark" href="/#get-demo">
                Request a demo office
              </a>
            </div>
          </div>
        )}
        {view === 'stopped' && (
          <div className="dm-actions">
            <button type="button" className="dm-btn" onClick={checkAgain} data-testid="check-again">
              Check again
            </button>
          </div>
        )}
      </section>

      <section className="dm-card" aria-labelledby="next-title">
        <h2 id="next-title" style={{ margin: 0, fontSize: 20 }}>
          What happens next
        </h2>
        <ol className="dm-steps">
          <li>
            <div>
              <strong>Open the email from AgentCity</strong>
              <span>It’s titled something like “Verify your email”. It can take a minute to arrive.</span>
            </div>
          </li>
          <li>
            <div>
              <strong>Confirm your address</strong>
              <span>Select the link in the email. It works once and only for a limited time.</span>
            </div>
          </li>
          <li>
            <div>
              <strong>Sign in with a code</strong>
              <span>No password: we email you a short sign-in code, and then your office opens.</span>
            </div>
          </li>
        </ol>
        <p className="small" data-testid="check-resend">
          Nothing arrived after a few minutes? Check your spam or promotions folder. You can also{' '}
          <a href="/#get-demo">submit the form again</a> with the same email address: it’s safe, and we’ll send a fresh
          link to the same demo office.
        </p>
        {requestId && checks > 0 && view === 'verification-sent' && (
          <p className="small" aria-hidden="true">
            You can keep this page open: it updates by itself once you’ve confirmed.
          </p>
        )}
      </section>

      {devMailboxUrl && (
        <aside className="dm-notice dm-notice-dev" data-testid="check-dev-mailbox" aria-label="Development note">
          <p>
            <strong>Development only.</strong> Emails aren’t really sent here. Open the local mail inbox at{' '}
            <a href={devMailboxUrl} target="_blank" rel="noreferrer">
              {devMailboxUrl}
            </a>{' '}
            to find the verification email.
          </p>
        </aside>
      )}
    </>
  );
}
