import { z } from 'zod';

/** API configuration, validated at start. Fails fast listing every problem, and never prints values. */
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().startsWith('postgres'),
  REDIS_URL: z.string().startsWith('redis'),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  TEMPORAL_ADDRESS: z.string().min(3),
  TEMPORAL_NAMESPACE: z.string().min(1),
  /** Development-only routes (the heartbeat round trip). Never on in production; enforced below. */
  ENABLE_DEV_ROUTES: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  /** Per-dependency time limit for readiness checks. */
  READINESS_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(2000),

  // Identity (M03). The API is the OIDC client (backend for frontend): tokens never reach the browser.
  /** The browser-facing origin (the web app, which proxies /api/* here). Also the only accepted Origin for writes. */
  PUBLIC_ORIGIN: z.string().url(),
  OIDC_ISSUER: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(16),
  OIDC_REDIRECT_URI: z.string().url(),
  OIDC_POST_LOGOUT_REDIRECT_URI: z.string().url(),
  /** Encrypts refresh tokens at rest in identity.session. Production: 32+ random bytes from the secret store. */
  SESSION_ENCRYPTION_KEY: z.string().min(32),
  SESSION_IDLE_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(12 * 60),
  SESSION_ABSOLUTE_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(30 * 24)
    .default(7 * 24),
  /** How recent a strong sign-in must be for credential, billing and permission changes. */
  STEP_UP_MAX_AGE_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  DEVICE_PROOF_MAX_SKEW_SECONDS: z.coerce.number().int().min(5).max(300).default(60),
  INVITATION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(14 * 24)
    .default(48),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),

  // Demo funnel (X01). Without a provisioner client the demo request endpoint answers 503 demo_unavailable.
  /** Keycloak service-account client allowed to create demo users and send their verification email. */
  PROVISIONER_CLIENT_ID: z.string().min(1).optional(),
  PROVISIONER_CLIENT_SECRET: z.string().min(16).optional(),
  DEMO_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  /** Spam defence: a form submitted faster than this after it was shown is refused. */
  DEMO_FORM_MIN_SECONDS: z.coerce.number().int().min(0).max(60).default(3),
});
export type ApiEnv = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid API configuration: ${problems}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    // Secret boundary: the committed local-development credentials must never reach production.
    if (Object.values(source).some(v => typeof v === 'string' && v.includes('local-dev-only'))) {
      throw new Error(
        'Refusing to start in production with local-development credentials (values containing "local-dev-only").',
      );
    }
    if (env.ENABLE_DEV_ROUTES) throw new Error('ENABLE_DEV_ROUTES must not be true in production.');
    if (!env.COOKIE_SECURE) throw new Error('COOKIE_SECURE must be true in production.');
    for (const k of ['PUBLIC_ORIGIN', 'OIDC_ISSUER', 'OIDC_REDIRECT_URI'] as const) {
      if (!env[k].startsWith('https://')) throw new Error(`${k} must use https in production.`);
    }
  }
  return env;
}

export const API_ENV = Symbol('API_ENV');
