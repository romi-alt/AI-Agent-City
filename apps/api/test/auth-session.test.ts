import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { SESSION_RESOLVER, type SessionResolver } from '../src/auth/contracts.ts';
import {
  cookieHeader,
  createDevice,
  eventually,
  PUBLIC_ORIGIN,
  startAuthApp,
  type AuthApp,
  type Jar,
} from './helpers/auth-app.ts';
import type { TestDevice } from './helpers/device.ts';

/** Logout, session and device revocation, step-up, IdP revalidation, back-channel logout and SESSION_RESOLVER. */
describe('auth: session lifecycle', () => {
  let t: AuthApp;
  let n = 0;
  async function signedIn(sub = `life-${++n}`, acr = '1') {
    const device = await createDevice();
    const r = await t.login(device, { sub, acr, email: `${sub}@example.com`, emailVerified: true });
    assert.equal(r.res.status, 303);
    const me = await t.request('GET', '/api/auth/me', { jar: r.jar, device });
    const sessionId = (
      await t.admin.query(`SELECT id FROM identity.session WHERE subject = $1 ORDER BY created_at DESC LIMIT 1`, [
        `kc:${sub}`,
      ])
    ).rows[0].id as string;
    return {
      jar: r.jar,
      device,
      sub,
      subject: `kc:${sub}`,
      sid: r.sid,
      sessionId,
      deviceId: me.body.device.id as string,
    };
  }
  const probe = (jar: Jar, device: TestDevice) => t.request('GET', '/api/probe', { jar, device });
  const events = async (subject: string) =>
    (await t.admin.query(`SELECT kind, detail FROM identity.security_event WHERE subject = $1 ORDER BY id`, [subject]))
      .rows;

  before(async () => {
    t = await startAuthApp();
  });
  after(async () => {
    await t?.close();
  });

  describe('logout', () => {
    it('revokes the session, clears the cookie, publishes, and returns the end-session URL with id_token_hint', async () => {
      const s = await signedIn();
      const r = await t.request('POST', '/api/auth/logout', { jar: s.jar, device: s.device });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(r.setCookies.some(c => c.startsWith('ac_session=;')));
      const url = new URL(r.body.endSessionUrl);
      assert.equal(`${url.origin}${url.pathname}`, `${t.idp.issuer}/protocol/openid-connect/logout`);
      assert.equal(url.searchParams.get('post_logout_redirect_uri'), `${PUBLIC_ORIGIN}/signed-out`);
      const hint = url.searchParams.get('id_token_hint')!;
      assert.equal(JSON.parse(Buffer.from(hint.split('.')[1]!, 'base64url').toString()).sub, s.sub);
      assert.equal((await probe(s.jar, s.device)).body.error, 'session_revoked');
      assert.ok(await eventually(() => t.revocations.some(x => x.kind === 'session' && x.sessionId === s.sessionId)));
      assert.equal(t.idp.revoked.length > 0, true, 'the refresh token is revoked at the IdP');
      const row = (
        await t.admin.query(
          `SELECT refresh_token_enc, id_token_enc, revoked_reason FROM identity.session WHERE id = $1`,
          [s.sessionId],
        )
      ).rows[0];
      assert.deepEqual(row, { refresh_token_enc: null, id_token_enc: null, revoked_reason: 'logout' });
      assert.ok((await events(s.subject)).some(e => e.kind === 'logout'));
    });

    it('needs Origin and a proof like any other write', async () => {
      const s = await signedIn();
      assert.equal(
        (await t.request('POST', '/api/auth/logout', { jar: s.jar, device: s.device, origin: 'https://evil.example' }))
          .status,
        403,
      );
      assert.equal((await t.request('POST', '/api/auth/logout', { jar: s.jar })).status, 401);
      assert.equal((await probe(s.jar, s.device)).status, 200);
    });
  });

  describe('sessions and devices', () => {
    it('lists the person’s sessions and devices, marking the current ones', async () => {
      const a = await signedIn('multi');
      const b = await signedIn('multi');
      const r = await t.request('GET', '/api/auth/sessions', { jar: a.jar, device: a.device });
      assert.equal(r.status, 200);
      assert.equal(r.body.sessions.length, 2);
      assert.equal(r.body.devices.length, 2);
      assert.deepEqual(
        r.body.sessions.filter((x: { current: boolean }) => x.current).map((x: { id: string }) => x.id),
        [a.sessionId],
      );
      assert.deepEqual(
        r.body.devices.filter((x: { current: boolean }) => x.current).map((x: { id: string }) => x.id),
        [a.deviceId],
      );
      assert.ok(r.body.sessions.some((x: { id: string }) => x.id === b.sessionId));
      assert.equal(JSON.stringify(r.body).includes('token'), false);
    });

    it('revokes one session (only the person’s own) and publishes it', async () => {
      const a = await signedIn('revoke-one');
      const b = await signedIn('revoke-one');
      const stranger = await signedIn();
      assert.equal(
        (await t.request('DELETE', `/api/auth/sessions/${a.sessionId}`, { jar: stranger.jar, device: stranger.device }))
          .status,
        404,
      );
      assert.equal(
        (await t.request('DELETE', `/api/auth/sessions/not-a-uuid`, { jar: b.jar, device: b.device })).status,
        400,
      );
      const r = await t.request('DELETE', `/api/auth/sessions/${a.sessionId}`, { jar: b.jar, device: b.device });
      assert.equal(r.status, 204);
      assert.equal((await probe(a.jar, a.device)).body.error, 'session_revoked');
      assert.equal((await probe(b.jar, b.device)).status, 200);
      assert.ok(await eventually(() => t.revocations.some(x => x.kind === 'session' && x.sessionId === a.sessionId)));
    });

    it('revoking a device needs a fresh step-up, then ends every session on it', async () => {
      const a = await signedIn('dev-owner');
      const b = await signedIn('dev-owner');
      // A second session on device B.
      const b2 = await t.login(b.device, { sub: 'dev-owner' });
      const path = `/api/auth/devices/${b.deviceId}`;
      const denied = await t.request('DELETE', path, { jar: a.jar, device: a.device });
      assert.equal(denied.status, 403);
      assert.deepEqual(denied.body, { error: 'step_up_required', reason: 'credential' });

      const up = await t.stepUp(a.device, a.jar, { sub: 'dev-owner', acr: '2', amr: ['passkey'] });
      assert.equal(up.status, 303, JSON.stringify(up.body));
      const r = await t.request('DELETE', path, { jar: a.jar, device: a.device });
      assert.equal(r.status, 204, JSON.stringify(r.body));
      assert.equal((await probe(b.jar, b.device)).body.error, 'session_revoked');
      assert.equal((await probe(b2.jar, b.device)).body.error, 'session_revoked');
      assert.equal((await probe(a.jar, a.device)).status, 200);
      assert.ok(await eventually(() => t.revocations.some(x => x.kind === 'device' && x.deviceId === b.deviceId)));
      // The revoked key cannot sign in again.
      assert.equal((await t.login(b.device, { sub: 'dev-owner' })).res.status, 403);
      assert.ok((await events('kc:dev-owner')).some(e => e.kind === 'device_revoked'));
    });
  });

  describe('step-up', () => {
    it('asks for acr 2, prompt=login and max_age=0, and only for an existing session on the same device', async () => {
      const s = await signedIn();
      const st = await t.start(s.device, { jar: s.jar, purpose: 'step-up', stepUpReason: 'billing' });
      assert.equal(st.res.status, 200);
      const p = new URL(st.authorizeUrl).searchParams;
      assert.equal(p.get('acr_values'), '2');
      assert.equal(p.get('prompt'), 'login');
      assert.equal(p.get('max_age'), '0');
      const noSession = await t.start(await createDevice(), { purpose: 'step-up', stepUpReason: 'billing' });
      assert.equal(noSession.res.body.error, 'not_signed_in');
      const otherDevice = await t.start(await createDevice(), {
        jar: s.jar,
        purpose: 'step-up',
        stepUpReason: 'billing',
      });
      assert.equal(otherDevice.res.body.error, 'device_proof_required');
      const noReason = await t.start(s.device, { jar: s.jar, purpose: 'step-up' });
      assert.equal(noReason.res.status, 400);
    });

    it('denies a step-up route without a step-up, then grants it after one', async () => {
      const s = await signedIn();
      const denied = await t.request('POST', '/api/probe/billing', { jar: s.jar, device: s.device });
      assert.deepEqual(denied.body, { error: 'step_up_required', reason: 'billing' });
      const up = await t.stepUp(s.device, s.jar, { sub: s.sub, acr: '2', amr: ['passkey'] });
      assert.equal(up.status, 303);
      assert.equal(up.headers.get('location'), '/workspace');
      assert.ok(!up.setCookies.some(c => c.startsWith('ac_session=')), 'step-up keeps the same session');
      assert.equal((await t.request('POST', '/api/probe/billing', { jar: s.jar, device: s.device })).status, 201);
      const me = await t.request('GET', '/api/auth/me', { jar: s.jar, device: s.device });
      assert.equal(me.body.acr, '2');
      assert.ok(me.body.stepUpAt);
      assert.ok((await events(s.subject)).some(e => e.kind === 'step_up'));
    });

    it('does not grant a step-up with acr 1', async () => {
      const s = await signedIn();
      const up = await t.stepUp(s.device, s.jar, { sub: s.sub, acr: '1' });
      assert.equal(up.status, 403);
      assert.equal((await t.request('POST', '/api/probe/billing', { jar: s.jar, device: s.device })).status, 403);
      assert.ok((await events(s.subject)).some(e => e.kind === 'step_up_refused' && e.detail.reason === 'acr_too_low'));
    });

    it('does not grant a step-up whose authentication is not fresh', async () => {
      const s = await signedIn();
      const up = await t.stepUp(
        s.device,
        s.jar,
        { sub: s.sub, acr: '2', amr: ['passkey'] },
        { authTime: Math.floor(Date.now() / 1000) - 3600 },
      );
      assert.equal(up.status, 400);
      assert.equal((await t.request('POST', '/api/probe/billing', { jar: s.jar, device: s.device })).status, 403);
      // Within STEP_UP_MAX_AGE_SECONDS but before this step-up started: an old sign-in reused, not a new one.
      const reused = await t.stepUp(
        s.device,
        s.jar,
        { sub: s.sub, acr: '2', amr: ['passkey'] },
        { authTime: Math.floor(Date.now() / 1000) - 60 },
      );
      assert.equal(reused.status, 403);
      assert.ok((await events(s.subject)).some(e => e.kind === 'step_up_refused' && e.detail.reason === 'not_fresh'));
    });

    it('expires: a step-up older than STEP_UP_MAX_AGE_SECONDS no longer counts', async () => {
      const s = await signedIn();
      assert.equal((await t.stepUp(s.device, s.jar, { sub: s.sub, acr: '2', amr: ['passkey'] })).status, 303);
      await t.admin.query(`UPDATE identity.session SET step_up_at = now() - make_interval(secs => $2) WHERE id = $1`, [
        s.sessionId,
        t.env.STEP_UP_MAX_AGE_SECONDS + 5,
      ]);
      const r = await t.request('POST', '/api/probe/billing', { jar: s.jar, device: s.device });
      assert.deepEqual(r.body, { error: 'step_up_required', reason: 'billing' });
    });

    it('refuses a level-2 step-up that did not use a passkey', async () => {
      const s = await signedIn();
      const up = await t.stepUp(s.device, s.jar, { sub: s.sub, acr: '2', amr: ['email-code'] });
      assert.equal(up.status, 403);
      const me = await t.request('GET', '/api/auth/me', { jar: s.jar, device: s.device });
      assert.equal(me.body.stepUpAt, null);
      assert.ok((await events(s.subject)).some(e => e.kind === 'step_up_refused' && e.detail.reason === 'no_passkey'));
    });

    it('refuses a step-up callback for a different person', async () => {
      const s = await signedIn();
      const up = await t.stepUp(s.device, s.jar, { sub: 'someone-else', acr: '2', amr: ['passkey'] });
      assert.equal(up.status, 403);
      const me = await t.request('GET', '/api/auth/me', { jar: s.jar, device: s.device });
      assert.equal(me.body.subject, s.subject);
      assert.equal(me.body.stepUpAt, null);
      assert.ok(
        (await events(s.subject)).some(e => e.kind === 'step_up_refused' && e.detail.reason === 'different_subject'),
      );
    });

    it('refuses a step-up callback arriving in a browser without that session', async () => {
      const s = await signedIn();
      const st = await t.start(s.device, { jar: s.jar, purpose: 'step-up', stepUpReason: 'credential' });
      const { query } = t.idp.authorize(st.authorizeUrl, { sub: s.sub, acr: '2', amr: ['passkey'] });
      const r = await t.callback(query, { ac_login: st.jar.ac_login! });
      assert.equal(r.status, 403);
    });
  });

  describe('revalidation with the refresh token', () => {
    it('refreshes at most every few minutes and keeps an active session', async () => {
      const s = await signedIn();
      const before = t.idp.grants.refresh_token ?? 0;
      assert.equal((await probe(s.jar, s.device)).status, 200);
      assert.equal(t.idp.grants.refresh_token ?? 0, before, 'not due yet');
      await t.admin.query(`UPDATE identity.session SET revalidated_at = now() - interval '6 minutes' WHERE id = $1`, [
        s.sessionId,
      ]);
      assert.equal((await probe(s.jar, s.device)).status, 200);
      assert.equal(t.idp.grants.refresh_token, before + 1);
      assert.equal((await probe(s.jar, s.device)).status, 200);
      assert.equal(t.idp.grants.refresh_token, before + 1, 'revalidated_at was updated');
    });

    it('revokes the session when the IdP refuses (user disabled)', async () => {
      const s = await signedIn();
      t.idp.disableUser(s.sub);
      await t.admin.query(`UPDATE identity.session SET revalidated_at = now() - interval '6 minutes' WHERE id = $1`, [
        s.sessionId,
      ]);
      assert.equal((await probe(s.jar, s.device)).body.error, 'session_revoked');
      assert.ok(await eventually(() => t.revocations.some(x => x.kind === 'session' && x.sessionId === s.sessionId)));
      const ev = await events(s.subject);
      assert.ok(ev.some(e => e.kind === 'refresh_failed' && e.detail.reason === 'invalid_grant'));
      assert.equal((await probe(s.jar, s.device)).body.error, 'session_revoked');
    });
  });

  describe('back-channel logout', () => {
    const post = (token: string) =>
      t.request('POST', '/api/auth/backchannel-logout', { form: { logout_token: token }, origin: null });

    it('revokes the sessions of the IdP session (sid) and refuses a replay', async () => {
      const a = await signedIn('bcl');
      const b = await signedIn('bcl');
      const token = await t.idp.logoutToken({ sid: a.sid, sub: a.sub });
      const r = await post(token);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.equal((await probe(a.jar, a.device)).body.error, 'session_revoked');
      assert.equal((await probe(b.jar, b.device)).status, 200, 'other IdP sessions are untouched');
      assert.ok(await eventually(() => t.revocations.some(x => x.kind === 'session' && x.sessionId === a.sessionId)));
      assert.equal((await post(token)).status, 400, 'replayed jti');
    });

    it('revokes every session of the subject when only sub is given', async () => {
      const a = await signedIn('bcl-sub');
      const b = await signedIn('bcl-sub');
      assert.equal((await post(await t.idp.logoutToken({ sub: 'bcl-sub' }))).status, 200);
      assert.equal((await probe(a.jar, a.device)).status, 401);
      assert.equal((await probe(b.jar, b.device)).status, 401);
    });

    it('refuses invalid logout tokens', async () => {
      const s = await signedIn();
      const now = Math.floor(Date.now() / 1000);
      const bad = [
        await t.idp.logoutToken({ sid: s.sid }, { rogue: true }),
        await t.idp.logoutToken({ sid: s.sid }, { omitEvents: true }),
        await t.idp.logoutToken({ sid: s.sid, nonce: 'n' }),
        await t.idp.logoutToken({ sid: s.sid, aud: 'someone-else' }),
        await t.idp.logoutToken({ sid: s.sid, iss: 'http://127.0.0.1:1/realms/other' }),
        await t.idp.logoutToken({ sid: s.sid, iat: now - 3600, exp: now + 60 }),
        await t.idp.logoutToken({ sid: s.sid, events: { 'http://schemas.openid.net/event/other': {} } }),
        await t.idp.logoutToken({ sid: undefined, sub: undefined }),
        'not-a-jwt',
      ];
      for (const token of bad) assert.equal((await post(token)).status, 400, token.slice(0, 40));
      assert.equal((await t.request('POST', '/api/auth/backchannel-logout', { body: {}, origin: null })).status, 400);
      assert.equal((await probe(s.jar, s.device)).status, 200);
    });
  });

  describe('SESSION_RESOLVER (Socket.IO handshakes)', () => {
    const htu = `${PUBLIC_ORIGIN}/socket.io`;

    it('resolves a valid handshake and re-reads the session', async () => {
      const resolver = t.get<SessionResolver>(SESSION_RESOLVER);
      const s = await signedIn();
      const ctx = await resolver.resolveHandshake({
        cookieHeader: `other=1; ${cookieHeader(s.jar)}`,
        proof: await s.device.proof('GET', htu),
        origin: PUBLIC_ORIGIN,
      });
      assert.equal(ctx?.subject, s.subject);
      assert.equal(ctx?.sessionId, s.sessionId);
      assert.equal((await resolver.current(s.sessionId))?.subject, s.subject);
      await t.request('POST', '/api/auth/logout', { jar: s.jar, device: s.device });
      assert.equal(await resolver.current(s.sessionId), null);
      assert.equal(await resolver.current('not-a-uuid'), null);
    });

    it('refuses bad handshakes', async () => {
      const resolver = t.get<SessionResolver>(SESSION_RESOLVER);
      const s = await signedIn();
      const cookie = cookieHeader(s.jar);
      const ok = async () => s.device.proof('GET', htu);
      assert.equal(
        await resolver.resolveHandshake({ cookieHeader: cookie, proof: await ok(), origin: 'https://evil.example' }),
        null,
      );
      assert.equal(
        await resolver.resolveHandshake({ cookieHeader: cookie, proof: await ok(), origin: undefined }),
        null,
      );
      assert.equal(
        await resolver.resolveHandshake({ cookieHeader: undefined, proof: await ok(), origin: PUBLIC_ORIGIN }),
        null,
      );
      assert.equal(
        await resolver.resolveHandshake({ cookieHeader: cookie, proof: undefined, origin: PUBLIC_ORIGIN }),
        null,
      );
      const wrongPath = await s.device.proof('GET', `${PUBLIC_ORIGIN}/api/probe`);
      assert.equal(
        await resolver.resolveHandshake({ cookieHeader: cookie, proof: wrongPath, origin: PUBLIC_ORIGIN }),
        null,
      );
      const thief = await createDevice();
      assert.equal(
        await resolver.resolveHandshake({
          cookieHeader: cookie,
          proof: await thief.proof('GET', htu),
          origin: PUBLIC_ORIGIN,
        }),
        null,
      );
      const once = await ok();
      assert.ok(await resolver.resolveHandshake({ cookieHeader: cookie, proof: once, origin: PUBLIC_ORIGIN }));
      assert.equal(
        await resolver.resolveHandshake({ cookieHeader: cookie, proof: once, origin: PUBLIC_ORIGIN }),
        null,
        'replay',
      );
      await t.admin.query(`UPDATE identity.session SET revoked_at = now() WHERE id = $1`, [s.sessionId]);
      assert.equal(
        await resolver.resolveHandshake({ cookieHeader: cookie, proof: await ok(), origin: PUBLIC_ORIGIN }),
        null,
      );
    });
  });
});
