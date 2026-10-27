import type { ReactNode } from 'react';
import { AgentDeskMock, ApprovalMock, TaskListMock } from './Mocks';
import { Icon, Tag } from './Primitives';

// Product rows: explore buildings and AI teams, agent capabilities (from the source task documents), and control.
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
    eyebrow: 'Buildings and AI teams',
    title: 'Walk into a floor. Meet the team.',
    text: 'Every agent has a desk, a role and a status, so you always know who is on what.',
    points: ['Real floor plans from the public city', 'Agents beside the people they help', 'Status at a glance'],
    mock: <AgentDeskMock />,
  },
  {
    key: 'work',
    eyebrow: 'What agents do',
    title: 'Follow-up, content, scheduling, reports.',
    text: 'Agents work your customers by email, phone and text, plan a month of social content and end each day with a report.',
    points: [
      'Prospects, sold customers, birthdays, lease ends, service visits',
      'Strategy, 30-day calendar, captions and briefs',
      'A daily report with what needs your decision',
    ],
    note: (
      <>
        <Tag tone="roadmap">Roadmap</Tag> Sending from your own accounts, social publishing and calendar booking.
      </>
    ),
    mock: <TaskListMock />,
  },
  {
    key: 'control',
    eyebrow: 'Control',
    title: 'Nothing goes out without you.',
    text: 'AgentCity is designed so agents draft and people approve; in a demo, the database refuses every send.',
    points: ['Clear yes or no on every message', 'Edit before it goes', 'Demo agents can’t contact anyone'],
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
