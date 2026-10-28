import { adminGate, handler, json } from '../../../../../lib/lite/http.ts';
import { getService } from '../../../../../lib/lite/runtime.ts';
import { demoUnavailable } from '../../../../../lib/lite/errors.ts';

export const dynamic = 'force-dynamic';

const intParam = (v: string | null, fallback: number) => (v && /^\d{1,6}$/.test(v) ? Number(v) : fallback);

// The owner's lead list. Email addresses and phone numbers are masked unless ?full=1.
export const GET = handler(async (req: Request) => {
  const denied = adminGate(req);
  if (denied) return denied;
  const service = await getService();
  if (!service) throw demoUnavailable();
  const q = new URL(req.url).searchParams;
  return json(
    await service.adminLeads(intParam(q.get('page'), 1), intParam(q.get('pageSize'), 50), q.get('full') === '1'),
  );
});
