import { SectionHead } from './Primitives';
import { CONTACT_EMAIL, LITE_DEMO } from '../../lib/preview';

export function Faq({ ttlDays }: { ttlDays: number }) {
  const items = [
    [
      'Is the demo free?',
      'Yes. You can explore the sample office without a payment card. A business email is required to receive your access link.',
    ],
    [
      'What can I explore?',
      'A sample office with AI personas, assigned roles, example tasks and work awaiting review. The activity and customer information are simulated.',
    ],
    ['Will an agent contact my customers?', 'No. Demo agents cannot send messages or contact anyone.'],
    [
      'Can I connect my CRM or business accounts?',
      `The demo is a sample environment. Live connections depend on the integrations currently available. Tell us which tools you use so we can confirm what is supported: write to ${CONTACT_EMAIL}.`,
    ],
    [
      'Can agents publish content or book appointments?',
      'Social publishing, calendar booking and sending through connected business accounts are listed on the roadmap. The demo lets you explore sample workflows.',
    ],
    [
      'How long will I have access?',
      LITE_DEMO
        ? 'The demo expires automatically. Your office shows the date it is available until.'
        : `The demo expires automatically, after ${ttlDays} days.`,
    ],
    [
      'What happens after the demo?',
      `Use the demo to identify the workflows you would like to support. Write to ${CONTACT_EMAIL} to discuss available capabilities and next steps.`,
    ],
    [
      'What does a live setup cost?',
      `The demo is free. Write to ${CONTACT_EMAIL} to request current pricing for the capabilities and scope you need.`,
    ],
    [
      'Why don’t I need a password?',
      LITE_DEMO
        ? 'A one-time link sent to your email provides access to the demo.'
        : 'We email a one-time code each time, or you can use a passkey.',
    ],
    [
      'What happens to my details?',
      'Your details are used to send the confirmation link, create the demo and follow up about your request. Marketing emails are optional.',
    ],
    [
      'Do I need a powerful computer?',
      'No. The city has quality settings that reduce detail, and a simpler map of the same buildings is shown if your browser cannot display 3D.',
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
