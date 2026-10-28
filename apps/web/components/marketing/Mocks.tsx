import { TRAINING_DIRECTORY, TRAINING_NAME } from './cityFacts';
import { Icon, Tag } from './Primitives';

// Monochrome product mocks, drawn as real UI (not illustrations). Every one is labelled "Sample": the data is made
// up for the picture, and agent names are the AI personas of the public city layout.

const STATUS: Record<string, { label: string; tone: 'busy' | 'wait' | 'idle' | 'done' }> = {
  CEO: { label: 'Daily report ready', tone: 'done' },
  closer: { label: 'Booking a call', tone: 'busy' },
  'follow-up': { label: 'Awaiting review', tone: 'wait' },
  content: { label: 'Planning week 2', tone: 'busy' },
  ads: { label: 'Between tasks', tone: 'idle' },
  students: { label: 'Class reminders', tone: 'busy' },
  'dealer partnerships': { label: 'Between tasks', tone: 'idle' },
};

function MockFrame({ title, meta, children }: { title: string; meta: string; children: React.ReactNode }) {
  return (
    <figure className="mk-mock" aria-label={`Example screen: ${title} (sample data)`}>
      <div className="mk-mock-bar">
        <span className="mk-mock-title">{title}</span>
        <span className="mk-mock-meta">
          <span className="mk-mock-meta-text">{meta}</span> <Tag>Sample</Tag>
        </span>
      </div>
      <div className="mk-mock-body">{children}</div>
    </figure>
  );
}

/** The agents on the Training Center's top floor, from the public layout. */
export function AgentDeskMock() {
  const top = TRAINING_DIRECTORY[0];
  const agents = (top?.agents ?? []).filter(a => a.name).slice(0, 6);
  return (
    <MockFrame title={`L${top?.level ?? 12} · ${top?.name ?? 'Admin / CEO'}`} meta={TRAINING_NAME}>
      <ul className="mk-agents">
        {agents.map(a => {
          const s = STATUS[a.role] ?? { label: 'Working', tone: 'busy' as const };
          return (
            <li key={a.name}>
              <span className="mk-avatar" aria-hidden="true">
                {a.name![0]}
              </span>
              <span className="mk-agent-name">
                {a.name}
                <span className="mk-agent-role">{a.role === 'CEO' ? 'CEO' : a.role}</span>
              </span>
              <span className={`mk-status mk-status-${s.tone}`}>
                <span className="mk-status-dot" aria-hidden="true" />
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>
    </MockFrame>
  );
}

const TASKS = [
  { done: true, title: 'Draft a reply to a new website inquiry', who: 'Vera', when: '09:12' },
  { done: true, title: 'Plan next week’s content', who: 'Luna', when: '10:40' },
  { done: false, title: 'Follow up: prospect asked for more time', who: 'Nico', when: 'Needs you' },
  { done: false, title: 'Service reminder awaiting review', who: 'Nico', when: '15:00' },
  { done: false, title: 'Daily report: decisions to review', who: 'Max', when: '18:00' },
];

export function TaskListMock() {
  return (
    <MockFrame title="Today" meta="5 tasks">
      <ul className="mk-tasks">
        {TASKS.map(t => (
          <li key={t.title} className={t.done ? 'is-done' : undefined}>
            <span className="mk-check" aria-hidden="true">
              {t.done && <Icon name="check" />}
            </span>
            <span className="mk-task-title">
              {t.title}
              <span className="mk-task-who">{t.who}</span>
            </span>
            <span className={`mk-task-when${t.when === 'Needs you' ? ' is-wait' : ''}`}>{t.when}</span>
          </li>
        ))}
      </ul>
    </MockFrame>
  );
}

export function ApprovalMock() {
  return (
    <MockFrame title="Approval" meta="Nico · Follow-up">
      <div className="mk-approval">
        <p className="mk-approval-to">Sample draft · To Alex · Text message</p>
        <p className="mk-approval-msg">
          Hi Alex, following up on the vehicle you asked about. Would you like us to confirm availability or answer any
          questions before your next visit?
        </p>
        <div className="mk-approval-foot">
          <span className="mk-status mk-status-wait">
            <span className="mk-status-dot" aria-hidden="true" />
            Awaiting review
          </span>
          <span className="mk-approval-btns" aria-hidden="true">
            <span className="mk-fake-btn is-quiet">Request change</span>
            <span className="mk-fake-btn">Approve</span>
          </span>
        </div>
      </div>
    </MockFrame>
  );
}
