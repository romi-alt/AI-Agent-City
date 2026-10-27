import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Form tokens: an HMAC-signed issue time. The landing page fetches one when it shows the form; a submission made
 * sooner than the minimum age (a bot filling the form instantly) or with a forged or stale token is refused. The
 * token proves nothing about the person; it only slows down blind form posting.
 *
 * Format: `v1.<issuedAtMs base36>.<nonce>.<hmac base64url>`.
 */
export type FormTokenCheck = 'ok' | 'too-fast' | 'expired' | 'invalid';

export function createFormTokens(key: Buffer, now: () => number = Date.now) {
  const mac = (payload: string) => createHmac('sha256', key).update(`agentcity.demo-form.v1\n${payload}`).digest();
  return {
    issue(): string {
      const payload = `v1.${now().toString(36)}.${randomBytes(9).toString('base64url')}`;
      return `${payload}.${mac(payload).toString('base64url')}`;
    },
    check(token: string, minSeconds: number, maxSeconds: number): FormTokenCheck {
      if (typeof token !== 'string' || token.length > 200) return 'invalid';
      const parts = token.split('.');
      if (parts.length !== 4 || parts[0] !== 'v1') return 'invalid';
      const payload = parts.slice(0, 3).join('.');
      const given = Buffer.from(parts[3]!, 'base64url');
      const expected = mac(payload);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 'invalid';
      const issuedAt = parseInt(parts[1]!, 36);
      if (!Number.isFinite(issuedAt)) return 'invalid';
      const age = (now() - issuedAt) / 1000;
      if (age < -5) return 'invalid';
      if (age < minSeconds) return 'too-fast';
      if (age > maxSeconds) return 'expired';
      return 'ok';
    },
  };
}
export type FormTokens = ReturnType<typeof createFormTokens>;
