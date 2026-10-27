import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { createPool } from '@agentcity/db';
import { Redis } from 'ioredis';
import type pg from 'pg';
import { API_ENV, type ApiEnv } from '../env.js';
import { RevocationBus } from './revocation-bus.js';

/** The app-role pool (agentcity_app). Tenant rows are reached only through withScope(APP_POOL, …). */
export const APP_POOL = Symbol('APP_POOL');
/** Shared Redis connection for commands (rate limits, replay caches). Subscribers create their own. */
export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    { provide: APP_POOL, inject: [API_ENV], useFactory: (env: ApiEnv) => createPool(env.DATABASE_URL, 10) },
    {
      provide: REDIS,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 }),
    },
    RevocationBus,
  ],
  exports: [APP_POOL, REDIS, RevocationBus],
})
export class PlatformModule implements OnModuleDestroy {
  constructor(
    @Inject(APP_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}
  async onModuleDestroy() {
    await Promise.allSettled([this.pool.end(), this.redis.quit()]);
  }
}
