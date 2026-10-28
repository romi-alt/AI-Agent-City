// Sends the demo request to the lite API from validated form values. Shared by the form and by "send it again".
import { liteFormToken, liteRequestDemo, liteSignIn, LiteError } from '../../lib/api-client';
import { readAttribution } from './demo-api';
import { normaliseDemoForm, type DemoFormValues } from './demo-validation';

// The server refuses a form token younger than 3 s (a bot filter), so the token is fetched when the form opens and
// a submit that comes sooner waits out the difference. It is dropped after 90 minutes, well inside the 2 h limit.
const MIN_AGE_MS = 3200;
const MAX_AGE_MS = 90 * 60_000;
type HeldToken = { token: string; at: number } | null;
let held: Promise<HeldToken> | null = null;

/** Gets a form token ahead of time (call when the form appears and again after each use). */
export function prefetchFormToken(): void {
  held = liteFormToken()
    .then(token => ({ token, at: Date.now() }))
    .catch(() => null);
}

async function takeFormToken(): Promise<string> {
  const ready = held ? await held : null;
  held = null;
  const usable = ready && Date.now() - ready.at < MAX_AGE_MS ? ready : null;
  const got = usable ?? { token: await liteFormToken(), at: Date.now() };
  const wait = MIN_AGE_MS - (Date.now() - got.at);
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  return got.token;
}

/** Sends the request with its own form token; the next one is fetched for a retry. */
export async function submitDemoRequest(values: DemoFormValues, honeypot = ''): Promise<string> {
  const clean = normaliseDemoForm(values);
  const { referrerHost, ...utm } = readAttribution();
  const formToken = await takeFormToken();
  prefetchFormToken();
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

/** Asks for a fresh sign-in link for a visitor who already has a demo office. */
export async function requestSignInLink(email: string, honeypot = ''): Promise<void> {
  const formToken = await takeFormToken();
  prefetchFormToken();
  await liteSignIn({ email: email.trim(), formToken, website2: honeypot });
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
