import { LITE_DEMO } from '../../lib/preview';
import { Icon, SectionHead } from './Primitives';

// True of the platform today (M02 tenancy and RLS, M03 identity, X01 demo isolation), except where it says
// "designed so": live sending and its approval queue arrive with the agent runtime.
const POINTS = [
  {
    icon: 'check',
    title: 'People approve',
    text: LITE_DEMO
      ? 'Designed so agents draft and people decide. The demo office is simulated: nothing is sent to anyone.'
      : 'Designed so agents draft and people decide. Demo sends are refused by the database.',
  },
  {
    icon: 'shield',
    title: 'Data sealed per client',
    text: LITE_DEMO
      ? 'Each demo office is tied to the verified visitor’s session and nothing else can read it. The full platform separates every organisation with database row-level security.'
      : 'PostgreSQL row-level security separates every organisation inside the database.',
  },
  {
    icon: 'key',
    title: 'No passwords',
    text: LITE_DEMO
      ? 'The demo uses a one-time link sent to your email. There is no password to create or leak.'
      : 'Email codes, passkeys or agency single sign-on, with sessions tied to your device.',
  },
  {
    icon: 'users',
    title: 'Roles, not shared logins',
    text: 'Agency owner, staff, client admin and viewer. Viewers can’t change anything.',
  },
  { icon: 'log', title: 'Append-only audit log', text: 'Entries can be added, never changed or deleted.' },
] as const;

export function Security() {
  return (
    <section className="mk-section mk-dark" aria-labelledby="security-title" id="security">
      <div className="mk-container mk-security-grid">
        <SectionHead
          id="security-title"
          eyebrow="Security and control"
          title="You stay in charge."
          lead="Built in from the start. AgentCity holds no security certification today, and we don’t imply one."
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
