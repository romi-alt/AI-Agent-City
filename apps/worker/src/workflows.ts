// Workflow code runs in Temporal's deterministic sandbox: no I/O, clocks or randomness here, only activities
// and Temporal's own durable primitives. Import types only from outside packages.
import type { HeartbeatInput, HeartbeatResult } from '@agentcity/contracts';
import { proxyActivities, sleep } from '@temporalio/workflow';
import type { Activities } from './activities.js';

const { recordStep, readRun } = proxyActivities<Activities>({
  startToCloseTimeout: '30 seconds',
  retry: { initialInterval: '1 second', maximumAttempts: 10 },
});

/**
 * Platform heartbeat: record "started", wait on a durable timer, record "finished", report what happened.
 * The timer survives worker and server restarts, which is what the M01 restart check relies on.
 */
export async function heartbeat(input: HeartbeatInput): Promise<HeartbeatResult> {
  await recordStep(input.runId, 'started');
  await sleep(input.pauseSeconds * 1000);
  await recordStep(input.runId, 'finished');
  return readRun(input.runId);
}

export * from './demo-workflow.js';
