import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Small crypto helpers shared by tokens, cookies and rate limits. Keys are derived per purpose so one leaked
// derivation (say, the rate-limit hash) never lets anyone forge another (a cookie).

export function deriveKey(secret: Buffer, purpose: string): Buffer {
  return createHmac('sha256', secret).update(`agentcity.lite.${purpose}`).digest();
}

export const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

/** A one-time token: 32 random bytes. Only its hash is ever stored. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256Hex(token) };
}

export function hmacB64(key: Buffer, payload: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
}
