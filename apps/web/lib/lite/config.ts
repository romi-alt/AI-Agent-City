// Settings of the lite backend, read from the environment on every call so tests can change them.
// Nothing here is logged: several values are secrets.

export interface LiteLimits {
  ipPerTenMinutes: number;
  ipPerDay: number;
  emailPerHour: number;
  publicPerMinute: number;
}

export interface LiteConfig {
  production: boolean;
  /** Secret for cookies, form tokens and hashed rate-limit keys. Null only outside production. */
  secret: Buffer | null;
  publicOrigin: string;
  demoTtlDays: number;
  linkTtlSeconds: number;
  formMinSeconds: number;
  formMaxSeconds: number;
  /** Which privacy notice the form shows; stored with every consent choice. Bump it when the notice changes. */
  consentNoticeVersion: string;
  limits: LiteLimits;
  /** How many reverse proxies in front of the app append to X-Forwarded-For (the client address is that far from the end). */
  proxyHops: number;
  adminToken: string | null;
}

export const CONSENT_NOTICE_VERSION = '2026-10-x01';

export const DEFAULT_LIMITS: LiteLimits = { ipPerTenMinutes: 5, ipPerDay: 30, emailPerHour: 3, publicPerMinute: 60 };

/** A development-only key so `next dev` works without setup; production refuses to run without LITE_SECRET. */
const DEV_SECRET = 'lite-development-secret-not-for-production';

function intFrom(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = value === undefined || value === '' ? NaN : Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LiteConfig {
  const production = env.NODE_ENV === 'production';
  const raw = env.LITE_SECRET;
  const secret = raw && raw.length >= 16 ? Buffer.from(raw, 'utf8') : production ? null : Buffer.from(DEV_SECRET);
  return {
    production,
    secret,
    publicOrigin: (env.PUBLIC_ORIGIN ?? 'http://localhost:3000').replace(/\/+$/, ''),
    demoTtlDays: intFrom(env.DEMO_TTL_DAYS, 7, 1, 90),
    linkTtlSeconds: 24 * 3600,
    formMinSeconds: intFrom(env.DEMO_FORM_MIN_SECONDS, 3, 0, 600),
    formMaxSeconds: 2 * 3600,
    consentNoticeVersion: CONSENT_NOTICE_VERSION,
    limits: DEFAULT_LIMITS,
    proxyHops: intFrom(env.LITE_PROXY_HOPS, 1, 0, 5),
    adminToken: env.ADMIN_TOKEN && env.ADMIN_TOKEN.length >= 16 ? env.ADMIN_TOKEN : null,
  };
}
