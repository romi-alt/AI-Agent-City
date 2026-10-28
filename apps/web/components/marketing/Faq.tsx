import { SectionHead } from './Primitives';
import { LITE_DEMO } from '../../lib/preview';

export function Faq({ ttlDays }: { ttlDays: number }) {
  const items = [
    [
      'Is the demo free?',
      'Yes. You can explore a sample office without a credit card. Access is provided through an email link, and the demo expires automatically.',
    ],
    [
      'What can I explore?',
      'A virtual workspace with AI personas, sample tasks and approval examples. It lets you see how the team and its responsibilities could fit your business.',
    ],
    ['Will an agent contact my customers?', 'No. The demo uses simulated activity and cannot send customer messages.'],
    [
      'Can I connect GoHighLevel or other business tools?',
      'Connections are part of the proposed live setup and must be scoped before launch. The public demo does not activate CRM or business-account integrations.',
    ],
    [
      'Can agents publish content or book appointments?',
      'These are planned connected workflows. They are not active in the public demo, and availability must be confirmed for your live setup.',
    ],
    [
      'What does the full setup cost?',
      'The proposed Full Office Setup is $1,200 one time. Ongoing operation is separate at approximately $800 per month. Final scope and currency are confirmed in your quote.',
    ],
    [
      'What is included in the monthly estimate?',
      'The estimate combines a $399 monthly full-team office service with approximately $400 for AI usage, automations and hosting. Actual usage varies.',
    ],
    [
      'Does the setup payment replace the monthly fee?',
      'No. The setup payment covers initial configuration. The monthly service covers ongoing operation of the agreed office and workflows.',
    ],
    [
      'Are there additional costs?',
      'Advertising spend, GoHighLevel call minutes and SMS are separate. Any sales commission or partner revenue share must be agreed in writing.',
    ],
    [
      'What happens after the demo?',
      'We review your workflows, confirm the available integrations and agree on scope, pricing and a launch plan before setup begins.',
    ],
    [
      'How long will I have access?',
      LITE_DEMO
        ? 'The demo expires automatically. Your office shows the date it is available until.'
        : `The demo expires automatically, after ${ttlDays} days.`,
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
