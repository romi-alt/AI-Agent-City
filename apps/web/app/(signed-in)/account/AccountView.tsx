'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  describeError,
  getMe,
  NavigatingAwayError,
  startStepUp,
  StepUpRequiredError,
} from '../../../lib/api-client';
import {
  describeAmr,
  formatWhen,
  normaliseSessions,
  type AuthMeResponse,
  type DeviceRow,
  type LogoutResponse,
  type SessionRow,
} from '../../../lib/auth-types';

type Notice = { kind: 'ok' | 'bad'; text: string } | null;

// Query parameters we come back with after a step-up started from this page.
const PENDING = 'pending';
const PENDING_REMOVE_DEVICE = 'remove-device';

export function AccountView() {
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // A device removal waiting for a fresh sign-in (before we go) or for confirmation (after we come back).
  const [stepUpFor, setStepUpFor] = useState<DeviceRow | null>(null);
  const [resumeFor, setResumeFor] = useState<DeviceRow | null>(null);

  const fail = (err: unknown) => {
    if (!(err instanceof NavigatingAwayError)) setNotice({ kind: 'bad', text: describeError(err) });
  };

  const load = useCallback(async () => {
    const who = await getMe();
    setMe(who);
    const lists = normaliseSessions(await api('GET', '/api/auth/sessions'), null);
    // The API marks the current session; fall back to this browser's device id from /me.
    const devs = lists.devices.map(d => ({ ...d, current: d.current || d.id === who.device.id }));
    setSessions(lists.sessions);
    setDevices(devs);
    return devs;
  }, []);

  useEffect(() => {
    load().then(devs => {
      const params = new URLSearchParams(window.location.search);
      if (params.get(PENDING) !== PENDING_REMOVE_DEVICE) return;
      const target = devs.find(d => d.id === params.get('device'));
      window.history.replaceState(null, '', window.location.pathname);
      if (target) setResumeFor(target);
      else setNotice({ kind: 'bad', text: 'That device is no longer on your account.' });
    }, fail);
  }, [load]);

  async function revokeSession(s: SessionRow) {
    setBusy(`session:${s.id}`);
    setNotice(null);
    try {
      await api('DELETE', `/api/auth/sessions/${encodeURIComponent(s.id)}`);
      setNotice({ kind: 'ok', text: `Signed out ${s.deviceLabel ?? 'that session'}.` });
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function removeDevice(d: DeviceRow) {
    setBusy(`device:${d.id}`);
    setNotice(null);
    try {
      await api('DELETE', `/api/auth/devices/${encodeURIComponent(d.id)}`, { stepUp: 'throw' });
      setResumeFor(null);
      setStepUpFor(null);
      if (d.current) {
        window.location.assign('/signed-out');
        return;
      }
      setNotice({ kind: 'ok', text: `Removed ${d.label ?? 'the device'}. Every session on it is signed out.` });
      await load();
    } catch (err) {
      if (err instanceof StepUpRequiredError) {
        setResumeFor(null);
        setStepUpFor(d);
      } else fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function continueStepUp(d: DeviceRow) {
    setBusy('step-up');
    try {
      const back = `/account?${new URLSearchParams({ [PENDING]: PENDING_REMOVE_DEVICE, device: d.id })}`;
      await startStepUp('credential', back);
    } catch (err) {
      fail(err);
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy('signout');
    try {
      const res = await api<LogoutResponse>('POST', '/api/auth/logout', { signedOut: 'throw' });
      window.location.assign(res.endSessionUrl || '/signed-out');
    } catch (err) {
      // Already signed out (or revoked elsewhere): there is nothing left to end here.
      if (err instanceof ApiError && err.status === 401) {
        window.location.assign('/signed-out');
        return;
      }
      fail(err);
      setBusy(null);
    }
  }

  return (
    <>
      {notice && (
        <p
          className={`notice ${notice.kind}`}
          role={notice.kind === 'bad' ? 'alert' : 'status'}
          data-testid="account-notice"
        >
          {notice.text}
        </p>
      )}

      {stepUpFor && (
        <section className="panel" aria-labelledby="step-up-title" data-testid="step-up-panel">
          <h2 id="step-up-title">Confirm it's you</h2>
          <p>
            Removing a device signs it out everywhere, so we need a fresh sign-in with your passkey first. You'll come
            straight back here to finish removing <strong>{stepUpFor.label ?? 'this device'}</strong>.
          </p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              data-testid="step-up-continue"
              disabled={busy === 'step-up'}
              onClick={() => void continueStepUp(stepUpFor)}
              autoFocus
            >
              Continue to sign in
            </button>
            <button type="button" data-testid="step-up-cancel" onClick={() => setStepUpFor(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {resumeFor && (
        <section className="panel" aria-labelledby="resume-title" data-testid="step-up-resume">
          <h2 id="resume-title">Finish removing the device</h2>
          <p>
            You've signed in again. Remove <strong>{resumeFor.label ?? 'this device'}</strong> now?
            {resumeFor.current && ' This is the device you are using, so you will be signed out here too.'}
          </p>
          <div className="actions">
            <button
              type="button"
              className="danger"
              data-testid="step-up-resume-confirm"
              disabled={busy !== null}
              onClick={() => void removeDevice(resumeFor)}
              autoFocus
            >
              Remove device
            </button>
            <button type="button" onClick={() => setResumeFor(null)}>
              Keep it
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="me-title" data-testid="me">
        <h2 id="me-title">Who you're signed in as</h2>
        {me ? (
          <dl className="facts">
            <dt>Email</dt>
            <dd data-testid="me-email">
              {me.email ?? 'No email on your account'} {me.email && !me.emailVerified && '(not verified yet)'}
            </dd>
            <dt>Signed in with</dt>
            <dd data-testid="me-amr">{describeAmr(me.amr)}</dd>
            <dt>Sign-in strength</dt>
            <dd data-testid="me-acr">
              {me.acr === '2'
                ? 'strong (passkey)'
                : me.acr === '1'
                  ? 'basic (email code or agency sign-on)'
                  : 'unknown'}
            </dd>
            <dt>Signed in at</dt>
            <dd>{formatWhen(me.authTime)}</dd>
            <dt>This device</dt>
            <dd data-testid="me-device">{me.device.label ?? me.device.id}</dd>
          </dl>
        ) : (
          <p role="status">Loading your account…</p>
        )}
        <div className="actions">
          <button
            type="button"
            data-testid="signout-button"
            disabled={busy === 'signout' || !me}
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </section>

      <section aria-labelledby="sessions-title">
        <h2 id="sessions-title">Where you're signed in</h2>
        <p>Each sign-in is a session tied to one device. Signing a session out ends it straight away.</p>
        {sessions === null ? (
          <p role="status">Loading…</p>
        ) : (
          <table data-testid="sessions-table">
            <thead>
              <tr>
                <th scope="col">Device</th>
                <th scope="col">Signed in</th>
                <th scope="col">Last active</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} data-testid={`session-${s.id}`} data-current={s.current}>
                  <td>
                    {s.deviceLabel ?? s.deviceId ?? 'Unknown device'}
                    {s.current && <strong className="tag"> (this session)</strong>}
                  </td>
                  <td>{formatWhen(s.createdAt)}</td>
                  <td>{formatWhen(s.lastSeenAt)}</td>
                  <td>
                    {s.current ? (
                      <span className="muted">Use “Sign out” above</span>
                    ) : (
                      <button
                        type="button"
                        data-testid={`revoke-session-${s.id}`}
                        disabled={busy !== null}
                        onClick={() => void revokeSession(s)}
                      >
                        Sign out this session
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="devices-title">
        <h2 id="devices-title">Your devices</h2>
        <p>
          A device is a browser that holds its own sign-in key. Removing one signs out every session on it and needs a
          fresh passkey sign-in.
        </p>
        {sessions !== null && (
          <table data-testid="devices-table">
            <thead>
              <tr>
                <th scope="col">Device</th>
                <th scope="col">First used</th>
                <th scope="col">Last active</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.id} data-testid={`device-${d.id}`} data-current={d.current}>
                  <td>
                    {d.label ?? d.id}
                    {d.current && <strong className="tag"> (this device)</strong>}
                  </td>
                  <td>{formatWhen(d.createdAt)}</td>
                  <td>{formatWhen(d.lastSeenAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="danger"
                      data-testid={`revoke-device-${d.id}`}
                      disabled={busy !== null}
                      onClick={() => void removeDevice(d)}
                    >
                      Remove device
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
