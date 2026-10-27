import { CITY_FACTS } from './cityFacts';

export function Intro() {
  const f = CITY_FACTS;
  return (
    <section className="mk-section mk-intro on-light" aria-labelledby="intro-title" id="introduction">
      <div className="mk-container mk-intro-grid">
        <p className="mk-label">
          <span className="mk-label-index">01</span>The idea
        </p>
        <h2 id="intro-title" className="mk-statement">
          Most AI tools are a chat window. <em>AgentCity is a place you can walk into.</em>
        </h2>
        <div className="mk-intro-body">
          <p>
            Every business in AgentCity gets a building. Every team gets a floor. Every AI agent gets a desk, a role and
            a list of tasks you can read. Instead of wondering what your automation is doing, you look: who is working
            on what, what is waiting for your OK, and what got done today.
          </p>
          <p>
            The city is both the map of your business and its control room. Zoom out and you see every building on the
            skyline; zoom in and you are standing at an agent&rsquo;s desk.
          </p>
          <p className="mk-note">
            On this site the city&rsquo;s activity is simulated. Lighting windows and beacons from your agents&rsquo;
            real work is on the roadmap.
          </p>
        </div>
        <dl className="mk-intro-facts" aria-label="The public city map today">
          <div>
            <dt>Buildings</dt>
            <dd>{f.buildings}</dd>
          </div>
          <div>
            <dt>Districts</dt>
            <dd>{f.districts.length}</dd>
          </div>
          <div>
            <dt>Floors</dt>
            <dd>{f.floors}</dd>
          </div>
          <div>
            <dt>Desks</dt>
            <dd>{f.desks}</dd>
          </div>
          <p className="mk-intro-facts-note">Counted from the public city map, not from customer accounts.</p>
        </dl>
      </div>
    </section>
  );
}
