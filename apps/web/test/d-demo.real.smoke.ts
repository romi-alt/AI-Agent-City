// The demo funnel against the REAL API (workstream C's demo module), the shared Keycloak and Mailpit, and a
// throwaway migrated database. Nothing shared is reset: the database is created for this run and dropped after it;
// the one Keycloak user and any Mailpit message this run creates are deleted at the end.
//
//   node --test --test-concurrency=1 test/d-demo.real.smoke.ts        (from apps/web; needs `pnpm infra:up`)
//
// Web on http://localhost:3206, API on 4206 (PUBLIC_ORIGIN = the web origin, as device proofs and the Origin check
// require). Where it stops: the shared Keycloak only allows redirect URIs on http://localhost:3000 (agentcity-bff's
// callback and the provisioner's /demo/verified*), so on this port the verify-email link cannot be issued and the
// sign-in cannot come back. This test checks everything up to that boundary and records what Keycloak answered.
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';

const REPO = join(import.meta.dirname, '../../..');
const APP_DIR = join(REPO, 'apps/web');
const API_DIR = join(REPO, 'apps/api');
const EVIDENCE = join(REPO, 'planning/agentcity-migration/x01-cinematic-city/evidence');
const WEB_PORT = 3206;
const API_PORT = 4206;
const WEB = `http://localhost:${WEB_PORT}`;
const API = `http://127.0.0.1:${API_PORT}`;
const nextBin = join(APP_DIR, 'node_modules/next/dist/bin/next');

const localEnv = Object.fromEntries(
  readFileSync(join(REPO, 'infra/local-dev.env'), 'utf8')
    .split('\n')
    .filter(l => /^[A-Z_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
) as Record<string, string>;

type Browser = any;
type Page = any;
const { chromium } = createRequire(import.meta.url)('playwright') as { chromium: { launch(): Promise<Browser> } };
// pg is a dependency of packages/db, not of the web app; typed loosely here.
const pg = createRequire(join(REPO, 'packages/db/package.json'))('pg') as any;

let db: { name: string; adminUrl: string; appUrl: string; drop(): Promise<void> };
let api: ChildProcess;
let web: ChildProcess;
let browser: Browser;
const email = `d-real-${randomBytes(4).toString('hex')}@example.test`;
const problems: string[] = [];
const apiLog: string[] = [];

async function waitFor(url: string, what: string) {
  const until = Date.now() + 90_000;
  for (;;) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > until) throw new Error(`${what} did not start`);
    await new Promise(r => setTimeout(r, 400));
  }
}

async function kcToken(): Promise<string> {
  const res = await fetch('http://localhost:58080/realms/master/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: localEnv.KEYCLOAK_ADMIN_USER!,
      password: localEnv.KEYCLOAK_ADMIN_PASSWORD!,
    }),
  });
  return ((await res.json()) as { access_token: string }).access_token;
}
async function kcUsers(): Promise<{ id: string; emailVerified: boolean }[]> {
  const res = await fetch(
    `http://localhost:58080/admin/realms/agentcity/users?exact=true&username=${encodeURIComponent(email)}`,
    { headers: { authorization: `Bearer ${await kcToken()}` } },
  );
  return (await res.json()) as { id: string; emailVerified: boolean }[];
}
async function mailIds(): Promise<string[]> {
  const res = await fetch(`http://127.0.0.1:58025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  const body = (await res.json()) as { messages?: { ID: string }[] };
  return (body.messages ?? []).map(m => m.ID);
}

before(async () => {
  const { createTestDatabase } = (await import(
    pathToFileURL(join(REPO, 'packages/db/dist/testing.js')).href
  )) as typeof import('../../../packages/db/dist/testing.js');
  db = await createTestDatabase({ adminUrl: localEnv.DATABASE_ADMIN_URL!, appUrl: localEnv.DATABASE_URL! });

  api = spawn(process.execPath, ['--env-file-if-exists=../../infra/local-dev.env', 'dist/main.js'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      API_PORT: String(API_PORT),
      PUBLIC_ORIGIN: WEB,
      DATABASE_URL: db.appUrl,
      DATABASE_ADMIN_URL: db.adminUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const keep = (d: Buffer) => apiLog.push(...d.toString().split('\n').filter(Boolean));
  api.stdout!.on('data', keep);
  api.stderr!.on('data', keep);
  await waitFor(`${API}/health/live`, 'the API');

  const env = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_DIST_DIR: '.next/d-real-test',
    API_URL: API,
    NEXT_PUBLIC_REALTIME_URL: `http://localhost:${API_PORT}`,
    PUBLIC_ORIGIN: WEB,
    DEMO_DEV_MAILBOX_URL: 'http://127.0.0.1:58025',
  };
  if (!process.env.SKIP_BUILD) {
    const build = spawnSync(process.execPath, [nextBin, 'build'], { cwd: APP_DIR, env, stdio: 'inherit' });
    assert.equal(build.status, 0, 'next build failed');
  }
  web = spawn(process.execPath, [nextBin, 'start', '-p', String(WEB_PORT), '-H', '127.0.0.1'], {
    cwd: APP_DIR,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  await waitFor(`http://127.0.0.1:${WEB_PORT}/demo`, 'the web app');
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  web?.kill();
  api?.kill();
  // Clean up what this run created in the shared services, then drop the throwaway database.
  try {
    const token = await kcToken();
    for (const u of await kcUsers())
      await fetch(`http://localhost:58080/admin/realms/agentcity/users/${u.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
    const ids = await mailIds();
    if (ids.length)
      await fetch('http://127.0.0.1:58025/api/v1/messages', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ IDs: ids }),
      });
  } finally {
    await db?.drop();
  }
});

// Expected refusals (400 too-fast, 401 signed out, 404 unknown request) are what some steps check for.
const EXPECTED = /Failed to load resource: the server responded with a status of (400|401|404)/;
async function newPage(): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  page.on('console', (m: any) => {
    if (m.type() === 'error' && !EXPECTED.test(m.text())) problems.push(`${page.url()}: ${m.text()}`);
  });
  page.on('pageerror', (e: Error) => problems.push(`${page.url()}: ${e.message}`));
  return page;
}
async function fill(page: Page) {
  await page.getByTestId('demo-fullName').fill('Dana Real-Run');
  await page.getByTestId('demo-email').fill(email);
  await page.getByTestId('demo-company').fill('Real Run Homes');
  await page.getByTestId('demo-industry').selectOption('real-estate');
}

test('real API: a form sent too quickly is refused by the server and the page says so; sent again, it is accepted', async () => {
  const page = await newPage();
  const token = page.waitForResponse((r: any) => r.url().endsWith('/api/demo/form-token'));
  await page.goto(`${WEB}/demo?utm_source=real-run&utm_campaign=x01-d`);
  await page.getByTestId('demo-request-form').waitFor();
  assert.equal((await token).status(), 200, 'the real form token endpoint answered');
  await fill(page);
  await page.getByTestId('demo-submit').click(); // well within DEMO_FORM_MIN_SECONDS (3 s)
  const failure = page.getByTestId('demo-failure');
  await failure.waitFor();
  assert.match((await failure.textContent()) ?? '', /could not accept this form/i);
  assert.equal(await page.getByTestId('demo-email').inputValue(), email, 'details are kept');

  await page.waitForTimeout(3500); // the fresh token fetched after the refusal is now old enough
  await page.getByTestId('demo-submit').click();
  await page.waitForURL(/\/demo\/check-email\?request=[0-9a-f-]{36}$/);
  const poll = page.waitForResponse((r: any) => /\/api\/demo\/requests\/[0-9a-f-]{36}$/.test(r.url()), {
    timeout: 15_000,
  });
  await page.getByTestId('check-dev-mailbox').waitFor();
  const polled = await poll;
  assert.equal(polled.status(), 200);
  assert.equal(((await polled.json()) as { status: string }).status, 'verification-sent');
  assert.equal(await page.getByTestId('check-email').getAttribute('data-status'), 'verification-sent');
  await page.screenshot({ path: join(EVIDENCE, 'd-real-check-email.png'), fullPage: true });

  // What the real server stored (the throwaway database): attribution, consent and the notice version.
  const c = new pg.Client({ connectionString: db.adminUrl });
  await c.connect();
  try {
    const { rows } = await c.query(
      'SELECT attribution, marketing_consent, consent_notice_version, status, industry FROM marketing.lead WHERE email = $1',
      [email],
    );
    assert.equal(rows.length, 1, 'one lead stored');
    assert.equal(rows[0].marketing_consent, false);
    assert.equal(rows[0].status, 'verification-sent');
    assert.equal(rows[0].industry, 'real-estate');
    assert.equal(rows[0].attribution.utmSource, 'real-run');
    assert.equal(rows[0].attribution.utmCampaign, 'x01-d');
    assert.ok(rows[0].consent_notice_version);
  } finally {
    await c.end();
  }
  await page.context().close();
});

test('real Keycloak: the demo person exists, unverified; the verification email outcome is recorded', async () => {
  let users: { id: string; emailVerified: boolean }[] = [];
  for (let i = 0; i < 20 && users.length === 0; i++) {
    users = await kcUsers();
    if (!users.length) await new Promise(r => setTimeout(r, 500));
  }
  assert.equal(users.length, 1, 'Keycloak user created (username = email)');
  assert.equal(users[0]!.emailVerified, false);
  await new Promise(r => setTimeout(r, 2000));
  const mails = await mailIds();
  const line = apiLog.find(l => l.includes('verification not sent') || l.includes('created-and-sent'));
  // Reported, not asserted: on port 3206 Keycloak refuses the /demo/verified redirect (it only allows :3000).
  console.log(`# verification email: ${mails.length} message(s) in Mailpit; API log: ${line ?? '(none)'}`);
});

test('real API: an unknown request id shows "not found"', async () => {
  const page = await newPage();
  await page.goto(`${WEB}/demo/check-email?request=00000000-0000-4000-8000-000000000000`);
  await page.locator('[data-testid="check-email"][data-status="not-found"]').waitFor({ timeout: 15_000 });
  await page.context().close();
});

test('real API + Keycloak: /demo/verified starts sign-in with login_hint and Keycloak prefills the address', async () => {
  const page = await newPage();
  await page.goto(`${WEB}/demo`);
  await page.evaluate(
    (e: string) => localStorage.setItem('agentcity:demo-email', JSON.stringify({ email: e, at: Date.now() })),
    email,
  );
  await page.goto(`${WEB}/demo/verified`);
  await page.waitForURL(/localhost:58080\/realms\/agentcity\//, { timeout: 20_000 });
  const url = new URL(page.url());
  const hinted = url.searchParams.get('login_hint') ?? '';
  const pageText = (await page.content()).toLowerCase();
  await page.screenshot({ path: join(EVIDENCE, 'd-real-keycloak-hint.png') });
  // Keycloak may have already consumed the query (its login page URL changes); the address must be on the page.
  assert.ok(hinted === email || pageText.includes(email), 'Keycloak received the login hint');
  await page.context().close();
});

test('real API: signed-out visitors to the signed-in demo pages are sent to sign in and back', async () => {
  const page = await newPage();
  for (const path of ['/demo/welcome', '/office', '/admin/leads']) {
    await page.goto(`${WEB}${path}`);
    await page.waitForURL(`${WEB}/signin?**`);
    const u = new URL(page.url());
    assert.equal(u.searchParams.get('returnTo'), path);
    assert.equal(u.searchParams.get('reason'), 'not_signed_in');
  }
  await page.context().close();
});

test('no unexpected console errors', () => {
  assert.deepEqual(problems, []);
});
