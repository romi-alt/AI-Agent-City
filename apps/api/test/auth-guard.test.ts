import assert from 'node:assert/strict';
import { generateKeyPair } from 'jose';
import { after, before, describe, it } from 'node:test';
import { createDevice, PUBLIC_ORIGIN, startAuthApp, type AuthApp, type Jar } from './helpers/auth-app.ts';
import type { TestDevice } from './helpers/device.ts';

/** The global SessionGuard: cookie → live session → device proof → Origin for writes. */
describe('auth: SessionGuard on every non-public route', () => {
  let t: AuthApp;
  let n = 0;
  /** A fresh signed-in browser (its own person, device and session). */
  async function signedIn(): Promise<{ jar: Jar; device: TestDevice; subject: string }> {
    const device = await createDevice();
    const sub = `guard-${++n}`;
    const { jar, res } = await t.login(device, { sub, email: `${sub}@example.com`, emailVerified: true });
    assert.equal(res.status, 303);
    return { jar, device, subject: `kc:${sub}` };
  }
  const expectError = (r: { status: number; body: { error?: string } }, status: number, error: string) => {
    assert.equal(r.status, status, JSON.stringify(r.body));
    assert.equal(r.body.error, error);
  };

  before(async () => {
    t = await startAuthApp();
  });
  after(async () => {
    await t?.close();
  });

  it('lets @Public() routes through with nothing', async () => {
    const r = await t.request('GET', '/api/probe/public', { origin: null });
    assert.equal(r.status, 200);
  });

  it('accepts a valid session and proof, and attaches req.session', async () => {
    const { jar, device, subject } = await signedIn();
    const r = await t.request('GET', '/api/probe', { jar, device, origin: null });
    assert.equal(r.status, 200);
    assert.equal(r.body.subject, subject);
    const w = await t.request('POST', '/api/probe', { jar, device });
    assert.equal(w.status, 201);
  });

  it('refuses without a cookie, or with an unknown one', async () => {
    const device = await createDevice();
    expectError(await t.request('GET', '/api/probe', { device }), 401, 'not_signed_in');
    expectError(
      await t.request('GET', '/api/probe', { device, jar: { ac_session: 'x'.repeat(43) } }),
      401,
      'not_signed_in',
    );
  });

  it('refuses a revoked session and tells the browser to drop the cookie', async () => {
    const { jar, device, subject } = await signedIn();
    await t.admin.query(`UPDATE identity.session SET revoked_at = now() WHERE subject = $1`, [subject]);
    const r = await t.request('GET', '/api/probe', { jar, device });
    expectError(r, 401, 'session_revoked');
    assert.ok(r.setCookies.some(c => c.startsWith('ac_session=;')));
  });

  it('refuses an idle-expired session', async () => {
    const { jar, device, subject } = await signedIn();
    await t.admin.query(
      `UPDATE identity.session SET idle_expires_at = now() - interval '1 second' WHERE subject = $1`,
      [subject],
    );
    expectError(await t.request('GET', '/api/probe', { jar, device }), 401, 'session_revoked');
  });

  it('refuses an absolute-expired session even if recently active', async () => {
    const { jar, device, subject } = await signedIn();
    await t.admin.query(
      `UPDATE identity.session SET absolute_expires_at = now() - interval '1 second', idle_expires_at = now() + interval '1 hour' WHERE subject = $1`,
      [subject],
    );
    expectError(await t.request('GET', '/api/probe', { jar, device }), 401, 'session_revoked');
  });

  it('refuses when the person is disabled', async () => {
    const { jar, device, subject } = await signedIn();
    await t.admin.query(`UPDATE identity.person SET disabled_at = now() WHERE subject = $1`, [subject]);
    expectError(await t.request('GET', '/api/probe', { jar, device }), 401, 'session_revoked');
  });

  it('refuses when the device is revoked', async () => {
    const { jar, device, subject } = await signedIn();
    await t.admin.query(`UPDATE identity.device SET revoked_at = now() WHERE subject = $1`, [subject]);
    expectError(await t.request('GET', '/api/probe', { jar, device }), 401, 'session_revoked');
  });

  it('refuses a missing proof: the cookie alone is useless', async () => {
    const { jar } = await signedIn();
    expectError(await t.request('GET', '/api/probe', { jar }), 401, 'device_proof_required');
  });

  it('refuses a proof with a bad signature', async () => {
    const { jar, device } = await signedIn();
    const other = await generateKeyPair('ES256');
    const forged = await device.proof('GET', `${PUBLIC_ORIGIN}/api/probe`, { signWith: other.privateKey });
    expectError(await t.request('GET', '/api/probe', { jar, proof: forged }), 401, 'device_proof_required');
    // A tampered payload with the original signature fails too.
    const good = await device.proof('GET', `${PUBLIC_ORIGIN}/api/probe`);
    const [h, , sig] = good.split('.');
    const payload = Buffer.from(
      JSON.stringify({
        htm: 'GET',
        htu: `${PUBLIC_ORIGIN}/api/probe`,
        iat: Math.floor(Date.now() / 1000),
        jti: 'x'.repeat(22),
      }),
    ).toString('base64url');
    expectError(
      await t.request('GET', '/api/probe', { jar, proof: `${h}.${payload}.${sig}` }),
      401,
      'device_proof_required',
    );
  });

  it('refuses a valid proof from a different device key (stolen cookie)', async () => {
    const { jar } = await signedIn();
    const thief = await createDevice();
    expectError(await t.request('GET', '/api/probe', { jar, device: thief }), 401, 'device_proof_required');
  });

  it('refuses a proof embedding another key than the one that signed it', async () => {
    const { jar, device } = await signedIn();
    const thief = await createDevice();
    const proof = await thief.proof('GET', `${PUBLIC_ORIGIN}/api/probe`, { embedJwk: device.jwk });
    expectError(await t.request('GET', '/api/probe', { jar, proof }), 401, 'device_proof_required');
  });

  it('refuses a proof for another method or URL', async () => {
    const { jar, device } = await signedIn();
    expectError(
      await t.request('GET', '/api/probe', { jar, device, proofMethod: 'POST' }),
      401,
      'device_proof_required',
    );
    expectError(
      await t.request('GET', '/api/probe', { jar, device, proofPath: '/api/auth/me' }),
      401,
      'device_proof_required',
    );
    const otherOrigin = await device.proof('GET', 'http://evil.example/api/probe');
    expectError(await t.request('GET', '/api/probe', { jar, proof: otherOrigin }), 401, 'device_proof_required');
    // The query string is not part of htu.
    assert.equal((await t.request('GET', '/api/probe?x=1', { jar, device })).status, 200);
  });

  it('refuses a stale or future iat', async () => {
    const { jar, device } = await signedIn();
    const now = Math.floor(Date.now() / 1000);
    const skew = t.env.DEVICE_PROOF_MAX_SKEW_SECONDS;
    expectError(
      await t.request('GET', '/api/probe', { jar, device, proofOverrides: { iat: now - skew - 5 } }),
      401,
      'device_proof_required',
    );
    expectError(
      await t.request('GET', '/api/probe', { jar, device, proofOverrides: { iat: now + skew + 5 } }),
      401,
      'device_proof_required',
    );
  });

  it('refuses a replayed proof (jti is single use)', async () => {
    const { jar, device } = await signedIn();
    const proof = await device.proof('GET', `${PUBLIC_ORIGIN}/api/probe`);
    assert.equal((await t.request('GET', '/api/probe', { jar, proof })).status, 200);
    expectError(await t.request('GET', '/api/probe', { jar, proof }), 401, 'device_proof_required');
  });

  it('refuses a proof with the wrong typ', async () => {
    const { jar, device } = await signedIn();
    expectError(
      await t.request('GET', '/api/probe', { jar, device, proofOverrides: { typ: 'dpop+jwt' } }),
      401,
      'device_proof_required',
    );
  });

  it('refuses a write without our Origin (CSRF), but not a read', async () => {
    const { jar, device } = await signedIn();
    expectError(
      await t.request('POST', '/api/probe', { jar, device, origin: 'https://evil.example' }),
      403,
      'bad_origin',
    );
    expectError(await t.request('POST', '/api/probe', { jar, device, origin: null }), 403, 'bad_origin');
    expectError(await t.request('POST', '/api/probe', { jar, device, origin: 'null' }), 403, 'bad_origin');
    assert.equal((await t.request('GET', '/api/probe', { jar, device, origin: null })).status, 200);
  });

  it('extends the idle expiry on use, never past the absolute expiry', async () => {
    const { jar, device, subject } = await signedIn();
    await t.admin.query(
      `UPDATE identity.session SET last_seen_at = now() - interval '10 minutes', idle_expires_at = now() + interval '1 minute',
         absolute_expires_at = now() + interval '30 minutes' WHERE subject = $1`,
      [subject],
    );
    assert.equal((await t.request('GET', '/api/probe', { jar, device })).status, 200);
    const r = await t.admin.query(
      `SELECT idle_expires_at = absolute_expires_at AS capped, last_seen_at > now() - interval '5 seconds' AS touched
       FROM identity.session WHERE subject = $1`,
      [subject],
    );
    assert.deepEqual(r.rows[0], { capped: true, touched: true });
  });
});
