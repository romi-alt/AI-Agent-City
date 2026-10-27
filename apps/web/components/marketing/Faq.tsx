import { DEMO_BUILDING } from './cityFacts';
import { SectionHead } from './Primitives';

export function Faq({ ttlDays }: { ttlDays: number }) {
  const items = [
    {
      q: 'Is the demo really free?',
      a: 'Yes. There is no card and no password. You need a business email address, because that is where the confirmation link and your sign-in codes go.',
    },
    {
      q: 'What will I see?',
      a: `A sample office for your company on a floor of ${DEMO_BUILDING.name}, with an AI team, their tasks, conversations and activity. All of it is sample data, labelled "Sample" or "Simulated".`,
    },
    {
      q: 'Will the agents contact anyone?',
      a: 'No. Demo agents cannot send anything: the system refuses messages, receipts and payments for demo accounts, and no real customer data is involved.',
    },
    {
      q: 'How long does the demo last?',
      a: `${ttlDays} days. After that, access ends and the sample office and its data are removed.`,
    },
    {
      q: 'Why a code instead of a password?',
      a: 'There is nothing to reuse or leak. Each time you sign in we email you a one-time code, or you can use a passkey on your device.',
    },
    {
      q: 'Can I connect my CRM?',
      a: 'Not yet. Connectors for GoHighLevel, HubSpot and Salesforce are on the roadmap. The demo uses sample data only.',
    },
    {
      q: 'What does AgentCity cost?',
      a: 'Pricing is being set with our first clients. If you want to go further after your demo, we will walk you through it.',
    },
    {
      q: 'Do I need a powerful computer?',
      a: 'No. The city lowers its detail on slower devices, and if yours cannot show 3D you get a simpler map of the same buildings.',
    },
    {
      q: 'What happens to the details I send?',
      a: 'We use them to set up your demo and follow up on your request. We only send marketing emails if you tick the separate box on the form, which starts unticked.',
    },
  ];
  return (
    <section className="mk-section mk-faq on-light" aria-labelledby="faq-title" id="faq">
      <div className="mk-container mk-faq-grid">
        <SectionHead
          index="10"
          label="Questions"
          id="faq-title"
          title={
            <>
              Straight <em>answers.</em>
            </>
          }
        />
        <div className="mk-faq-list">
          {items.map(it => (
            <details key={it.q} className="mk-faq-item">
              <summary>
                <span>{it.q}</span>
                <span className="mk-faq-icon" aria-hidden="true" />
              </summary>
              <p>{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
