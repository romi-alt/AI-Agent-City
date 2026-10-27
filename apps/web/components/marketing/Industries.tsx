import { ASSOCIATE_FLOOR, CITY_FACTS, DEALERSHIP_DIRECTORY, TRAINING_DIRECTORY } from './cityFacts';
import { SectionHead, Tag } from './Primitives';

export function Industries() {
  const departments = DEALERSHIP_DIRECTORY.filter(r => r.agents.length > 0).map(r => r.name.replace(/ Dept\.$/, ''));
  const courses = TRAINING_DIRECTORY.filter(r => r.name.startsWith('How to') || r.name.startsWith('The ')).length;
  const items = [
    {
      key: 'auto',
      name: 'Auto dealerships',
      line: 'A tower for each store. A floor for each department.',
      text: 'Every department gets its own agents, working its own customers: unsold prospects, lease ends, service visits, CSI, birthdays and ownership anniversaries. Each sales associate can have a floor too, with a follow-up agent and a social agent of their own.',
      chips: departments,
    },
    {
      key: 'training',
      name: 'Training and education',
      line: 'A floor for every course you sell.',
      text: `Modelled on the Training Center in the public city: ${courses} course floors, each with enrolment, follow-up and student agents, plus floors for dealership packages, books and affiliates. Leads are answered, students are welcomed and reminded, and affiliates are followed up.`,
      chips: ['Enrolment', 'Follow-up', 'Students', 'Dealership packages', 'Affiliates'],
    },
    {
      key: 'agencies',
      name: 'Agencies',
      line: 'Every client a building. One skyline.',
      text: 'Run each client in its own building with its own data. Roles match how agencies work: agency owners and staff, client admins and client viewers, each seeing only what they should.',
      chips: ['Agency owner', 'Agency staff', 'Client admin', 'Client viewer'],
      roadmap: 'White-label: your logo, domain and colours.',
    },
    {
      key: 'any',
      name: 'Any business',
      line: 'Rent a floor and staff it with AI.',
      text: `${CITY_FACTS.rentalBuildings} rental towers hold ${CITY_FACTS.rentableFloors} floors for businesses and salespeople who want a team of their own, starting from a ${ASSOCIATE_FLOOR ? 'two-agent' : 'small'} office. Your demo office opens on one of these floors.`,
      chips: ['Follow-up', 'Social', 'Scheduling', 'Reporting'],
    },
  ];
  return (
    <section className="mk-section mk-industries on-light" aria-labelledby="industries-title" id="industries">
      <div className="mk-container">
        <SectionHead
          index="06"
          label="Who it is for"
          id="industries-title"
          align="split"
          title={
            <>
              Built from real floor plans, <em>not a template.</em>
            </>
          }
          lead="AgentCity started with an auto sales training business and the dealerships around it. The buildings in the city follow their real departments and task lists."
        />
        <ol className="mk-industry-list">
          {items.map((it, i) => (
            <li key={it.key} className="mk-industry">
              <span className="mk-industry-num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="mk-industry-name">
                <h3 className="mk-h3">{it.name}</h3>
                <p className="mk-industry-line">{it.line}</p>
              </div>
              <div className="mk-industry-body">
                <p>{it.text}</p>
                <ul className="mk-chips" aria-label={`${it.name}: floors and roles`}>
                  {it.chips.map(c => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                {it.roadmap && (
                  <p className="mk-roadmap">
                    <Tag tone="roadmap">Roadmap</Tag> {it.roadmap}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
