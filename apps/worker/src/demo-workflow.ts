// Workflow code runs in Temporal's deterministic sandbox: no I/O here, only the activity call. Started by a Temporal
// Schedule (see demo-expire.ts); overlapping runs are skipped by the schedule and harmless anyway (SKIP LOCKED).
import { proxyActivities } from '@temporalio/workflow';
import type { DemoActivities, DemoExpiryResult } from './demo-expire.js';

const { expireDemos } = proxyActivities<DemoActivities>({
  startToCloseTimeout: '5 minutes',
  retry: { initialInterval: '10 seconds', maximumAttempts: 5 },
});

/** Ends every demo past its expiry. */
export async function expireDemosWorkflow(): Promise<DemoExpiryResult> {
  return expireDemos();
}
