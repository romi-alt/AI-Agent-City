// Unit tests for the device-proof and thumbprint logic (lib/device-proof.ts), using Node's WebCrypto.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  base64url,
  base64urlDecode,
  jwkThumbprint,
  proofUrl,
  signDeviceProof,
  toPublicJwk,
  type PublicEcJwk,
} from '../lib/device-proof.ts';

const subtle = globalThis.crypto.subtle;
const decoder = new TextDecoder();

async function newKey() {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const publicJwk = toPublicJwk(await subtle.exportKey('jwk', pair.publicKey));
  return { pair, publicJwk };
}

const parts = (jws: string) => {
  const [h, p, s] = jws.split('.');
  return {
    header: JSON.parse(decoder.decode(base64urlDecode(h!))),
    payload: JSON.parse(decoder.decode(base64urlDecode(p!))),
    signingInput: `${h}.${p}`,
    signature: base64urlDecode(s!),
  };
};

test('the proof is a compact JWS with the header and claims DESIGN.md specifies', async () => {
  const { pair, publicJwk } = await newKey();
  const jws = await signDeviceProof({
    privateKey: pair.privateKey,
    publicJwk,
    htm: 'post',
    htu: 'http://localhost:3000/api/auth/login/start',
    iat: 1_800_000_000,
    jti: 'abc',
  });
  assert.match(jws, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'three base64url parts, no padding');
  const { header, payload, signature } = parts(jws);
  assert.deepEqual(header, { typ: 'device-proof+jwt', alg: 'ES256', jwk: publicJwk });
  assert.deepEqual(Object.keys(header.jwk).sort(), ['crv', 'kty', 'x', 'y'], 'public members only');
  assert.deepEqual(payload, {
    htm: 'POST',
    htu: 'http://localhost:3000/api/auth/login/start',
    iat: 1_800_000_000,
    jti: 'abc',
  });
  assert.equal(signature.length, 64, 'ES256 signatures are raw r||s, 64 bytes');
});

test('defaults: iat is now in seconds and every proof gets a different jti', async () => {
  const { pair, publicJwk } = await newKey();
  const make = () => signDeviceProof({ privateKey: pair.privateKey, publicJwk, htm: 'GET', htu: 'http://x/api/a' });
  const [a, b] = await Promise.all([make(), make()]);
  const pa = parts(a).payload;
  assert.ok(Math.abs(pa.iat - Date.now() / 1000) < 5);
  assert.ok(Number.isInteger(pa.iat));
  assert.notEqual(pa.jti, parts(b).payload.jti);
  assert.ok(pa.jti.length >= 16);
});

test('the ES256 signature verifies with crypto.subtle.verify against the JWK in the header', async () => {
  const { pair, publicJwk } = await newKey();
  const jws = await signDeviceProof({
    privateKey: pair.privateKey,
    publicJwk,
    htm: 'GET',
    htu: 'http://x/api/auth/me',
  });
  const { header, signingInput, signature } = parts(jws);
  const key = await subtle.importKey('jwk', header.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const enc = new TextEncoder();
  assert.equal(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, enc.encode(signingInput)), true);
  // Tampering with the payload breaks it.
  const forged = signingInput.replace(/\.[^.]+$/, '.' + base64url(enc.encode('{"htm":"DELETE"}')));
  assert.equal(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, enc.encode(forged)), false);
});

test('RFC 7638 thumbprint: canonical JSON of crv, kty, x, y hashed with SHA-256', async () => {
  // RFC 7638 section 3.1 uses an RSA key; this applies the same rule to EC (required members crv, kty, x, y in
  // lexicographic order, no whitespace) and checks it against an independent computation.
  const jwk: PublicEcJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU',
    y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0',
  };
  const expected = base64url(
    await subtle.digest(
      'SHA-256',
      new TextEncoder().encode(
        '{"crv":"P-256","kty":"EC","x":"f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU","y":"x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0"}',
      ),
    ),
  );
  assert.equal(await jwkThumbprint(jwk), expected);
  // Member order and extra members in the input don't change it.
  const shuffled = { y: jwk.y, x: jwk.x, kty: 'EC', crv: 'P-256', ext: true, key_ops: ['verify'] } as JsonWebKey;
  assert.equal(await jwkThumbprint(toPublicJwk(shuffled)), expected);
  assert.match(expected, /^[A-Za-z0-9_-]{43}$/, '32 bytes base64url');
});

test('RFC 7638 section 3.1 vector reproduced with the same canonicalisation code path', async () => {
  // The RFC's own example (RSA): thumbprint NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs.
  const n =
    '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw';
  const canonical = JSON.stringify({ e: 'AQAB', kty: 'RSA', n });
  const digest = base64url(await subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
  assert.equal(digest, 'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs');
});

test('htu is origin + path: the query string and fragment are dropped', () => {
  assert.equal(proofUrl('http://localhost:3000', '/api/auth/me?x=1&y=2#frag'), 'http://localhost:3000/api/auth/me');
  assert.equal(
    proofUrl('http://localhost:3000', '/api/auth/sessions/abc'),
    'http://localhost:3000/api/auth/sessions/abc',
  );
  assert.equal(proofUrl('http://localhost:3000', '/socket.io'), 'http://localhost:3000/socket.io');
  assert.equal(proofUrl('http://localhost:3000', 'http://localhost:3000/api/a?b'), 'http://localhost:3000/api/a');
});

test('toPublicJwk refuses anything but a P-256 public key', () => {
  assert.throws(() => toPublicJwk({ kty: 'RSA', n: 'x', e: 'AQAB' }));
  assert.throws(() => toPublicJwk({ kty: 'EC', crv: 'P-384', x: 'a', y: 'b' }));
  assert.deepEqual(toPublicJwk({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b', d: 'secret' }), {
    kty: 'EC',
    crv: 'P-256',
    x: 'a',
    y: 'b',
  });
});
