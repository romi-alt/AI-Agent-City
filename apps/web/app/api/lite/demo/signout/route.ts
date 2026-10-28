import { assertSameOrigin, clearedCookie, handler, json } from '../../../../../lib/lite/http.ts';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  return json({ ok: true }, 200, { 'set-cookie': clearedCookie() });
});
