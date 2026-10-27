// Browser smoke test for the M03 web pages, with the API mocked (test/mock-api.ts).
//
//   pnpm --filter @agentcity/web test:browser
//
// Builds the app into .next/browser-test with API_URL pointing at the mock (Next bakes rewrites in at build time),
// starts it with `next start` on port 3100, and drives Chromium through sign-in, the account page, step-up, the
// realtime indicator, tenant switching and invitations. Set SKIP_BUILD=1 to reuse an existing test build.
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { startMockApi, type MockApi } from './mock-api.ts';

const WEB_PORT = 3100;
const API_PORT = 3101;
const WEB = `http://127.0.0.1:${WEB_PORT}`;
const APP_DIR = join(import.meta.dirname, '..');
const DIST = '.next/browser-test';
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_DIST_DIR: DIST,
  API_URL: `http://127.0.0.1:${API_PORT}`,
  NEXT_PUBLIC_REALTIME_URL: `http://127.0.0.1:${API_PORT}`,
};
const nextBin = join(APP_DIR, 'node_modules/next/dist/bin/next');

// Playwright is pre-installed outside the workspace (not a dependency); CommonJS resolution finds it via NODE_PATH.
// Its types aren't installed here either, so it is typed loosely.
type Browser = any;
type Page = any;
const { chromium } = createRequire(import.meta.url)('playwright') as { chromium: { launch(): Promise<Browser> } };

let mock: MockApi;
let web: ChildProcess;
let browser: Browser;

before(async () => {
  if (!process.env.SKIP_BUILD) {
    const build = spawnSync(process.execPath, [nextBin, 'build'], { cwd: APP_DIR, env, stdio: 'inherit' });
    assert.equal(build.status, 0, 'next build failed');
  }
  mock = await startMockApi(API_PORT, WEB);
  web = spawn(process.execPath, [nextBin, 'start', '-p', String(WEB_PORT), '-H', '127.0.0.1'], {
    cwd: APP_DIR,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const until = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(`${WEB}/signed-out`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > until) throw new Error('web app did not start');
    await new Promise(r => setTimeout(r, 300));
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  web?.kill();
  await mock?.close();
});

async function newPage(signedIn: boolean): Promise<Page> {
  const context = await browser.newContext();
  if (signedIn) {
    // The cookie the real API would set at /api/auth/callback; cookies ignore ports, so the mock's socket sees it too.
    await context.addCookies([{ name: 'ac_session', value: 'mock-session', domain: '127.0.0.1', path: '/' }]);
  }
  return context.newPage();
}

const since = (n: number) => mock.requests.slice(n);
const find = (n: number, method: string, path: string) =>
  since(n).find(r => r.method === method && r.path.startsWith(path));

test('sign-in posts the device JWK with a valid proof and goes to the returned authorize URL', async () => {
  const page = await newPage(false);
  const n = mock.requests.length;
  await page.goto(`${WEB}/signin?returnTo=%2Faccount`);
  await page.getByTestId('signin-button').click();
  await page.waitForURL(`${mock.url}/idp/authorize**`);

  const start = find(n, 'POST', '/api/auth/login/start');
  assert.ok(start, 'login/start was called');
  assert.ok(start.proof.ok, `proof verified: ${JSON.stringify(start.proof)}`);
  assert.deepEqual(Object.keys(start.body!.deviceJwk as object).sort(), ['crv', 'kty', 'x', 'y']);
  assert.deepEqual(start.proof.ok && start.proof.header.jwk, start.body!.deviceJwk, 'proof signed by deviceJwk');
  assert.equal(start.body!.purpose, 'login');
  assert.equal(start.body!.returnTo, '/account');
  assert.equal(start.origin, WEB, 'Origin reaches the API through the proxy');

  // The SSO button sends the agency IdP hint.
  const m = mock.requests.length;
  await page.goto(`${WEB}/signin`);
  await page.getByTestId('signin-sso-button').click();
  await page.waitForURL(`${mock.url}/idp/authorize**`);
  assert.equal(find(m, 'POST', '/api/auth/login/start')!.body!.idpHint, 'agency-sso');
  await page.context().close();
});

test('the device key is non-extractable and survives reloads', async () => {
  const page = await newPage(false);
  await page.goto(`${WEB}/signin`);
  const n = mock.requests.length;
  await page.getByTestId('signin-button').click();
  await page.waitForURL(`${mock.url}/idp/authorize**`);
  const firstJwk = find(n, 'POST', '/api/auth/login/start')!.body!.deviceJwk;

  await page.goto(`${WEB}/signin`);
  await page.reload();
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('agentcity-device');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const pair = await new Promise<CryptoKeyPair>(resolve => {
      const req = db.transaction('keys').objectStore('keys').get('device');
      req.onsuccess = () => resolve(req.result);
    });
    let exportError = '';
    try {
      await crypto.subtle.exportKey('jwk', pair.privateKey);
    } catch (e) {
      exportError = (e as Error).name;
    }
    return {
      isCryptoKey: pair.privateKey instanceof CryptoKey,
      extractable: pair.privateKey.extractable,
      algorithm: pair.privateKey.algorithm as EcKeyAlgorithm,
      exportError,
      publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
    };
  });
  assert.equal(stored.isCryptoKey, true, 'the CryptoKey object itself is stored');
  assert.equal(stored.extractable, false);
  assert.equal(stored.algorithm.name, 'ECDSA');
  assert.equal(stored.algorithm.namedCurve, 'P-256');
  assert.equal(stored.exportError, 'InvalidAccessError', 'the private key cannot be exported');
  assert.equal(stored.publicJwk.x, (firstJwk as JsonWebKey).x);

  const m = mock.requests.length;
  await page.getByTestId('signin-button').click();
  await page.waitForURL(`${mock.url}/idp/authorize**`);
  assert.deepEqual(find(m, 'POST', '/api/auth/login/start')!.body!.deviceJwk, firstJwk, 'same key after reload');
  await page.context().close();
});

test('signed out: /account sends you to sign-in and comes back to /account', async () => {
  const page = await newPage(false);
  await page.goto(`${WEB}/account`);
  await page.waitForURL(`${WEB}/signin?**`);
  const url = new URL(page.url());
  assert.equal(url.searchParams.get('returnTo'), '/account');
  assert.equal(url.searchParams.get('reason'), 'not_signed_in');
  await page.getByTestId('signin-reason').waitFor();
  await page.context().close();
});

test('/account lists sessions and devices; revoking a session calls the API with a proof', async () => {
  const page = await newPage(true);
  await page.goto(`${WEB}/account`);
  await page.getByTestId('me-email').getByText('ada@example.test').waitFor();
  await page.getByTestId('session-sess-laptop').waitFor();
  assert.equal(await page.getByTestId('session-sess-current').getAttribute('data-current'), 'true');
  assert.equal(await page.getByTestId('revoke-session-sess-current').count(), 0, 'no revoke button on this session');
  await page.getByTestId('device-dev-laptop').waitFor();

  const n = mock.requests.length;
  await page.getByTestId('revoke-session-sess-laptop').click();
  await page.getByTestId('account-notice').getByText('Signed out Firefox on Windows').waitFor();
  const del = find(n, 'DELETE', '/api/auth/sessions/sess-laptop');
  assert.ok(del, 'DELETE /api/auth/sessions/sess-laptop was called');
  assert.ok(del.proof.ok, `proof verified: ${JSON.stringify(del.proof)}`);
  assert.equal(del.proof.ok && del.proof.claims.htm, 'DELETE');
  assert.equal(del.origin, WEB);
  // Every API call from the page carried a valid proof (none needed the retry).
  assert.deepEqual(
    since(n).filter(r => !r.proof.ok),
    [],
  );
  await page.context().close();
});

test('step_up_required: removing a device explains step-up, starts it, and finishes after coming back', async () => {
  const page = await newPage(true);
  mock.state.deviceNeedsStepUp = true;
  await page.goto(`${WEB}/account`);
  await page.getByTestId('revoke-device-dev-laptop').click();
  await page.getByTestId('step-up-panel').waitFor();
  assert.ok(find(0, 'DELETE', '/api/auth/devices/dev-laptop'));

  const n = mock.requests.length;
  await page.getByTestId('step-up-continue').click();
  await page.waitForURL(`${mock.url}/idp/authorize**`);
  const start = find(n, 'POST', '/api/auth/login/start');
  assert.ok(start?.proof.ok, 'step-up start carried a valid proof');
  assert.equal(start!.body!.purpose, 'step-up');
  assert.equal(start!.body!.stepUpReason, 'credential');
  const returnTo = start!.body!.returnTo as string;
  assert.equal(returnTo, '/account?pending=remove-device&device=dev-laptop');

  // Back from the IdP after a strong sign-in: the page asks once more, then removes the device.
  mock.state.deviceNeedsStepUp = false;
  await page.goto(`${WEB}${returnTo}`);
  await page.getByTestId('step-up-resume').waitFor();
  assert.equal(new URL(page.url()).search, '', 'the pending action is cleared from the address bar');
  const m = mock.requests.length;
  await page.getByTestId('step-up-resume-confirm').click();
  await page.getByTestId('account-notice').getByText('Removed Firefox on Windows').waitFor();
  const del = find(m, 'DELETE', '/api/auth/devices/dev-laptop');
  assert.ok(del?.proof.ok);
  await page.context().close();
});

test('tenant switcher lists memberships and switches tenant', async () => {
  const page = await newPage(true);
  await page.goto(`${WEB}/account`);
  const select = page.getByTestId('tenant-select');
  await select.waitFor();
  assert.equal(await select.inputValue(), 't-north|');
  const n = mock.requests.length;
  await select.selectOption({ label: 'South Homes (agency staff)' });
  await page.getByTestId('tenant-message').getByText("You're now working in South Homes.").waitFor();
  const post = find(n, 'POST', '/api/session/tenant');
  assert.deepEqual(post?.body, { tenantId: 't-south' });
  assert.ok(post?.proof.ok);
  await page.context().close();
});

test('realtime indicator: live with a proof-bearing handshake, then "signed out on this device" on revoked', async () => {
  const page = await newPage(true);
  const n = mock.socketHandshakes.length;
  await page.goto(`${WEB}/account`);
  const status = page.getByTestId('realtime-status');
  await page.locator('[data-testid="realtime-status"][data-state="live"]').waitFor({ timeout: 15_000 });
  assert.match((await status.textContent()) ?? '', /Live/);
  const hs = mock.socketHandshakes.slice(n).find(h => h.proof.ok);
  assert.ok(hs, `a handshake with a valid proof: ${JSON.stringify(mock.socketHandshakes.slice(n))}`);
  assert.ok(hs.cookie?.includes('ac_session=mock-session'), 'the session cookie reached the socket endpoint');

  mock.revokeSockets();
  await page.locator('[data-testid="realtime-status"][data-state="revoked"]').waitFor({ timeout: 15_000 });
  assert.match((await status.textContent()) ?? '', /Signed out on this device/);
  await page.context().close();
});

test('invitations: accepted, expired and wrong-email each get a clear message', async () => {
  const page = await newPage(true);
  const cases: [string, string, RegExp][] = [
    ['good-token', 'ok', /You've joined East Lettings as viewer/],
    ['expired-token', 'bad', /expired/],
    ['wrong-email-token', 'bad', /different email address .*ada@example\.test/],
  ];
  for (const [token, kind, text] of cases) {
    await page.goto(`${WEB}/invitations/accept#token=${token}`);
    await page.getByTestId('invite-signed-in-as').getByText('ada@example.test').waitFor();
    const n = mock.requests.length;
    await page.getByTestId('invite-accept').click();
    const result = page.locator(`[data-testid="invite-result"][data-result="${kind}"]`);
    await result.waitFor();
    assert.match((await result.textContent()) ?? '', text);
    assert.deepEqual(find(n, 'POST', '/api/invitations/accept')?.body, { token });
  }
  await page.context().close();
  // A fresh tab with no token in the link (and none pending) explains what is missing.
  const fresh = await newPage(true);
  await fresh.goto(`${WEB}/invitations/accept`);
  await fresh.locator('[data-testid="invite-result"][data-result="missing"]').waitFor();
  await fresh.context().close();
});

test('sign out posts logout and follows endSessionUrl', async () => {
  const page = await newPage(true);
  await page.goto(`${WEB}/account`);
  await page.getByTestId('me-email').getByText('ada@example.test').waitFor();
  const n = mock.requests.length;
  await page.getByTestId('signout-button').click();
  await page.waitForURL(`${mock.url}/idp/authorize?logout=1`);
  assert.ok(find(n, 'POST', '/api/auth/logout')?.proof.ok);
  await page.context().close();
});

test('the status page still renders server-side', async () => {
  const html = await (await fetch(WEB)).text();
  assert.match(html, /AgentCity platform status/);
});
