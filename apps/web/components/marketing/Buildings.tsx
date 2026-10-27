import { CITY_FACTS, DEALERSHIP_DIRECTORY, DEMO_BUILDING, TRAINING_DIRECTORY, TRAINING_NAME } from './cityFacts';
import { CtaLink, SectionHead, Tag } from './Primitives';

// "Explore buildings and AI teams" and "visual office previews", merged into the page's one navy band: a real lobby
// directory from the public layout next to an illustrated office floor.

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
      <rect x="0" y="0" width="640" height="420" className="plan-bg" />
      <rect x="0" y="0" width="640" height="420" fill="url(#plan-grid)" />
      <rect x="40" y="40" width="560" height="340" className="plan-floor" />
      <path d="M60 40 H580 M40 60 V360" className="plan-glass" />
      <rect x="40" y="40" width="560" height="340" className="plan-wall" />
      <path d="M530 40 V210 H600" className="plan-wall-in" />
      <rect x="548" y="90" width="34" height="70" rx="17" className="plan-furniture" />
      <path d="M530 380 V290 H600" className="plan-wall-in" />
      <rect x="548" y="316" width="36" height="20" className="plan-desk plan-desk-human" />
      <circle cx="80" cy="340" r="16" className="plan-plant" />
      <circle cx="500" cy="64" r="12" className="plan-plant" />
      <text x="566" y="360" className="plan-small" textAnchor="middle">
        OWNER
      </text>
      <text x="565" y="70" className="plan-small" textAnchor="middle">
        MEETING
      </text>
      <path d="M360 380 A40 40 0 0 1 400 340 V380" className="plan-thin" />
      {DESKS.map(d => (
        <g key={d.name} className={`plan-agent plan-${d.tone}`}>
          <rect x={d.x - 44} y={d.y - 18} width={88} height={36} rx={3} className="plan-desk" />
          <rect x={d.x - 14} y={d.y - 12} width={28} height={4} className="plan-monitor" />
          <circle cx={d.x} cy={d.y + 34} r={12} className="plan-seat" />
          <text x={d.x} y={d.y + 38} className="plan-initial" textAnchor="middle">
            {d.name[0]}
          </text>
          <g transform={`translate(${d.x - 62} ${d.y - 70})`}>
            <rect width="124" height="40" rx="4" className="plan-bubble" />
            <text x="10" y="17" className="plan-name">
              {d.name} · {d.role}
            </text>
            <text x="10" y="32" className="plan-note">
              {d.note}
            </text>
          </g>
        </g>
      ))}
      <text x="40" y="408" className="plan-small">
        SAMPLE OFFICE · ILLUSTRATION
      </text>
    </svg>
  );
}

export function Buildings() {
  const departments = DEALERSHIP_DIRECTORY.filter(r => r.agents.length > 0).map(r => r.name.replace(/ Dept\.$/, ''));
  const agentsOnTraining = TRAINING_DIRECTORY.reduce((n, r) => n + r.agents.length, 0);
  return (
    <section className="mk-section mk-buildings on-dark" aria-labelledby="buildings-title" id="buildings">
      <div className="mk-container">
        <SectionHead
          index="02"
          label="Explore buildings and AI teams"
          id="buildings-title"
          align="split"
          title={
            <>
              Walk into any building. <em>Meet the team.</em>
            </>
          }
          lead={`Real lobby directories from the public city: ${CITY_FACTS.buildings} buildings and ${CITY_FACTS.aiDesks} AI agent desks. Open a floor and every agent shows its role, its status and what needs you.`}
        />
        <div className="mk-explore">
          <figure className="mk-board">
            <figcaption className="mk-board-head">
              <span className="mk-board-kicker">Lobby directory · {agentsOnTraining} AI agents</span>
              <span className="mk-board-title">{TRAINING_NAME}</span>
            </figcaption>
            <ol className="mk-board-rows">
              {TRAINING_DIRECTORY.map(r => (
                <li key={r.level} className={r.agents.length === 0 && r.people === 0 ? 'is-empty' : undefined}>
                  <span className="mk-board-level">L{r.level}</span>
                  <span className="mk-board-name">{r.name}</span>
                  {r.agents.length > 0 && (
                    <span className="mk-board-agents">
                      {r.agents
                        .map(a => a.name)
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </figure>
          <div className="mk-explore-right">
            <figure className="mk-office-figure">
              <Plan />
              <figcaption className="mk-office-caption">
                <Tag tone="sample">Illustration</Tag>
                <span className="mk-legend">
                  <span>
                    <i className="mk-dot mk-dot-gold" /> Ready
                  </span>
                  <span>
                    <i className="mk-dot mk-dot-sky" /> Working
                  </span>
                  <span>
                    <i className="mk-dot mk-dot-coral" /> Waiting for your OK
                  </span>
                  <span>
                    <i className="mk-dot mk-dot-idle" /> Between tasks
                  </span>
                </span>
              </figcaption>
            </figure>
            <div className="mk-mini-cards">
              <div className="mk-mini">
                <p className="mk-board-kicker">{CITY_FACTS.dealerships} dealership towers</p>
                <p>
                  A floor per department: {departments.slice(0, 5).join(', ')} and more. Sales associates can have a
                  floor of their own.
                </p>
              </div>
              <div className="mk-mini mk-mini-gold">
                <p className="mk-board-kicker">{DEMO_BUILDING.name}</p>
                <p>Where your demo office opens, on one of its {DEMO_BUILDING.floors.length} floors.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mk-buildings-foot">
          <p>Agent names are AI personas. People&rsquo;s desks in the public city are anonymous.</p>
          <CtaLink href="/city" variant="ghost" testId="buildings-cta-city">
            Walk the streets yourself
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
