import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PLATFORM_TASK_QUEUE } from '@agentcity/contracts';
import { createPool } from '@agentcity/db';
import { NativeConnection, Worker } from '@temporalio/worker';
import { createActivities } from './activities.js';
import { createDemoActivities } from './demo-expire.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const workerId = env.WORKER_ID ?? `${hostname()}-${process.pid}`;
const pool = createPool(env.DATABASE_URL, 4);
const connection = await NativeConnection.connect({ address: env.TEMPORAL_ADDRESS });

const worker = await Worker.create({
  connection,
  namespace: env.TEMPORAL_NAMESPACE,
  taskQueue: PLATFORM_TASK_QUEUE,
  workflowsPath: fileURLToPath(new URL('./workflows.js', import.meta.url)),
  activities: { ...createActivities(pool, workerId), ...createDemoActivities(pool) },
});

console.log(
  `[worker] ${workerId} polling task queue "${PLATFORM_TASK_QUEUE}" on ${env.TEMPORAL_ADDRESS} (namespace ${env.TEMPORAL_NAMESPACE})`,
);
// run() resolves after SIGINT/SIGTERM, once in-flight tasks are handed back to Temporal.
await worker.run();
await pool.end();
await connection.close();
console.log(`[worker] ${workerId} stopped`);
