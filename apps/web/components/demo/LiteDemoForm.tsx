'use client';

// The real demo request form for the public site (LITE_DEMO). Same fields, rules and look as the landing page's
// design (.mk / .dm-*); it talks to /api/lite/demo. Public: there is no session, nothing here signs anyone in.
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  DEMO_FIELDS,
  EMPTY_DEMO_FORM,
  FIELD_LABELS,
  INDUSTRIES,
  LIMITS,
  validateDemoForm,
  type DemoField,
  type DemoFormValues,
} from './demo-validation';
import { loadDraft, saveDraft } from './lite-draft';
import { explainSubmitError, prefetchFormToken, submitDemoRequest } from './lite-submit';
import '../marketing/marketing.css';
import './demo.css';

type Errors = Partial<Record<DemoField, string>>;

export function LiteDemoForm({ headingId }: { headingId?: string }) {
  const router = useRouter();
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;
  const [values, setValues] = useState<DemoFormValues>(EMPTY_DEMO_FORM);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);

  // The server wants a form token at least 3 s old, so it is fetched as soon as the form is on screen.
  useEffect(() => prefetchFormToken(), []);

  // Coming back from "wrong address?" on the check-email page: the details are still here, ready to correct.
  useEffect(() => {
    const draft = loadDraft();
    if (draft && new URLSearchParams(window.location.search).get('edit') === '1') setValues(draft);
  }, []);

  function update<K extends keyof DemoFormValues>(key: K, value: DemoFormValues[K]) {
    setValues(v => ({ ...v, [key]: value }));
    if (key !== 'marketingConsent' && errors[key as DemoField]) {
      const next = validateDemoForm({ ...values, [key]: value });
      setErrors(e => ({ ...e, [key]: next[key as DemoField] }));
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    setFailure(null);
    const found = validateDemoForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    try {
      const requestId = await submitDemoRequest(values, honeypot);
      saveDraft(values);
      router.push(`/demo/check-email?request=${encodeURIComponent(requestId)}`);
      return; // keep the button disabled while the next page loads
    } catch (err) {
      setFailure(explainSubmitError(err));
      requestAnimationFrame(() => failureRef.current?.focus());
    }
    inFlight.current = false;
    setSubmitting(false);
  }

  const listed = DEMO_FIELDS.filter(f => errors[f]);
  const field = (f: DemoField, input: (props: InputProps) => ReactNode, optional = false) => (
    <div className="dm-field">
      <label htmlFor={id(f)}>
        {FIELD_LABELS[f]}
        {optional && <span className="dm-optional"> · optional</span>}
      </label>
      {input({
        id: id(f),
        name: f,
        'aria-invalid': errors[f] ? true : undefined,
        'aria-describedby': errors[f] ? id(`${f}-error`) : undefined,
        'data-testid': `demo-${f}`,
      })}
      {errors[f] && (
        <p className="dm-field-error" id={id(`${f}-error`)} data-testid={`demo-error-${f}`}>
          {errors[f]}
        </p>
      )}
    </div>
  );

  return (
    <form
      className="dm-form"
      noValidate
      onSubmit={e => void onSubmit(e)}
      aria-labelledby={headingId}
      aria-busy={submitting}
      data-testid="demo-request-form"
    >
      {listed.length > 0 && (
        <div className="dm-error-summary" role="alert" tabIndex={-1} ref={summaryRef} data-testid="demo-error-summary">
          <h3>Please check {listed.length === 1 ? 'one thing' : `${listed.length} things`}</h3>
          <ul>
            {listed.map(f => (
              <li key={f}>
                <a
                  href={`#${id(f)}`}
                  onClick={e => {
                    e.preventDefault();
                    document.getElementById(id(f))?.focus();
                  }}
                >
                  {FIELD_LABELS[f]}: {errors[f]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="dm-form-grid">
        {field('fullName', p => (
          <input
            {...p}
            type="text"
            autoComplete="name"
            required
            aria-required="true"
            maxLength={LIMITS.fullName.max + 20}
            value={values.fullName}
            onChange={e => update('fullName', e.target.value)}
          />
        ))}
        {field('email', p => (
          <input
            {...p}
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            required
            aria-required="true"
            maxLength={LIMITS.email.max + 20}
            value={values.email}
            onChange={e => update('email', e.target.value)}
          />
        ))}
        {field('company', p => (
          <input
            {...p}
            type="text"
            autoComplete="organization"
            required
            aria-required="true"
            maxLength={LIMITS.company.max + 20}
            value={values.company}
            onChange={e => update('company', e.target.value)}
          />
        ))}
        {field(
          'industry',
          p => (
            <select
              {...p}
              data-empty={values.industry === ''}
              value={values.industry}
              onChange={e => update('industry', e.target.value)}
            >
              <option value="">Choose one</option>
              {INDUSTRIES.map(i => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
          ),
          true,
        )}
        {field(
          'phone',
          p => (
            <input
              {...p}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={LIMITS.phone.max + 10}
              value={values.phone}
              onChange={e => update('phone', e.target.value)}
            />
          ),
          true,
        )}
        {field(
          'website',
          p => (
            <input
              {...p}
              type="text"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              placeholder="company.com"
              maxLength={LIMITS.website.max + 10}
              value={values.website}
              onChange={e => update('website', e.target.value)}
            />
          ),
          true,
        )}
      </div>

      {/* Spam trap: people never see or reach this field; bots that fill every input give themselves away. */}
      <div className="dm-hp" aria-hidden="true">
        <label htmlFor={id('website2')}>Leave this field empty</label>
        <input
          id={id('website2')}
          name="website2"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={e => setHoneypot(e.target.value)}
          data-testid="demo-website2"
        />
      </div>

      <label className="dm-consent" htmlFor={id('consent')}>
        <input
          id={id('consent')}
          type="checkbox"
          name="marketingConsent"
          checked={values.marketingConsent}
          onChange={e => update('marketingConsent', e.target.checked)}
          data-testid="demo-marketing-consent"
        />
        <span>
          Yes, email me occasional AutoSalesCity news and offers. Optional: you get your demo either way, and you can
          unsubscribe at any time.
        </span>
      </label>

      {failure && (
        <div
          className="dm-notice dm-notice-error"
          role="alert"
          tabIndex={-1}
          ref={failureRef}
          data-testid="demo-failure"
        >
          <p>{failure}</p>
          <p>Your details are still here; send the form again when you are ready.</p>
        </div>
      )}

      <button
        type="submit"
        className="mk-btn mk-btn-primary dm-submit"
        disabled={submitting}
        aria-describedby={id('privacy')}
        data-testid="demo-submit"
      >
        {submitting ? (
          <>
            <span className="dm-spinner" aria-hidden="true" /> Preparing your demo office…
          </>
        ) : (
          'Get My Free Demo Office'
        )}
      </button>

      <p className="dm-privacy" id={id('privacy')}>
        We use your details to send your confirmation link, set up your demo and follow up about it. The demo expires
        automatically.
      </p>
      <p className="dm-privacy">
        Already have a demo office? <a href="/demo/signin">Sign in with your email</a>.
      </p>
    </form>
  );
}

type InputProps = {
  id: string;
  name: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
  'data-testid': string;
};
