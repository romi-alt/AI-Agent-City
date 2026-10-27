import { createHash } from 'node:crypto';

/** Namespace for every AgentCity name-based id. Never change it: imported and seeded ids depend on it. */
export const AGENTCITY_NAMESPACE = '6f3b8f0e-5d2a-4c41-9a57-2b7e1c9d4a10';

/**
 * RFC 9562 version-5 (SHA-1, name-based) UUID. The same parts always give the same id, which is what makes the
 * catalog seed and the legacy import repeatable.
 */
export function deterministicId(...parts: string[]): string {
  const ns = Buffer.from(AGENTCITY_NAMESPACE.replace(/-/g, ''), 'hex');
  const name = Buffer.from(parts.map(p => p.replace(/\\/g, '\\\\').replace(/\//g, '\\/')).join('/'), 'utf8');
  const h = createHash('sha1').update(ns).update(name).digest().subarray(0, 16);
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const hex = h.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
