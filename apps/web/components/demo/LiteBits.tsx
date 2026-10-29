// Small pieces shared by the lite demo pages (check-email, verified, welcome, office).
import type { ReactNode } from 'react';
import type { LiteAgentStatus } from '../../lib/api-client';
import { CONTACT_EMAIL } from '../../lib/preview';
import '../marketing/marketing.css';
import './demo.css';

const STATUS: Record<LiteAgentStatus, { text: string; tone: string }> = {
  working: { text: 'Working', tone: 'busy' },
  idle: { text: 'Idle', tone: 'idle' },
  'needs-you': { text: 'Needs you', tone: 'wait' },
};

/** An agent's status chip, in the landing page's hairline style. */
export function LiteStatus({ status, testId }: { status: LiteAgentStatus; testId?: string }) {
  const s = STATUS[status];
  return (
    <span className={`mk-status mk-status-${s.tone}`} data-state={status} data-testid={testId}>
      <span className="mk-status-dot" aria-hidden="true" />
      {s.text}
    </span>
  );
}

/** The "Talk to us" address. No booking tool is assumed: it is a plain email link. */
export function talkToUsHref(subject = 'AutoSalesCity demo'): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/** A calm full-card message with actions, for states like "link expired" or "sign in again". */
export function LiteNotice({
  eyebrow,
  title,
  children,
  actions,
  kind,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  kind: string;
}) {
  return (
    <section className="dm-card" aria-labelledby="lite-notice-title" data-testid="lite-notice" data-kind={kind}>
      <div className="dm-stack">
        <p className="mk-eyebrow">{eyebrow}</p>
        <h1 id="lite-notice-title" className="dm-title">
          {title}
        </h1>
      </div>
      <div className="dm-muted">{children}</div>
      <div className="dm-actions">{actions}</div>
    </section>
  );
}

/** "13 days left" / "less than a day left", or an empty string when the date is unreadable or past. */
export function daysLeft(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms) || ms <= 0) return '';
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return 'less than a day left';
  return days === 1 ? '1 day left' : `${days} days left`;
}
