import { DEMO_BUILDING } from './cityFacts';
import { CtaLink } from './Primitives';
import { DemoRequestForm } from '../demo/DemoRequestForm';
import { LiteDemoForm } from '../demo/LiteDemoForm';
import { LITE_DEMO, PUBLIC_PREVIEW } from '../../lib/preview';

// The demo invitation, with the demo walkthrough beside the form.
export function GetDemo({ ttlDays }: { ttlDays: number }) {
  const steps = [
    'Tell us about your business.',
    'Confirm your email with the one-time link.',
    LITE_DEMO ? 'Your office opens straight away. No password.' : 'Sign in with a code. No password.',
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
              {LITE_DEMO ? 'Your demo expires automatically.' : `Lasts ${ttlDays} days, then it is removed.`} Everything
              inside is Sample or Simulated, and demo agents can&rsquo;t contact anyone.
            </p>
          </div>
          <div className="mk-demo-form">
            <DemoForm />
          </div>
        </div>
      </div>
    </section>
  );
}

// The preview has no backend to store a request, so it collects nothing and says so plainly.
function ComingSoon() {
  return (
    <div className="mk-coming-soon" data-testid="demo-coming-soon">
      <p className="mk-eyebrow">Opening soon</p>
      <p className="mk-h3">Demo offices open here shortly.</p>
      <p className="mk-coming-soon-text">
        This is a public preview of AgentCity. Explore the live city now; requesting a demo office is switched off until
        sign-up opens, so nothing you do here is stored.
      </p>
      <CtaLink href="/city" variant="secondary" testId="demo-coming-soon-city">
        Explore the city
      </CtaLink>
    </div>
  );
}

// Which form the visitor gets: the real one when the lite demo is on, a notice in the plain preview, else the full app's.
function DemoForm() {
  if (LITE_DEMO) return <LiteDemoForm headingId="get-demo-title" />;
  return PUBLIC_PREVIEW ? <ComingSoon /> : <DemoRequestForm headingId="get-demo-title" />;
}
