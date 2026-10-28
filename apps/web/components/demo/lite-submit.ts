// Sends the demo request to the lite API from validated form values. Shared by the form and by "send it again".
import { liteFormToken, liteRequestDemo, LiteError } from '../../lib/api-client';
import { readAttribution } from './demo-api';
import { normaliseDemoForm, type DemoFormValues } from './demo-validation';

/** Takes a fresh single-use form token each time, so a retry after any failure starts clean. */
export async function submitDemoRequest(values: DemoFormValues, honeypot = ''): Promise<string> {
  const clean = normaliseDemoForm(values);
  const { referrerHost, ...utm } = readAttribution();
  const formToken = await liteFormToken();
  const { requestId } = await liteRequestDemo({
    name: clean.fullName,
    email: clean.email,
    company: clean.company,
    ...(clean.industry ? { industry: clean.industry } : {}),
    ...(clean.phone ? { phone: clean.phone } : {}),
    ...(clean.website ? { website: clean.website } : {}),
    marketingConsent: clean.marketingConsent,
    formToken,
    website2: honeypot,
    ...(referrerHost ? { referrerHost } : {}),
    ...(Object.keys(utm).length > 0 ? { attribution: utm } : {}),
  });
  return requestId;
}

/** The sentence shown for a refused or failed request. */
export function explainSubmitError(err: unknown): string {
  if (!(err instanceof LiteError)) return 'Something went wrong and your request was not sent. Please try again.';
  switch (err.code) {
    case 'rate_limited':
      return 'We have received several requests from you in a short time. Please wait a few minutes and try again.';
    case 'demo_unavailable':
      return 'Demo offices cannot be prepared right now. Please try again in a little while, or write to us.';
    case 'network':
      return err.message;
    case 'validation_failed':
    case 'bad_request':
      return err.message;
    default:
      return 'Something went wrong on our side and your request was not sent. Please try again.';
  }
}
