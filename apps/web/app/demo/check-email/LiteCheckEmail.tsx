'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { liteStatusDetail, type LiteStatus } from '../../../lib/api-client';
import { CheckIcon, MailIcon } from '../../../components/demo/DemoBits';
import { loadDraft } from '../../../components/demo/lite-draft';
import { explainSubmitError, submitDemoRequest } from '../../../components/demo/lite-submit';

type View = LiteStatus | 'unknown';

const FIRST_DELAY_MS = 4000;
const MAX_DELAY_MS = 20_000;
const RESEND_COOLDOWN_S = 60;

/**
 * Waits for the email link to be used. It asks the status endpoint gently (4 s, then slower, never while the tab
 * is hidden) and, once the address is confirmed, takes the visitor on to the welcome page.
 */
function useRequestStatus(requestId: string | null): { view: View; deliveryFailed: boolean } {
  const [view, setView] = useState<View>(requestId ? 'verification-sent' : 'unknown');
  const [deliveryFailed, setDeliveryFailed] = useState(false);
  const delay = useRef(FIRST_DELAY_MS);

  useEffect(() => {
    if (!requestId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (document.visibilityState !== 'hidden') {
        try {
          const { status, deliveryFailed: failed } = await liteStatusDetail(requestId);
          if (stopped) return;
          setView(status);
          setDeliveryFailed(failed);
          if (status !== 'verification-sent') return;
        } catch {
          // passing trouble (network, a busy server): keep waiting
        }
      }
      delay.current = Math.min(delay.current * 1.4, MAX_DELAY_MS);
      timer = setTimeout(() => void tick(), delay.current);
    };
    delay.current = FIRST_DELAY_MS;
    setView('verification-sent');
    setDeliveryFailed(false);
    timer = setTimeout(() => void tick(), delay.current);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [requestId]);

  return { view, deliveryFailed };
}

function useCooldown() {
  const [left, setLeft] = useState(RESEND_COOLDOWN_S);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, restart: () => setLeft(RESEND_COOLDOWN_S) };
}

export function LiteCheckEmail({ requestId }: { requestId: string | null }) {
  const router = useRouter();
  const { view, deliveryFailed } = useRequestStatus(requestId);
  const cooldown = useCooldown();
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  // Read after mount: the draft lives in sessionStorage, which the server render cannot see.
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => setAddress(loadDraft()?.email ?? null), []);

  useEffect(() => {
    if (view !== 'ready') return;
    const t = setTimeout(() => router.push('/demo/welcome'), 2500);
    return () => clearTimeout(t);
  }, [view, router]);

  const resend = useCallback(async () => {
    const draft = loadDraft();
    if (!draft) {
      setNote({ ok: false, text: 'We no longer have your details in this tab. Please fill in the form again.' });
      return;
    }
    setSending(true);
    setNote(null);
    try {
      const fresh = await submitDemoRequest(draft);
      setNote({ ok: true, text: `We sent a new link to ${draft.email}. The earlier one may no longer work.` });
      cooldown.restart();
      router.replace(`/demo/check-email?request=${encodeURIComponent(fresh)}`);
    } catch (err) {
      setNote({ ok: false, text: explainSubmitError(err) });
    }
    setSending(false);
  }, [cooldown, router]);

  return (
    <section className="dm-card" aria-labelledby="check-title" data-testid="check-email" data-status={view}>
      {view === 'ready' ? <CheckIcon /> : <MailIcon />}
      <div className="dm-stack">
        <p className="mk-eyebrow">{view === 'ready' ? 'Email confirmed' : 'Check your email'}</p>
        <h1 id="check-title" className="dm-title">
          {view === 'ready' ? 'Your demo office is ready' : 'Confirm your email to open your office'}
        </h1>
        <p className="mk-lead">
          {view === 'ready'
            ? 'Taking you in now.'
            : address
              ? `We sent a confirmation link to ${address}. Open it and your demo office opens.`
              : 'We sent you a confirmation link. Open it and your demo office opens.'}
        </p>
      </div>

      <div className="dm-status-line" role="status" aria-live="polite" data-testid="check-status">
        <span
          className={`dm-pulse${view === 'verification-sent' ? '' : view === 'ready' ? ' dm-done' : ' dm-stopped'}`}
          aria-hidden="true"
        />
        {view === 'verification-sent' && 'Waiting for you to confirm your email address…'}
        {view === 'ready' && 'Email confirmed.'}
        {view === 'expired' && 'This request has expired.'}
        {view === 'unknown' && 'Look for the email from AgentCity.'}
      </div>

      {deliveryFailed && view === 'verification-sent' && (
        <div className="dm-error-summary" role="alert" data-testid="check-delivery-failed">
          <h3>We could not send the email</h3>
          <p>
            Our email provider did not accept the message, so no link is on its way. Press &ldquo;Send the email
            again&rdquo; below, or check that the address is correct.
          </p>
        </div>
      )}

      {view === 'ready' && (
        <div className="dm-actions">
          <Link className="mk-btn mk-btn-primary" href="/demo/welcome" data-testid="check-continue">
            Open my demo office
          </Link>
        </div>
      )}

      {view !== 'ready' && (
        <div className="dm-stack">
          <p className="dm-muted" data-testid="check-resend">
            Nothing arrived? Check your spam folder, then send it again. The link works once.
          </p>
          <div className="dm-actions">
            <button
              type="button"
              className="mk-btn mk-btn-secondary"
              onClick={() => void resend()}
              disabled={sending || (cooldown.left > 0 && !deliveryFailed)}
              data-testid="check-resend-button"
            >
              {sending
                ? 'Sending…'
                : cooldown.left > 0 && !deliveryFailed
                  ? `Send again in ${cooldown.left}s`
                  : 'Send the email again'}
            </button>
            <Link className="dm-link" href="/demo?edit=1" data-testid="check-wrong-address">
              Wrong address? Go back
            </Link>
          </div>
          {note && (
            <p className={note.ok ? 'dm-muted' : 'dm-field-error'} role="status" data-testid="check-resend-note">
              {note.text}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
