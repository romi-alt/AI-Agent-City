import { CITY_FACTS } from './cityFacts';
import { Icon, SectionHead } from './Primitives';

// The idea and "how the virtual city works" in three steps: building, floor, desk.
const STEPS = [
  {
    icon: 'city',
    title: 'Your business has a building.',
    text: 'Bring your teams into a shared visual workspace, with a clear place for each part of the business.',
  },
  {
    icon: 'building',
    title: 'Each department has a floor.',
    text: 'Organize sales, marketing, customer care and training around the work they need to do.',
  },
  {
    icon: 'desk',
    title: 'Every agent has a desk.',
    text: 'Inspect responsibilities, review prepared work and find the decisions waiting for your input.',
  },
] as const;

export function HowItWorks() {
  return (
    <section className="mk-section" aria-labelledby="how-title" id="how-it-works">
      <div className="mk-container">
        <SectionHead
          id="how-title"
          eyebrow="How it works"
          title="A place for your business. A role for every agent."
          lead="See the big picture, open a department, then go straight to the task that needs you."
        />
        <ol className="mk-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="mk-step" data-reveal>
              <span className="mk-step-icon">
                <Icon name={s.icon} />
              </span>
              <p className="mk-step-num">0{i + 1}</p>
              <h3 className="mk-h3">{s.title}</h3>
              <p className="mk-body">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mk-footnote" data-reveal>
          The sample city has {CITY_FACTS.buildings} buildings, {CITY_FACTS.floors} floors and {CITY_FACTS.desks} desks.
          Activity in it is simulated.
        </p>
      </div>
    </section>
  );
}
