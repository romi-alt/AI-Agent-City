import { CITY_FACTS } from './cityFacts';
import { SectionHead, Tag } from './Primitives';

export function Audience() {
  const items = [
    { name: 'Auto dealerships', text: 'A tower per store and a floor per department, from sales to service.' },
    { name: 'Training and education', text: 'A floor per course, with enrolment, follow-up and student agents.' },
    {
      name: 'Agencies',
      text: 'Each client in its own building, with agency and client roles.',
      roadmap: 'White-label',
    },
    {
      name: 'Any business',
      text: `${CITY_FACTS.rentableFloors} rental floors for teams of any size. Your demo opens on one.`,
    },
  ];
  return (
    <section className="mk-section mk-audience" aria-labelledby="who-title" id="who">
      <div className="mk-container">
        <SectionHead
          id="who-title"
          eyebrow="Who it’s for"
          title="Built from real floor plans."
          lead="AgentCity started with an auto sales training business and the dealerships around it."
        />
        <ul className="mk-audience-grid">
          {items.map(it => (
            <li key={it.name} data-reveal>
              <h3 className="mk-h3">{it.name}</h3>
              <p className="mk-body">{it.text}</p>
              {it.roadmap && (
                <p className="mk-note">
                  <Tag tone="roadmap">Roadmap</Tag> {it.roadmap}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
