import { DEMO_BUILDING } from './cityFacts';
import { SectionHead } from './Primitives';

export function Faq({ ttlDays }: { ttlDays: number }) {
  const items = [
    [
      'Is the demo free?',
      'Yes. No card and no password; you need a business email for the confirmation link and sign-in codes.',
    ],
    [
      'What will I see?',
      `A sample office for your company in ${DEMO_BUILDING.name}, with an AI team, its tasks and conversations, all labelled Sample or Simulated.`,
    ],
    [
      'Will the agents contact anyone?',
      'No. Demo agents can’t send anything: the system refuses messages, receipts and payments for demo accounts.',
    ],
    [
      'How long does the demo last?',
      `${ttlDays} days. Then access ends and the sample office and its data are removed.`,
    ],
    [
      'Why a code instead of a password?',
      'There is nothing to reuse or leak. We email a one-time code each time, or you can use a passkey.',
    ],
    ['Can I connect my CRM?', 'Not yet. Connectors for GoHighLevel, HubSpot and Salesforce are on the roadmap.'],
    [
      'What does it cost?',
      'Pricing is being set with our first clients. We’ll walk you through it after your demo if you want to go further.',
    ],
    [
      'Do I need a powerful computer?',
      'No. The city lowers its detail on slower devices, and without 3D you get a simpler map of the same buildings.',
    ],
    [
      'What happens to my details?',
      'We use them to set up your demo and follow up on your request. Marketing emails only if you tick the separate, unticked box.',
    ],
  ] as const;
  return (
    <section className="mk-section" aria-labelledby="faq-title" id="faq">
      <div className="mk-container mk-faq">
        <SectionHead id="faq-title" eyebrow="FAQ" title="Questions, answered." center />
        <div className="mk-faq-list" data-reveal>
          {items.map(([q, a]) => (
            <details key={q} className="mk-faq-item">
              <summary>
                <span>{q}</span>
                <span className="mk-faq-icon" aria-hidden="true" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
