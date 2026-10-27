'use client';

import { useEffect, useRef, useState } from 'react';
import { describeError, NavigatingAwayError, startLogin } from '../../../lib/api-client';
import { recallDemoEmail } from '../../../components/demo/demo-api';
import { CheckIcon } from '../../../components/demo/DemoBits';

const AUTO_START_MS = 1200;

/**
 * Starts the email-code sign-in by itself after a short pause (so the page can be read), prefilled with the address
 * the visitor typed in this browser. If that address isn't known here (the link was opened on another device), the
 * sign-in page simply asks for it. The button does the same thing straight away.
 */
export function VerifiedSignIn() {
  const [hint, setHint] = useState<string | null>(null);
  const [state, setState] = useState<'waiting' | 'opening' | 'failed'>('waiting');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function go(loginHint: string | null) {
    if (started.current) return;
    started.current = true;
    setState('opening');
    setError(null);
    try {
      await startLogin({ purpose: 'login', returnTo: '/demo/welcome', ...(loginHint ? { loginHint } : {}) });
    } catch (err) {
      if (err instanceof NavigatingAwayError) return;
      started.current = false;
      setState('failed');
      setError(
        err instanceof DOMException || (err instanceof Error && /IndexedDB|key/i.test(err.message))
          ? "This browser couldn't create its sign-in key. Private windows and blocked site storage can cause this; try a normal window."
          : describeError(err),
      );
    }
  }

  useEffect(() => {
    const known = recallDemoEmail();
    setHint(known);
    const t = setTimeout(() => void go(known), AUTO_START_MS);
    return () => clearTimeout(t); // run once on arrival
  }, []);

  return (
    <section className="dm-card" aria-labelledby="verified-title" data-testid="verified" data-state={state}>
      <CheckIcon />
      <div className="dm-stack">
        <p className="mk-eyebrow">Email confirmed</p>
        <h1 id="verified-title" className="dm-title">
          Thanks. Now sign in.
        </h1>
        <p className="mk-lead">
          No password: we’ll email you a short code
          {hint ? (
            <>
              {' '}
              at <strong data-testid="verified-hint">{hint}</strong>
            </>
          ) : null}
          .
        </p>
      </div>
      <p role="status" aria-live="polite" className="dm-status-line" data-testid="verified-status">
        <span className={`dm-pulse${state === 'failed' ? ' dm-stopped' : ''}`} aria-hidden="true" />
        {state === 'failed' ? 'Sign-in didn’t open.' : 'Taking you to sign in…'}
      </p>
      {error && (
        <div className="dm-notice dm-notice-error" role="alert" data-testid="verified-error">
          <p>{error}</p>
        </div>
      )}
      <div className="dm-actions">
        <button
          type="button"
          className="mk-btn mk-btn-primary"
          disabled={state === 'opening'}
          onClick={() => void go(hint)}
          data-testid="verified-signin"
        >
          {state === 'opening' ? 'Opening sign-in…' : 'Sign in to my demo office'}
        </button>
      </div>
      <p className="dm-muted">Use the address you requested the demo with.</p>
    </section>
  );
}
