import { assertSameOrigin, clientIp, redirect, sessionCookie } from '../../../../../lib/lite/http.ts';
import { getService } from '../../../../../lib/lite/runtime.ts';

export const dynamic = 'force-dynamic';

const EXPIRED = '/demo/verified?error=expired';

// The one-time link from the email. Opening it must not use it up: mail security scanners (Safe Links, Mimecast,
// Proofpoint) open every link in a message before the person does, and would leave them on "link expired". So a GET
// only forwards to a page with a button, and the link is spent when that button posts the form back here.
export async function GET(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get('t');
  if (!token || token.length > 100) return redirect(EXPIRED);
  return redirect(`/demo/confirm?t=${encodeURIComponent(token)}`);
}

// Spends the link. A browser lands here from the confirm page, so every outcome is a redirect, never JSON.
export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const service = await getService();
    const form = await req.formData();
    const t = form.get('t');
    const token = typeof t === 'string' ? t : null;
    const outcome = service ? await service.verify(token, clientIp(req)) : null;
    if (!outcome) return redirect(EXPIRED);
    return redirect('/demo/welcome', sessionCookie(outcome.cookie, outcome.maxAgeSeconds));
  } catch (e) {
    console.error(`lite: verify failed (${(e as Error).name})`);
    return redirect(EXPIRED);
  }
}
