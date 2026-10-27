// Demo expiry (X01, PLAN.md decision 5): ends demos whose DEMO_TTL_DAYS have passed by calling app.expire_demos,
// which revokes the demo memberships, clears sessions pointing into the demo tenants and removes the demo data (see
// packages/db/migrations/1793318400000_demo.sql for what is removed and what is kept).
//
// Two ways to run it:
// - As a Temporal activity (createDemoActivities) behind the expireDemosWorkflow in demo-workflow.ts, started by a
//   Temporal Schedule, e.g. hourly:
//     temporal schedule create --schedule-id demo-expire --interval 1h --overlap-policy Skip \
//       --workflow-type expireDemosWorkflow --task-queue <PLATFORM_TASK_QUEUE> --workflow-id demo-expire
//   (the worker must register the activity and export the workflow; see the X01 workstream C report).
// - As a command: `node --env-file-if-exists=../../infra/local-dev.env --import tsx src/demo-expire.ts` from
//   apps/worker (suggested root script: "demo:expire").
//
// It is idempotent and safe to run concurrently (rows are locked with SKIP LOCKED). It prints counts and tenant ids
// only, never personal data.
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export interface DemoExpiryResult {
  /** Demos ended in this run. */
  expired: number;
  /** Their demo tenant ids. */
  tenantIds: string[];
  /** Memberships ended (one per person who had claimed a demo). */
  membershipsEnded: number;
}

/** Runs app.expire_demos as the app role. `now` can only make expiry earlier than the database clock, never later. */
export async function expireDemos(pool: pg.Pool, now: Date = new Date()): Promise<DemoExpiryResult> {
  const r = await pool.query<{ tenant_id: string; revoked_subjects: string[] }>(
    'SELECT tenant_id, revoked_subjects FROM app.expire_demos($1)',
    [now],
  );
  return {
    expired: r.rows.length,
    tenantIds: r.rows.map(x => x.tenant_id),
    membershipsEnded: r.rows.reduce((n, x) => n + x.revoked_subjects.length, 0),
  };
}

/** Temporal activities for demo expiry. Register them on the worker next to the platform activities. */
export function createDemoActivities(pool: pg.Pool) {
  return {
    async expireDemos(): Promise<DemoExpiryResult> {
      return expireDemos(pool);
    },
  };
}
export type DemoActivities = ReturnType<typeof createDemoActivities>;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith('postgres')) {
    console.error('DATABASE_URL is not set (for local development the scripts read infra/local-dev.env).');
    process.exit(2);
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const result = await expireDemos(pool);
    console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: Error) => {
    console.error(`demo expiry failed: ${e.name}: ${e.message}`);
    process.exit(1);
  });
}
