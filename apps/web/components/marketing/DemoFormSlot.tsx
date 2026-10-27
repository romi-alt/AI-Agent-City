// INTEGRATION SLOT. Workstream D builds the real form at components/demo/DemoRequestForm.tsx (PLAN.md: full name,
// business email, company; optional industry, phone, website; privacy notice; a separate, unticked marketing-consent
// checkbox; the button "Get My Demo Office"). At integration, replace <DemoFormSlot /> in GetDemo.tsx with
// <DemoRequestForm /> (one import, one line). This placeholder takes no input and sends nothing.

const FIELDS = [
  { label: 'Full name', required: true },
  { label: 'Business email', required: true },
  { label: 'Company', required: true },
  { label: 'Industry', required: false },
  { label: 'Phone', required: false },
  { label: 'Website', required: false },
];

export function DemoFormSlot() {
  return (
    <div className="mk-form-slot" data-testid="demo-form-slot" role="note" aria-label="Demo request form (coming soon)">
      <p className="mk-form-slot-flag">Demo request form · being connected</p>
      <ul className="mk-form-slot-fields">
        {FIELDS.map(f => (
          <li key={f.label}>
            <span>{f.label}</span>
            <span className="mk-form-slot-req">{f.required ? 'Required' : 'Optional'}</span>
          </li>
        ))}
      </ul>
      <p className="mk-form-slot-consent">
        <span className="mk-form-slot-box" aria-hidden="true" /> Send me news about AgentCity (optional, unticked)
      </p>
      <p className="mk-form-slot-button" aria-hidden="true">
        Get My Demo Office
      </p>
      <p className="mk-form-slot-note">
        The form will appear here. Until then, explore the <a href="/city">public city</a>.
      </p>
    </div>
  );
}
