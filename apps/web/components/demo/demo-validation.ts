// Client-side checks for the demo request form. They mirror the API's rules (PLAN.md "API contract") so people see
// mistakes before sending; the server still decides. Pure functions with no imports, so Node's unit tests run them
// directly (test/d-demo-validation.test.ts).

export const DEMO_FIELDS = ['fullName', 'email', 'company', 'industry', 'phone', 'website'] as const;
export type DemoField = (typeof DEMO_FIELDS)[number];

export interface DemoFormValues {
  fullName: string;
  email: string;
  company: string;
  industry: string;
  phone: string;
  website: string;
  marketingConsent: boolean;
}

export const EMPTY_DEMO_FORM: DemoFormValues = {
  fullName: '',
  email: '',
  company: '',
  industry: '',
  phone: '',
  website: '',
  marketingConsent: false,
};

export const LIMITS = {
  fullName: { min: 2, max: 120 },
  email: { max: 254 },
  company: { min: 2, max: 160 },
  phone: { max: 40, minDigits: 6, maxDigits: 20 },
  website: { max: 200 },
} as const;

/** Industries offered in the form. Values are stable slugs; the labels are what people see. */
export const INDUSTRIES: { value: string; label: string }[] = [
  { value: 'real-estate', label: 'Real estate sales' },
  { value: 'lettings', label: 'Lettings and property management' },
  { value: 'automotive', label: 'Automotive dealership' },
  { value: 'financial-services', label: 'Mortgages and financial services' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'professional-services', label: 'Professional services' },
  { value: 'training', label: 'Training and education' },
  { value: 'software', label: 'Software and technology' },
  { value: 'retail', label: 'Retail and e-commerce' },
  { value: 'other', label: 'Something else' },
];

export const FIELD_LABELS: Record<DemoField, string> = {
  fullName: 'Full name',
  email: 'Business email',
  company: 'Company',
  industry: 'Industry',
  phone: 'Phone',
  website: 'Website',
};

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;
const PHONE_CHARS = /^\+?[0-9 ().-]+$/;
// Control characters have no place in a name or company (they break emails and CSV exports).
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Trim the text fields the way the server will, so what we check is what we send. */
export function normaliseDemoForm(v: DemoFormValues): DemoFormValues {
  return {
    fullName: v.fullName.trim().replace(/\s+/g, ' '),
    email: v.email.trim(),
    company: v.company.trim().replace(/\s+/g, ' '),
    industry: v.industry.trim(),
    phone: v.phone.trim(),
    website: normaliseWebsite(v.website),
    marketingConsent: v.marketingConsent === true,
  };
}

/** "example.com" becomes "https://example.com"; an empty value stays empty. */
export function normaliseWebsite(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
}

export function isValidEmail(value: string): boolean {
  return value.length <= LIMITS.email.max && EMAIL.test(value);
}

export function isValidWebsite(value: string): boolean {
  if (value.length > LIMITS.website.max) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.') && !url.username;
  } catch {
    return false;
  }
}

/** Every problem with the form, keyed by field, as sentences written for the person filling it in. */
export function validateDemoForm(input: DemoFormValues): Partial<Record<DemoField, string>> {
  const v = normaliseDemoForm(input);
  const errors: Partial<Record<DemoField, string>> = {};

  if (!v.fullName) errors.fullName = 'Enter your full name.';
  else if (v.fullName.length < LIMITS.fullName.min) errors.fullName = 'Enter your full name, not just an initial.';
  else if (v.fullName.length > LIMITS.fullName.max)
    errors.fullName = `Keep your name under ${LIMITS.fullName.max} characters.`;
  else if (CONTROL.test(v.fullName)) errors.fullName = 'Your name contains characters we cannot use.';

  if (!v.email) errors.email = 'Enter your business email address.';
  else if (!isValidEmail(v.email)) errors.email = 'Enter an email address like name@company.com.';

  if (!v.company) errors.company = 'Enter your company name.';
  else if (v.company.length < LIMITS.company.min) errors.company = 'Enter your company’s full name.';
  else if (v.company.length > LIMITS.company.max)
    errors.company = `Keep the company name under ${LIMITS.company.max} characters.`;
  else if (CONTROL.test(v.company)) errors.company = 'The company name contains characters we cannot use.';

  if (v.industry && !INDUSTRIES.some(i => i.value === v.industry))
    errors.industry = 'Choose an industry from the list.';

  if (v.phone) {
    const digits = v.phone.replace(/\D/g, '').length;
    if (v.phone.length > LIMITS.phone.max || !PHONE_CHARS.test(v.phone))
      errors.phone = 'Use digits, spaces and + ( ) - only.';
    else if (digits < LIMITS.phone.minDigits || digits > LIMITS.phone.maxDigits)
      errors.phone = 'Enter a full phone number, including the area code.';
  }

  if (v.website && !isValidWebsite(v.website)) errors.website = 'Enter a web address like company.com.';

  return errors;
}

/**
 * Field errors from the API's `validation_failed` body. M04 sends `details.issues[] = { path, code, message }` (path
 * as an array or a dotted string); a `details.fields` map is accepted too. Unknown fields are returned under
 * `other` so the page can still show them.
 */
export function fieldErrorsFromApi(body: Record<string, unknown>): {
  fields: Partial<Record<DemoField, string>>;
  other: string[];
  /** Every top-level path mentioned, e.g. "formToken" when the form was sent too quickly. */
  paths: string[];
} {
  const fields: Partial<Record<DemoField, string>> = {};
  const other: string[] = [];
  const paths: string[] = [];
  const details = (body.details && typeof body.details === 'object' ? body.details : {}) as Record<string, unknown>;
  const add = (path: unknown, message: unknown) => {
    const key = (Array.isArray(path) ? String(path[0] ?? '') : String(path ?? '').split('.')[0]) ?? '';
    const text = typeof message === 'string' && message ? message : 'Check this field.';
    if (key) paths.push(key);
    if ((DEMO_FIELDS as readonly string[]).includes(key)) {
      fields[key as DemoField] ??= text;
    } else other.push(text);
  };
  if (Array.isArray(details.issues)) {
    for (const issue of details.issues) {
      if (issue && typeof issue === 'object')
        add((issue as { path?: unknown }).path, (issue as { message?: unknown }).message);
    }
  }
  if (details.fields && typeof details.fields === 'object') {
    for (const [k, m] of Object.entries(details.fields as Record<string, unknown>)) add(k, m);
  }
  return { fields, other, paths };
}

/** First name for greetings: the first word of the full name. */
export function firstNameOf(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? '';
}
