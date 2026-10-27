import { z } from 'zod';

/**
 * Shared contracts for the platform's operational endpoints. Business contracts arrive with their stages
 * (M04 onwards); this package must stay free of server-only code so the browser can import it.
 */

/** One dependency the API needs before it can serve traffic. */
export const DependencyCheck = z.object({
  name: z.enum(['postgres', 'redis', 'objectStorage', 'temporal']),
  ok: z.boolean(),
  /** Short, non-secret explanation: never a connection string or credential. */
  detail: z.string(),
  latencyMs: z.number().nonnegative(),
});
export type DependencyCheck = z.infer<typeof DependencyCheck>;

/** GET /health/ready (REST) and the `readiness` GraphQL query. */
export const ReadinessReport = z.object({
  status: z.enum(['ready', 'not-ready']),
  checkedAt: z.string(),
  checks: z.array(DependencyCheck),
});
export type ReadinessReport = z.infer<typeof ReadinessReport>;

/** GET /health/live: the process is up. Says nothing about dependencies. */
export const Liveness = z.object({ status: z.literal('alive'), service: z.string(), version: z.string() });
export type Liveness = z.infer<typeof Liveness>;

/**
 * The platform heartbeat workflow: a harmless round trip through the API, Temporal and the worker, used to
 * prove the plumbing works. It writes two rows to platform.heartbeat and contacts nothing outside.
 */
export const HeartbeatInput = z.object({
  /** Stable id: starting the same id twice returns the same run instead of a second one. */
  runId: z.string().regex(/^[a-z0-9-]{6,64}$/),
  /** Durable pause between the two steps, so a worker can be restarted mid-run. */
  pauseSeconds: z.number().int().min(0).max(300),
});
export type HeartbeatInput = z.infer<typeof HeartbeatInput>;

export const HeartbeatResult = z.object({
  runId: z.string(),
  steps: z.array(z.object({ step: z.enum(['started', 'finished']), recordedAt: z.string() })),
  /** How many worker processes executed an activity of this run (more than one after a restart). */
  workerIds: z.array(z.string()),
});
export type HeartbeatResult = z.infer<typeof HeartbeatResult>;

/** Temporal task queue for platform plumbing work. Business queues arrive in M08. */
export const PLATFORM_TASK_QUEUE = 'agentcity-platform';
