// Browser smoke test for the marketing landing page (X01 workstream B). No API needed: the page is static, and the
// one call the demo form makes (its form token) is answered by the browser context.
//
//   node --test test/b-landing.smoke.ts            (builds into .next/b-landing-test first)
//   SKIP_BUILD=1 node --test test/b-landing.smoke.ts
//
// Starts `next start` on port 3204 and checks, in Chromium: the calls to action (scroll to #get-demo, link to
// /city), no console errors, the reduced-motion and no-WebGL fallbacks, the skip link, and the page metadata.
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const PORT = Number(process.env.B_LANDING_PORT ?? 3204);
const WEB = `http://127.0.0.1:${PORT}`;
const APP_DIR = join(import.meta.dirname, '..');
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_DIST_DIR: '.next/b-landing-test' };
const nextBin = join(APP_DIR, 'node_modules/next/dist/bin/next');

// Playwright is pre-installed outside the workspace (not a dependency), so it is required and typed loosely.
type Browser = any;
type Page = any;
const { chromium } = createRequire(import.meta.url)('playwright') as {
  chromium: { launch(o?: { args?: string[] }): Promise<Browser> };
};

let web: ChildProcess;
let browser: Browser;

before(async () => {
  if (!process.env.SKIP_BUILD) {
    const build = spawnSync(process.execPath, [nextBin, 'build'], { cwd: APP_DIR, env, stdio: 'inherit' });
    assert.equal(build.status, 0, 'next build failed');
  }
  web = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT), '-H', '127.0.0.1'], {
    cwd: APP_DIR,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const until = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(WEB)).ok) break;
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
});

/** The demo request form (workstream D) fetches a form token on load; this test runs without an API, so answer it. */
function stubFormToken(context: any): Promise<void> {
  return context.route('**/api/demo/form-token', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'test-token' }) }),
  );
}

/** A page that records console errors and uncaught exceptions. */
async function open(
  options: { reducedMotion?: 'reduce' | 'no-preference'; viewport?: { width: number; height: number } } = {},
): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1440, height: 900 },
    reducedMotion: options.reducedMotion ?? 'no-preference',
  });
  await stubFormToken(context);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m: any) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e: Error) => errors.push(String(e)));
  await page.goto(WEB, { waitUntil: 'networkidle' });
  return { page, errors };
}

test('the landing page renders its headline and calls to action without console errors', async () => {
  const { page, errors } = await open();
  assert.match(await page.textContent('h1'), /Give every\s*opportunity\s*a next step\./);
  assert.equal(await page.locator('h1').count(), 1, 'exactly one h1');
  assert.match(await page.textContent('[data-testid=hero-cta-demo]'), /Get My Free Demo Office/);
  assert.match(await page.textContent('[data-testid=hero-cta-city]'), /Explore the City/);
  // Give the deferred 3D preview time to load (or fall back) before judging the console.
  await page.waitForTimeout(3000);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('"Get My Free Demo Office" scrolls to the demo form section', async () => {
  const { page } = await open();
  await page.click('[data-testid=hero-cta-demo]');
  await page.waitForFunction(() => location.hash === '#get-demo');
  await page.waitForFunction(() => {
    const top = document.getElementById('get-demo')?.getBoundingClientRect().top ?? 9999;
    return Math.abs(top) < 120;
  });
  assert.equal(
    await page.locator('#get-demo [data-testid=demo-request-form]').count(),
    1,
    'the demo request form is in #get-demo',
  );
  await page.context().close();
});

test('"Explore the City" goes to /city', async () => {
  const { page } = await open();
  assert.equal(await page.getAttribute('[data-testid=hero-cta-city]', 'href'), '/city');
  await page.click('[data-testid=hero-cta-city]');
  await page.waitForURL(`${WEB}/city`);
  await page.context().close();
});

test('reduced motion keeps the poster and never loads the 3D scene', async () => {
  const { page, errors } = await open({ reducedMotion: 'reduce' });
  await page.waitForTimeout(3000);
  assert.equal(await page.getAttribute('[data-testid=city-preview]', 'data-mode'), 'poster');
  assert.equal(await page.locator('[data-testid=city-preview] canvas').count(), 0);
  assert.ok(
    await page.evaluate(() => (document.querySelector('[data-testid=city-poster]') as HTMLImageElement).complete),
  );
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('without WebGL the poster stays and nothing errors', async () => {
  const noGl = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
  try {
    const context = await noGl.newContext();
    await stubFormToken(context);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', (m: any) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e: Error) => errors.push(String(e)));
    await page.goto(WEB, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    assert.equal(await page.getAttribute('[data-testid=city-preview]', 'data-mode'), 'poster');
    assert.match(await page.textContent('[data-testid=city-preview-label]'), /Rendered frame/);
    assert.deepEqual(errors, []);
  } finally {
    await noGl.close();
  }
});

test('the first Tab reaches the skip link, which moves focus to the content', async () => {
  const { page } = await open({ reducedMotion: 'reduce' });
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Skip to content');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash === '#main');
  await page.context().close();
});

test('the page is not indexable by default and has Open Graph metadata', async () => {
  const html = await (await fetch(WEB)).text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(html, /<meta property="og:title" content="AgentCity: Your Business\. Your AI Team\. Your City\."/);
  assert.match(html, /<meta property="og:image"/);
});

for (const width of [360, 390]) {
  test(`nothing overflows or is clipped on a ${width}px phone`, async () => {
    const { page } = await open({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= width, 'no horizontal scroll');
    // The marketing wrapper clips overflow, so also check that no text block runs past the viewport.
    const overflowing = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.mk h1, .mk h2, .mk h3, .mk p, .mk li, .mk figure'))
        .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
        .map(el => el.textContent?.trim().slice(0, 40)),
    );
    assert.deepEqual(overflowing, []);
    await page.context().close();
  });
}
