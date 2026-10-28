'use client';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { explainSubmitError, prefetchFormToken, requestSignInLink } from '../../../components/demo/lite-submit';

// No password: a verified visitor asks for a new one-time link, and the link opens the demo office they already have.
// The answer is the same for every address, so this page never says whether an address has a demo.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LiteSignIn() {
  const uid = useId();
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => prefetchFormToken(), []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const value = email.trim();
    if (!EMAIL.test(value)) {
      setError('Enter the email address you used for your demo.');
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await requestSignInLink(value, honeypot);
      setSentTo(value);
    } catch (err) {
      setError(explainSubmitError(err));
      requestAnimationFrame(() => errorRef.current?.focus());
    }
    setBusy(false);
  }

  if (sentTo) {
    return (
      <section className="dm-card" aria-labelledby="signin-title" data-testid="signin-sent">
        <div className="dm-stack">
          <p className="mk-eyebrow">Check your email</p>
          <h1 id="signin-title" className="dm-title">
            If that address has a demo office, a link is on its way
          </h1>
          <p>
            We sent a one-time link to <strong>{sentTo}</strong>. It works once and expires in 24 hours. Open it in this
            browser to go back to your office. Check your spam folder if it does not arrive.
          </p>
          <p>
            No demo office for that address yet?{' '}
            <Link className="dm-link" href="/demo">
              Get your free demo office
            </Link>
            .
          </p>
          <p>
            <button type="button" className="dm-link" onClick={() => setSentTo(null)}>
              Use a different address
            </button>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="dm-card" aria-labelledby="signin-title" data-testid="signin-card">
      <div className="dm-stack">
        <p className="mk-eyebrow">Your demo office</p>
        <h1 id="signin-title" className="dm-title">
          Sign in with your email
        </h1>
        <p>
          There is no password. Enter the address you used for your demo and we will email you a one-time link that
          opens your office again, on any device.
        </p>
        <form className="dm-form" noValidate onSubmit={e => void onSubmit(e)} aria-busy={busy}>
          <div className="dm-field">
            <label htmlFor={`${uid}-email`}>Business email</label>
            <input
              id={`${uid}-email`}
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${uid}-error` : undefined}
              data-testid="signin-email"
            />
            {error && (
              <p className="dm-field-error" id={`${uid}-error`} ref={errorRef} tabIndex={-1} role="alert">
                {error}
              </p>
            )}
          </div>
          <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
            <label htmlFor={`${uid}-site`}>Leave this field empty</label>
            <input
              id={`${uid}-site`}
              name="website2"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={e => setHoneypot(e.target.value)}
            />
          </div>
          <button type="submit" className="mk-btn mk-btn-primary dm-submit" disabled={busy} data-testid="signin-submit">
            {busy ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>
        <p className="mk-footnote">
          New here?{' '}
          <Link className="dm-link" href="/demo">
            Get your free demo office
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
