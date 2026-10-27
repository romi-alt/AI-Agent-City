import { createHmac } from 'node:crypto';
import type { Redis } from 'ioredis';

/**
 * Sliding-window counter in Redis (API-CONVENTIONS.md §6): the previous window's count, weighted by how much of it
 * still overlaps, plus the current window's. One Lua script, so check-and-count is atomic across API replicas.
 * Returns [allowed (0/1), current count, estimated count].
 */
const SCRIPT = `
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local elapsed = tonumber(ARGV[3])
local prev = tonumber(redis.call('GET', KEYS[2]) or '0')
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local estimate = prev * (window - elapsed) / window + cur
if estimate >= limit then
  return {0, cur, math.floor(estimate)}
end
cur = redis.call('INCR', KEYS[1])
if cur == 1 then redis.call('EXPIRE', KEYS[1], window * 2) end
return {1, cur, math.floor(estimate + 1)}
`;

export interface LimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window ends (also the Retry-After on refusal). */
  resetSeconds: number;
}

/**
 * Keys are `<prefix>:<class>:-:<hmac(subject)>:<windowSeconds>:<windowIndex>`: the IP or email address is hashed
 * with a server secret, so Redis never holds personal data.
 */
export class RateLimiter {
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly key: Buffer;
  private readonly now: () => number;

  constructor(redis: Redis, opts: { prefix: string; key: Buffer; now?: () => number }) {
    this.redis = redis;
    this.prefix = opts.prefix;
    this.key = opts.key;
    this.now = opts.now ?? Date.now;
  }

  private hash(subject: string) {
    return createHmac('sha256', this.key).update(subject).digest('base64url').slice(0, 32);
  }

  async hit(klass: string, subject: string, limit: number, windowSeconds: number): Promise<LimitResult> {
    const nowSec = this.now() / 1000;
    const index = Math.floor(nowSec / windowSeconds);
    const elapsed = nowSec - index * windowSeconds;
    const base = `${this.prefix}:${klass}:-:${this.hash(subject)}:${windowSeconds}`;
    const [allowed, , estimate] = (await this.redis.eval(
      SCRIPT,
      2,
      `${base}:${index}`,
      `${base}:${index - 1}`,
      String(limit),
      String(windowSeconds),
      String(elapsed),
    )) as [number, number, number];
    return {
      allowed: allowed === 1,
      limit,
      remaining: Math.max(0, limit - estimate),
      resetSeconds: Math.max(1, Math.ceil(windowSeconds - elapsed)),
    };
  }
}
