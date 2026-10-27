import { SectionHead } from './Primitives';

// Each point is true of the platform today (M02 tenancy and RLS, M03 identity, X01 demo isolation), except where the
// wording says "designed so": live sending and its approval queue arrive with the agent runtime.
const POINTS = [
  {
    title: 'A person decides what goes out',
    text: 'Designed so agents draft and people approve. In a demo, the database refuses every send.',
  },
  {
    title: 'Your data is sealed off',
    text: 'PostgreSQL row-level security keeps each organisation’s records apart inside the database.',
  },
  {
    title: 'No passwords to steal',
    text: 'Email codes, passkeys or agency single sign-on; sessions tied to your device.',
  },
  {
    title: 'Roles, not shared logins',
    text: 'Agency owner, staff, client admin and viewer; viewers can’t change anything.',
  },
  {
    title: 'An audit log that can’t be rewritten',
    text: 'Entries can be added, never changed or deleted.',
  },
];

export function Security() {
  return (
    <section className="mk-section mk-security on-teal" aria-labelledby="security-title" id="security">
      <div className="mk-container">
        <SectionHead
          index="05"
          label="Security and control"
          id="security-title"
          align="split"
          title={
            <>
              You stay in charge <em>of your city.</em>
            </>
          }
          lead="Built in, not bolted on. AgentCity does not hold a security certification today, and we won’t imply one."
        />
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
