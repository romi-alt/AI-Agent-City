'use client';

// The demo request form (PLAN.md "Visitor journey"). Workstream B places it on the landing page at #get-demo; it is
// also the whole of /demo. Public: there is no session, so nothing here may send people to sign in.
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FocusEvent, type FormEvent, type ReactNode } from 'react';
import { ApiError, describeError } from '../../lib/api-client';
import { publicApi, readAttribution, rememberDemoEmail, type Attribution } from './demo-api';
import {
  DEMO_FIELDS,
  EMPTY_DEMO_FORM,
  FIELD_LABELS,
  fieldErrorsFromApi,
  INDUSTRIES,
  LIMITS,
  normaliseDemoForm,
  validateDemoForm,
  type DemoField,
  type DemoFormValues,
} from './demo-validation';
import '../marketing/marketing.css';
import './demo.css';

/** Where the privacy notice lives. A placeholder until the notice is published; the integrator wires it. */
export const PRIVACY_NOTICE_HREF = '/privacy';

type Errors = Partial<Record<DemoField, string>>;

export interface DemoRequestFormProps {
  /** Heading level and text are the host page's choice; the form only needs an id to label itself. */
  headingId?: string;
  className?: string;
}

export function DemoRequestForm({ headingId, className }: DemoRequestFormProps) {
  const router = useRouter();
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;
  const [values, setValues] = useState<DemoFormValues>(EMPTY_DEMO_FORM);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [showSummary, setShowSummary] = useState(false);
  // Bumped on each refused submit, so the summary takes focus then (and not on every keystroke afterwards).
  const [summaryFocus, setSummaryFocus] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const token = useRef<string | null>(null);
  const attribution = useRef<Attribution>({});
  const summaryRef = useRef<HTMLDivElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);

  async function loadToken(): Promise<string | null> {
    try {
      const body = await publicApi<{ token?: unknown }>('GET', '/api/demo/form-token');
      token.current = typeof body.token === 'string' ? body.token : null;
    } catch {
      token.current = null; // fetched again when the form is sent
    }
    return token.current;
  }

  useEffect(() => {
    attribution.current = readAttribution();
    void loadToken();
  }, []);

  useEffect(() => {
    if (summaryFocus > 0) summaryRef.current?.focus();
  }, [summaryFocus]);

  function update<K extends keyof DemoFormValues>(key: K, value: DemoFormValues[K]) {
    setValues(v => ({ ...v, [key]: value }));
    // Once a field has an error, re-check it as the person types so the message disappears when it is fixed.
    if (key !== 'marketingConsent' && errors[key as DemoField]) {
      const next = validateDemoForm({ ...values, [key]: value });
      setErrors(e => ({ ...e, [key]: next[key as DemoField] }));
    }
  }

  /**
   * Leaving a field points out a new mistake in it. It never clears one (typing does that, and a server's verdict on
   * an unchanged value still stands), and it waits when focus is moving to the submit button: the page must not shift
   * under the pointer between press and release, or the click would be lost. Submitting checks everything anyway.
   */
  function onBlur(field: DemoField, event: FocusEvent<HTMLElement>) {
    if (!values[field]) return; // don't scold an empty field the person hasn't reached yet
    const to = event.relatedTarget as HTMLElement | null;
    if (to && to.getAttribute('type') === 'submit') return;
    const problem = validateDemoForm(values)[field];
    if (problem && problem !== errors[field]) setErrors(e => ({ ...e, [field]: problem }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return; // a double click or Enter while sending
    setFailure(null);

    const found = validateDemoForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setShowSummary(true);
      setSummaryFocus(n => n + 1);
      return;
    }
    setShowSummary(false);

    inFlight.current = true;
    setSubmitting(true);
    try {
      const clean = normaliseDemoForm(values);
      const formToken = token.current ?? (await loadToken());
      const attr = attribution.current;
      const body = {
        fullName: clean.fullName,
        email: clean.email,
        company: clean.company,
        ...(clean.industry ? { industry: clean.industry } : {}),
        ...(clean.phone ? { phone: clean.phone } : {}),
        ...(clean.website ? { website: clean.website } : {}),
        marketingConsent: clean.marketingConsent,
        formToken: formToken ?? '',
        website2: honeypot,
        ...(Object.keys(attr).length > 0 ? { attribution: attr } : {}),
      };
      const res = await publicApi<{ requestId?: unknown }>('POST', '/api/demo/requests', body);
      const requestId = typeof res.requestId === 'string' ? res.requestId : '';
      rememberDemoEmail(clean.email);
      router.push(requestId ? `/demo/check-email?request=${encodeURIComponent(requestId)}` : '/demo/check-email');
      return; // keep the button disabled while the next page loads
    } catch (err) {
      handleFailure(err);
    }
    inFlight.current = false;
    setSubmitting(false);
  }

  function handleFailure(err: unknown) {
    token.current = null;
    void loadToken(); // tokens are single-use and age-checked: always start the next try with a fresh one
    if (err instanceof ApiError && err.status === 400) {
      const { fields, other, paths } = fieldErrorsFromApi(err.body);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        setShowSummary(true);
        setSummaryFocus(n => n + 1);
        return;
      }
      if (paths.includes('formToken')) {
        showFailure('Please take a moment to check your details, then send the form again.');
        return;
      }
      if (other.length > 0) {
        showFailure(other.join(' '));
        return;
      }
    }
    if (err instanceof ApiError && err.status === 429) {
      const details = (err.body.details ?? {}) as { retryAfterSeconds?: unknown };
      const secs = typeof details.retryAfterSeconds === 'number' ? details.retryAfterSeconds : null;
      const wait = secs
        ? secs > 90
          ? `about ${Math.ceil(secs / 60)} minutes`
          : `${Math.max(secs, 1)} seconds`
        : 'a few minutes';
      showFailure(`We've received several requests from you in a short time. Please try again in ${wait}.`);
      return;
    }
    if (err instanceof ApiError && err.status === 503) {
      showFailure('Demo offices can’t be prepared right now. Please try again in a little while.');
      return;
    }
    showFailure(
      err instanceof ApiError && err.status >= 500
        ? 'Something went wrong on our side and your request wasn’t sent. Please try again.'
        : describeError(err),
    );
  }

  function showFailure(text: string) {
    setFailure(text);
    requestAnimationFrame(() => failureRef.current?.focus());
  }

  const listed = DEMO_FIELDS.filter(f => errors[f]);
  const describedBy = (f: DemoField, hint?: string) =>
    [hint, errors[f] ? id(`${f}-error`) : null].filter(Boolean).join(' ') || undefined;

  const field = (f: DemoField, input: ReactNode, optional = false) => (
    <div className="dm-field">
      <label htmlFor={id(f)}>
        {FIELD_LABELS[f]}
        {optional && <span className="dm-optional"> · optional</span>}
      </label>
      {input}
      {errors[f] && (
        <p className="dm-field-error" id={id(`${f}-error`)} data-testid={`demo-error-${f}`}>
          {errors[f]}
        </p>
      )}
    </div>
  );
  const common = (f: DemoField) => ({
    id: id(f),
    name: f,
    'aria-invalid': errors[f] ? (true as const) : undefined,
    'aria-describedby': describedBy(f),
    'data-testid': `demo-${f}`,
    onBlur: (e: FocusEvent<HTMLElement>) => onBlur(f, e),
  });

  return (
    <form
      className={`dm-form ${className ?? ''}`}
      noValidate
      onSubmit={e => void onSubmit(e)}
      aria-labelledby={headingId}
      aria-busy={submitting}
      data-testid="demo-request-form"
    >
      {showSummary && listed.length > 0 && (
        <div
          className="dm-error-summary"
          role="alert"
          tabIndex={-1}
          ref={summaryRef}
          aria-labelledby={id('summary-title')}
          data-testid="demo-error-summary"
        >
          <h3 id={id('summary-title')}>Please check {listed.length === 1 ? 'one thing' : `${listed.length} things`}</h3>
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
        {field(
          'fullName',
          <input
            {...common('fullName')}
            type="text"
            autoComplete="name"
            required
            aria-required="true"
            maxLength={LIMITS.fullName.max + 20}
            value={values.fullName}
            onChange={e => update('fullName', e.target.value)}
          />,
        )}
        {field(
          'email',
          <input
            {...common('email')}
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            required
            aria-required="true"
            maxLength={LIMITS.email.max + 20}
            value={values.email}
            onChange={e => update('email', e.target.value)}
          />,
        )}
        {field(
          'company',
          <input
            {...common('company')}
            type="text"
            autoComplete="organization"
            required
            aria-required="true"
            maxLength={LIMITS.company.max + 20}
            value={values.company}
            onChange={e => update('company', e.target.value)}
          />,
        )}
        {field(
          'industry',
          <select
            {...common('industry')}
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
          </select>,
          true,
        )}
        {field(
          'phone',
          <input
            {...common('phone')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={LIMITS.phone.max + 10}
            value={values.phone}
            onChange={e => update('phone', e.target.value)}
          />,
          true,
        )}
        {field(
          'website',
          <input
            {...common('website')}
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="company.com"
            maxLength={LIMITS.website.max + 10}
            value={values.website}
            onChange={e => update('website', e.target.value)}
          />,
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
        <span>Send me product news (optional). Unsubscribe any time.</span>
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
          <p>Your details are still here; send the form again when you’re ready.</p>
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
          'Get My Demo Office'
        )}
      </button>

      <p className="dm-privacy" id={id('privacy')}>
        We use your details to set up your demo and follow up about it. The demo is removed after 14 days.{' '}
        <a href={PRIVACY_NOTICE_HREF} data-testid="demo-privacy-link">
          Privacy notice
        </a>
      </p>
    </form>
  );
}
