import { Inject, Injectable } from '@nestjs/common';
import { calculateJwkThumbprint, compactVerify, decodeProtectedHeader, importJWK, type JWK } from 'jose';
import { Redis } from 'ioredis';
import { API_ENV, type ApiEnv } from '../env.js';
import { REDIS } from '../platform/platform.module.js';
import { sha256Hex } from './crypto.js';

export const DEVICE_PROOF_TYP = 'device-proof+jwt';
const MAX_PROOF_LENGTH = 4096;

export interface DevicePublicJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

/** Why a proof was refused (for security events and tests; the client only ever sees `device_proof_required`). */
export class DeviceProofError extends Error {}

/**
 * Accepts only an ECDSA P-256 public key: no private part, no other key types. Returns a canonical copy holding
 * just the public members, which is what gets stored and thumbprinted.
 */
export function parseDevicePublicJwk(value: unknown): DevicePublicJwk | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const j = value as Record<string, unknown>;
  if (j.kty !== 'EC' || j.crv !== 'P-256' || 'd' in j) return null;
  const b64 = /^[A-Za-z0-9_-]{43}$/;
  if (typeof j.x !== 'string' || typeof j.y !== 'string' || !b64.test(j.x) || !b64.test(j.y)) return null;
  return { kty: 'EC', crv: 'P-256', x: j.x, y: j.y };
}

/** RFC 7638 SHA-256 thumbprint (base64url): the device id the session is bound to. */
export const deviceThumbprint = (jwk: DevicePublicJwk) => calculateJwkThumbprint(jwk as JWK, 'sha256');

/**
 * Verifies `X-Device-Proof` (DESIGN.md "Device binding"): a compact JWS with header
 * `{ typ: "device-proof+jwt", alg: "ES256", jwk }` and payload `{ htm, htu, iat, jti }`. Checks the signature with
 * the embedded key, the method and URL, the clock skew, and that the `jti` was never seen before (Redis SET NX).
 * Returns the key's thumbprint; the caller compares it with the session's device.
 */
@Injectable()
export class DeviceProofVerifier {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async verify(
    proof: string | undefined,
    expected: { htm: string; htu: string },
  ): Promise<{ jkt: string; jwk: DevicePublicJwk }> {
    if (!proof) throw new DeviceProofError('missing');
    if (proof.length > MAX_PROOF_LENGTH) throw new DeviceProofError('too long');

    let header: ReturnType<typeof decodeProtectedHeader>;
    try {
      header = decodeProtectedHeader(proof);
    } catch {
      throw new DeviceProofError('malformed');
    }
    if (header.typ !== DEVICE_PROOF_TYP) throw new DeviceProofError('wrong typ');
    if (header.alg !== 'ES256') throw new DeviceProofError('wrong alg');
    if (header.crit !== undefined) throw new DeviceProofError('unsupported crit');
    const jwk = parseDevicePublicJwk(header.jwk);
    if (!jwk) throw new DeviceProofError('bad jwk');

    let payload: Record<string, unknown>;
    try {
      const key = await importJWK(jwk as JWK, 'ES256');
      const { payload: bytes } = await compactVerify(proof, key, { algorithms: ['ES256'] });
      payload = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    } catch {
      throw new DeviceProofError('bad signature');
    }
    if (!payload || typeof payload !== 'object') throw new DeviceProofError('bad payload');

    if (payload.htm !== expected.htm) throw new DeviceProofError('htm mismatch');
    if (payload.htu !== expected.htu) throw new DeviceProofError('htu mismatch');
    const iat = payload.iat;
    if (typeof iat !== 'number' || !Number.isFinite(iat)) throw new DeviceProofError('bad iat');
    if (Math.abs(Date.now() / 1000 - iat) > this.env.DEVICE_PROOF_MAX_SKEW_SECONDS) throw new DeviceProofError('stale');
    const jti = payload.jti;
    if (typeof jti !== 'string' || jti.length < 16 || jti.length > 256) throw new DeviceProofError('bad jti');

    const jkt = await deviceThumbprint(jwk);
    // Single use: remembered for the whole window in which the iat check would still accept it.
    const fresh = await this.redis.set(
      `agentcity:auth:proof-jti:${jkt}:${sha256Hex(jti)}`,
      '1',
      'EX',
      this.env.DEVICE_PROOF_MAX_SKEW_SECONDS * 2 + 5,
      'NX',
    );
    if (fresh !== 'OK') throw new DeviceProofError('replayed');
    return { jkt, jwk };
  }
}
