import { clientIp, redirect, sessionCookie } from '../../../../../lib/lite/http.ts';
import { getService } from '../../../../../lib/lite/runtime.ts';

export const dynamic = 'force-dynamic';

const EXPIRED = '/demo/verified?error=expired';

// The one-time link from the email. A browser lands here, so every outcome is a redirect, never JSON.
export async function GET(req: Request): Promise<Response> {
  try {
    const service = await getService();
    const token = new URL(req.url).searchParams.get('t');
    const outcome = service ? await service.verify(token, clientIp(req)) : null;
    if (!outcome) return redirect(EXPIRED);
    return redirect('/demo/welcome', sessionCookie(outcome.cookie, outcome.maxAgeSeconds));
  } catch (e) {
    console.error(`lite: verify failed (${(e as Error).name})`);
    return redirect(EXPIRED);
  }
}
