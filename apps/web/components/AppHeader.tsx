'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, describeError, getMe, NavigatingAwayError } from '../lib/api-client';
import { describeRole, normaliseMemberships, type AuthMeResponse, type MembershipRow } from '../lib/auth-types';
import { Mark } from './marketing/Primitives';
import { RealtimeStatus } from './RealtimeStatus';

/** Fired by pages that change what the header shows (e.g. after accepting an invitation). */
export const MEMBERSHIPS_CHANGED = 'agentcity:memberships-changed';

const optionValue = (m: { tenantId: string | null; workspaceId: string | null }) =>
  `${m.tenantId}|${m.workspaceId ?? ''}`;

/** Shared header for signed-in pages: who you are, which organisation you're working in, live-updates status. */
export function AppHeader() {
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [memberships, setMemberships] = useState<MembershipRow[] | null>(null);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const who = await getMe();
      setMe(who);
      const rows = normaliseMemberships(await api('GET', '/api/access/memberships'));
      setMemberships(rows);
      // The current tenant from the session; match its workspace when there is one, else the tenant's first row.
      const current =
        rows.find(m => m.tenantId === who.tenantId && m.workspaceId === who.workspaceId) ??
        rows.find(m => m.tenantId === who.tenantId);
      setSelected(current ? optionValue(current) : '');
    } catch (err) {
      if (!(err instanceof NavigatingAwayError)) setMessage({ kind: 'bad', text: describeError(err) });
    }
  }, []);

  useEffect(() => {
    void load();
    const reload = () => void load();
    window.addEventListener(MEMBERSHIPS_CHANGED, reload);
    return () => window.removeEventListener(MEMBERSHIPS_CHANGED, reload);
  }, [load]);

  async function switchTenant(value: string) {
    const target = memberships?.find(m => optionValue(m) === value);
    if (!target) return;
    const previous = selected;
    setSelected(value);
    setBusy(true);
    setMessage(null);
    try {
      await api('POST', '/api/session/tenant', {
        body: { tenantId: target.tenantId, ...(target.workspaceId ? { workspaceId: target.workspaceId } : {}) },
      });
      setMessage({ kind: 'ok', text: `You're now working in ${labelFor(target)}.` });
      window.dispatchEvent(new CustomEvent('agentcity:tenant-changed', { detail: target }));
    } catch (err) {
      if (err instanceof NavigatingAwayError) return;
      setSelected(previous);
      setMessage({ kind: 'bad', text: `Could not switch: ${describeError(err)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="app-header" data-testid="app-header">
      <a className="brand" href="/account" aria-label="AgentCity, your account">
        <Mark className="brand-mark" />
        <span>AgentCity</span>
      </a>
      <div className="tenant-switcher">
        <label htmlFor="tenant-select">Working in</label>
        {memberships && memberships.length > 0 ? (
          <select
            id="tenant-select"
            data-testid="tenant-select"
            value={selected}
            disabled={busy}
            onChange={e => void switchTenant(e.target.value)}
          >
            {!selected && <option value="">Choose an organisation…</option>}
            {memberships.map(m => (
              <option key={optionValue(m)} value={optionValue(m)}>
                {labelFor(m)} ({describeRole(m.role)})
              </option>
            ))}
          </select>
        ) : (
          <span id="tenant-select" data-testid="tenant-none" className="muted">
            {memberships ? 'No organisations yet' : 'Loading…'}
          </span>
        )}
      </div>
      <RealtimeStatus />
      <a className="header-account" href="/account" data-testid="header-account">
        {me?.email ?? 'Your account'}
      </a>
      {message && (
        <p
          className={`header-message ${message.kind}`}
          role={message.kind === 'bad' ? 'alert' : 'status'}
          data-testid="tenant-message"
        >
          {message.text}
        </p>
      )}
    </header>
  );
}

function labelFor(m: MembershipRow): string {
  return m.workspaceName ? `${m.tenantName} — ${m.workspaceName}` : m.tenantName;
}
