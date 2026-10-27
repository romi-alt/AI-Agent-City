import { SectionHead } from './Primitives';

// Each point is true of the platform today (M02 tenancy and RLS, M03 identity, X01 demo isolation), except where the
// wording says "designed so": live sending and its approval queue arrive with the agent runtime.
const POINTS = [
  {
    title: 'A person decides what goes out',
    text: 'AgentCity is designed so agents draft and people approve: anything risky or outside your rules waits for a person. In a demo, sending is impossible. The database itself refuses messages, receipts and payments for demo accounts.',
  },
  {
    title: 'Your data is sealed off',
    text: 'Every record carries the organisation it belongs to, and PostgreSQL row-level security enforces that boundary inside the database, not only in the app. Each demo gets an account of its own.',
  },
  {
    title: 'No passwords to steal',
    text: 'Sign in with a one-time email code or a passkey; agencies can use single sign-on. Sessions are tied to the device you signed in on, and sensitive changes ask for your passkey again.',
  },
  {
    title: 'Roles, not shared logins',
    text: 'Agency owners, agency staff, client admins and client viewers each get their own access. Viewers can look but not change anything.',
  },
  {
    title: 'A record that can’t be rewritten',
    text: 'Important actions go into an append-only audit log: the application can add entries, never change or delete them.',
  },
];

export function Security() {
  return (
    <section className="mk-section mk-security on-teal" aria-labelledby="security-title" id="security">
      <div className="mk-container mk-security-grid">
        <div>
          <SectionHead
            index="07"
            label="Security and control"
            id="security-title"
            title={
              <>
                You stay in charge <em>of your city.</em>
              </>
            }
          />
          <p className="mk-lead">
            AI that works for your customers has to be trusted with them. These protections are built in, not bolted on.
          </p>
          <p className="mk-note">
            AgentCity does not hold a security certification today, and we won&rsquo;t imply one.
          </p>
        </div>
        <ol className="mk-security-list">
          {POINTS.map((p, i) => (
            <li key={p.title}>
              <span className="mk-security-num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mk-h3">{p.title}</h3>
              <p>{p.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
