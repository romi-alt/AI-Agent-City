import { z } from 'zod';
import { ApiError } from '../common/errors.js';

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform(v => (v ? v : undefined));

const utm = z.string().trim().max(200).optional();

/**
 * POST /api/demo/requests. Messages are written for the person filling in the form; they never echo the value.
 * `website2` is a honeypot: hidden from people, so anything in it means a bot filled the form.
 */
export const DemoRequestBody = z.object({
  fullName: z.string().trim().min(1, 'Enter your name.').max(200, 'Use at most 200 characters.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320, 'Use at most 320 characters.')
    .pipe(z.email('Enter a valid email address.')),
  company: z.string().trim().min(1, 'Enter your company.').max(200, 'Use at most 200 characters.'),
  industry: optionalText(100, 'Use at most 100 characters.'),
  phone: optionalText(40, 'Use at most 40 characters.').refine(
    v => v === undefined || /^[0-9+().\s/-]{3,40}$/.test(v),
    {
      message: 'Enter a phone number using digits, spaces and + ( ) - only.',
    },
  ),
  website: optionalText(300, 'Use at most 300 characters.').refine(
    v => v === undefined || /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(:\d{1,5})?(\/\S*)?$/i.test(v),
    { message: 'Enter a website like example.com.' },
  ),
  marketingConsent: z.boolean({ message: 'Choose whether we may send you product news.' }),
  formToken: z.string().min(1, 'Reload the page and try again.').max(200, 'Reload the page and try again.'),
  website2: z.string().max(2000).optional(),
  /** Optional campaign attribution from the landing page URL (`utm_*`) and the referring page. */
  attribution: z
    .object({
      utmSource: utm,
      utmMedium: utm,
      utmCampaign: utm,
      utmTerm: utm,
      utmContent: utm,
      referrer: z.string().trim().max(2000).optional(),
      /** The web form sends the referring host only (it never reads the path). */
      referrerHost: z.string().trim().max(253).optional(),
    })
    .optional(),
});
export type DemoRequestInput = z.infer<typeof DemoRequestBody>;

/** 400 validation_failed with `details.issues` (M04) and `details.fields` (one message per field, for the form). */
export function parseDemoRequest(body: unknown): DemoRequestInput {
  const r = DemoRequestBody.safeParse(body);
  if (r.success) return r.data;
  const issues = r.error.issues.slice(0, 20).map(i => ({
    path: i.path.map(p => (typeof p === 'symbol' ? String(p.description ?? '') : p)),
    code: i.code,
    message: i.message,
  }));
  const fields: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.length ? i.path.join('.') : 'body';
    fields[key] ??= i.message;
  }
  throw new ApiError('validation_failed', 'Some of the information is missing or not valid.', {
    details: { issues, fields },
  });
}

/** Attribution as stored: utm values and the referrer's host only (never its path or query). */
export function attributionOf(input: DemoRequestInput['attribution']): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  for (const k of ['utmSource', 'utmMedium', 'utmCampaign', 'utmTerm', 'utmContent'] as const) {
    if (input[k]) out[k] = input[k]!;
  }
  if (input.referrer) {
    try {
      const host = new URL(input.referrer).hostname;
      if (host) out.referrerHost = host.slice(0, 253);
    } catch {
      /* not a URL: dropped */
    }
  }
  if (!out.referrerHost && input.referrerHost && /^[a-z0-9.-]+(:\d+)?$/i.test(input.referrerHost)) {
    out.referrerHost = input.referrerHost.toLowerCase();
  }
  return out;
}

/** First name and last name for the identity provider. A single name is used for both (its profile needs both). */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0]!;
  return { firstName, lastName: parts.slice(1).join(' ') || firstName };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
