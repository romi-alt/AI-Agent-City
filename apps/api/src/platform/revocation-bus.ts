import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { API_ENV, type ApiEnv } from '../env.js';

/**
 * Something lost access. Published by auth (session/device/person revoked) and access (membership changed or
 * removed); consumed by realtime (disconnect sockets) and anyone caching authorization. Every API instance hears
 * every event through Redis, so a revocation applies cluster-wide. Events carry ids only, never tokens.
 */
export type Revocation =
  | { kind: 'session'; sessionId: string; reason: string }
  | { kind: 'device'; deviceId: string; reason: string }
  | { kind: 'person'; subject: string; reason: string }
  | { kind: 'membership'; subject: string; tenantId: string; reason: string };

const CHANNEL = 'agentcity:identity:revocations';

@Injectable()
export class RevocationBus implements OnModuleDestroy {
  private publisher?: Redis;
  private subscriber?: Redis;
  private readonly listeners = new Set<(r: Revocation) => void>();

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  async publish(r: Revocation): Promise<void> {
    this.publisher ??= new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: 2 });
    await this.publisher.publish(CHANNEL, JSON.stringify(r));
  }

  /** Listen for revocations from every API instance (including this one). Returns an unsubscribe function. */
  async subscribe(fn: (r: Revocation) => void): Promise<() => void> {
    if (!this.subscriber) {
      this.subscriber = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
      await this.subscriber.subscribe(CHANNEL);
      this.subscriber.on('message', (_ch, raw) => {
        let r: Revocation;
        try {
          r = JSON.parse(raw) as Revocation;
        } catch {
          return;
        }
        for (const l of this.listeners) l(r);
      });
    }
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.publisher?.quit(), this.subscriber?.quit()]);
  }
}
