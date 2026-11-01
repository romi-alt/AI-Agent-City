'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  DEMO_FIELDS,
  EMPTY_DEMO_FORM,
  FIELD_LABELS,
  INDUSTRIES,
  LIMITS,
  validateDemoForm,
  type DemoField,
  type DemoFormValues,
} from '../demo/demo-validation';
import { loadDraft, saveDraft } from '../demo/lite-draft';
import { explainSubmitError, prefetchFormToken, submitDemoRequest } from '../demo/lite-submit';

// "Book a demo": the real demo request form in the front page's design. Every button marked data-open-book opens it.
// It sends the same request as the old landing-page form (POST /api/lite/demo, through lite-submit), then goes to the
// check-your-email page. Public: nothing here signs anyone in.

type Errors = Partial<Record<DemoField, string>>;

export function BookDemo({ contactEmail }: { contactEmail: string }) {
  const router = useRouter();
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const [values, setValues] = useState<DemoFormValues>(EMPTY_DEMO_FORM);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const open = useCallback(() => {
    setFailure(null);
    // Coming back from "wrong address?" on the check-email page: the details are still here, ready to correct.
    const draft = loadDraft();
    if (draft && new URLSearchParams(window.location.search).get('edit') === '1') setValues(draft);
    // The server wants a form token at least 3 s old, so it is fetched as soon as the form opens.
    prefetchFormToken();
    dialog.current?.showModal();
    requestAnimationFrame(() => firstField.current?.focus());
  }, []);

  // Every "book a demo" button on the page (server-rendered, marked data-open-book).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-open-book]');
      if (!el) return;
      e.preventDefault();
      opener.current = el;
      open();
    };
    document.addEventListener('click', onClick);
    if (new URLSearchParams(window.location.search).get('edit') === '1') open();
    return () => document.removeEventListener('click', onClick);
  }, [open]);

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
  const props = (f: DemoField) => ({
    id: id(f),
    name: f,
    'aria-invalid': errors[f] ? true : undefined,
    'aria-describedby': errors[f] ? id(`${f}-error`) : undefined,
    'data-testid': `book-${f}`,
  });
  const label = (f: DemoField, optional = false) => (
    <label htmlFor={id(f)}>
      {FIELD_LABELS[f]}
      {optional && <span className="bk-opt"> · optional</span>}
    </label>
  );
  const error = (f: DemoField) =>
    errors[f] ? (
      <p className="bk-err" id={id(`${f}-error`)} data-testid={`book-error-${f}`}>
        {errors[f]}
      </p>
    ) : null;

  return (
    <dialog
      className="dl bk"
      id="bookDemo"
      ref={dialog}
      aria-labelledby="bkTitle"
      onClick={e => e.target === dialog.current && dialog.current?.close()}
      onClose={() => opener.current?.focus()}
    >
      <form noValidate onSubmit={e => void onSubmit(e)} aria-busy={submitting} data-testid="book-demo-form">
        <button className="x" type="button" aria-label="Close" onClick={() => dialog.current?.close()}>
          ✕
        </button>
        <span className="eyebrow">Book a demo</span>
        <h3 id="bkTitle">Get your free demo office</h3>
        <p className="bk-lead">
          Tell us where to send your link. We email a one-time confirmation link: no password, no card.
        </p>

        {listed.length > 0 && (
          <div className="bk-summary" role="alert" tabIndex={-1} ref={summaryRef} data-testid="book-error-summary">
            <b>Please check {listed.length === 1 ? 'one thing' : `${listed.length} things`}</b>
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

        <div className="bk-grid">
          <div className="bk-field">
            {label('fullName')}
            <input
              {...props('fullName')}
              ref={firstField}
              type="text"
              autoComplete="name"
              required
              aria-required="true"
              maxLength={LIMITS.fullName.max + 20}
              value={values.fullName}
              onChange={e => update('fullName', e.target.value)}
            />
            {error('fullName')}
          </div>
          <div className="bk-field">
            {label('email')}
            <input
              {...props('email')}
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
            {error('email')}
          </div>
          <div className="bk-field">
            {label('company')}
            <input
              {...props('company')}
              type="text"
              autoComplete="organization"
              required
              aria-required="true"
              maxLength={LIMITS.company.max + 20}
              value={values.company}
              onChange={e => update('company', e.target.value)}
            />
            {error('company')}
          </div>
          <div className="bk-field">
            {label('industry', true)}
            <select
              {...props('industry')}
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
            {error('industry')}
          </div>
          <div className="bk-field">
            {label('phone', true)}
            <input
              {...props('phone')}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={LIMITS.phone.max + 10}
              value={values.phone}
              onChange={e => update('phone', e.target.value)}
            />
            {error('phone')}
          </div>
          <div className="bk-field">
            {label('website', true)}
            <input
              {...props('website')}
              type="text"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              placeholder="company.com"
              maxLength={LIMITS.website.max + 10}
              value={values.website}
              onChange={e => update('website', e.target.value)}
            />
            {error('website')}
          </div>
        </div>

        {/* Spam trap: people never see or reach this field; bots that fill every input give themselves away. */}
        <div className="bk-hp" aria-hidden="true">
          <label htmlFor={id('website2')}>Leave this field empty</label>
          <input
            id={id('website2')}
            name="website2"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={e => setHoneypot(e.target.value)}
            data-testid="book-website2"
          />
        </div>

        <label className="bk-consent" htmlFor={id('consent')}>
          <input
            id={id('consent')}
            type="checkbox"
            name="marketingConsent"
            checked={values.marketingConsent}
            onChange={e => update('marketingConsent', e.target.checked)}
            data-testid="book-marketing-consent"
          />
          <span>
            Yes, email me occasional news and offers. Optional: you get your demo either way, and you can unsubscribe at
            any time.
          </span>
        </label>

        {failure && (
          <div className="bk-failure" role="alert" tabIndex={-1} ref={failureRef} data-testid="book-failure">
            <p>{failure}</p>
            <p>Your details are still here; send the form again when you are ready.</p>
          </div>
        )}

        <button
          type="submit"
          className="btn primary"
          style={{ justifyContent: 'center', marginTop: 4 }}
          disabled={submitting}
          aria-describedby={id('privacy')}
          data-testid="book-submit"
        >
          {submitting ? 'Preparing your demo office…' : 'Get my free demo office →'}
        </button>
        <p className="fine" id={id('privacy')}>
          We use your details to send your confirmation link, set up your demo and follow up about it. The demo expires
          automatically.
        </p>
        <p className="fine">
          Already have a demo office? <a href="/demo/signin">Sign in with your email</a>. Prefer to write?{' '}
          <a href={`mailto:${contactEmail}?subject=AutoSalesCity%20demo`}>{contactEmail}</a>.
        </p>
      </form>
    </dialog>
  );
}
