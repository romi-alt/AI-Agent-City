import { DEMO_BUILDING } from './cityFacts';
import { DemoFormSlot } from './DemoFormSlot';

// The demo invitation and the demo walkthrough, side by side: what happens after you press the button sits right
// next to the form.
export function GetDemo({ ttlDays }: { ttlDays: number }) {
  const steps = [
    ['Tell us about your business', 'Name, business email and company. The rest is optional.'],
    ['Confirm your email', 'Click the one-time link we send you.'],
    ['Sign in with a code', 'No password to create; add a passkey later if you like.'],
    ['Meet your office', `A sample office for your company opens in ${DEMO_BUILDING.name}.`],
    ['Look around', 'Fly in from the skyline, open each desk, explore the city.'],
  ];
  return (
    <section className="mk-section mk-get-demo on-light" aria-labelledby="get-demo-title" id="get-demo" tabIndex={-1}>
      <div className="mk-container mk-get-demo-grid">
        <div className="mk-get-demo-copy">
          <p className="mk-label">
            <span className="mk-label-index">06</span>Your invitation
          </p>
          <h2 id="get-demo-title" className="mk-h2 mk-get-demo-title">
            Get your free <em>demo office.</em>
          </h2>
          <ol className="mk-steps" aria-label="What happens next" id="demo-walkthrough">
            {steps.map(([title, text], i) => (
              <li key={title}>
                <span className="mk-step-dot" aria-hidden="true">
                  {i + 1}
                </span>
                <p>
                  <strong>{title}.</strong> {text}
                </p>
              </li>
            ))}
          </ol>
          <p className="mk-get-demo-note">
            {ttlDays} days, then access ends and the sample office is removed. Everything inside is labelled Sample or
            Simulated, and demo agents can&rsquo;t contact anyone.
          </p>
        </div>
        <div className="mk-get-demo-form">
          <DemoFormSlot />
        </div>
      </div>
    </section>
  );
}
