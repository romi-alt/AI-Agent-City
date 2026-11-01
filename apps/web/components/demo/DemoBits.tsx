// Small pieces shared by the demo pages, built from the landing page's primitives (components/marketing): the
// "Simulated"/"Sample" tag, agent avatars, status chips, the demo page header and footer, and the conversion cards.
import { Icon } from '../marketing/Primitives';
import { PUBLIC_PREVIEW } from '../../lib/preview';
import { describeAgentStatus } from './demo-api';
import '../marketing/marketing.css';
import './demo.css';
import './demo-asc.css';

/** Every piece of sample content carries this label, so nobody mistakes it for real activity. */
export function Simulated({ label = 'Simulated' }: { label?: string }) {
  return (
    <span
      className="mk-tag"
      data-testid="simulated-label"
      title="Sample content created for this demo. Nothing was sent."
    >
      {label}
    </span>
  );
}

export function AgentAvatar({ name }: { name: string; id?: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0]!.toUpperCase())
      .join('') || 'AI';
  return (
    <span className="mk-avatar" aria-hidden="true">
      {initials}
    </span>
  );
}

/** An agent's status as the landing page shows it: a hairline chip with a dot; gold only when a person is needed. */
export function AgentStatus({ status, testId }: { status: string; testId?: string }) {
  const text = describeAgentStatus(status);
  const tone =
    text === 'Waiting for approval' ? 'wait' : text === 'Working' ? 'busy' : text === 'Available' ? 'done' : 'idle';
  return (
    <span className={`mk-status mk-status-${tone}`} data-state={text} data-testid={testId}>
      <span className="mk-status-dot" aria-hidden="true" />
      {text}
    </span>
  );
}

/** The front page's logo: the gradient AS badge and the two-tone name. */
function AscLogo({ testId }: { testId?: string }) {
  return (
    <a className="dm-asc-logo" href="/" aria-label="AutoSalesCity home" data-testid={testId}>
      <span className="dm-asc-mark" aria-hidden="true">
        <span>AS</span>
      </span>
      <span>
        AutoSales<b>City</b>
      </span>
    </a>
  );
}

/** Header for the public demo pages: the landing page's wordmark, no section navigation. */
export function DemoHeader() {
  return (
    <header className="mk-header dm-header">
      <div className="mk-header-inner">
        <AscLogo testId="demo-home-link" />
        <div className="mk-header-actions">
          <a className="mk-header-link" href="/city">
            Explore the city
          </a>
          {!PUBLIC_PREVIEW && (
            <a className="mk-header-link" href="/signin">
              Sign in
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

export function DemoFooter() {
  return (
    <footer className="dm-foot">
      <div className="mk-container">
        <div className="mk-footer-base">
          <AscLogo />
          <p className="mk-footer-note">Demo offices use sample data. Demo agents never contact anyone.</p>
        </div>
      </div>
    </footer>
  );
}

/**
 * Where the conversion links go. Placeholders until sales contact and booking are wired by the integrator; kept in one
 * place so that is a one-line change.
 */
export const DEMO_CTA_LINKS = {
  consultation: '/#contact',
  customOffice: '/#contact',
  contactSales: '/#contact',
  capabilities: '/#product',
} as const;

const CTAS: { key: keyof typeof DEMO_CTA_LINKS; title: string; text: string; go: string }[] = [
  {
    key: 'consultation',
    title: 'Book a consultation',
    text: 'A 30-minute call about your sales process.',
    go: 'Find a time',
  },
  {
    key: 'customOffice',
    title: 'Request a custom office',
    text: 'Your products, your tone, your approval rules.',
    go: 'Tell us more',
  },
  {
    key: 'contactSales',
    title: 'Talk to sales',
    text: 'Pricing, security or rollout questions.',
    go: 'Contact sales',
  },
  {
    key: 'capabilities',
    title: 'Explore capabilities',
    text: 'What agents do, and what stays with people.',
    go: 'See the product',
  },
];

/** Calm, inline next steps: no popups, no countdowns. */
export function ConversionCards({
  only,
  testId = 'demo-ctas',
}: {
  only?: (keyof typeof DEMO_CTA_LINKS)[];
  testId?: string;
}) {
  const shown = only ? CTAS.filter(c => only.includes(c.key)) : CTAS;
  return (
    <div className="dm-cta-grid" data-testid={testId}>
      {shown.map(c => (
        <a key={c.key} className="dm-cta" href={DEMO_CTA_LINKS[c.key]} data-testid={`demo-cta-${c.key}`}>
          <strong>{c.title}</strong>
          <span>{c.text}</span>
          <span className="dm-cta-go">
            {c.go}
            <Icon name="arrow" />
          </span>
        </a>
      ))}
    </div>
  );
}

/** A small icon in the landing page's hairline box. */
export function MailIcon() {
  return (
    <span className="dm-icon-box" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    </span>
  );
}

export function CheckIcon() {
  return (
    <span className="dm-icon-box" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 2.8 2.7L16 9.5" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
