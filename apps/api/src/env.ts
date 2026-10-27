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
  }
  return env;
}

export const API_ENV = Symbol('API_ENV');
