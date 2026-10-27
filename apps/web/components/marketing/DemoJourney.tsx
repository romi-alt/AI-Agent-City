import { DEMO_BUILDING } from './cityFacts';
import { SectionHead } from './Primitives';

export function DemoJourney({ ttlDays }: { ttlDays: number }) {
  const stops = [
    {
      title: 'Tell us about your business',
      text: 'Your name, business email and company. Industry, phone and website are optional.',
    },
    {
      title: 'Confirm your email',
      text: 'We email you a one-time link. Clicking it proves the address is yours.',
    },
    {
      title: 'Sign in with a code',
      text: 'No password to create. We send a sign-in code to the same address; you can add a passkey later.',
    },
    {
      title: 'Meet your office',
      text: `A sample office for your company opens on a floor of ${DEMO_BUILDING.name}, with an AI team already at work.`,
    },
    {
      title: 'Look around',
      text: 'Fly in from the skyline, open each desk, read the agents’ sample tasks and conversations, then explore the rest of the city.',
    },
  ];
  return (
    <section className="mk-section mk-journey on-light" aria-labelledby="journey-title" id="demo-walkthrough">
      <div className="mk-container">
        <SectionHead
          index="08"
          label="The demo, step by step"
          id="journey-title"
          align="split"
          title={
            <>
              Five stops <em>from here to your office.</em>
            </>
          }
          lead="What happens after you press the button, with nothing left out."
        />
        <ol className="mk-line" aria-label="Demo steps">
          {stops.map((s, i) => (
            <li key={s.title} className="mk-stop">
              <span className="mk-stop-dot" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="mk-h3">{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mk-journey-foot">
          Your demo lasts <strong>{ttlDays} days</strong>. After that, access ends and the sample office and its data
          are removed. Everything inside is labelled <em>Sample</em> or <em>Simulated</em>, and demo agents can&rsquo;t
          contact anyone.
        </p>
      </div>
    </section>
  );
}
