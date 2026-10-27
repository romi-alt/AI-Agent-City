import { CITY_FACTS } from './cityFacts';
import { Icon, SectionHead } from './Primitives';

// The idea and "how the virtual city works" in three steps (the city's five levels, condensed).
const STEPS = [
  {
    icon: 'city',
    title: 'A city of businesses',
    text: `Every business is a building on one skyline, grouped in districts like ${CITY_FACTS.districts[1] ?? 'Dealer Row'}.`,
  },
  {
    icon: 'building',
    title: 'A floor for every team',
    text: 'Floors are departments: sales, service, social media, finance, each with its own agents.',
  },
  {
    icon: 'desk',
    title: 'A desk for every agent',
    text: 'Open a desk to see the agent’s role, its tasks, its conversations and what it needs from you.',
  },
] as const;

export function HowItWorks() {
  return (
    <section className="mk-section" aria-labelledby="how-title" id="how-it-works">
      <div className="mk-container">
        <SectionHead
          id="how-title"
          eyebrow="How it works"
          title="From the skyline to a single desk."
          lead="Not a chat window: a place where you can see who is working on what."
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
          The public city has {CITY_FACTS.buildings} buildings, {CITY_FACTS.floors} floors and {CITY_FACTS.desks} desks.
          Activity in it is simulated.
        </p>
      </div>
    </section>
  );
}
