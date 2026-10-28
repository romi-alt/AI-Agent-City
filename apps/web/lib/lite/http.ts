import { timingSafeEqual } from 'node:crypto';
import { sha256Hex } from './crypto.ts';
import { loadConfig } from './config.ts';
import { demoUnavailable, LiteError } from './errors.ts';
import { COOKIE_NAME } from './session.ts';

// Small helpers shared by the route handlers: JSON replies that are never cached, error mapping, client address,
// cookies and the admin bearer check.

const NO_STORE = { 'cache-control': 'no-store' };

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof LiteError) {
    const headers: Record<string, string> = {};
    const retry = e.details?.retryAfterSeconds;
    if (typeof retry === 'number') headers['retry-after'] = String(retry);
    return json(
      { error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } },
      e.status,
      headers,
    );
  }
  console.error(`lite: unexpected error (${(e as Error)?.name ?? 'unknown'})`);
  const d = demoUnavailable();
  return json({ error: { code: d.code, message: d.message } }, d.status);
}

/** Wraps a handler so every failure becomes the documented error shape. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** The client address as the nearest trusted proxy saw it: counted from the end of X-Forwarded-For. */
export function clientIp(req: Request): string {
  const hops = loadConfig().proxyHops;
  const forwarded = req.headers.get('x-forwarded-for');
  if (hops > 0 && forwarded) {
    const parts = forwarded
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const ip = parts[Math.max(0, parts.length - hops)];
    if (ip) return ip.slice(0, 64);
  }
  return (req.headers.get('x-real-ip') ?? 'unknown').slice(0, 64);
}

/** Refuses cross-site writes: when the browser sends an Origin it must be this site. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (!origin) return;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    throw new LiteError('bad_request', 'We could not accept this request.');
  }
  const allowed = new Set([
    new URL(loadConfig().publicOrigin).host,
    req.headers.get('host') ?? '',
    req.headers.get('x-forwarded-host') ?? '',
  ]);
  if (!allowed.has(host)) throw new LiteError('bad_request', 'We could not accept this request.');
}

export function cookieOf(req: Request): string | undefined {
  const header = req.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE_NAME) return part.slice(i + 1).trim();
  }
  return undefined;
}

function secureFlag(): string {
  const c = loadConfig();
  return c.production || c.publicOrigin.startsWith('https:') ? '; Secure' : '';
}

export function sessionCookie(value: string, maxAgeSeconds: number): string {
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secureFlag()}`;
}

export const clearedCookie = (): string => `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureFlag()}`;

export function redirect(path: string, setCookie?: string): Response {
  const headers = new Headers({ location: `${loadConfig().publicOrigin}${path}`, ...NO_STORE });
  if (setCookie) headers.append('set-cookie', setCookie);
  return new Response(null, { status: 303, headers });
}

/** Admin routes: 404 when ADMIN_TOKEN is unset (the route does not exist), 401 on a wrong or missing bearer. */
export function adminGate(req: Request): Response | null {
  const token = loadConfig().adminToken;
  if (!token) return json({ error: { code: 'not_found', message: 'Not found.' } }, 404);
  const given = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
  const a = Buffer.from(sha256Hex(given), 'hex');
  const b = Buffer.from(sha256Hex(token), 'hex');
  if (!timingSafeEqual(a, b)) return json({ error: { code: 'unauthorized', message: 'Unauthorized.' } }, 401);
  return null;
}
