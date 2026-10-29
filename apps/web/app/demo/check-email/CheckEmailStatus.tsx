'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../lib/api-client';
import { publicApi, type DemoRequestStatus } from '../../../components/demo/demo-api';
import { CheckIcon, MailIcon } from '../../../components/demo/DemoBits';

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
        {view === 'ready' ? <CheckIcon /> : <MailIcon />}
        <div className="dm-stack">
          <p className="mk-eyebrow">{view === 'ready' ? 'Email confirmed' : 'Check your email'}</p>
          <h1 id="check-title" className="dm-title">
            {view === 'ready' ? 'Your demo office is ready' : 'Your demo office is being prepared'}
          </h1>
          <p className="mk-lead">
            {view === 'ready'
              ? 'Sign in with a code and we’ll take you straight to your office.'
              : 'We’ve sent you a link. Confirm your address and your office opens.'}
          </p>
        </div>

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
          {view === 'unknown' && 'Look for the email from AutoSalesCity.'}
        </div>

        {view === 'ready' && (
          <div className="dm-actions">
            <a className="mk-btn mk-btn-primary" href="/demo/verified" data-testid="check-signin">
              Sign in to your demo office
            </a>
          </div>
        )}
        {(view === 'expired' || view === 'not-found') && (
          <div className="dm-stack" data-testid="check-restart">
            <p className="dm-muted">
              {view === 'expired'
                ? 'Demo links last a limited time. Request a new demo office and we’ll send a fresh link.'
                : 'The link may be incomplete. The email we sent still works, or you can request a new demo.'}
            </p>
            <div className="dm-actions">
              <a className="mk-btn mk-btn-dark" href="/#get-demo">
                Request a demo office
              </a>
            </div>
          </div>
        )}
        {view === 'stopped' && (
          <div className="dm-actions">
            <button type="button" className="mk-btn mk-btn-secondary" onClick={checkAgain} data-testid="check-again">
              Check again
            </button>
          </div>
        )}
      </section>

      <section className="dm-card" aria-labelledby="next-title">
        <h2 id="next-title" className="dm-h3">
          What happens next
        </h2>
        <ol className="dm-steps">
          <li>
            <span className="dm-step-num" aria-hidden="true">
              1
            </span>
            <div>
              <strong>Open the email from AutoSalesCity</strong>
              <span className="dm-step-text">It can take a minute to arrive.</span>
            </div>
          </li>
          <li>
            <span className="dm-step-num" aria-hidden="true">
              2
            </span>
            <div>
              <strong>Confirm your address</strong>
              <span className="dm-step-text">The link works once, for a limited time.</span>
            </div>
          </li>
          <li>
            <span className="dm-step-num" aria-hidden="true">
              3
            </span>
            <div>
              <strong>Sign in with a code</strong>
              <span className="dm-step-text">No password. Your office opens straight after.</span>
            </div>
          </li>
        </ol>
        <p className="dm-muted" data-testid="check-resend">
          Nothing arrived? Check spam, or{' '}
          <a className="dm-link" href="/#get-demo">
            send the form again
          </a>{' '}
          with the same address. It’s safe: we’ll send a fresh link to the same office.
        </p>
      </section>

      {devMailboxUrl && (
        <aside className="dm-notice dm-notice-dev" data-testid="check-dev-mailbox" aria-label="Development note">
          <p>
            <strong>Development only.</strong> No real email is sent here. The verification email is in the local inbox
            at{' '}
            <a href={devMailboxUrl} target="_blank" rel="noreferrer">
              {devMailboxUrl}
            </a>
            .
          </p>
        </aside>
      )}
    </>
  );
}
