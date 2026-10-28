import { adminGate, handler, json } from '../../../../../lib/lite/http.ts';
import { getService } from '../../../../../lib/lite/runtime.ts';
import { demoUnavailable } from '../../../../../lib/lite/errors.ts';

export const dynamic = 'force-dynamic';

// Ends demos past their expiry and removes stale rate-limit rows and links. Safe to call from a daily cron.
export const POST = handler(async (req: Request) => {
  const denied = adminGate(req);
  if (denied) return denied;
  const service = await getService();
  if (!service) throw demoUnavailable();
  return json(await service.adminExpire());
});
