// Browser smoke test for the demo funnel (workstream D), with the API mocked (test/d-mock-api.ts).
//
//   node --test --test-concurrency=1 test/d-demo.smoke.ts        (from apps/web)
//
// Builds the app into .next/d-demo-test with API_URL pointing at the mock (Next bakes rewrites in at build time),
// starts it with `next start` on port 3206 and drives Chromium through the request form, check-email, verified,
// welcome, the office with its tour and agent panel, and the admin leads page. Set SKIP_BUILD=1 to reuse the build.
// Screenshots go to planning/agentcity-migration/x01-cinematic-city/evidence/d-*.png.
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { startDemoMockApi, type DemoMockApi } from './d-mock-api.ts';

const WEB_PORT = 3206;
const API_PORT = 3207;
const BASE_API_PORT = 3208;
const WEB = `http://127.0.0.1:${WEB_PORT}`;
const APP_DIR = join(import.meta.dirname, '..');
const EVIDENCE = join(APP_DIR, '../../planning/agentcity-migration/x01-cinematic-city/evidence');
const DIST = '.next/d-demo-test';
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_DIST_DIR: DIST,
  API_URL: `http://127.0.0.1:${API_PORT}`,
  NEXT_PUBLIC_REALTIME_URL: `http://127.0.0.1:${API_PORT}`,
  DEMO_DEV_MAILBOX_URL: 'http://127.0.0.1:58025',
};
const nextBin = join(APP_DIR, 'node_modules/next/dist/bin/next');

// Playwright is pre-installed outside the workspace (not a dependency); it is typed loosely, as in browser.smoke.ts.
type Browser = any;
type Page = any;
const { chromium, devices } = createRequire(import.meta.url)('playwright') as {
  chromium: { launch(): Promise<Browser> };
  devices: Record<string, Record<string, unknown>>;
};

let mock: DemoMockApi;
let web: ChildProcess;
let browser: Browser;
/** Console errors and uncaught page errors from every page, checked at the end. */
const problems: string[] = [];

before(async () => {
  mkdirSync(EVIDENCE, { recursive: true });
  if (!process.env.SKIP_BUILD) {
    const build = spawnSync(process.execPath, [nextBin, 'build'], { cwd: APP_DIR, env, stdio: 'inherit' });
    assert.equal(build.status, 0, 'next build failed');
  }
  mock = await startDemoMockApi(API_PORT, BASE_API_PORT, WEB);
  web = spawn(process.execPath, [nextBin, 'start', '-p', String(WEB_PORT), '-H', '127.0.0.1'], {
    cwd: APP_DIR,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const until = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(`${WEB}/demo`)).ok) break;
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

// Expected HTTP refusals (400 field errors, 401 before sign-in, 403 step-up, 404/410) show up in the console as
// "Failed to load resource"; those are the point of the test. Anything else is a real problem.
const EXPECTED = /Failed to load resource: the server responded with a status of (400|401|403|404|409|410|500)/;

async function newPage(opts: { signedIn?: boolean; mobile?: boolean } = {}): Promise<Page> {
  const context = await browser.newContext(
    opts.mobile ? { ...devices['iPhone 13'], deviceScaleFactor: 2 } : { viewport: { width: 1360, height: 900 } },
  );
  if (opts.signedIn) {
    await context.addCookies([{ name: 'ac_session', value: 'mock-session', domain: '127.0.0.1', path: '/' }]);
  }
  const page = await context.newPage();
  page.on('console', (m: any) => {
    if (m.type() === 'error' && !EXPECTED.test(m.text())) problems.push(`${page.url()}: ${m.text()}`);
  });
  page.on('pageerror', (e: Error) => problems.push(`${page.url()}: ${e.message}`));
  return page;
}

const since = (n: number) => mock.requests.slice(n);
const count = (n: number, method: string, path: string) =>
  since(n).filter(r => r.method === method && r.path.startsWith(path)).length;
// Chromium occasionally refuses a capture right after a navigation ("Unable to capture screenshot"): retry once.
async function shot(page: Page, name: string, fullPage = true) {
  const path = join(EVIDENCE, `d-${name}.png`);
  try {
    await page.screenshot({ path, fullPage });
  } catch {
    await page.waitForTimeout(500);
    await page.screenshot({ path, fullPage });
  }
}
const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) as Promise<boolean>;

async function fillGood(page: Page, overrides: Record<string, string> = {}) {
  const v = { fullName: 'Ada Lovelace', email: 'ada@analytical.example', company: 'Analytical Homes', ...overrides };
  await page.getByTestId('demo-fullName').fill(v.fullName);
  await page.getByTestId('demo-email').fill(v.email);
  await page.getByTestId('demo-company').fill(v.company);
}

test('form: client validation shows accessible errors and an error summary that takes focus', async () => {
  const page = await newPage();
  const n = mock.requests.length;
  await page.goto(`${WEB}/demo`);
  await page.getByTestId('demo-request-form').waitFor();
  await page.waitForFunction(() => true);
  await shot(page, 'form');

  await page.getByTestId('demo-submit').click();
  const summary = page.getByTestId('demo-error-summary');
  await summary.waitFor();
  assert.equal(await summary.evaluate((el: Element) => el === document.activeElement), true, 'summary has focus');
  assert.match((await summary.textContent()) ?? '', /3 things/);
  for (const f of ['fullName', 'email', 'company']) {
    const input = page.getByTestId(`demo-${f}`);
    assert.equal(await input.getAttribute('aria-invalid'), 'true', `${f} is aria-invalid`);
    const describedBy = (await input.getAttribute('aria-describedby')) ?? '';
    const errorId = await page.getByTestId(`demo-error-${f}`).getAttribute('id');
    assert.ok(describedBy.split(' ').includes(errorId), `${f} is described by its error`);
  }
  // Wrong formats: email, website, phone.
  await fillGood(page, { email: 'ada@nowhere' });
  await page.getByTestId('demo-phone').fill('12');
  await page.getByTestId('demo-website').fill('not a site');
  await page.getByTestId('demo-submit').click();
  await page.getByTestId('demo-error-email').waitFor();
  await page.getByTestId('demo-error-phone').waitFor();
  await page.getByTestId('demo-error-website').waitFor();
  assert.equal(await page.getByTestId('demo-error-fullName').count(), 0, 'fixed fields lose their error');
  await shot(page, 'form-errors');
  // Fixing a field as you type clears its error.
  await page.getByTestId('demo-email').fill('ada@analytical.example');
  await page.getByTestId('demo-error-email').waitFor({ state: 'detached' });
  assert.equal(count(n, 'POST', '/api/demo/requests'), 0, 'nothing was sent while the form was invalid');
  assert.ok(count(n, 'GET', '/api/demo/form-token') >= 1, 'the form token was fetched on load');
  await page.context().close();
});

test('form: server field errors map onto fields; a 500 offers a retry; success goes to check-email once', async () => {
  const page = await newPage();
  await page.goto(`${WEB}/demo?utm_source=newsletter&utm_campaign=autumn`);
  await page.getByTestId('demo-request-form').waitFor();
  await page.waitForTimeout(300); // let the form token arrive

  // Server-side validation.
  await fillGood(page, { company: 'Server Reject Co' });
  await page.getByTestId('demo-submit').click();
  await page.getByTestId('demo-error-email').getByText('Use your work email address').waitFor();
  assert.equal(await page.getByTestId('demo-email').getAttribute('aria-invalid'), 'true');

  // Generic failure, then retry.
  mock.state.failNextRequest = true;
  await page.getByTestId('demo-company').fill('Analytical Homes');
  // The server's verdict on the unchanged address stands until it is edited.
  await page.getByTestId('demo-company').blur();
  assert.equal(await page.getByTestId('demo-email').getAttribute('aria-invalid'), 'true');
  await page.getByTestId('demo-email').fill('ada@analytical-homes.example');
  assert.equal(await page.getByTestId('demo-error-email').count(), 0);
  await page.getByTestId('demo-submit').click();
  await page.getByTestId('demo-failure').waitFor();
  assert.equal(await page.getByTestId('demo-fullName').inputValue(), 'Ada Lovelace', 'values are kept');

  // Double click and Enter while sending: exactly one request.
  await page.getByTestId('demo-industry').selectOption('automotive');
  const n = mock.requests.length;
  await page.getByTestId('demo-submit').dblclick();
  await page
    .getByTestId('demo-email')
    .press('Enter')
    .catch(() => undefined);
  await page.waitForURL(`${WEB}/demo/check-email?request=req-*`);
  assert.equal(count(n, 'POST', '/api/demo/requests'), 1, 'one request despite repeated submits');
  const sent = since(n).find(r => r.method === 'POST' && r.path === '/api/demo/requests')!;
  assert.equal(sent.body!.website2, '', 'the honeypot stayed empty');
  assert.equal(sent.body!.marketingConsent, false, 'marketing consent defaults to unchecked');
  assert.equal(sent.body!.industry, 'automotive');
  assert.match(String(sent.body!.formToken), /^ft-/);
  assert.deepEqual(sent.body!.attribution, { utmSource: 'newsletter', utmCampaign: 'autumn' });
  assert.ok(!page.url().includes('@'), 'no email address in the URL');
  const stored = await page.evaluate(() => localStorage.getItem('agentcity:demo-email'));
  assert.match(stored ?? '', /ada@analytical-homes\.example/, 'the address is remembered for the sign-in hint');
  await page.context().close();
});

test('form: can be completed with the keyboard alone; the honeypot is never focused', async () => {
  const page = await newPage();
  const n = mock.requests.length;
  await page.goto(`${WEB}/demo`);
  await page.getByTestId('demo-request-form').waitFor();
  await page.waitForTimeout(300);
  await page.getByTestId('demo-fullName').focus();
  const focused: string[] = [];
  const track = async () =>
    focused.push(
      await page.evaluate(() => document.activeElement?.getAttribute('name') ?? document.activeElement?.tagName ?? ''),
    );
  await track();
  await page.keyboard.type('Grace Hopper');
  await page.keyboard.press('Tab');
  await track();
  await page.keyboard.type('grace@navy.example');
  await page.keyboard.press('Tab');
  await track();
  await page.keyboard.type('Compiler Co');
  await page.keyboard.press('Tab');
  await track();
  await page.keyboard.press('ArrowDown'); // industry: first real option
  await page.keyboard.press('Tab');
  await track();
  await page.keyboard.type('+1 202 555 0143');
  await page.keyboard.press('Tab');
  await track();
  await page.keyboard.type('compiler.example');
  await page.keyboard.press('Tab'); // consent
  await track();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab'); // submit
  await track();
  assert.deepEqual(focused, [
    'fullName',
    'email',
    'company',
    'industry',
    'phone',
    'website',
    'marketingConsent',
    'BUTTON',
  ]);
  assert.ok(!focused.includes('website2'));
  await page.keyboard.press('Enter');
  await page.waitForURL(`${WEB}/demo/check-email?request=req-*`);
  const sent = since(n).find(r => r.method === 'POST' && r.path === '/api/demo/requests')!;
  assert.equal(sent.body!.marketingConsent, true);
  assert.equal(sent.body!.website, 'https://compiler.example');
  assert.equal(sent.body!.website2, '');
  assert.ok(sent.body!.industry);
  await page.context().close();
});

test('landing: the form sits natively in the #get-demo card and submits to check-email', async () => {
  for (const mobile of [false, true]) {
    const page = await newPage({ mobile });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${WEB}/#get-demo`);
    const form = page.locator('#get-demo [data-testid="demo-request-form"]');
    await form.waitFor();
    await page.waitForTimeout(400);
    const card = page.locator('#get-demo .mk-demo-card');
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: join(EVIDENCE, mobile ? 'd-landing-form-390.png' : 'd-landing-form.png') });
    assert.ok(await noHorizontalScroll(page), 'landing: no sideways scroll');
    if (!mobile) {
      const n = mock.requests.length;
      await fillGood(page, { email: 'landing@analytical.example' });
      await page.getByTestId('demo-submit').click();
      await page.waitForURL(`${WEB}/demo/check-email?request=req-*`);
      assert.equal(count(n, 'POST', '/api/demo/requests'), 1);
    }
    await page.context().close();
  }
});

test('check-email: polls gently with growing gaps and stops when ready; dev mailbox note is shown', async () => {
  const page = await newPage();
  await page.goto(`${WEB}/demo/check-email?request=req-poll`);
  await page.getByTestId('check-dev-mailbox').getByText('http://127.0.0.1:58025').waitFor();
  await page.getByTestId('check-resend').waitFor();
  await shot(page, 'check-email');
  await page.locator('[data-testid="check-email"][data-status="ready"]').waitFor({ timeout: 45_000 });
  const times = mock.polls.get('req-poll')!;
  assert.equal(times.length, 3);
  const gaps = [times[1]! - times[0]!, times[2]! - times[1]!];
  assert.ok(gaps[1]! > gaps[0]! + 1000, `gaps grow: ${gaps.join(', ')} ms`);
  await page.getByTestId('check-signin').waitFor();
  await shot(page, 'check-email-ready');
  await page.waitForTimeout(7000);
  assert.equal(mock.polls.get('req-poll')!.length, 3, 'no polling after ready');

  await page.goto(`${WEB}/demo/check-email?request=req-expired`);
  await page.locator('[data-testid="check-email"][data-status="expired"]').waitFor({ timeout: 10_000 });
  await page.getByTestId('check-restart').waitFor();
  await page.goto(`${WEB}/demo/check-email?request=req-missing`);
  await page.locator('[data-testid="check-email"][data-status="not-found"]').waitFor({ timeout: 10_000 });
  await page.context().close();
});

test('verified: starts sign-in by itself with the remembered address as login hint; without it, no hint', async () => {
  const page = await newPage();
  await page.goto(`${WEB}/demo`);
  await page.evaluate(() =>
    localStorage.setItem('agentcity:demo-email', JSON.stringify({ email: 'ada@analytical.example', at: Date.now() })),
  );
  const n = mock.base.requests.length;
  await page.goto(`${WEB}/demo/verified`);
  await page.getByTestId('verified-hint').getByText('ada@analytical.example').waitFor();
  await page.getByTestId('verified-signin').waitFor();
  await shot(page, 'verified');
  await page.waitForURL(`${mock.base.url}/idp/authorize**`);
  const start = mock.base.requests.slice(n).find(r => r.path === '/api/auth/login/start')!;
  assert.ok(start.proof.ok);
  assert.equal(start.body!.loginHint, 'ada@analytical.example');
  assert.equal(start.body!.returnTo, '/demo/welcome');
  assert.equal(start.body!.purpose, 'login');
  await page.context().close();

  const fresh = await newPage();
  const m = mock.base.requests.length;
  await fresh.goto(`${WEB}/demo/verified`);
  await fresh.getByTestId('verified-signin').click(); // the visible fallback does the same, straight away
  await fresh.waitForURL(`${mock.base.url}/idp/authorize**`);
  const starts = mock.base.requests.slice(m).filter(r => r.path === '/api/auth/login/start');
  assert.equal(starts.length, 1, 'sign-in started once');
  assert.equal('loginHint' in starts[0]!.body!, false);
  await fresh.context().close();
});

test('welcome: claims the demo and greets by first name; errors explain the next step', async () => {
  const page = await newPage({ signedIn: true });
  mock.state.claim = 'ok';
  const n = mock.requests.length;
  await page.goto(`${WEB}/demo/welcome`);
  await page.getByTestId('welcome-title').getByText('Welcome to AgentCity, Ada.').waitFor();
  assert.equal(count(n, 'POST', '/api/demo/claim'), 1, 'claimed once');
  assert.equal(await page.getByTestId('welcome-company').textContent(), 'Analytical Homes');
  assert.equal(await page.getByTestId('welcome-building').textContent(), 'Rental Building 2');
  assert.match((await page.getByTestId('welcome-office').textContent()) ?? '', /Level 7 · Suite 7A/);
  await page.getByTestId('welcome-agents').getByText('Iris Vale').waitFor();
  assert.equal(await page.getByTestId('welcome-start-tour').getAttribute('href'), '/office?tour=start');
  assert.match((await page.getByTestId('welcome-explore-city').getAttribute('href')) ?? '', /^\/city/);
  await page.getByText('Your virtual AI office is ready to explore.').waitFor();
  await shot(page, 'welcome');

  // Claimed earlier: the workspace fills in the same details.
  mock.state.claim = 'already';
  await page.goto(`${WEB}/demo/welcome`);
  await page.getByTestId('welcome-title').getByText('Welcome to AgentCity, Ada.').waitFor();

  for (const [mode, kind, text] of [
    ['not-verified', 'not-verified', /isn’t confirmed yet/],
    ['no-demo', 'no-demo', /couldn’t find a demo office for ada@example\.test/],
    ['expired', 'expired', /has expired/],
  ] as const) {
    mock.state.claim = mode;
    await page.goto(`${WEB}/demo/welcome`);
    const box = page.locator(`[data-testid="welcome-error"][data-kind="${kind}"]`);
    await box.waitFor();
    assert.match((await page.getByTestId('welcome-error-text').textContent()) ?? '', text);
    if (mode === 'expired') await shot(page, 'welcome-expired');
  }
  mock.state.claim = 'ok';
  await page.context().close();

  const out = await newPage();
  await out.goto(`${WEB}/demo/welcome`);
  await out.waitForURL(`${WEB}/signin?**`);
  assert.equal(new URL(out.url()).searchParams.get('returnTo'), '/demo/welcome');
  await out.context().close();
});

test('office: first-visit tour walks 7 steps, can be skipped, and resumes where it was left', async () => {
  const page = await newPage({ signedIn: true });
  await page.goto(`${WEB}/office`);
  const tour = page.getByTestId('tour');
  await tour.waitFor();
  assert.equal(await page.getByTestId('tour-progress').textContent(), 'Step 1 of 7');
  assert.equal(
    await page.getByTestId('tour-title').evaluate((el: Element) => el === document.activeElement),
    true,
    'the step heading has focus',
  );
  await shot(page, 'office-tour', false);
  const seen: string[] = [await tour.getAttribute('data-step')];
  for (let i = 0; i < 6; i++) {
    await page.getByTestId('tour-next').click();
    await page.waitForFunction(
      (i: number) =>
        document.querySelector('[data-testid="tour"]')?.getAttribute('data-step') !== null &&
        document.querySelector('[data-testid="tour-progress"]')?.textContent === `Step ${i + 2} of 7`,
      i,
    );
    seen.push(await tour.getAttribute('data-step'));
    if (seen.at(-1) === 'activity') {
      await page.locator('[data-testid="agent-panel"][data-agent="ag-iris"]').waitFor();
      await page.locator('html[data-tour-target="agent-panel"] [data-tour="agent-panel"]').waitFor(); // the panel is outlined
      await shot(page, 'office-tour-activity', false);
    }
  }
  assert.deepEqual(seen, ['arrival', 'building', 'floor', 'agents', 'activity', 'approvals', 'consult']);
  await page.getByTestId('tour-next').click(); // Finish
  await tour.waitFor({ state: 'detached' });
  assert.equal(
    await page.getByTestId('office-tour-button').evaluate((el: Element) => el === document.activeElement),
    true,
    'focus returns to "Take the tour"',
  );
  await page.reload();
  await page.getByTestId('office').waitFor();
  await page.waitForTimeout(800);
  assert.equal(await page.getByTestId('tour').count(), 0, 'not shown again after finishing');

  // Restart from the button; Back works; Escape skips.
  await page.getByTestId('office-tour-button').click();
  await page.getByTestId('tour-next').click();
  await page.getByTestId('tour-back').click();
  assert.equal(await page.getByTestId('tour-progress').textContent(), 'Step 1 of 7');
  await page.keyboard.press('Escape');
  await page.getByTestId('tour').waitFor({ state: 'detached' });
  await page.context().close();

  // A new person (fresh browser): leave mid-way, come back, and it resumes at the same step.
  const other = await newPage({ signedIn: true });
  await other.goto(`${WEB}/office`);
  await other.getByTestId('tour').waitFor();
  await other.getByTestId('tour-next').click();
  await other.getByTestId('tour-next').click();
  await other.reload();
  await other.locator('[data-testid="tour"][data-step="floor"]').waitFor();
  await other.getByTestId('tour-skip').click();
  await other.getByTestId('tour').waitFor({ state: 'detached' });
  await other.reload();
  await other.getByTestId('office').waitFor();
  await other.waitForTimeout(800);
  assert.equal(await other.getByTestId('tour').count(), 0, 'skipped tours stay away');
  // ?tour=start (from the welcome page) always opens it, and the parameter is removed from the address.
  await other.goto(`${WEB}/office?tour=start`);
  await other.getByTestId('tour').waitFor();
  assert.equal(new URL(other.url()).search, '');
  await other.context().close();
});

test('office: agent panel shows sample content labelled "Simulated"; try-it shows canned text, nothing sent', async () => {
  const page = await newPage({ signedIn: true });
  await page.goto(`${WEB}/demo`);
  await page.evaluate(() =>
    localStorage.setItem('agentcity:demo-tour:v1:kc:test-person', JSON.stringify({ step: 6, status: 'done' })),
  );
  const n = mock.requests.length;
  await page.goto(`${WEB}/office`);
  await page.getByTestId('office-title').getByText('Analytical Homes’s AI office').waitFor();
  assert.match((await page.getByTestId('office-place').textContent()) ?? '', /Rental Building 2 · Level 7 · Suite 7A/);
  await page.getByTestId('office-scene').waitFor();
  await page.getByTestId('office-desk-ag-theo').click();
  await page.locator('[data-testid="agent-panel"][data-agent="ag-theo"]').waitFor();
  assert.equal(await page.getByTestId('agent-status').textContent(), 'Waiting for approval');
  await page.getByTestId('office-agent-ag-iris').click();
  await page.locator('[data-testid="agent-panel"][data-agent="ag-iris"]').waitFor();
  await page.getByTestId('agent-conversation').first().locator('summary').click();
  await page.getByTestId('agent-try-follow-up').click();
  const canned = page.getByTestId('agent-canned');
  await canned.waitFor();
  assert.match((await canned.textContent()) ?? '', /not sent/);
  assert.match(
    (await page.getByTestId('agent-canned-note').textContent()) ?? '',
    /Nothing was sent, and nothing was written to a CRM/,
  );
  const labels = await page.getByTestId('simulated-label').count();
  assert.ok(labels >= 6, `simulated labels everywhere (${labels})`);
  await page.getByTestId('demo-ctas').waitFor();
  assert.equal(await page.locator('[role="dialog"][aria-modal="true"]').count(), 0, 'no modal popups');
  await shot(page, 'office');
  // The demo controls never call the API: only the page's own loads happened.
  const writes = since(n).filter(r => r.method !== 'GET');
  assert.deepEqual(writes, [], 'no writes from the office page');
  await page.context().close();
});

test('admin leads: step-up first, then cursor pagination and CSV export; no personal data in URLs', async () => {
  mock.state.leadsNeedStepUp = true;
  const page = await newPage({ signedIn: true });
  await page.goto(`${WEB}/admin/leads`);
  await page.locator('[data-testid="leads-step-up"][data-reason="permission"]').waitFor();
  await shot(page, 'admin-step-up');
  const b = mock.base.requests.length;
  await page.getByTestId('leads-step-up-continue').click();
  await page.waitForURL(`${mock.base.url}/idp/authorize**`);
  const start = mock.base.requests.slice(b).find(r => r.path === '/api/auth/login/start')!;
  assert.equal(start.body!.purpose, 'step-up');
  assert.equal(start.body!.stepUpReason, 'permission');
  assert.equal(start.body!.returnTo, '/admin/leads');

  mock.state.leadsNeedStepUp = false;
  const n = mock.requests.length;
  await page.goto(`${WEB}/admin/leads`);
  await page.getByTestId('leads-table').waitFor();
  assert.equal(await page.getByTestId('lead-row').count(), 25);
  await page.getByText('person1@example.test', { exact: true }).waitFor();
  await shot(page, 'admin-leads');
  await page.getByTestId('leads-next').click();
  await page.getByTestId('leads-page-number').getByText('Page 2').waitFor();
  await page.getByText('person26@example.test', { exact: true }).waitFor();
  await page.getByTestId('leads-next').click();
  await page.getByTestId('leads-page-number').getByText('Page 3').waitFor();
  assert.equal(await page.getByTestId('lead-row').count(), 10);
  assert.equal(await page.getByTestId('leads-next').isDisabled(), true);
  await page.getByTestId('leads-prev').click();
  await page.getByTestId('leads-page-number').getByText('Page 2').waitFor();
  assert.equal(new URL(page.url()).search, '', 'cursors stay out of the address bar');
  const listCalls = since(n).filter(r => r.path.startsWith('/api/admin/leads?'));
  assert.deepEqual(
    listCalls.map(r => r.path),
    [
      '/api/admin/leads?first=25',
      '/api/admin/leads?first=25&after=c-25',
      '/api/admin/leads?first=25&after=c-50',
      '/api/admin/leads?first=25&after=c-25',
    ],
  );
  assert.ok(
    since(n).every(r => !r.path.includes('@')),
    'no email address in any request URL',
  );

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('leads-export').click()]);
  assert.equal(download.suggestedFilename(), 'agentcity-demo-leads.csv');
  await page.getByTestId('leads-exported').waitFor();
  const csv = since(n).find(r => r.path === '/api/admin/leads.csv')!;
  assert.ok(csv.proof.ok, 'the CSV request carried a device proof');

  // Step-up demanded for the export alone.
  mock.state.csvNeedsStepUp = true;
  await page.getByTestId('leads-export').click();
  await page.getByTestId('leads-step-up').waitFor();
  mock.state.csvNeedsStepUp = false;
  await page.context().close();
});

test('mobile: form, check-email, welcome, office and leads fit a phone screen', async () => {
  const page = await newPage({ mobile: true, signedIn: true });
  await page.goto(`${WEB}/demo`);
  await page.getByTestId('demo-request-form').waitFor();
  assert.ok(await noHorizontalScroll(page), 'demo form: no sideways scroll');
  await shot(page, 'mobile-form');
  await page.goto(`${WEB}/demo/check-email?request=req-x`);
  await page.getByTestId('check-email').waitFor();
  assert.ok(await noHorizontalScroll(page), 'check-email: no sideways scroll');
  await shot(page, 'mobile-check-email');
  await page.goto(`${WEB}/demo/welcome`);
  await page.getByTestId('welcome-title').waitFor();
  assert.ok(await noHorizontalScroll(page), 'welcome: no sideways scroll');
  await shot(page, 'mobile-welcome');
  await page.goto(`${WEB}/office`);
  await page.getByTestId('tour').waitFor();
  assert.ok(await noHorizontalScroll(page), 'office: no sideways scroll');
  await shot(page, 'mobile-office-tour', false);
  await page.getByTestId('tour-skip').click();
  await page.getByTestId('office-agent-ag-iris').click();
  await shot(page, 'mobile-office');
  mock.state.leadsNeedStepUp = false;
  await page.goto(`${WEB}/admin/leads`);
  await page.getByTestId('leads-table').waitFor();
  assert.ok(await noHorizontalScroll(page), 'leads: no sideways scroll');
  await page.context().close();
});

test('no unexpected console errors or page errors on any demo page', () => {
  assert.deepEqual(problems, []);
});
