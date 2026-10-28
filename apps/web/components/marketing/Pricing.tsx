import { CONTACT_EMAIL } from '../../lib/preview';
import { Icon, SectionHead } from './Primitives';

// Reference pricing from the service proposal: a one-time setup and an ongoing monthly estimate that work together.
// The source shows dollar amounts without a currency code, so the page says final currency is confirmed in the quote.
// Nothing here sells or activates anything: both buttons open an email.

const mailto = (subject: string) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;

const CARDS = [
  {
    key: 'setup',
    label: 'One-time',
    title: 'Full Office Setup',
    price: '$1,200',
    suffix: 'one-time setup',
    text: 'Configure your workspace and prepare your AI team around your business, offers and customer journey.',
    points: [
      'Virtual office and private access configuration.',
      'Business-specific setup for Max and six specialist agents.',
      'GoHighLevel pipeline and calendar connection scope.',
      'Lead-capture funnel planning and setup.',
      'Initial content calendar and workflow strategy.',
    ],
    note: 'Live connections and delivery scope are confirmed before work begins.',
    cta: 'Discuss My Setup',
    subject: 'Setup inquiry: Full Office Setup',
  },
  {
    key: 'monthly',
    label: 'Ongoing',
    title: 'Monthly Office & AI',
    price: 'Approximately $800',
    suffix: 'per month',
    text: 'Budget for the full-team office service and the usage required to run the agreed workflows.',
    points: [
      'Full-team office service: $399/month.',
      'Estimated AI usage, automations and hosting: approximately $400/month.',
    ],
    note: 'Estimated combined cost: $799/month, rounded to approximately $800. Actual usage varies with lead volume and conversation activity.',
    cta: 'Discuss Monthly Service',
    subject: 'Monthly service inquiry: Monthly Office & AI',
  },
] as const;

export function Pricing() {
  return (
    <section className="mk-section" aria-labelledby="pricing-title" id="pricing" tabIndex={-1}>
      <div className="mk-container">
        <SectionHead
          id="pricing-title"
          eyebrow="Setup & monthly service"
          title="A clear starting cost. A clear monthly estimate."
          lead="Explore the demo for free. For a live office, the proposed full-team package combines a one-time setup with an ongoing monthly service."
        />
        <div className="mk-pricing-grid">
          {CARDS.map(c => (
            <article key={c.key} className="mk-price-card" aria-labelledby={`price-${c.key}`} data-reveal>
              <p className="mk-eyebrow">{c.label}</p>
              <h3 id={`price-${c.key}`} className="mk-h3">
                {c.title}
              </h3>
              <p className="mk-price">
                <span className="mk-price-amount">{c.price}</span> <span className="mk-price-suffix">{c.suffix}</span>
              </p>
              <p className="mk-body">{c.text}</p>
              <ul className="mk-points">
                {c.points.map(p => (
                  <li key={p}>
                    <Icon name="check" />
                    {p}
                  </li>
                ))}
              </ul>
              <p className="mk-note">{c.note}</p>
              <a
                className="mk-btn mk-btn-secondary mk-btn-md"
                href={mailto(c.subject)}
                data-testid={`price-cta-${c.key}`}
              >
                {c.cta}
                <Icon name="arrow" className="mk-btn-arrow" />
              </a>
            </article>
          ))}
        </div>
        <div className="mk-pricing-notes" data-reveal>
          <p className="mk-pricing-together">
            These costs work together: $1,200 setup plus approximately $800/month for ongoing operation. This is not a
            lifetime purchase.
          </p>
          <p className="mk-note">
            Advertising spend, GoHighLevel call minutes and SMS are separate. Any sales commission or partner revenue
            share is agreed separately in writing before launch.
          </p>
          <p className="mk-note">
            Reference pricing from the service proposal. Final scope, currency and commercial terms are confirmed in
            your quote.
          </p>
        </div>
      </div>
    </section>
  );
}
