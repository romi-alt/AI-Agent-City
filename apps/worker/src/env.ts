import { z } from 'zod';

/** Worker configuration, validated at start. Fails fast with every problem listed, and never prints values. */
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().startsWith('postgres'),
  TEMPORAL_ADDRESS: z.string().min(3),
  TEMPORAL_NAMESPACE: z.string().min(1),
  WORKER_ID: z.string().min(1).optional(),
});
export type WorkerEnv = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid worker configuration: ${problems}`);
  }
  // Secret boundary: the committed local-development credentials must never reach production.
  if (
    parsed.data.NODE_ENV === 'production' &&
    Object.values(source).some(v => typeof v === 'string' && v.includes('local-dev-only'))
  ) {
    throw new Error(
      'Refusing to start in production with local-development credentials (values containing "local-dev-only").',
    );
  }
  return parsed.data;
}
