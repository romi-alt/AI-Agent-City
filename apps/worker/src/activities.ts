import type { HeartbeatResult } from '@agentcity/contracts';
import type pg from 'pg';

/**
 * Activities for the platform heartbeat. They only touch platform.heartbeat in our own database; nothing here
 * contacts a person or an outside provider. Each step is idempotent (primary key on run_id + step), so a
 * retried or restarted activity cannot record a step twice.
 */
export function createActivities(pool: pg.Pool, workerId: string) {
  return {
    async recordStep(runId: string, step: 'started' | 'finished'): Promise<void> {
      await pool.query(
        'INSERT INTO platform.heartbeat (run_id, step, worker_id) VALUES ($1, $2, $3) ON CONFLICT (run_id, step) DO NOTHING',
        [runId, step, workerId],
      );
    },
    async readRun(runId: string): Promise<HeartbeatResult> {
      const r = await pool.query<{ step: 'started' | 'finished'; recorded_at: Date; worker_id: string }>(
        'SELECT step, recorded_at, worker_id FROM platform.heartbeat WHERE run_id = $1 ORDER BY recorded_at',
        [runId],
      );
      return {
        runId,
        steps: r.rows.map(x => ({ step: x.step, recordedAt: x.recorded_at.toISOString() })),
        workerIds: [...new Set(r.rows.map(x => x.worker_id))],
      };
    },
  };
}
export type Activities = ReturnType<typeof createActivities>;
