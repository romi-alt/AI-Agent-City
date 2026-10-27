import { SectionHead, Tag } from './Primitives';

// A floor plan of a sample office, drawn like an architect's plan: walls, glazing, desks and the agents at them.
// Names and roles are the AI personas of the Training Center's top floor in the public city.
const DESKS = [
  { x: 150, y: 120, name: 'Max', role: 'CEO', note: 'Daily report ready', tone: 'gold' },
  { x: 300, y: 120, name: 'Vera', role: 'Closer', note: 'Booking a call', tone: 'sky' },
  { x: 450, y: 120, name: 'Nico', role: 'Follow-up', note: 'Waiting for your OK', tone: 'coral' },
  { x: 150, y: 280, name: 'Luna', role: 'Content', note: 'Week 2 calendar', tone: 'sky' },
  { x: 300, y: 280, name: 'Teo', role: 'Ads', note: 'Between tasks', tone: 'idle' },
  { x: 450, y: 280, name: 'Iris', role: 'Students', note: 'Class reminders', tone: 'green' },
] as const;

function Plan() {
  return (
    <svg className="mk-plan" viewBox="0 0 640 420" role="img" aria-labelledby="plan-title plan-desc" focusable="false">
      <title id="plan-title">Illustration of a sample office floor</title>
      <desc id="plan-desc">
        A floor plan with six AI agent desks. Max, the CEO agent, has a daily report ready. Vera is booking a call. Nico
        is waiting for your approval. Luna is planning the week 2 content calendar. Teo is between tasks. Iris is
        preparing class reminders. A meeting room and the owner&rsquo;s desk sit at the right.
      </desc>
      <defs>
        <pattern id="plan-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0 H0 V20" className="plan-grid" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="640" height="420" fill="url(#plan-grid)" />
      {/* Outer wall with glazing along the top and left. */}
      <rect x="40" y="40" width="560" height="340" className="plan-wall" />
      <path d="M60 40 H580 M40 60 V360" className="plan-glass" />
      {/* Meeting room and the owner's office. */}
      <path d="M530 40 V210 H600" className="plan-wall-in" />
      <rect x="548" y="90" width="34" height="70" rx="17" className="plan-furniture" />
      <path d="M530 380 V290 H600" className="plan-wall-in" />
      <rect x="548" y="316" width="36" height="20" className="plan-desk plan-desk-human" />
      <text x="566" y="360" className="plan-small" textAnchor="middle">
        Owner
      </text>
      <text x="565" y="70" className="plan-small" textAnchor="middle">
        Meeting
      </text>
      {/* Door swing. */}
      <path d="M360 380 A40 40 0 0 1 400 340 V380" className="plan-thin" />
      {DESKS.map(d => (
        <g key={d.name} className={`plan-agent plan-${d.tone}`}>
          <rect x={d.x - 44} y={d.y - 18} width={88} height={36} className="plan-desk" />
          <circle cx={d.x} cy={d.y + 34} r={11} className="plan-seat" />
          <text x={d.x} y={d.y + 38} className="plan-initial" textAnchor="middle">
            {d.name[0]}
          </text>
          <g transform={`translate(${d.x - 58} ${d.y - 66})`}>
            <rect width="116" height="36" rx="3" className="plan-bubble" />
            <text x="10" y="15" className="plan-name">
              {d.name} · {d.role}
            </text>
            <text x="10" y="29" className="plan-note">
              {d.note}
            </text>
          </g>
        </g>
      ))}
      <text x="40" y="408" className="plan-small">
        SAMPLE OFFICE · L12 · ILLUSTRATION
      </text>
      <path d="M560 400 h40 M560 396 v8 M580 398 v4 M600 396 v8" className="plan-thin" />
    </svg>
  );
}

export function OfficePreview() {
  return (
    <section className="mk-section mk-office on-dark" aria-labelledby="office-title" id="office">
      <div className="mk-container mk-office-grid">
        <div className="mk-office-copy">
          <SectionHead
            index="04"
            label="Inside an office"
            id="office-title"
            title={
              <>
                Step off the elevator <em>and see the work.</em>
              </>
            }
          />
          <p className="mk-lead">
            Each floor is an office with a desk for every agent. Open a desk and you get the agent&rsquo;s role, what it
            is doing now, its task list and its conversations. Anything that needs a person is flagged, so the question
            is never &ldquo;what is the AI doing?&rdquo; but &ldquo;what do I need to approve?&rdquo;
          </p>
          <ul className="mk-legend">
            <li>
              <span className="mk-dot mk-dot-gold" aria-hidden="true" /> Report or result ready
            </li>
            <li>
              <span className="mk-dot mk-dot-sky" aria-hidden="true" /> Working on a task
            </li>
            <li>
              <span className="mk-dot mk-dot-coral" aria-hidden="true" /> Waiting for your OK
            </li>
            <li>
              <span className="mk-dot mk-dot-idle" aria-hidden="true" /> Between tasks
            </li>
          </ul>
          <p className="mk-note">
            <Tag tone="sample">Illustration</Tag> This drawing shows the idea. Your demo office is the real thing, with
            sample data.
          </p>
        </div>
        <div className="mk-office-figure">
          <Plan />
        </div>
      </div>
    </section>
  );
}
