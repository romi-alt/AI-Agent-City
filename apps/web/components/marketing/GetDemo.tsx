import { DEMO_BUILDING } from './cityFacts';
import { DemoFormSlot } from './DemoFormSlot';

// The demo invitation, with the demo walkthrough beside the form.
export function GetDemo({ ttlDays }: { ttlDays: number }) {
  const steps = [
    'Tell us about your business.',
    'Confirm your email with the one-time link.',
    'Sign in with a code. No password.',
    `Meet your sample office in ${DEMO_BUILDING.name}.`,
  ];
  return (
    <section className="mk-section mk-get-demo" aria-labelledby="get-demo-title" id="get-demo" tabIndex={-1}>
      <div className="mk-container">
        <div className="mk-demo-card" data-reveal>
          <div className="mk-demo-copy" id="demo-walkthrough">
            <p className="mk-eyebrow">Free demo</p>
            <h2 id="get-demo-title" className="mk-h2">
              Get your demo office.
            </h2>
            <p className="mk-lead">A private sample office with an AI team already at work.</p>
            <ol className="mk-demo-steps">
              {steps.map((s, i) => (
                <li key={s}>
                  <span aria-hidden="true">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
            <p className="mk-footnote">
              Lasts {ttlDays} days, then it is removed. Everything inside is Sample or Simulated, and demo agents
              can&rsquo;t contact anyone.
            </p>
          </div>
          <div className="mk-demo-form">
            <DemoFormSlot />
          </div>
        </div>
      </div>
    </section>
  );
}
