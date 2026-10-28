// Validation of the demo request form: same rules as the full backend's schema (apps/api demo.schemas.ts), written
// without a schema library. Messages are for the person filling in the form and never echo what they typed.

export interface DemoInput {
  fullName: string;
  email: string;
  company: string;
  industry?: string;
  phone?: string;
  website?: string;
  marketingConsent: boolean;
  formToken: string;
  website2?: string;
  attribution: Record<string, string>;
}

export class ValidationError extends Error {
  readonly fields: Record<string, string>;
  constructor(fields: Record<string, string>) {
    super('validation_failed');
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

const PHONE = /^[0-9+().\s/-]{3,40}$/;
const WEBSITE = /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(:\d{1,5})?(\/\S*)?$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HOST = /^[a-z0-9.-]+(:\d+)?$/i;
const UTM_KEYS = ['utmSource', 'utmMedium', 'utmCampaign', 'utmTerm', 'utmContent'] as const;

type Fields = Record<string, string>;

function text(
  src: Record<string, unknown>,
  key: string,
  errors: Fields,
  opts: { required: boolean; max: number; what?: string },
) {
  const raw = src[key];
  if (raw === undefined || raw === null || raw === '') {
    if (opts.required) errors[key] = `Enter your ${opts.what ?? key}.`;
    return undefined;
  }
  if (typeof raw !== 'string') {
    errors[key] = 'Enter text.';
    return undefined;
  }
  const v = raw.trim();
  if (!v) {
    if (opts.required) errors[key] = `Enter your ${opts.what ?? key}.`;
    return undefined;
  }
  if (v.length > opts.max) {
    errors[key] = `Use at most ${opts.max} characters.`;
    return undefined;
  }
  return v;
}

/** Attribution as stored: utm values and the referrer's host only (never its path or query). */
export function parseAttribution(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof input !== 'object' || input === null) return out;
  const a = input as Record<string, unknown>;
  for (const k of UTM_KEYS) {
    const v = a[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 200);
  }
  if (typeof a.referrer === 'string' && a.referrer.trim()) {
    try {
      const host = new URL(a.referrer.trim()).hostname;
      if (host) out.referrerHost = host.slice(0, 253);
    } catch {
      /* not a URL: dropped */
    }
  }
  const rh = a.referrerHost;
  if (!out.referrerHost && typeof rh === 'string' && rh.trim().length <= 253 && HOST.test(rh.trim())) {
    out.referrerHost = rh.trim().toLowerCase();
  }
  return out;
}

export function parseDemoRequest(body: unknown): DemoInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    throw new ValidationError({ body: 'Send the form as JSON.' });
  const src = body as Record<string, unknown>;
  const errors: Fields = {};
  const fullName = text(src, 'fullName', errors, { required: true, max: 200, what: 'name' });
  const company = text(src, 'company', errors, { required: true, max: 200 });
  const industry = text(src, 'industry', errors, { required: false, max: 100 });
  const phone = text(src, 'phone', errors, { required: false, max: 40 });
  const website = text(src, 'website', errors, { required: false, max: 300 });
  const emailRaw = text(src, 'email', errors, { required: true, max: 320, what: 'email address' });
  const email = emailRaw?.toLowerCase();
  if (email && !EMAIL.test(email)) errors.email = 'Enter a valid email address.';
  if (phone && !PHONE.test(phone)) errors.phone = 'Enter a phone number using digits, spaces and + ( ) - only.';
  if (website && !WEBSITE.test(website)) errors.website = 'Enter a website like example.com.';
  if (typeof src.marketingConsent !== 'boolean')
    errors.marketingConsent = 'Choose whether we may send you product news.';
  const token = src.formToken;
  if (typeof token !== 'string' || !token || token.length > 200) errors.formToken = 'Reload the page and try again.';
  const w2 = src.website2;
  if (w2 !== undefined && w2 !== null && (typeof w2 !== 'string' || w2.length > 2000)) errors.website2 = 'Not valid.';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return {
    fullName: fullName!,
    email: email!,
    company: company!,
    industry,
    phone,
    website,
    marketingConsent: src.marketingConsent as boolean,
    formToken: token as string,
    website2: typeof w2 === 'string' && w2 ? w2 : undefined,
    attribution: parseAttribution(src.attribution),
  };
}

export const firstNameOf = (fullName: string): string => fullName.trim().split(/\s+/)[0]!;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
