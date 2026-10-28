import { SectionHead, Tag } from './Primitives';

export function Audience() {
  const items = [
    {
      name: 'Dealerships',
      text: 'Organize vehicle inquiries, buyer follow-up and service-related tasks in one view.',
    },
    {
      name: 'Training businesses',
      text: 'Bring enrollment inquiries, student questions, class reminders and course content together.',
    },
    {
      name: 'Agencies',
      text: 'Explore a clearer way to organize client work, responsibilities and approvals.',
      roadmap: 'White-label',
    },
    {
      name: 'Other businesses',
      text: 'Try a sample office and see how the structure fits your customers, team and daily priorities.',
    },
  ];
  return (
    <section className="mk-section mk-audience" aria-labelledby="who-title" id="who">
      <div className="mk-container">
        <SectionHead
          id="who-title"
          eyebrow="Who it’s for"
          title="Built around the work your business does."
          lead="Start with the conversations and tasks that matter most to your team."
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
