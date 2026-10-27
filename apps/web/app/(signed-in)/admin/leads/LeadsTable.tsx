'use client';

// Demo leads for the platform agency's owner. Personal data stays on this page: nothing about a lead goes into the
// address bar (cursors are kept in memory) or the console.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  ApiError,
  API_ERRORS,
  describeError,
  goToSignIn,
  NavigatingAwayError,
  startStepUp,
  StepUpRequiredError,
} from '../../../../lib/api-client';
import type { StepUpReason } from '../../../../lib/auth-types';
import { deviceProof } from '../../../../lib/device-key';
import { INDUSTRIES } from '../../../../components/demo/demo-validation';
import '../../../../components/marketing/marketing.css';
import '../../../../components/demo/demo.css';

const PAGE_SIZE = 25;
const LIST = '/api/admin/leads';
const CSV = '/api/admin/leads.csv';

export interface LeadRow {
  id: string;
  createdAt: string | null;
  fullName: string;
  email: string;
  company: string;
  industry: string | null;
  phone: string | null;
  website: string | null;
  marketingConsent: boolean | null;
  demoStatus: string | null;
  source: string | null;
  expiresAt: string | null;
}

type Obj = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' && v ? v : null);
const o = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});

export function normaliseLead(raw: unknown): LeadRow | null {
  const l = o(raw);
  const id = s(l.id) ?? s(l.leadId);
  if (!id) return null;
  const consent = o(l.consent);
  const attr = o(l.attribution);
  const marketing =
    typeof l.marketingConsent === 'boolean'
      ? l.marketingConsent
      : typeof consent.marketing === 'boolean'
        ? consent.marketing
        : typeof consent.given === 'boolean'
          ? consent.given
          : null;
  const source =
    [s(attr.utmSource) ?? s(l.utmSource) ?? s(l.utm_source), s(attr.utmMedium) ?? s(l.utmMedium) ?? s(l.utm_medium)]
      .filter(Boolean)
      .join(' / ') ||
    s(attr.referrerHost) ||
    s(l.referrerHost) ||
    null;
  return {
    id,
    createdAt: s(l.createdAt),
    fullName: s(l.fullName) ?? s(l.name) ?? '',
    email: s(l.email) ?? '',
    company: s(l.company) ?? '',
    industry: s(l.industry),
    phone: s(l.phone),
    website: s(l.website),
    marketingConsent: marketing,
    demoStatus: s(l.demoStatus) ?? s(l.status),
    source,
    expiresAt: s(l.expiresAt),
  };
}

const when = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/** The landing page's status chips: green dot when ready, gold while waiting on the visitor, grey otherwise. */
function statusTone(status: string | null): 'done' | 'wait' | 'idle' {
  const v = (status ?? '').toLowerCase();
  if (v.includes('ready') || v.includes('claimed') || v.includes('active')) return 'done';
  if (v.includes('verif') || v.includes('pending')) return 'wait';
  return 'idle';
}

function statusLabel(status: string | null): string {
  if (!status) return '—';
  const known: Record<string, string> = {
    'verification-sent': 'Awaiting confirmation',
    ready: 'Ready',
    claimed: 'Opened',
    expired: 'Expired',
  };
  return known[status] ?? status.replace(/[-_]/g, ' ');
}

export function LeadsTable() {
  const [rows, setRows] = useState<LeadRow[] | null>(null);
  const [cursors, setCursors] = useState<(string | null)[]>([null]); // cursor for each page we've visited
  const [page, setPage] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepUp, setStepUp] = useState<StepUpReason | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const load = useCallback(async (after: string | null, pageIndex: number) => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ first: String(PAGE_SIZE) });
      if (after) params.set('after', after);
      const body = await api(`GET`, `${LIST}?${params}`, { stepUp: 'throw' });
      const items = (Array.isArray(body.items) ? body.items : []).map(normaliseLead).filter(r => r !== null);
      const info = o(body.pageInfo);
      setRows(items as LeadRow[]);
      setNextCursor(info.hasNextPage === true ? s(info.endCursor) : null);
      setPage(pageIndex);
      setStepUp(null);
    } catch (err) {
      if (err instanceof NavigatingAwayError) return;
      if (err instanceof StepUpRequiredError) return setStepUp(err.reason ?? 'permission');
      if (err instanceof ApiError && err.code === 'invalid_cursor') {
        setCursors([null]);
        setError('The list changed or the page link expired, so we went back to the first page.');
        void load(null, 0);
        return;
      }
      setError(
        err instanceof ApiError && err.status === 403
          ? 'Only the owner of the platform agency can see demo leads.'
          : describeError(err),
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(null, 0);
  }, [load]);

  function goNext() {
    if (!nextCursor) return;
    setCursors(c => [...c.slice(0, page + 1), nextCursor]);
    void load(nextCursor, page + 1).then(() => tableRef.current?.focus());
  }
  function goPrevious() {
    if (page === 0) return;
    void load(cursors[page - 1] ?? null, page - 1).then(() => tableRef.current?.focus());
  }

  /** The CSV needs the same device proof as every API call, so it is fetched here and saved from memory. */
  async function exportCsv() {
    setExporting(true);
    setExported(null);
    setError(null);
    try {
      const res = await fetch(CSV, {
        headers: { Accept: 'text/csv', 'X-Device-Proof': await deviceProof('GET', CSV) },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) {
        let body: Obj = {};
        try {
          body = (await res.json()) as Obj;
        } catch {
          body = {};
        }
        if (res.status === 403 && body.error === API_ERRORS.stepUpRequired) {
          setStepUp((s(body.reason) as StepUpReason | null) ?? 'permission');
          return;
        }
        if (res.status === 401) goToSignIn(window.location.pathname, s(body.error) ?? undefined);
        throw new ApiError(res.status, body);
      }
      const blob = await res.blob();
      const name =
        /filename="?([^";]+)"?/i.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'agentcity-demo-leads.csv';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExported(
        `Downloaded ${name}. It contains personal data: keep it somewhere safe and delete it when you’re done.`,
      );
    } catch (err) {
      if (!(err instanceof NavigatingAwayError)) setError(`The export didn’t work. ${describeError(err)}`);
    } finally {
      setExporting(false);
    }
  }

  async function continueStepUp() {
    try {
      await startStepUp(stepUp ?? 'permission', '/admin/leads');
    } catch (err) {
      if (!(err instanceof NavigatingAwayError)) setError(describeError(err));
    }
  }

  return (
    <div className="mk dm-page">
      <main className="dm-wide" data-testid="leads-page">
        <div className="dm-office-head">
          <div>
            <p className="mk-eyebrow">Admin</p>
            <h1 className="dm-title">Demo leads</h1>
            <p className="dm-muted">Newest first. This list contains personal data.</p>
          </div>
          <button
            type="button"
            className="mk-btn mk-btn-secondary"
            onClick={() => void exportCsv()}
            disabled={exporting || stepUp !== null}
            data-testid="leads-export"
          >
            {exporting ? 'Preparing CSV…' : 'Export CSV'}
          </button>
        </div>

        {stepUp && (
          <section
            className="dm-card"
            aria-labelledby="leads-stepup-title"
            data-testid="leads-step-up"
            data-reason={stepUp}
          >
            <div className="dm-stack">
              <h2 id="leads-stepup-title" className="dm-h3">
                Confirm it’s you
              </h2>
              <p className="dm-muted">
                Leads include names and contact details, so we ask for a fresh passkey sign-in first. You’ll come
                straight back here.
              </p>
            </div>
            <div className="dm-actions">
              <button
                type="button"
                className="mk-btn mk-btn-dark"
                onClick={() => void continueStepUp()}
                data-testid="leads-step-up-continue"
              >
                Continue with passkey
              </button>
            </div>
          </section>
        )}

        {error && (
          <div className="dm-notice dm-notice-error" role="alert" data-testid="leads-error">
            <p>{error}</p>
          </div>
        )}
        {exported && (
          <div className="dm-notice dm-notice-ok" role="status" data-testid="leads-exported">
            <p>{exported}</p>
          </div>
        )}

        {rows && !stepUp && (
          <>
            {rows.length === 0 ? (
              <p className="dm-notice" data-testid="leads-empty">
                No demo requests yet.
              </p>
            ) : (
              <div className="dm-table-wrap">
                <table className="dm-table" ref={tableRef} tabIndex={-1} aria-busy={busy} data-testid="leads-table">
                  <caption className="sr-only">Demo leads, page {page + 1}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Received</th>
                      <th scope="col">Name and phone</th>
                      <th scope="col">Email</th>
                      <th scope="col">Company</th>
                      <th scope="col">Industry</th>
                      <th scope="col">News consent</th>
                      <th scope="col">Demo</th>
                      <th scope="col">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} data-testid="lead-row">
                        <td data-label="Received">{when(r.createdAt)}</td>
                        <td data-label="Name">
                          {r.fullName || '—'}
                          {r.phone && <span className="dm-sub dm-nowrap">{r.phone}</span>}
                        </td>
                        <td data-label="Email">{r.email || '—'}</td>
                        <td data-label="Company">
                          {r.company || '—'}
                          {r.website && <span className="dm-sub">{r.website}</span>}
                        </td>
                        <td data-label="Industry">
                          {r.industry ? (INDUSTRIES.find(i => i.value === r.industry)?.label ?? r.industry) : '—'}
                        </td>
                        <td data-label="News consent">
                          {r.marketingConsent === null ? '—' : r.marketingConsent ? 'Yes' : 'No'}
                        </td>
                        <td data-label="Demo">
                          <span className={`mk-status mk-status-${statusTone(r.demoStatus)}`}>
                            <span className="mk-status-dot" aria-hidden="true" />
                            {statusLabel(r.demoStatus)}
                          </span>
                        </td>
                        <td data-label="Source">{r.source ?? 'Direct'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <nav className="dm-pager" aria-label="Lead pages">
              <span data-testid="leads-page-number">Page {page + 1}</span>
              <span className="dm-actions">
                <button
                  type="button"
                  className="mk-btn mk-btn-secondary mk-btn-sm"
                  onClick={goPrevious}
                  disabled={busy || page === 0}
                  data-testid="leads-prev"
                >
                  Previous page
                </button>
                <button
                  type="button"
                  className="mk-btn mk-btn-secondary mk-btn-sm"
                  onClick={goNext}
                  disabled={busy || !nextCursor}
                  data-testid="leads-next"
                >
                  Next page
                </button>
              </span>
            </nav>
          </>
        )}
        {!rows && !stepUp && !error && (
          <p className="dm-status-line" role="status">
            <span className="dm-pulse" aria-hidden="true" /> Loading leads…
          </p>
        )}
      </main>
    </div>
  );
}
