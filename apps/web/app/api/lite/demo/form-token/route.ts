import { clientIp, handler, json } from '../../../../../lib/lite/http.ts';
import { getService } from '../../../../../lib/lite/runtime.ts';
import { demoUnavailable } from '../../../../../lib/lite/errors.ts';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request) => {
  const service = await getService();
  if (!service) throw demoUnavailable();
  return json(await service.formToken(clientIp(req)));
});
