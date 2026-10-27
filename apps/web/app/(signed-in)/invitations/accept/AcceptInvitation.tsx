'use client';

import { useEffect, useState } from 'react';
import { MEMBERSHIPS_CHANGED } from '../../../../components/AppHeader';
import { api, ApiError, describeError, getMe, NavigatingAwayError } from '../../../../lib/api-client';
import { describeRole, type AuthMeResponse } from '../../../../lib/auth-types';

const PENDING = 'agentcity:pending-invitation';

/**
 * Takes the token from the link's fragment, keeps it in this tab only (sessionStorage) and removes it from the address
 * bar. If the person has to sign in first, the token survives the round trip without ever being sent anywhere except
 * to the accept endpoint.
 */
function takeToken(): string | null {
  const fromLink = new URLSearchParams(window.location.hash.slice(1)).get('token');
  try {
    if (fromLink) {
      sessionStorage.setItem(PENDING, fromLink);
      history.replaceState(null, '', window.location.pathname);
      return fromLink;
    }
    return sessionStorage.getItem(PENDING);
  } catch {
    return fromLink;
  }
}

function forgetToken() {
  try {
    sessionStorage.removeItem(PENDING);
  } catch {
    // storage unavailable: nothing to forget
  }
}

type Result =
  { kind: 'ok'; text: string; tenantId: string | null; workspaceId: string | null } | { kind: 'bad'; text: string };

/** Turn the API's refusal into something the invited person can act on. */
export function explainInviteError(err: unknown, email: string | null | undefined): string {
  if (!(err instanceof ApiError)) return describeError(err);
  const code = (err.code ?? '').toLowerCase();
  if (err.status === 410 || code.includes('expired') || code.includes('used') || code.includes('replay')) {
    if (code.includes('expired'))
      return 'This invitation has expired. Ask the person who invited you to send a new link.';
    if (code.includes('used') || code.includes('replay'))
      return 'This invitation has already been used. If that wasn’t you, tell the person who invited you.';
    return 'This invitation has expired or has already been used. Ask the person who invited you for a new link.';
  }
  if (code.includes('verif'))
    return 'Your email address isn’t verified yet. Sign in with an email code to verify it, then open this link again.';
  if (err.status === 403 || code.includes('email') || code.includes('mismatch')) {
    return `This invitation was sent to a different email address than the one you're signed in with${
      email ? ` (${email})` : ''
    }. Sign out and sign in with the invited address, or ask for an invitation to this one.`;
  }
  if (err.status === 404 || err.status === 400)
    return 'This invitation link isn’t valid. Check you copied the whole link.';
  return describeError(err);
}

export function AcceptInvitation() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    // A second invitation link opened in the same tab only changes the fragment, so listen for that too.
    const onHash = () => {
      if (!window.location.hash) return;
      setResult(null);
      setToken(takeToken());
    };
    window.addEventListener('hashchange', onHash);
    setToken(takeToken());
    getMe().then(setMe, err => {
      if (!(err instanceof NavigatingAwayError)) setResult({ kind: 'bad', text: describeError(err) });
    });
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (token === undefined) return null;
  if (!token) {
    return (
      <p className="notice bad" role="alert" data-testid="invite-result" data-result="missing">
        This link is missing its invitation code. Open the full link from your invitation again.
      </p>
    );
  }

  async function accept() {
    setBusy(true);
    setResult(null);
    try {
      const body = await api('POST', '/api/invitations/accept', { body: { token } });
      const tenantName = typeof body.tenantName === 'string' ? body.tenantName : null;
      const role = typeof body.role === 'string' ? ` as ${describeRole(body.role)}` : '';
      setResult({
        kind: 'ok',
        text: `You've joined ${tenantName ?? 'the organisation'}${role}.`,
        tenantId: typeof body.tenantId === 'string' ? body.tenantId : null,
        workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : null,
      });
      forgetToken();
      window.dispatchEvent(new Event(MEMBERSHIPS_CHANGED));
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) forgetToken(); // used or expired: it will never work
      if (!(err instanceof NavigatingAwayError)) setResult({ kind: 'bad', text: explainInviteError(err, me?.email) });
    } finally {
      setBusy(false);
    }
  }

  async function openTenant(tenantId: string, workspaceId: string | null) {
    try {
      await api('POST', '/api/session/tenant', { body: { tenantId, ...(workspaceId ? { workspaceId } : {}) } });
      window.location.assign('/account');
    } catch (err) {
      if (!(err instanceof NavigatingAwayError)) setResult({ kind: 'bad', text: describeError(err) });
    }
  }

  return (
    <section aria-labelledby="invite-title">
      <h2 id="invite-title" className="sr-only">
        Invitation
      </h2>
      <p data-testid="invite-signed-in-as">
        {me ? (
          <>
            You're signed in as <strong>{me.email ?? 'an account with no email'}</strong>. The invitation must have been
            sent to this address.
          </>
        ) : (
          'Checking who you are signed in as…'
        )}
      </p>
      {result?.kind !== 'ok' && (
        <div className="actions">
          <button
            type="button"
            className="primary"
            data-testid="invite-accept"
            disabled={busy || !me}
            onClick={() => void accept()}
          >
            {busy ? 'Accepting…' : 'Accept invitation'}
          </button>
        </div>
      )}
      {result && (
        <div
          className={`notice ${result.kind}`}
          role={result.kind === 'bad' ? 'alert' : 'status'}
          data-testid="invite-result"
          data-result={result.kind}
        >
          <p>{result.text}</p>
          {result.kind === 'ok' && result.tenantId && (
            <div className="actions">
              <button
                type="button"
                className="primary"
                data-testid="invite-open-tenant"
                onClick={() => void openTenant(result.tenantId!, result.workspaceId)}
              >
                Start working there
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
