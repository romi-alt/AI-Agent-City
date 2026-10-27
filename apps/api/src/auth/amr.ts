import type { AuthMethod } from './contracts.js';

/**
 * Maps the ID token's authentication-method claims to the AuthMethod values the API records (DESIGN.md:
 * passkey → `passkey`, email sign-in code → `email-code`, agency SSO → `sso`).
 *
 * The exact claim is defined by the Keycloak workstream in `m03/IDP.md`, which this module was written without.
 * Expected inputs (any combination):
 * - `amr`: an array of strings (or a single string), either our own values (`passkey`, `email-code`, `sso`) or the
 *   RFC 8176 / Keycloak "Authentication Method Reference" values listed in ALIASES below;
 * - `identity_provider`: the brokered IdP alias Keycloak can map into the token (`agency-sso` means SSO).
 *
 * Unknown values are dropped, never guessed upwards: an unrecognised method can only make a session look weaker.
 * Authorization never depends on `amr` alone; step-up is decided by `acr` (recorded verbatim) and its freshness.
 * Adjust ALIASES once IDP.md fixes the claim values.
 */
const ALIASES: Record<string, AuthMethod> = {
  passkey: 'passkey',
  webauthn: 'passkey',
  'webauthn-passwordless': 'passkey',
  hwk: 'passkey', // RFC 8176: proof of possession of a hardware-secured key
  'email-code': 'email-code',
  email_code: 'email-code',
  'email-otp': 'email-code',
  sso: 'sso',
  fed: 'sso',
  pwd: 'password',
  password: 'password',
  otp: 'otp',
  totp: 'otp',
  'recovery-code': 'recovery-code',
};

const SSO_IDP_ALIASES = new Set(['agency-sso']);

export function mapAuthMethods(claims: { amr?: unknown; identity_provider?: unknown }): AuthMethod[] {
  const raw = Array.isArray(claims.amr) ? claims.amr : typeof claims.amr === 'string' ? [claims.amr] : [];
  const out = new Set<AuthMethod>();
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const m = ALIASES[v.trim().toLowerCase()];
    if (m) out.add(m);
  }
  if (typeof claims.identity_provider === 'string' && SSO_IDP_ALIASES.has(claims.identity_provider)) out.add('sso');
  return [...out];
}

/** The numeric level of an `acr` value ("1" basic, "2" strong). Anything else counts as 0 (no assurance). */
export function acrLevel(acr: string | null | undefined): number {
  if (typeof acr !== 'string' || !/^[0-9]$/.test(acr)) return 0;
  return Number(acr);
}
