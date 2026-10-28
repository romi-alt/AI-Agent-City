import { SectionHead, Tag } from './Primitives';

export function Audience() {
  const items = [
    {
      name: 'Dealerships',
      text: 'Bring sales inquiries, ownership follow-up and service tasks into a shared view of the next steps.',
    },
    {
      name: 'Training businesses',
      text: 'Organize enrollment inquiries, student questions, class reminders and content planning.',
    },
    {
      name: 'Agencies',
      text: 'Explore a workspace that gives each client and team a clear place to work.',
      roadmap: 'White-label',
    },
    {
      name: 'Other businesses',
      text: 'Try the sample office and see how the structure could fit your customer and team workflows.',
    },
  ];
  return (
    <section className="mk-section mk-audience" aria-labelledby="who-title" id="who">
      <div className="mk-container">
        <SectionHead
          id="who-title"
          eyebrow="Who it’s for"
          title="Built around the way your teams work."
          lead="Start with the workflow that matters to your business, then explore how it fits into your office."
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
