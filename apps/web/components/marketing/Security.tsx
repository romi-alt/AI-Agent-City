import { LITE_DEMO } from '../../lib/preview';
import { Icon, SectionHead } from './Primitives';

// True of the platform today (M02 tenancy and RLS, M03 identity, X01 demo isolation), except where it says
// "designed so": live sending and its approval queue arrive with the agent runtime.
const POINTS = [
  {
    icon: 'check',
    title: 'People make the decisions',
    text: LITE_DEMO
      ? 'The product is designed around reviewing AI-prepared work. The demo sends nothing to customers.'
      : 'The product is designed around reviewing AI-prepared work. Demo sends are refused by the database.',
  },
  {
    icon: 'shield',
    title: 'Separate workspaces',
    text: LITE_DEMO
      ? 'Access to your demo office is tied to your verified session.'
      : 'Each organisation’s work is kept apart inside the database.',
  },
  {
    icon: 'key',
    title: 'Email-link access',
    text: LITE_DEMO
      ? 'Enter through a one-time email link, with no password to create.'
      : 'Email codes, passkeys or agency single sign-on, with sessions tied to your device.',
  },
  {
    icon: 'users',
    title: 'Access by role',
    text: 'The platform separates owner, staff, client administrator and viewer permissions. Viewers can’t change anything.',
  },
  {
    icon: 'log',
    title: 'Recorded activity',
    text: LITE_DEMO
      ? 'The platform is built around an append-only audit log. This single-visitor sample office does not include it.'
      : 'Entries can be added, never changed or deleted.',
  },
] as const;

export function Security() {
  return (
    <section className="mk-section mk-dark" aria-labelledby="security-title" id="security">
      <div className="mk-container mk-security-grid">
        <SectionHead
          id="security-title"
          eyebrow="Security and control"
          title="Clear responsibilities. Visible control."
          lead="Understand who can access the work, what needs approval and how the demo behaves. AgentCity holds no security certification today, and we don’t imply one."
        />
        <ul className="mk-security">
          {POINTS.map(p => (
            <li key={p.title} data-reveal>
              <Icon name={p.icon} />
              <h3 className="mk-h3">{p.title}</h3>
              <p className="mk-body">{p.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
