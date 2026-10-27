import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import type { DependencyCheck, ReadinessReport } from '@agentcity/contracts';
import { createPool } from '@agentcity/db';
import { Connection } from '@temporalio/client';
import { Redis } from 'ioredis';
import { API_ENV, type ApiEnv } from '../env.js';

type Name = DependencyCheck['name'];

/**
 * Readiness: can this API serve traffic right now? Every dependency it needs is checked on each call, with a
 * time limit. Details are short and never include connection strings or credentials. The same report backs
 * REST (GET /health/ready) and GraphQL (`readiness`).
 */
@Injectable()
export class ReadinessService implements OnModuleDestroy {
  private readonly pool;
  private readonly redis;
  private readonly s3;
  private temporal?: Connection;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {
    this.pool = createPool(env.DATABASE_URL, 3);
    this.pool.on('error', () => {}); // a dropped idle connection must not crash the process; the next check reports it
    this.redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: env.READINESS_TIMEOUT_MS,
    });
    this.redis.on('error', () => {});
    this.s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }

  async report(): Promise<ReadinessReport> {
    const checks = await Promise.all([
      this.check('postgres', async () => {
        const r = await this.pool.query<{ ok: number }>('SELECT 1 AS ok FROM platform.heartbeat LIMIT 0');
        return `connected; schema "platform" readable (${r.command})`;
      }),
      this.check('redis', async () => {
        if (this.redis.status !== 'ready') {
          this.redis.disconnect();
          await this.redis.connect();
        }
        const pong = await this.redis.ping();
        return `connected (${pong})`;
      }),
      this.check('objectStorage', async () => {
        await this.s3.send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET }));
        return `bucket "${this.env.S3_BUCKET}" reachable`;
      }),
      this.check('temporal', async () => {
        this.temporal ??= await Connection.connect({
          address: this.env.TEMPORAL_ADDRESS,
          connectTimeout: this.env.READINESS_TIMEOUT_MS,
        });
        const info = await this.temporal.workflowService.getSystemInfo({});
        return `connected (server ${info.serverVersion || 'unknown version'})`;
      }),
    ]);
    return { status: checks.every(c => c.ok) ? 'ready' : 'not-ready', checkedAt: new Date().toISOString(), checks };
  }

  private async check(name: Name, run: () => Promise<string>): Promise<DependencyCheck> {
    const started = performance.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), this.env.READINESS_TIMEOUT_MS);
      });
      const detail = await Promise.race([run(), timeout]);
      return { name, ok: true, detail, latencyMs: Math.round(performance.now() - started) };
    } catch (e) {
      return { name, ok: false, detail: describe(e), latencyMs: Math.round(performance.now() - started) };
    } finally {
      clearTimeout(timer);
    }
  }

  async onModuleDestroy() {
    // quit() waits for a server reply, so only use it on a live connection; a never-connected client just drops.
    const redis = this.redis.status === 'ready' ? this.redis.quit() : Promise.resolve(this.redis.disconnect());
    await Promise.allSettled([this.pool.end(), redis, this.temporal?.close()]);
    this.s3.destroy();
  }
}

/** A short failure reason that cannot leak a connection string or credential. */
function describe(e: unknown): string {
  const err = e as { code?: string; name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  if (err?.code) return `unavailable (${err.code})`;
  if (err?.$metadata?.httpStatusCode) return `unavailable (HTTP ${err.$metadata.httpStatusCode})`;
  if (err?.message === 'timed out') return 'unavailable (timed out)';
  return `unavailable (${err?.name ?? 'error'})`;
}
