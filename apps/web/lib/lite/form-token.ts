import { randomBytes } from 'node:crypto';
import { hmacB64, safeEqual } from './crypto.ts';

/**
 * Form tokens: an HMAC-signed issue time. The landing page fetches one when it shows the form; a submission made
 * sooner than the minimum age (a bot filling the form instantly) or with a forged or stale token is refused. The
 * token proves nothing about the person; it only slows down blind form posting.
 *
 * Format: `v1.<issuedAtMs base36>.<nonce>.<hmac base64url>`.
 */
export type FormTokenCheck = 'ok' | 'too-fast' | 'expired' | 'invalid';

export function issueFormToken(key: Buffer, now: number): string {
  const payload = `v1.${now.toString(36)}.${randomBytes(9).toString('base64url')}`;
  return `${payload}.${hmacB64(key, `form\n${payload}`)}`;
}

export function checkFormToken(
  key: Buffer,
  token: string,
  minSeconds: number,
  maxSeconds: number,
  now: number,
): FormTokenCheck {
  if (typeof token !== 'string' || token.length > 200) return 'invalid';
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return 'invalid';
  const payload = parts.slice(0, 3).join('.');
  if (!safeEqual(parts[3]!, hmacB64(key, `form\n${payload}`))) return 'invalid';
  const issuedAt = parseInt(parts[1]!, 36);
  if (!Number.isFinite(issuedAt)) return 'invalid';
  const age = (now - issuedAt) / 1000;
  if (age < -5) return 'invalid';
  if (age < minSeconds) return 'too-fast';
  if (age > maxSeconds) return 'expired';
  return 'ok';
}
