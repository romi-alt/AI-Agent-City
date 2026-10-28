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
    eyebrow: 'Team visibility',
    title: 'Know who owns the next move.',
    text: 'See the team’s work without chasing separate updates. Each agent has a defined role, a visible status and a place to review its tasks.',
    points: [
      'See responsibility at a glance.',
      'Find work waiting for your input.',
      'Review daily priorities in one place.',
    ],
    mock: <AgentDeskMock />,
  },
  {
    key: 'work',
    eyebrow: 'Practical workflows',
    title: 'Put the next customer conversation in view.',
    text: 'A new inquiry, a customer considering their options, a lease approaching its end: each creates work worth tracking. Explore how an AI team can organize that work and prepare the next step for review.',
    points: [
      'Draft responses to new website inquiries and follow-ups for prospects who need more time.',
      'Service reminders and a daily report that highlights your decisions.',
      'Give your content a clear purpose: review ideas, captions and campaign plans that invite the next inquiry.',
    ],
    note: (
      <>
        <Tag tone="roadmap">Roadmap</Tag> Sending through connected business accounts, social publishing and calendar
        booking.
      </>
    ),
    mock: <TaskListMock />,
  },
  {
    key: 'control',
    eyebrow: 'Approvals',
    title: 'Your team prepares. You decide.',
    text: 'See the draft and the reason behind it before choosing the next step. Review the wording, request a change or approve the work.',
    points: [
      'Clear requests for your attention.',
      'Drafts you can inspect before a decision.',
      'Visible status for work awaiting review.',
    ],
    note: 'Demo agents cannot send messages or contact customers.',
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
