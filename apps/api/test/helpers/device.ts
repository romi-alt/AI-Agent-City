import { randomBytes } from 'node:crypto';
import { calculateJwkThumbprint, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from 'jose';

/**
 * A browser's device key for tests (DESIGN.md "Device binding"): an ES256 key pair, its public JWK and RFC 7638
 * thumbprint, and `proof()` to make `X-Device-Proof` values. Overrides produce deliberately broken proofs.
 */
export interface TestDevice {
  jwk: JWK;
  jkt: string;
  proof(htm: string, htu: string, o?: ProofOverrides): Promise<string>;
}

export interface ProofOverrides {
  iat?: number;
  jti?: string;
  typ?: string;
  /** Embed this device's key but sign with another one (signature mismatch). */
  signWith?: CryptoKey;
  /** Embed another public key (e.g. another device's). */
  embedJwk?: JWK;
}

export async function createDevice(): Promise<TestDevice & { privateKey: CryptoKey }> {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const full = await exportJWK(publicKey);
  const jwk: JWK = { kty: full.kty, crv: full.crv, x: full.x, y: full.y };
  const jkt = await calculateJwkThumbprint(jwk, 'sha256');
  return {
    jwk,
    jkt,
    privateKey,
    proof: (htm, htu, o = {}) =>
      new SignJWT({
        htm,
        htu,
        iat: o.iat ?? Math.floor(Date.now() / 1000),
        jti: o.jti ?? randomBytes(16).toString('base64url'),
      })
        .setProtectedHeader({ alg: 'ES256', typ: o.typ ?? 'device-proof+jwt', jwk: o.embedJwk ?? jwk })
        .sign(o.signWith ?? privateKey),
  };
}
