import type { ReactNode } from 'react';

/** Section heading: a small eyebrow, the h2 and one sentence. */
export function SectionHead({
  id,
  eyebrow,
  title,
  lead,
  center,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  center?: boolean;
}) {
  return (
    <header className={`mk-head${center ? ' is-center' : ''}`} data-reveal>
      <p className="mk-eyebrow">{eyebrow}</p>
      <h2 id={id} className="mk-h2">
        {title}
      </h2>
      {lead && <p className="mk-lead">{lead}</p>}
    </header>
  );
}

/** A link styled as a button: `primary` is the gold call to action, `secondary` is white with a hairline. */
export function CtaLink({
  href,
  children,
  variant = 'primary',
  size = 'md',
  testId,
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'dark';
  size?: 'sm' | 'md';
  testId?: string;
}) {
  return (
    <a href={href} className={`mk-btn mk-btn-${variant} mk-btn-${size}`} data-testid={testId}>
      {children}
      <Icon name="arrow" className="mk-btn-arrow" />
    </a>
  );
}

/** Honesty labels: "Sample", "Simulated", "Roadmap", "Illustration". */
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'roadmap' | 'live' }) {
  return <span className={`mk-tag mk-tag-${tone}`}>{children}</span>;
}

/** The AgentCity mark: three setback towers. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2" y="11" width="5.5" height="11" rx="1" fill="currentColor" />
      <rect x="9.25" y="4" width="5.5" height="18" rx="1" fill="currentColor" />
      <rect x="16.5" y="8" width="5.5" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}

const PATHS: Record<string, ReactNode> = {
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  city: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V10l4-2v13" />
      <path d="M9 21V4l6 3v14" />
      <path d="M15 21v-9l4 2v7" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" />
    </>
  ),
  desk: (
    <>
      <rect x="4" y="4" width="16" height="11" rx="1.5" />
      <path d="M12 15v4M8 19h8" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  shield: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 018 0v3" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M17 6l2 2M15 8l2 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
      <path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c1.8.7 3 2.5 3.5 5.2" />
    </>
  ),
  log: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  pause: <path d="M9 6v12M15 6v12" />,
  play: <path d="M8 5.5v13l10-6.5-10-6.5z" />,
};

/** Stroke icons in one style: 24px grid, 1.6px stroke, round joins. */
export function Icon({ name, className }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg
      className={`mk-icon ${className ?? ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
