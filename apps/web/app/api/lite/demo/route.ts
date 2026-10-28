import { assertSameOrigin, clientIp, handler, json } from '../../../../lib/lite/http.ts';
import { getService } from '../../../../lib/lite/runtime.ts';
import { demoUnavailable, LiteError } from '../../../../lib/lite/errors.ts';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const service = await getService();
  if (!service) throw demoUnavailable();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new LiteError('validation_failed', 'Some of the information is missing or not valid.', {
      fields: { body: 'Send the form as JSON.' },
    });
  }
  return json(await service.submit(body, clientIp(req)));
});
