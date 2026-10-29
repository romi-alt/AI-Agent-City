// Browser smoke test for the front page (the AutoSalesCity design). No API needed: the page is static and its demo
// is simulated in the browser.
//
//   node --test test/b-landing.smoke.ts            (builds into .next/b-landing-test first)
//   SKIP_BUILD=1 node --test test/b-landing.smoke.ts
//
// Starts `next start` on port 3204 and checks, in Chromium: every section and its copy, no console errors, the
// demo sign-in dialog and overlay, the reduced-motion and no-WebGL fallbacks, the phone layout and the page metadata.
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

/** A page that records console errors and uncaught exceptions. */
async function open(
  options: { reducedMotion?: 'reduce' | 'no-preference'; viewport?: { width: number; height: number } } = {},
): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1440, height: 900 },
    reducedMotion: options.reducedMotion ?? 'no-preference',
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m: any) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e: Error) => errors.push(String(e)));
  await page.goto(WEB, { waitUntil: 'networkidle' });
  return { page, errors };
}

test('the front page renders its headline, sections and pricing without console errors', async () => {
  const { page, errors } = await open();
  assert.match(await page.textContent('h1'), /Every\s+dealership\s+gets\s+an\s+AI\s+sales\s+floor\./);
  assert.equal(await page.locator('h1').count(), 1, 'exactly one h1');
  for (const id of ['live-demo', 'how', 'districts', 'agents', 'control', 'pricing', 'demo']) {
    assert.equal(await page.locator(`#${id}`).count(), 1, `section #${id}`);
  }
  assert.equal(await page.locator('.asc .agent').count(), 7, 'seven agents');
  assert.equal(await page.locator('.asc .plan').count(), 4, 'four plans');
  assert.equal(await page.locator('.asc .district').count(), 5, 'five districts');
  // Give the hero scene time to load before judging the console.
  await page.waitForTimeout(3000);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('the closing call to action opens a mail to the contact address', async () => {
  const { page } = await open({ reducedMotion: 'reduce' });
  const href = await page.getAttribute('#demo a.btn.primary', 'href');
  assert.match(href, /^mailto:hello@autosalescity\.site\?subject=AutoSalesCity%20demo$/);
  await page.context().close();
});

test('the demo sign-in dialog rejects a wrong password and opens the overlay with the public login', async () => {
  const { page } = await open({ reducedMotion: 'reduce' });
  await page.click('.nav-demo');
  assert.ok(await page.locator('#demoLogin').evaluate((d: HTMLDialogElement) => d.open), 'dialog open');
  await page.fill('#dlPw', 'wrong');
  await page.click('#dlForm button[type=submit]');
  assert.match(await page.textContent('#dlErr'), /public demo login/);
  assert.ok(await page.locator('#demoApp').evaluate((el: HTMLElement) => el.classList.contains('hidden')));
  await page.fill('#dlPw', 'autosales');
  await page.click('#dlForm button[type=submit]');
  await page.waitForFunction(() => !document.getElementById('demoApp')?.classList.contains('hidden'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('demoApp')?.classList.contains('hidden'));
  await page.context().close();
});

test('reduced motion shows the final numbers at once', async () => {
  const { page } = await open({ reducedMotion: 'reduce' });
  await page.evaluate(() => document.getElementById('control')?.scrollIntoView());
  await page.waitForFunction(() => document.querySelector('#screen .kpi .n')?.textContent === '1,284');
  await page.context().close();
});

test('without WebGL the skyline stays and the simulated feed keeps running', async () => {
  const noGl = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
  try {
    const context = await noGl.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', (m: any) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e: Error) => errors.push(String(e)));
    await page.goto(WEB, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.getElementById('hero')?.classList.contains('no-webgl'));
    await page.waitForFunction(() => document.querySelectorAll('#feed li').length >= 4);
    assert.deepEqual(errors, []);
  } finally {
    await noGl.close();
  }
});

test('the page is not indexable by default and has Open Graph metadata', async () => {
  const html = await (await fetch(WEB)).text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(html, /<title>AutoSalesCity · AI sales floors for every dealership<\/title>/);
  assert.match(html, /<meta property="og:title" content="AutoSalesCity · AI sales floors for every dealership"/);
  assert.match(html, /<meta property="og:image"/);
});

for (const width of [360, 390]) {
  test(`nothing overflows on a ${width}px phone`, async () => {
    const { page } = await open({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= width, 'no horizontal scroll');
    const overflowing = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.asc h1, .asc h2, .asc h3, .asc p, .asc li'))
        .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
        .map(el => el.textContent?.trim().slice(0, 40)),
    );
    assert.deepEqual(overflowing, []);
    await page.context().close();
  });
}
