// Device proofs (DESIGN.md "Device binding"): a compact JWS in the style of RFC 9449 (DPoP), signed with this
// browser's non-extractable P-256 key. Everything here is pure WebCrypto so it runs in the browser and in Node's
// unit tests alike (Node 22 has globalThis.crypto.subtle). No DOM, no imports.

/** The public half of a P-256 key as a JWK: only the members RFC 7638 needs, nothing private. */
export interface PublicEcJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

export const DEVICE_PROOF_TYPE = 'device-proof+jwt';

export interface ProofClaims {
  htm: string;
  htu: string;
  iat: number;
  jti: string;
}

const encoder = new TextEncoder();

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlDecode(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Keep only the public members of an exported EC JWK (drops key_ops, ext and anything else). */
export function toPublicJwk(jwk: JsonWebKey): PublicEcJwk {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) throw new Error('expected a P-256 public key');
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
}

/**
 * RFC 7638 thumbprint: SHA-256 over the required members in lexicographic order with no whitespace
 * (`{"crv":…,"kty":…,"x":…,"y":…}` for EC keys), base64url-encoded. The API uses it as the device id (`jkt`).
 */
export async function jwkThumbprint(jwk: PublicEcJwk, subtle: SubtleCrypto = crypto.subtle): Promise<string> {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  return base64url(await subtle.digest('SHA-256', encoder.encode(canonical)));
}

/**
 * The `htu` claim: the page's origin plus the request path, with no query string or fragment. `target` may be a path
 * ("/api/auth/me?x=1") or an absolute URL on the same origin.
 */
export function proofUrl(origin: string, target: string): string {
  const url = new URL(target, origin);
  return `${url.origin}${url.pathname}`;
}

export function randomJti(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Sign a proof. WebCrypto's ECDSA output is already the raw r||s (64 bytes for P-256) that JWS ES256 requires, so
 * no DER conversion is needed.
 */
export async function signDeviceProof(
  input: {
    privateKey: CryptoKey;
    publicJwk: PublicEcJwk;
    htm: string;
    htu: string;
    iat?: number;
    jti?: string;
  },
  subtle: SubtleCrypto = crypto.subtle,
): Promise<string> {
  const header = { typ: DEVICE_PROOF_TYPE, alg: 'ES256', jwk: input.publicJwk };
  const claims: ProofClaims = {
    htm: input.htm.toUpperCase(),
    htu: input.htu,
    iat: input.iat ?? Math.floor(Date.now() / 1000),
    jti: input.jti ?? randomJti(),
  };
  const signingInput = `${base64url(encoder.encode(JSON.stringify(header)))}.${base64url(
    encoder.encode(JSON.stringify(claims)),
  )}`;
  const signature = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    input.privateKey,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${base64url(signature)}`;
}
