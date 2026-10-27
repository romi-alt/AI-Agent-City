// Small pieces shared by the demo pages: the "Simulated" label, agent avatars, the calm conversion cards and the
// decorative skyline on the welcome page.
import './demo.css';

/** Every piece of sample content carries this label, so nobody mistakes it for real activity. */
export function Simulated({ label = 'Simulated' }: { label?: string }) {
  return (
    <span
      className="dm-sim"
      data-testid="simulated-label"
      title="Sample content created for this demo. Nothing was sent."
    >
      {label}
    </span>
  );
}

const AVATAR_COLOURS = ['#1f8a8a', '#3b6ea8', '#c45f43', '#5b9a5b', '#8a5aa8', '#b8862a'];

export function AgentAvatar({ name, id }: { name: string; id: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0]!.toUpperCase())
      .join('') || 'AI';
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className="dm-avatar" aria-hidden="true" style={{ background: AVATAR_COLOURS[hash % AVATAR_COLOURS.length] }}>
      {initials}
    </span>
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
  capabilities: '/#capabilities',
} as const;

const CTAS: { key: keyof typeof DEMO_CTA_LINKS; title: string; text: string; go: string }[] = [
  {
    key: 'consultation',
    title: 'Book a consultation',
    text: 'A 30-minute call to map your sales process onto an AI office.',
    go: 'Find a time',
  },
  {
    key: 'customOffice',
    title: 'Request a customised office',
    text: 'Agents set up with your products, your tone of voice and your approval rules.',
    go: 'Tell us what you need',
  },
  {
    key: 'contactSales',
    title: 'Talk to sales',
    text: 'Questions about pricing, security or rollout? We’re happy to help.',
    go: 'Contact sales',
  },
  {
    key: 'capabilities',
    title: 'Explore capabilities',
    text: 'See everything AgentCity agents can do, and what stays with people.',
    go: 'See capabilities',
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
          <span className="dm-cta-go" aria-hidden="true">
            {c.go} →
          </span>
        </a>
      ))}
    </div>
  );
}

// Heights and widths of the decorative skyline (percent of the hero); the fifth tower is "yours".
const TOWERS = [
  [2, 7, 38],
  [10, 6, 55],
  [17, 8, 46],
  [26, 5, 70],
  [33, 9, 62],
  [44, 6, 82],
  [52, 8, 50],
  [62, 5, 66],
  [69, 9, 44],
  [80, 6, 74],
  [88, 8, 52],
] as const;

export function Skyline({ highlight = 4 }: { highlight?: number }) {
  return (
    <div className="dm-skyline" aria-hidden="true">
      {TOWERS.map(([left, width, height], i) => (
        <span
          key={i}
          className={i === highlight ? 'dm-you' : undefined}
          style={{ left: `${left}%`, width: `${width}%`, height: `${height}%` }}
        />
      ))}
    </div>
  );
}
