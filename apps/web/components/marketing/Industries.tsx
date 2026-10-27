import { CITY_FACTS, TRAINING_DIRECTORY } from './cityFacts';
import { SectionHead, Tag } from './Primitives';

export function Industries() {
  const courses = TRAINING_DIRECTORY.filter(r => r.name.startsWith('How to') || r.name.startsWith('The ')).length;
  const items = [
    {
      key: 'auto',
      name: 'Auto dealerships',
      text: 'A tower per store, a floor per department, from sales and finance to service and parts.',
      chips: ['Lease ends', 'Service visits', 'CSI', 'Birthdays'],
    },
    {
      key: 'training',
      name: 'Training and education',
      text: `A floor per course: ${courses} in the city's Training Center, each with enrolment, follow-up and student agents.`,
      chips: ['Enrolment', 'Students', 'Affiliates'],
    },
    {
      key: 'agencies',
      name: 'Agencies',
      text: 'Every client a building with its own data; owners, staff, client admins and viewers each see only theirs.',
      chips: ['Agency roles'],
      roadmap: 'White-label',
    },
    {
      key: 'any',
      name: 'Any business',
      text: `${CITY_FACTS.rentalBuildings} rental towers with ${CITY_FACTS.rentableFloors} floors for teams of any size. Your demo opens here.`,
      chips: ['Follow-up', 'Social', 'Reporting'],
    },
  ];
  return (
    <section className="mk-section mk-industries on-light" aria-labelledby="industries-title" id="industries">
      <div className="mk-container">
        <SectionHead
          index="04"
          label="Who it is for"
          id="industries-title"
          align="split"
          title={
            <>
              Built from real floor plans, <em>not a template.</em>
            </>
          }
          lead="AgentCity started with an auto sales training business and the dealerships around it."
        />
        <ol className="mk-industry-grid">
          {items.map((it, i) => (
            <li key={it.key} className={`mk-industry mk-industry-${i + 1}`}>
              <span className="mk-industry-num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mk-h3">{it.name}</h3>
              <p>{it.text}</p>
              <ul className="mk-chips" aria-label={`${it.name}: examples`}>
                {it.chips.map(c => (
                  <li key={c}>{c}</li>
                ))}
                {it.roadmap && (
                  <li className="is-roadmap">
                    <Tag tone="roadmap">Roadmap</Tag> {it.roadmap}
                  </li>
                )}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
