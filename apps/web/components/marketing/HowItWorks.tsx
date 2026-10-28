import { CITY_FACTS } from './cityFacts';
import { Icon, SectionHead } from './Primitives';

// The idea and "how the virtual city works" in three steps: building, floor, desk.
const STEPS = [
  {
    icon: 'city',
    title: 'Your business has a building.',
    text: 'Find your teams together in one place, with a clear view of how the work is organized.',
  },
  {
    icon: 'building',
    title: 'Each department has a floor.',
    text: 'Give sales, service, marketing and training their own workspace and responsibilities.',
  },
  {
    icon: 'desk',
    title: 'Every agent has a desk.',
    text: 'Open a desk to inspect the agent’s role, current tasks and items awaiting your review.',
  },
] as const;

export function HowItWorks() {
  return (
    <section className="mk-section" aria-labelledby="how-title" id="how-it-works">
      <div className="mk-container">
        <SectionHead
          id="how-title"
          eyebrow="How it works"
          title="A clear place for every part of your business."
          lead="Move from an overview of your business to the individual task that needs attention."
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
