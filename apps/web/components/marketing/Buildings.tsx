import {
  ASSOCIATE_FLOOR,
  CITY_FACTS,
  DEALERSHIP_DIRECTORY,
  DEMO_BUILDING,
  RENTAL_DIRECTORY,
  TRAINING_DIRECTORY,
  TRAINING_NAME,
  type DirectoryRow,
} from './cityFacts';
import { CtaLink, SectionHead } from './Primitives';

/** A lobby directory board: floor numbers on the left, the floor's team on the right. */
function Board({
  title,
  kicker,
  rows,
  showAgents,
  className,
  compact,
  foot,
  showInfo,
}: {
  title: string;
  kicker: string;
  rows: DirectoryRow[];
  showAgents?: boolean;
  className?: string;
  compact?: boolean;
  foot?: string;
  showInfo?: boolean;
}) {
  return (
    <figure className={`mk-board ${className ?? ''}`}>
      <figcaption className="mk-board-head">
        <span className="mk-board-kicker">{kicker}</span>
        <span className="mk-board-title">{title}</span>
      </figcaption>
      <ol className={`mk-board-rows ${compact ? 'is-compact' : ''}`}>
        {rows.map(r => {
          const empty = r.agents.length === 0 && r.people === 0;
          return (
            <li key={r.level} className={empty ? 'is-empty' : undefined}>
              <span className="mk-board-level">L{r.level}</span>
              <span className="mk-board-name">
                {r.name}
                {showInfo && r.info && <span className="mk-board-info">{r.info.replace(/\.$/, '')}</span>}
              </span>
              {showAgents && r.agents.length > 0 && (
                <span className="mk-board-agents">
                  {r.agents
                    .map(a => a.name)
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {foot && <p className="mk-board-foot">{foot}</p>}
    </figure>
  );
}

export function Buildings() {
  const dealershipFloors = DEALERSHIP_DIRECTORY.filter(r => r.agents.length > 0);
  const emptyTraining = TRAINING_DIRECTORY.filter(r => r.agents.length === 0 && r.people === 0).length;
  const agentsOnTraining = TRAINING_DIRECTORY.reduce((n, r) => n + r.agents.length, 0);
  return (
    <section className="mk-section mk-buildings on-dark" aria-labelledby="buildings-title" id="buildings">
      <div className="mk-container">
        <SectionHead
          index="03"
          label="Explore buildings and AI teams"
          id="buildings-title"
          align="split"
          title={
            <>
              Every building has <em>a directory.</em>
            </>
          }
          lead={`Walk into any lobby and the board tells you who works where. These are the real directories of the public city: ${CITY_FACTS.buildings} buildings, ${CITY_FACTS.floors} floors and ${CITY_FACTS.aiDesks} AI agent desks.`}
        />
        <div className="mk-boards">
          <Board
            className="mk-board-feature"
            kicker={`Training centre · ${agentsOnTraining} AI agents`}
            title={TRAINING_NAME}
            rows={TRAINING_DIRECTORY}
            showAgents
            showInfo
            foot={`Lobby directory · ${emptyTraining} floors not yet occupied`}
          />
          <div className="mk-boards-side">
            <Board
              kicker={`Dealership tower · ${CITY_FACTS.dealerships} in the city`}
              title="A floor for every department"
              rows={dealershipFloors}
              showAgents
              compact
            />
            <div className="mk-board-card">
              <p className="mk-board-kicker">Sales associates</p>
              <p className="mk-board-card-title">A floor of your own</p>
              <p>
                One salesperson, two agents: one for {ASSOCIATE_FLOOR?.agents[0]?.role ?? 'follow-up'}, one for{' '}
                {ASSOCIATE_FLOOR?.agents[1]?.role ?? 'social'} media. The person keeps the relationships; the agents
                keep up with the work.
              </p>
            </div>
            <div className="mk-board-card mk-board-card-gold">
              <p className="mk-board-kicker">{DEMO_BUILDING.name}</p>
              <p className="mk-board-card-title">Where your demo office opens</p>
              <p>
                {RENTAL_DIRECTORY.length} floors open to any business. When you request a demo, a sample office is set
                up for you on one of them.
              </p>
            </div>
          </div>
        </div>
        <div className="mk-buildings-foot">
          <p>Agent names on these boards are AI personas. People&rsquo;s desks in the public city are anonymous.</p>
          <CtaLink href="/city" variant="ghost" testId="buildings-cta-city">
            Walk the streets yourself
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
