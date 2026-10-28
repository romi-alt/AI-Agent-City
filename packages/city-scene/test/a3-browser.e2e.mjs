// A3 browser checks (dev-only, run by hand): the public /city page on a running build, plus the 3D harness
// (stand-in buildings) for camera and office checks. Needs Playwright with Chromium installed globally.
//   node packages/city-scene/test/a3-browser.e2e.mjs [baseUrl=http://127.0.0.1:3203] [--only=name,...]
// Screenshots go to planning/agentcity-migration/x01-cinematic-city/evidence/a3-*.png.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const evidence = join(root, 'planning/agentcity-migration/x01-cinematic-city/evidence');
const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const { chromium } = createRequire(join(globalRoot, 'noop.js'))('playwright');

const base = process.argv.find(a => a.startsWith('http')) ?? 'http://127.0.0.1:3203';
const only = (process.argv.find(a => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
// The harness opens from file:// by default; pass --harness=<url> to serve it over HTTP (with /city/ assets, so
// A2's character model loads), e.g. a static server on the dist folder with `city` linked to apps/web/public/city.
const harness =
  (process.argv.find(a => a.startsWith('--harness=')) ?? '').slice(10) ||
  `file://${join(here, 'harness/dist/index.html')}`;
const GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const results = [];

async function check(name, fn) {
  if (only.length && !only.includes(name)) return;
  const t0 = Date.now();
  try {
    await fn();
    results.push(`ok   ${name} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } catch (e) {
    results.push(`FAIL ${name}: ${e.message.split('\n').slice(0, 8).join(' | ')}`);
  }
  console.log(results.at(-1));
}

async function open(url, opts = {}) {
  const browser = await chromium.launch({ args: opts.args ?? GL });
  const context = await browser.newContext({
    viewport: opts.viewport ?? { width: 1440, height: 900 },
    ...opts.context,
  });
  const page = await context.newPage();
  // Software GL renders a frame of the full city in seconds; actions wait for stable frames, so give them room.
  page.setDefaultTimeout(120_000);
  const errors = [];
  // The file:// harness cannot fetch A2's character model; the office then shows its stand-in figures (the
  // Next app serves the model, and those checks keep the strict no-errors rule).
  const known = url.startsWith('file:') ? /Fetch API cannot load file:\/\/\/city\/models\// : null;
  const keep = msg => !(known && known.test(msg)) && errors.push(msg);
  page.on('pageerror', e => keep(e.message));
  page.on('console', m => m.type() === 'error' && keep(m.text()));
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  return { browser, page, errors, close: () => browser.close() };
}
const t00 = Date.now();
const log = msg => console.log(`  [${((Date.now() - t00) / 1000).toFixed(0)}s] ${msg}`);
const shot = async (page, name) => {
  log(`shot ${name}`);
  await page.waitForTimeout(600); // let CSS transitions finish
  await page.screenshot({ path: join(evidence, `a3-${name}.png`), timeout: 240_000 });
};
const activeText = page => page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 80) ?? '');
/** Wait (frames can be slow under software GL) until the focused element's text is `text`. */
const focusIs = (page, text) =>
  page
    .waitForFunction(t => document.activeElement?.textContent?.trim() === t, text, { timeout: 60_000 })
    .then(() => true);
const crumb = page => page.locator('.ac-crumbs [aria-current="page"]').innerText();

await check('city-arrival-skip-and-navigate', async () => {
  const { page, errors, close } = await open(`${base}/city`);
  await page.getByRole('button', { name: 'Skip intro' }).waitFor({ timeout: 60_000 });
  assert.match(await page.locator('.ac-arrival-title').innerText(), /Welcome to AgentCity/);
  await page.locator('.ac-veil[data-done="true"]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForTimeout(800);
  await shot(page, 'city-arrival');
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.locator('.ac-crumbs').waitFor({ timeout: 150_000 });
  assert.equal(await crumb(page), 'City');
  // View modes: Overview / Top / Orbit.
  for (const v of ['Top', 'Orbit', 'Overview']) {
    await page.getByRole('radio', { name: v }).check();
    assert.ok(await page.getByRole('radio', { name: v }).isChecked());
  }
  // Directory → building.
  await page.getByRole('button', { name: 'Show a list of buildings' }).click();
  await page.getByRole('heading', { name: 'Find a building' }).waitFor();
  await page.getByRole('button', { name: /^Audi Dealership/ }).click();
  await page.getByRole('heading', { name: 'Audi Dealership' }).waitFor();
  assert.ok(await focusIs(page, 'Audi Dealership'), 'focus moves to the panel heading');
  assert.match(await page.locator('.ac-panel').innerText(), /You can look around every floor/);
  assert.equal(await page.getByRole('button', { name: 'Enter building' }).count(), 0, 'public: nothing enterable');
  await shot(page, 'city-building-panel');
  // Floor → "Enter office" offers the demo.
  // Exploded floors: a switch in building mode.
  const explode = page.getByRole('switch', { name: 'Explode floors' });
  await explode.click();
  assert.equal(await explode.getAttribute('aria-checked'), 'true');
  await shot(page, 'city-building-exploded');
  // 3D floor labels beside the building: real buttons that open their floor.
  assert.ok((await page.locator('.ac-floor-tag').count()) >= 10, 'floor labels in 3D');
  await page
    .locator('.ac-panel')
    .getByRole('button', { name: /^Floor 12, Sales Dept\./ })
    .click();
  await page.getByRole('heading', { name: 'Sales Dept.' }).waitFor();
  assert.equal(await crumb(page), 'Floor 12');
  await page.getByRole('button', { name: 'Enter office' }).click();
  const cta = page.getByRole('link', { name: 'Request a demo' });
  assert.equal(await cta.getAttribute('href'), '/#get-demo');
  assert.match(await page.locator('.ac-panel').innerText(), /Ava/);
  await shot(page, 'city-floor-cta');
  // Agent selection in the cut-away: the panel shows the agent, the breadcrumb names them, Esc goes back.
  await page.locator('.ac-desk-tag', { hasText: 'Ava' }).click();
  await page.locator('.ac-agent[data-agent="audi/12/0"]').waitFor();
  assert.equal(await crumb(page), 'Ava');
  await shot(page, 'city-agent');
  await page.locator('[data-city-focus]').focus();
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.querySelector('.ac-crumbs [aria-current="page"]')?.textContent === 'Floor 12',
  );
  // Esc goes back one step at a time; closing the panel returns focus.
  await page.locator('[data-city-focus]').focus();
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'Audi Dealership' }).waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.ac-panel'));
  assert.equal(await crumb(page), 'City');
  assert.deepEqual(errors, []);
  await close();
});

await check('city-settings', async () => {
  const { page, errors, close } = await open(`${base}/city?tour=0`);
  await page.getByRole('button', { name: 'Skip intro' }).click({ timeout: 60_000 });
  await page.getByRole('button', { name: /View settings/ }).click();
  await page.getByRole('dialog', { name: 'View settings' }).waitFor();
  await page.getByLabel('Night').check();
  await page.getByLabel('Light rain').check();
  await page.getByLabel('Low').check();
  await page.getByLabel(/Reduce motion/).check();
  assert.ok(await page.getByLabel('Night').isChecked());
  assert.ok(await page.getByLabel('Low').isChecked());
  await shot(page, 'city-settings');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.match(await activeText(page), /^$/, 'focus back on the settings button (icon only)');
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
    'View settings: time of day, weather, quality, motion',
  );
  assert.deepEqual(errors, []);
  await close();
});

await check('city-keyboard-only', async () => {
  const { page, errors, close } = await open(`${base}/city`);
  await page.getByRole('button', { name: 'Skip intro' }).waitFor({ timeout: 60_000 });
  await page.keyboard.press('Space'); // any key skips the arrival
  await page.locator('.ac-crumbs').waitFor({ timeout: 150_000 });
  // Tab to the building list button and open it.
  for (
    let i = 0;
    i < 12 &&
    (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) !== 'Show a list of buildings';
    i++
  )
    await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Find a building' }).waitFor();
  assert.ok(await focusIs(page, 'Find a building'));
  for (let i = 0; i < 30 && !/^Rental Building 2/.test(await activeText(page)); i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Rental Building 2' }).waitFor();
  assert.ok(await focusIs(page, 'Rental Building 2'));
  for (let i = 0; i < 30 && !/^3Floor for Rent/.test(await activeText(page)); i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Floor for Rent' }).waitFor();
  assert.equal(await crumb(page), 'Floor 3');
  // Visible focus ring on the focused control.
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.equal(outline, 'solid');
  await shot(page, 'city-keyboard-focus');
  // Camera keys work from the scene region.
  await page.locator('[data-city-focus]').focus();
  for (const k of ['ArrowUp', '+', 'q', 'r']) await page.keyboard.press(k);
  await page.keyboard.press('h');
  await page.waitForFunction(() => !document.querySelector('.ac-panel'));
  assert.equal(await crumb(page), 'City');
  assert.deepEqual(errors, []);
  await close();
});

await check('city-mobile', async () => {
  const { page, errors, close } = await open(`${base}/city`, {
    viewport: { width: 390, height: 844 },
    context: { isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  });
  await page.getByRole('button', { name: 'Skip intro' }).tap({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Show a list of buildings' }).tap();
  await page.getByRole('button', { name: /^Fast Sales Training Center/ }).tap();
  await page.getByRole('heading', { name: 'Fast Sales Training Center' }).waitFor();
  const box = await page.locator('.ac-panel').boundingBox();
  assert.ok(box && box.y > 300 && Math.round(box.y + box.height) === 844 && box.width === 390, 'bottom sheet');
  for (const b of await page.locator('.ac-panel button').all()) {
    const r = await b.boundingBox();
    if (r) assert.ok(r.height >= 40, 'touch targets at least 40px tall');
  }
  await shot(page, 'city-mobile-building');
  await page
    .locator('.ac-panel')
    .getByRole('button', { name: /^Floor 12,/ })
    .tap();
  await page.getByRole('heading', { name: 'Admin / CEO / Accounting' }).waitFor();
  await page.getByRole('button', { name: 'Enter office' }).tap();
  await page.getByRole('link', { name: 'Request a demo' }).waitFor();
  await shot(page, 'city-mobile-floor');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.ok(!overflow, 'no horizontal scroll');
  assert.deepEqual(errors, []);
  await close();
});

await check('city-reduced-motion', async () => {
  const { page, errors, close } = await open(`${base}/city`, { reducedMotion: 'reduce' });
  // The arrival is a short fade instead of a flight: it ends by itself quickly.
  await page.locator('.ac-crumbs').waitFor({ timeout: 45_000 });
  await page.getByRole('button', { name: /View settings/ }).click();
  assert.ok(await page.getByLabel(/Reduce motion/).isChecked(), 'follows prefers-reduced-motion');
  assert.deepEqual(errors, []);
  await close();
});

await check('city-no-webgl', async () => {
  const { page, errors, close } = await open(`${base}/city`, { args: ['--disable-webgl', '--disable-3d-apis'] });
  await page.getByRole('heading', { name: 'Explore AgentCity', level: 1 }).waitFor();
  assert.equal(await page.locator('canvas').count(), 0);
  assert.match(await page.locator('.ac-map2d header').innerText(), /cannot show the 3D city/);
  await page.getByRole('button', { name: /^Maserati Dealership/ }).click();
  await page.getByRole('heading', { name: 'Maserati Dealership' }).waitFor();
  await page
    .locator('.ac-panel')
    .getByRole('button', { name: /^Floor 9,/ })
    .click();
  await page.getByRole('heading', { name: 'Social Media Dept.' }).waitFor();
  await page.getByRole('button', { name: 'Enter office' }).click();
  await page.getByRole('link', { name: 'Request a demo' }).waitFor();
  await shot(page, 'city-no-webgl');
  await page.getByRole('button', { name: /Back to the building/ }).click();
  await page.getByRole('button', { name: /Back to the city/ }).click();
  await page.getByRole('heading', { name: 'Find a building' }).waitFor();
  assert.deepEqual(errors, []);
  await close();
});

// ── 3D harness (stand-in buildings; A1's architecture is not on this branch) ──
const cam = page => page.evaluate(() => window.three.camera.position.toArray());
const mode = page => page.evaluate(() => window.cityStore.get().mode);
const waitMode = (page, kind, timeout = 120_000) =>
  page.waitForFunction(k => window.cityStore.get().mode.kind === k, kind, { timeout });
const settle = async (page, ms = 300_000) => {
  log('settle');
  // Wait for a frame (so a move just asked for has begun), then until no camera move is under way (the canvas
  // carries data-city-motion) and the camera has stopped for two readings in a row. SwiftShader frames are slow.
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  let prev = await cam(page);
  let still = 0;
  const t0 = Date.now();
  while (still < 2 && Date.now() - t0 < ms) {
    await page.waitForTimeout(2500);
    const now = await cam(page);
    const busy = await page.evaluate(() => [...document.querySelectorAll('canvas')].some(c => c.dataset.cityMotion));
    still = !busy && Math.hypot(now[0] - prev[0], now[1] - prev[1], now[2] - prev[2]) < 0.02 ? still + 1 : 0;
    prev = now;
  }
  return prev;
};
const insideAnyBuilding = page =>
  page.evaluate(() => {
    const p = window.three.camera.position;
    const m = window.cityStore.get().mode;
    return window.__layout.buildings.some(b => {
      const cut = (m.kind === 'floor' || m.kind === 'office') && m.building === b.key ? (m.level - 1) * 1.4 : null;
      const top = cut ?? b.floors.length * 1.4;
      return Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.z - b.z) < b.d / 2 && p.y < top;
    });
  });

await check('harness-explore-controls', async () => {
  const { page, errors, close } = await open(`${harness}?noarrival=1`);
  await page.waitForFunction(() => window.three, null, { timeout: 60_000 });
  const start = await settle(page);
  await shot(page, 'explore');
  await page.locator('[data-city-focus]').focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  const afterPan = await settle(page);
  assert.ok(afterPan[2] < start[2] - 1, 'arrow up moves forward');
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  const zoomed = await settle(page);
  const d = p => Math.hypot(...p);
  assert.ok(d(zoomed) < d(afterPan), 'plus zooms in');
  await page.keyboard.press('e');
  await settle(page);
  // Drag to rotate, wheel to zoom out.
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.move(900, 380, { steps: 6 });
  await page.mouse.up();
  await page.mouse.wheel(0, 600);
  const moved = await settle(page);
  assert.notDeepEqual(moved, zoomed);
  // Fly low into the city: the camera is pushed out of buildings and stays above the street.
  for (let i = 0; i < 25; i++) await page.keyboard.press('+');
  for (let i = 0; i < 12; i++) await page.keyboard.press('PageDown');
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowUp');
  await settle(page);
  assert.ok(!(await insideAnyBuilding(page)), 'never inside a building');
  assert.ok((await cam(page))[1] >= 1.2, 'above the street');
  await page.keyboard.press('h');
  const home = await settle(page);
  assert.ok(
    Math.abs(home[0] - start[0]) < 1 && Math.abs(home[2] - start[2]) < 1,
    `H returns to the overview (start ${start.map(v => v.toFixed(1))}, now ${home.map(v => v.toFixed(1))}, mode ${JSON.stringify(await mode(page))})`,
  );
  assert.deepEqual(errors, []);
  await close();
});

await check('harness-building-floor-office-desk', async () => {
  const { page, errors, close } = await open(`${harness}?noarrival=1&enter=rental-2&highlight=rental-2&demo=1`);
  await page.waitForFunction(() => window.three, null, { timeout: 60_000 });
  log('await settle(page);');
  await settle(page);
  // Click the building itself in 3D.
  const p = await page.evaluate(() => {
    const v = new window.three.camera.position.constructor(40, 14, 0).project(window.three.camera);
    return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight];
  });
  log('await page.mouse.click(p[0], p[1]);');
  await page.mouse.click(p[0], p[1]);
  await waitMode(page, 'building');
  assert.deepEqual(await mode(page), { kind: 'building', building: 'rental-2' });
  await settle(page);
  await shot(page, 'building');
  log("await page.getByRole('button', { name: 'Enter buil");
  await page.getByRole('button', { name: 'Enter building' }).click();
  await waitMode(page, 'floor');
  await settle(page);
  assert.ok(!(await insideAnyBuilding(page)));
  await shot(page, 'floor');
  log("await page.getByRole('button', { name: 'Enter offi");
  await page.getByRole('button', { name: 'Enter office' }).click();
  await waitMode(page, 'office');
  await settle(page);
  await shot(page, 'office');
  // Select a desk by clicking its name tag (a real button), then the whole office again.
  // In the office the name tags are the reference look's agent pills (R2); the cut-away keeps its desk tags.
  log("await page.locator('.ac-agent-pill', { hasText: 'Kai' })");
  await page.locator('.ac-agent-pill', { hasText: 'Kai' }).click();
  await page.waitForFunction(() => window.cityStore.get().mode.desk === 2);
  assert.equal(await page.evaluate(() => window.selected), 'a3', 'onSelectAgent got the agent id');
  await settle(page);
  assert.ok(!(await insideAnyBuilding(page)));
  await shot(page, 'desk');
  await page.locator('[data-city-focus]').focus();
  log("await page.keyboard.press('Escape');");
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.cityStore.get().mode.desk === null);
  await page.keyboard.press('Escape');
  await waitMode(page, 'floor');
  await page.keyboard.press('Escape');
  await waitMode(page, 'building');
  await page.keyboard.press('Escape');
  await waitMode(page, 'explore');
  assert.deepEqual(errors, []);
  await close();
});

await check('harness-arrival', async () => {
  const { page, errors, close } = await open(`${harness}?highlight=rental-2`);
  await page.waitForFunction(() => window.three, null, { timeout: 60_000 });
  await page.waitForFunction(() => window.three.camera.position.y > 40, null, { timeout: 120_000 });
  await shot(page, 'arrival');
  await waitMode(page, 'building', 300_000);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('agentcity:arrival-played')), '1');
  await page.reload();
  await page.waitForFunction(() => window.cityStore, null, { timeout: 60_000 });
  assert.equal((await mode(page)).kind, 'explore', 'plays once per session');
  assert.deepEqual(errors, []);
  await close();
});

await check('harness-demo-office-scene', async () => {
  const { page, errors, close } = await open(`${harness}?real=1`);
  await page.locator('.ac-agent-pill').first().waitFor({ timeout: 120_000 });
  assert.equal(await page.locator('.ac-agent-pill').count(), 8, 'the eight demo agents all have a desk');
  assert.equal(await page.getByTestId('office-desk-a3').count(), 1, 'desk test ids for the host');
  await page.getByTestId('office-desk-a3').click();
  await page.waitForFunction(() => window.selected === 'a3');
  await page.waitForTimeout(8000);
  await shot(page, 'demo-office-scene');
  assert.deepEqual(errors, []);
  await close();
});

console.log(`\n${results.join('\n')}`);
process.exitCode = results.some(r => r.startsWith('FAIL')) ? 1 : 0;
