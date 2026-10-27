import type { Metadata } from 'next';
import { DemoRequestForm } from '../../components/demo/DemoRequestForm';

export const metadata: Metadata = {
  title: 'Get your demo office — AgentCity',
  description: 'A private sample office in AgentCity with an AI team already at work.',
};

const STEPS = [
  'Tell us about your business.',
  'Confirm your email with the one-time link.',
  'Sign in with a code. No password.',
  'Meet your sample office in Rental Building 2.',
];

/** The request form on its own page, in the same card as the landing page's #get-demo section. */
export default function DemoRequestPage() {
  return (
    <main className="dm-main">
      <div className="mk-demo-card">
        <div className="mk-demo-copy">
          <p className="mk-eyebrow">Free demo</p>
          <h1 id="demo-intro-title" className="mk-h2">
            Get your demo office.
          </h1>
          <p className="mk-lead">A private sample office with an AI team already at work.</p>
          <ol className="mk-demo-steps">
            {STEPS.map((s, i) => (
              <li key={s}>
                <span aria-hidden="true">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <p className="mk-footnote">
            Everything inside is Sample or Simulated, and demo agents can&rsquo;t contact anyone.
          </p>
        </div>
        <div className="mk-demo-form">
          <DemoRequestForm headingId="demo-intro-title" />
        </div>
      </div>
    </main>
  );
}
