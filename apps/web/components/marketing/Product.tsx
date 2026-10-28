import type { ReactNode } from 'react';
import { AgentDeskMock, ApprovalMock, TaskListMock } from './Mocks';
import { Icon, Tag } from './Primitives';

// Product rows: team visibility, practical workflows (sample data), and approvals.
const ROWS: {
  key: string;
  eyebrow: string;
  title: string;
  text: string;
  points: string[];
  note?: ReactNode;
  mock: ReactNode;
}[] = [
  {
    key: 'teams',
    eyebrow: 'Meet your AI team',
    title: 'Clear roles. Shared priorities.',
    text: 'Explore a team organized around the work that keeps your business moving: sales conversations, follow-up, content, customer care and partnerships. Max brings the priorities together so you can see where your attention matters.',
    points: [
      'See who is responsible for each task.',
      'Review progress without chasing updates.',
      'Bring questions and approvals into one place.',
    ],
    mock: <AgentDeskMock />,
  },
  {
    key: 'work',
    eyebrow: 'From interest to the next step',
    title: 'Keep good opportunities moving.',
    text: 'A new inquiry needs a reply. An undecided buyer needs a thoughtful follow-up. A future student needs a clear path to enrollment. Bring those moments into view so your team can prepare the next step.',
    points: [
      'Prepare relevant replies and follow-up drafts.',
      'Organize customer questions and class reminders.',
      'Plan content that gives people a reason to get in touch.',
    ],
    note: (
      <>
        <Tag tone="roadmap">Roadmap</Tag> Planned integrations: connected messaging, CRM workflows, social publishing
        and calendar booking. Availability is confirmed during setup.
      </>
    ),
    mock: <TaskListMock />,
  },
  {
    key: 'control',
    eyebrow: 'You stay in control',
    title: 'Your team prepares. You make the call.',
    text: 'Review the draft, understand the context and decide what happens next. Keep your judgment close to the work, especially when a message, offer or campaign needs your approval.',
    points: [
      'Inspect prepared work before approving it.',
      'Request changes when the details need attention.',
      'See which decisions are still waiting.',
    ],
    note: 'Demo approvals are simulated and do not send messages.',
    mock: <ApprovalMock />,
  },
];

export function Product() {
  return (
    <section className="mk-section mk-product" aria-labelledby="product-title" id="product">
      <div className="mk-container">
        <h2 id="product-title" className="sr-only">
          Product
        </h2>
        <div className="mk-rows">
          {ROWS.map((r, i) => (
            <article key={r.key} className={`mk-row${i % 2 ? ' is-flipped' : ''}`} aria-labelledby={`row-${r.key}`}>
              <div className="mk-row-copy" data-reveal>
                <p className="mk-eyebrow">{r.eyebrow}</p>
                <h3 id={`row-${r.key}`} className="mk-row-title">
                  {r.title}
                </h3>
                <p className="mk-lead">{r.text}</p>
                <ul className="mk-points">
                  {r.points.map(p => (
                    <li key={p}>
                      <Icon name="check" />
                      {p}
                    </li>
                  ))}
                </ul>
                {r.note && <p className="mk-note">{r.note}</p>}
              </div>
              <div className="mk-row-visual" data-reveal>
                {r.mock}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
