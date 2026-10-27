import 'reflect-metadata';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createDevice, startAuthApp, type AuthApp } from './helpers/auth-app.ts';

/**
 * X01: POST /api/auth/login/start takes an optional `loginHint` (an email address), passed to the IdP as
 * `login_hint` so the demo visitor's sign-in page is pre-filled. Needs `pnpm infra:up` (PostgreSQL and Redis).
 */
const LOCAL_ENV = join(import.meta.dirname, '../../../infra/local-dev.env');
if (!process.env.DATABASE_ADMIN_URL && existsSync(LOCAL_ENV)) process.loadEnvFile(LOCAL_ENV);

describe('auth: login/start loginHint (X01)', () => {
  let t: AuthApp;
  before(async () => {
    t = await startAuthApp();
  });
  after(async () => {
    await t?.close();
  });

  const start = async (extra: Record<string, unknown>) => {
    const device = await createDevice();
    return t.request('POST', '/api/auth/login/start', {
      device,
      body: { deviceJwk: device.jwk, returnTo: '/demo/welcome', purpose: 'login', ...extra },
    });
  };

  it('passes a valid address to the IdP as login_hint', async () => {
    const r = await start({ loginHint: ' Visitor@Example.test ' });
    assert.equal(r.status, 200);
    const url = new URL(r.body.authorizeUrl);
    assert.equal(url.searchParams.get('login_hint'), 'Visitor@Example.test');
    assert.equal(url.searchParams.get('acr_values'), '1');
  });

  it('sends no login_hint without one', async () => {
    const r = await start({});
    assert.equal(r.status, 200);
    assert.equal(new URL(r.body.authorizeUrl).searchParams.has('login_hint'), false);
  });

  it('refuses a hint that is not an email address', async () => {
    for (const loginHint of ['not-an-email', 'a@b', `${'x'.repeat(320)}@example.test`, 42]) {
      const r = await start({ loginHint });
      assert.equal(r.status, 400, String(loginHint));
      assert.equal(r.body.error, 'invalid_request');
    }
  });
});
