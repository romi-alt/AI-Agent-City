import { DEMO_BUILDING } from './cityFacts';
import { DemoFormSlot } from './DemoFormSlot';

export function GetDemo({ ttlDays }: { ttlDays: number }) {
  return (
    <section className="mk-section mk-get-demo on-dark" aria-labelledby="get-demo-title" id="get-demo" tabIndex={-1}>
      <div className="mk-container mk-get-demo-grid">
        <div className="mk-get-demo-copy">
          <p className="mk-label">
            <span className="mk-label-index">09</span>Your invitation
          </p>
          <h2 id="get-demo-title" className="mk-h2 mk-get-demo-title">
            Get your free <em>demo office.</em>
          </h2>
          <p className="mk-lead">
            Tell us who you are and we&rsquo;ll open a sample office for your company in {DEMO_BUILDING.name}, with an
            AI team already at work on sample data.
          </p>
          <ul className="mk-ticks mk-ticks-gold">
            <li>A private office on its own floor</li>
            <li>An AI team with sample tasks, conversations and activity</li>
            <li>A guided arrival through the city</li>
            <li>{ttlDays} days to look around. No card, no password</li>
          </ul>
        </div>
        <div className="mk-get-demo-form">
          <DemoFormSlot />
        </div>
      </div>
    </section>
  );
}
