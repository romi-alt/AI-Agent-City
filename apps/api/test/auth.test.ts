import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { applyCookies, createDevice, startAuthApp, type AuthApp } from './helpers/auth-app.ts';

/**
 * Sign-in through the API's OIDC client against a local mock provider: the happy path, and each ID token or
 * callback check failing on its own. Needs Postgres and Redis (infra/local-dev.env).
 */
describe('auth: sign-in (login/start → IdP → callback → session)', () => {
  let t: AuthApp;
  const sessionCount = async () =>
    Number((await t.admin.query('SELECT count(*) AS n FROM identity.session')).rows[0].n);

  before(async () => {
    t = await startAuthApp();
  });
  after(async () => {
    await t?.close();
  });

  it('signs in: start → callback → httpOnly cookie → /me', async () => {
    const device = await createDevice();
    const s = await t.start(device, { returnTo: '/workspace?tab=1' });
    assert.equal(s.res.status, 200);
    const url = new URL(s.authorizeUrl);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('client_id'), 'agentcity-bff');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/api/auth/callback');
    assert.ok(url.searchParams.get('nonce') && url.searchParams.get('state'));
    assert.equal(url.searchParams.get('acr_values'), null);
    const loginCookie = s.res.setCookies.find(c => c.startsWith('ac_login='))!;
    assert.match(loginCookie, /HttpOnly/i);
    assert.match(loginCookie, /SameSite=Lax/i);
    assert.match(loginCookie, /Path=\/api\/auth\/callback/);
    assert.equal(s.jar.ac_login, url.searchParams.get('state'));

    const { query, sid } = t.idp.authorize(s.authorizeUrl, {
      sub: 'user-1',
      email: 'Alice@Example.COM',
      emailVerified: true,
      acr: '1',
      amr: ['email-code'],
      name: 'Alice',
    });
    const cb = await t.callback(query, s.jar);
    assert.equal(cb.status, 303);
    assert.equal(cb.headers.get('location'), '/workspace?tab=1');
    const sessionCookie = cb.setCookies.find(c => c.startsWith('ac_session='))!;
    assert.match(sessionCookie, /HttpOnly/i);
    assert.match(sessionCookie, /SameSite=Lax/i);
    assert.match(sessionCookie, /Path=\//);
    assert.doesNotMatch(sessionCookie, /Secure/); // COOKIE_SECURE=false in this test
    const jar = applyCookies(s.jar, cb.setCookies);
    assert.equal(jar.ac_login, undefined, 'the login cookie is cleared');
    assert.equal(Buffer.from(jar.ac_session!, 'base64url').length, 32);

    const me = await t.request('GET', '/api/auth/me', { jar, device });
    assert.equal(me.status, 200, JSON.stringify(me.body));
    assert.equal(me.body.subject, 'kc:user-1');
    assert.equal(me.body.email, 'alice@example.com');
    assert.equal(me.body.emailVerified, true);
    assert.deepEqual(me.body.amr, ['email-code']);
    assert.equal(me.body.acr, '1');
    assert.equal(me.body.stepUpAt, null);
    assert.equal(me.body.tenantId, null);
    assert.ok(me.body.device.id);

    // Only the hash of the cookie is stored; the refresh and ID tokens are encrypted; the IdP sid is kept.
    const row = (
      await t.admin.query(
        `SELECT s.token_sha256, s.refresh_token_enc, s.id_token_enc, s.idp_session_id, d.jkt
         FROM identity.session s JOIN identity.device d ON d.id = s.device_id WHERE s.subject = 'kc:user-1'`,
      )
    ).rows[0];
    assert.equal(row.token_sha256, createHash('sha256').update(jar.ac_session!).digest('hex'));
    assert.equal(row.idp_session_id, sid);
    assert.equal(row.jkt, device.jkt);
    assert.ok(Buffer.isBuffer(row.refresh_token_enc) && row.refresh_token_enc.length > 28);
    assert.ok(!row.id_token_enc.toString('latin1').includes('eyJ'), 'ID token is not stored in clear');
    const ev = await t.admin.query(`SELECT kind FROM identity.security_event WHERE subject = 'kc:user-1'`);
    assert.deepEqual(
      ev.rows.map(r => r.kind),
      ['sign_in'],
    );
  });

  it('refuses login/start from another origin, without a proof, or with a proof from another key', async () => {
    const device = await createDevice();
    const other = await createDevice();
    const body = { deviceJwk: device.jwk, returnTo: '/', purpose: 'login' };
    const path = '/api/auth/login/start';
    assert.equal(
      (await t.request('POST', path, { device, body, origin: 'https://evil.example' })).body.error,
      'bad_origin',
    );
    assert.equal((await t.request('POST', path, { body, origin: undefined })).body.error, 'device_proof_required');
    const r = await t.request('POST', path, { device: other, body });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'device_proof_required');
    // A private key is never accepted as the device key.
    const priv = await t.request('POST', path, {
      device,
      body: { ...body, deviceJwk: { ...device.jwk, d: 'x'.repeat(43) } },
    });
    assert.equal(priv.body.error, 'invalid_device_key');
  });

  for (const returnTo of [
    '//evil.example/x',
    'https://evil.example/',
    '/\\evil.example',
    'javascript:alert(1)',
    '/a\r\nb',
    'workspace',
    '',
  ]) {
    it(`refuses an unsafe returnTo ${JSON.stringify(returnTo)}`, async () => {
      const device = await createDevice();
      const s = await t.start(device, { returnTo });
      assert.equal(s.res.status, 400);
      assert.equal(s.res.body.error, 'invalid_return_to');
    });
  }

  /** A sign-in whose ID token is wrong in one way must fail without creating a session. */
  async function refused(tweaks: Parameters<AuthApp['idp']['authorize']>[2], reason: RegExp) {
    const before = await sessionCount();
    const device = await createDevice();
    const s = await t.start(device);
    const { query } = t.idp.authorize(s.authorizeUrl, { sub: 'user-x', acr: '1' }, tweaks);
    const cb = await t.callback(query, s.jar);
    assert.equal(cb.status, 400, JSON.stringify(cb.body));
    assert.equal(cb.body.error, 'login_failed');
    assert.ok(!cb.setCookies.some(c => c.startsWith('ac_session=')));
    assert.equal(await sessionCount(), before);
    const ev = await t.admin.query(
      `SELECT detail FROM identity.security_event WHERE kind = 'sign_in_failed' ORDER BY id DESC LIMIT 1`,
    );
    assert.match(ev.rows[0]?.detail.reason, reason);
  }

  it('refuses an ID token from the wrong issuer', () =>
    refused({ tweaks: { iss: 'http://127.0.0.1:1/realms/other' } }, /CLAIM_COMPARISON/));
  it('refuses an ID token for another audience', () =>
    refused({ tweaks: { aud: 'someone-else' } }, /CLAIM_COMPARISON/));
  it('refuses an ID token whose azp is another client', () =>
    refused({ tweaks: { aud: ['agentcity-bff', 'someone-else'], azp: 'someone-else' } }, /CLAIM_COMPARISON/));
  it('refuses an ID token without azp', () => refused({ tweaks: { azp: null } }, /IdTokenError\/azp/));
  it('refuses an expired ID token', () =>
    refused(
      { tweaks: { exp: Math.floor(Date.now() / 1000) - 120, iat: Math.floor(Date.now() / 1000) - 420 } },
      /TIMESTAMP_CHECK/,
    ));
  it('refuses an ID token issued in the future', () =>
    refused({ tweaks: { iat: Math.floor(Date.now() / 1000) + 600 } }, /IdTokenError\/iat/));
  it('refuses an ID token signed with a key not in the JWKS', () =>
    refused({ tweaks: { rogueSignature: true } }, /INVALID_RESPONSE/));
  it('refuses a nonce mismatch', () => refused({ tweaks: { nonce: 'not-the-nonce' } }, /CLAIM_COMPARISON/));
  it('refuses an ID token without a nonce', () => refused({ tweaks: { nonce: null } }, /INVALID_RESPONSE/));
  it('refuses when the PKCE verifier does not match the challenge', () =>
    refused({ tamperChallenge: true }, /RESPONSE_BODY_ERROR/));

  it('refuses a callback whose state does not match the login cookie, or without the cookie', async () => {
    const device = await createDevice();
    const s = await t.start(device);
    const { query } = t.idp.authorize(s.authorizeUrl, { sub: 'user-s' });
    assert.equal((await t.callback(query, {})).body.error, 'login_failed');
    assert.equal((await t.callback(query, { ac_login: 'a'.repeat(43) })).body.error, 'login_failed');
    // Another browser's attempt: its own (valid) cookie, but this state.
    const s2 = await t.start(device);
    assert.equal((await t.callback(query, s2.jar)).status, 400);
    // The real browser can still finish: a mismatched callback did not burn the attempt.
    assert.equal((await t.callback(query, s.jar)).status, 303);
  });

  it('refuses a replayed state (the attempt is single use)', async () => {
    const device = await createDevice();
    const s = await t.start(device);
    const { query } = t.idp.authorize(s.authorizeUrl, { sub: 'user-r' });
    assert.equal((await t.callback(query, s.jar)).status, 303);
    const again = await t.callback(query, s.jar);
    assert.equal(again.status, 400);
    assert.equal(again.body.error, 'login_failed');
  });

  it('refuses an expired attempt', async () => {
    const device = await createDevice();
    const s = await t.start(device);
    await t.admin.query(
      `UPDATE identity.login_attempt SET expires_at = now() - interval '1 second' WHERE used_at IS NULL`,
    );
    const { query } = t.idp.authorize(s.authorizeUrl, { sub: 'user-e' });
    assert.equal((await t.callback(query, s.jar)).status, 400);
  });

  it('refuses an IdP error response and records the failure', async () => {
    const device = await createDevice();
    const s = await t.start(device);
    const state = new URL(s.authorizeUrl).searchParams.get('state')!;
    const cb = await t.callback(new URLSearchParams({ error: 'access_denied', state }).toString(), s.jar);
    assert.equal(cb.status, 400);
    const ev = await t.admin.query(
      `SELECT detail FROM identity.security_event WHERE kind = 'sign_in_failed' ORDER BY id DESC LIMIT 1`,
    );
    assert.equal(ev.rows[0].detail.reason, 'idp_error');
  });

  it('refuses sign-in for a disabled person', async () => {
    const device = await createDevice();
    await t.login(device, { sub: 'user-d' });
    await t.admin.query(`UPDATE identity.person SET disabled_at = now() WHERE subject = 'kc:user-d'`);
    const again = await t.login(await createDevice(), { sub: 'user-d' });
    assert.equal(again.res.status, 403);
    assert.equal(again.jar.ac_session, undefined);
  });

  it('maps known methods and drops unknown ones', async () => {
    const device = await createDevice();
    const { jar } = await t.login(device, { sub: 'user-m', acr: '2', amr: ['webauthn', 'magic-unknown'] });
    const me = await t.request('GET', '/api/auth/me', { jar, device });
    assert.deepEqual(me.body.amr, ['passkey']);
    assert.equal(me.body.acr, '2');
  });
});
