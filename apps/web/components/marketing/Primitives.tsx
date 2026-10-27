import type { ReactNode } from 'react';

/** Section opener: a numbered label, the heading (h2) and an optional lead paragraph. */
export function SectionHead({
  index,
  label,
  title,
  lead,
  id,
  align = 'start',
}: {
  index: string;
  label: string;
  title: ReactNode;
  lead?: ReactNode;
  /** id of the heading, for aria-labelledby on the section. */
  id: string;
  align?: 'start' | 'split';
}) {
  return (
    <header className={`mk-head mk-head-${align}`}>
      <p className="mk-label">
        <span className="mk-label-index">{index}</span>
        {label}
      </p>
      <h2 id={id} className="mk-h2">
        {title}
      </h2>
      {lead && <p className="mk-lead">{lead}</p>}
    </header>
  );
}

/** A link styled as a button. `primary` is the gold call to action; `ghost` sits on dark or light surfaces. */
export function CtaLink({
  href,
  children,
  variant = 'primary',
  testId,
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'text';
  testId?: string;
}) {
  return (
    <a href={href} className={`mk-cta mk-cta-${variant}`} data-testid={testId}>
      <span>{children}</span>
      <span className="mk-cta-arrow" aria-hidden="true">
        →
      </span>
    </a>
  );
}

/** A small status tag: "Sample", "Roadmap", "Simulated". */
export function Tag({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'roadmap' | 'sample' | 'wait';
}) {
  return <span className={`mk-tag mk-tag-${tone}`}>{children}</span>;
}

/** The AgentCity mark: three setback towers, the middle one crowned in gold. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="3" y="14" width="7" height="16" fill="currentColor" />
      <rect x="12.5" y="8" width="7" height="22" fill="currentColor" />
      <rect x="14.5" y="4" width="3" height="4" fill="#f5b335" />
      <rect x="15.5" y="0.5" width="1" height="3.5" fill="#f5b335" />
      <rect x="22" y="11" width="7" height="19" fill="currentColor" />
    </svg>
  );
}
