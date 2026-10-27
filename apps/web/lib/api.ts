import 'server-only';
import { ReadinessReport } from '@agentcity/contracts';

/**
 * Server-side calls to the API. `server-only` makes the build fail if a browser component imports this, so the
 * API address and anything added later (tokens, M03) can never be bundled for the browser.
 */
export type ApiStatus =
  { reachable: true; httpStatus: number; report: ReadinessReport } | { reachable: false; reason: string };

export async function fetchReadiness(): Promise<ApiStatus> {
  const base = process.env.API_URL;
  if (!base) return { reachable: false, reason: 'API_URL is not set' };
  try {
    const res = await fetch(`${base}/health/ready`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const parsed = ReadinessReport.safeParse(await res.json());
    if (!parsed.success) return { reachable: false, reason: `unexpected response (HTTP ${res.status})` };
    return { reachable: true, httpStatus: res.status, report: parsed.data };
  } catch (e) {
    return { reachable: false, reason: (e as Error).name === 'TimeoutError' ? 'timed out' : 'connection failed' };
  }
}
