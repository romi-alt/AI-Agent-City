import { assertSameOrigin, clientIp, handler, json } from '../../../../../lib/lite/http.ts';
import { getService } from '../../../../../lib/lite/runtime.ts';
import { demoUnavailable, LiteError } from '../../../../../lib/lite/errors.ts';

export const dynamic = 'force-dynamic';

// "Send me a new link": the way back into a demo from another browser or after the cookie is gone.
export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const service = await getService();
  if (!service) throw demoUnavailable();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new LiteError('validation_failed', 'Enter a valid email address.', {
      fields: { email: 'Enter a valid email address.' },
    });
  }
  return json(await service.signIn(body, clientIp(req)));
});
