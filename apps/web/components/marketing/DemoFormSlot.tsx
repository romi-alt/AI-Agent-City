// INTEGRATION SLOT. Workstream D builds the real form at components/demo/DemoRequestForm.tsx (PLAN.md: full name,
// business email, company; optional industry, phone, website; privacy notice; a separate, unticked marketing-consent
// checkbox; the button "Get My Demo Office"). At integration, replace <DemoFormSlot /> in GetDemo.tsx with
// <DemoRequestForm /> (one import, one line). This placeholder takes no input and sends nothing.

import { LiteDemoForm } from '../demo/LiteDemoForm';
import { LITE_DEMO } from '../../lib/preview';

const FIELDS = [
  { label: 'Full name', optional: false },
  { label: 'Business email', optional: false },
  { label: 'Company', optional: false },
  { label: 'Industry', optional: true },
  { label: 'Phone', optional: true },
  { label: 'Website', optional: true },
];

export function DemoFormSlot() {
  if (LITE_DEMO) return <LiteDemoForm />;
  return (
    <div className="mk-form-slot" data-testid="demo-form-slot" role="note" aria-label="Demo request form (coming soon)">
      <div className="mk-form-fields" aria-hidden="true">
        {FIELDS.map(f => (
          <div key={f.label} className="mk-form-field">
            <span className="mk-form-label">
              {f.label}
              {f.optional && <span className="mk-form-opt"> · optional</span>}
            </span>
            <span className="mk-form-input" />
          </div>
        ))}
        <span className="mk-form-consent">
          <span className="mk-form-box" /> Send me product news (optional)
        </span>
        <span className="mk-form-submit">Get My Demo Office</span>
      </div>
      <p className="mk-form-note">
        The request form is being connected. Until then, <a href="/city">explore the public city</a>.
      </p>
    </div>
  );
}
