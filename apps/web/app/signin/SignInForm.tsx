'use client';

import { useState } from 'react';
import { describeError, NavigatingAwayError, safeReturnTo, startLogin } from '../../lib/api-client';

export function SignInForm({ returnTo }: { returnTo: string }) {
  const [busy, setBusy] = useState<'login' | 'sso' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(kind: 'login' | 'sso') {
    setBusy(kind);
    setError(null);
    try {
      await startLogin({
        purpose: 'login',
        returnTo: safeReturnTo(returnTo),
        ...(kind === 'sso' ? { idpHint: 'agency-sso' as const } : {}),
      });
    } catch (err) {
      if (err instanceof NavigatingAwayError) return;
      setError(
        err instanceof DOMException || (err instanceof Error && /IndexedDB|key/i.test(err.message))
          ? "This browser couldn't create or open its sign-in key. Private windows and blocked site storage can cause this."
          : describeError(err),
      );
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="signin-title" className="signin">
      <h2 id="signin-title" className="sr-only">
        Choose how to sign in
      </h2>
      <p>
        On the next screen you can sign in with a <strong>passkey</strong> or have a{' '}
        <strong>sign-in code emailed</strong> to you. No password needed.
      </p>
      <div className="actions">
        <button
          type="button"
          className="primary"
          data-testid="signin-button"
          disabled={busy !== null}
          onClick={() => void go('login')}
        >
          {busy === 'login' ? 'Opening sign-in…' : 'Sign in'}
        </button>
        <button type="button" data-testid="signin-sso-button" disabled={busy !== null} onClick={() => void go('sso')}>
          {busy === 'sso' ? 'Opening your agency sign-in…' : 'Sign in with your agency account (SSO)'}
        </button>
      </div>
      <p className="small">
        Signing in also registers this browser as one of your devices. It keeps a private key that never leaves it, so
        your session can't be used from anywhere else. You can see and remove devices on your account page.
      </p>
      {error && (
        <p className="notice bad" role="alert" data-testid="signin-error">
          {error}
        </p>
      )}
    </section>
  );
}
