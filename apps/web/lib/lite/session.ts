import { hmacB64, safeEqual } from './crypto.ts';

// The visitor's session is one signed cookie holding the lead id and demo generation. It carries no password and
// no personal data. Every read is keyed by this id; no endpoint accepts a lead id from the client.

export const COOKIE_NAME = 'ac_demo';

export interface SessionClaim {
  leadId: string;
  generation: number;
  expiresAt: number;
}

export function signSession(key: Buffer, claim: SessionClaim): string {
  const payload = `v1.${claim.leadId}.${claim.generation}.${claim.expiresAt.toString(36)}`;
  return `${payload}.${hmacB64(key, `session\n${payload}`)}`;
}

/** Expiry is not checked here: an expired demo must answer 410 (gone), which only the lead's own record can tell. */
export function readSession(key: Buffer, value: string | undefined): SessionClaim | null {
  if (!value || value.length > 300) return null;
  const parts = value.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') return null;
  const payload = parts.slice(0, 4).join('.');
  if (!safeEqual(parts[4]!, hmacB64(key, `session\n${payload}`))) return null;
  const generation = Number(parts[2]);
  const expiresAt = parseInt(parts[3]!, 36);
  if (!Number.isInteger(generation) || !Number.isFinite(expiresAt)) return null;
  return { leadId: parts[1]!, generation, expiresAt };
}
