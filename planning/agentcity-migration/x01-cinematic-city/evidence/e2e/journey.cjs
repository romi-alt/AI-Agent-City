// Real end-to-end demo journey against the local stack (web :3000, API :4000, Keycloak, Mailpit).
const { chromium } = require('playwright');
const OUT = process.env.OUT ?? '/home/user/sales-city/planning/agentcity-migration/x01-cinematic-city/evidence/e2e';
const MAILPIT = 'http://127.0.0.1:58025';
const WEB = 'http://localhost:3000';
const email = `e2e-${Date.now()}@example.test`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function mails() {
  const q = encodeURIComponent(`to:"${email}"`);
  const r = await (await fetch(`${MAILPIT}/api/v1/search?query=${q}&limit=50`)).json();
  return r.messages ?? [];
}
async function waitMail(n, timeout = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const m = await mails();
    if (m.length >= n) {
      const newest = m.sort((a, b) => new Date(b.Created) - new Date(a.Created))[0];
      return (await fetch(`${MAILPIT}/api/v1/message/${newest.ID}`)).json();
    }
    await sleep(2000);
  }
  throw new Error(`no mail #${n} for ${email}`);
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  let page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror ${page.url()}: ${e}`));
  page.on('console', m => m.type() === 'error' && errors.push(`console ${page.url()}: ${m.text()}`));
  const shot = async (name, opts = {}) => {
    await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 240000, ...opts });
    log('shot', name, page.url());
  };
  try {
    log('email', email);
    await page.goto(`${WEB}/?utm_source=e2e&utm_campaign=x01`, { waitUntil: 'load' });
    await sleep(3000);
    await shot('01-landing-fold');
    await page.getByRole('link', { name: 'Get My Free Demo Office' }).first().click();
    await sleep(1500);
    await page.getByTestId('demo-fullName').fill('Ada Lovelace');
    await page.getByTestId('demo-email').fill(email);
    await page.getByTestId('demo-company').fill('Analytical Homes');
    await page.getByTestId('demo-industry').selectOption('real-estate');
    await sleep(4000); // the form refuses submissions faster than DEMO_FORM_MIN_SECONDS
    await page.getByTestId('demo-request-form').evaluate(el => el.scrollIntoView({ block: 'center' }));
    await shot('02-form-filled');
    await page.getByTestId('demo-submit').click();
    await page.waitForURL(/\/demo\/check-email/, { timeout: 30000 });
    await sleep(1500);
    await shot('03-check-email');

    const verifyMail = await waitMail(1);
    log('mail 1 subject:', verifyMail.Subject);
    const link = (verifyMail.HTML.match(/href="([^"]*action-token[^"]*)"/) ?? verifyMail.Text.match(/(http\S*action-token\S*)/))?.[1]?.replace(/&amp;/g, '&');
    if (!link) throw new Error('no verify link in mail');
    await page.goto(link, { waitUntil: 'load' });
    log('after verify link', page.url());
    // Keycloak keeps one deliberate click before the email check runs (so link scanners cannot confirm an address).
    // After it, the AgentCity theme continues to /demo/verified by itself: no "Back to Application" click.
    const proceed = page.locator('#ac-proceed, a:has-text("proceed")');
    if (await proceed.count()) {
      await shot('04a-keycloak-confirm-email');
      await Promise.all([page.waitForURL(/localhost:3000\/demo\/verified/, { timeout: 30000 }), proceed.first().click()]);
    }
    await page.waitForURL(/\/demo\/verified|#username|login-actions|openid-connect/, { timeout: 30000 });
    log('verified step', page.url());
    if (page.url().includes('/demo/verified')) await shot('04-verified');

    // Sign-in starts by itself on /demo/verified; Keycloak asks for the address (prefilled by login_hint), then a code.
    await page.waitForSelector('#username, #kc-email-code-form', { timeout: 60000 });
    if (await page.$('#username')) {
      const v = await page.inputValue('#username');
      log('username prefilled:', v === email);
      if (!v) await page.fill('#username', email);
      await shot('05-keycloak-email');
      await Promise.all([page.waitForEvent('load'), page.click('#kc-login')]);
    }
    await page.waitForSelector('#kc-email-code-form', { timeout: 60000 });
    await shot('06-keycloak-code');
    const codeMail = await waitMail(2);
    const code = /\b(\d{6})\b/.exec(codeMail.Text)?.[1];
    if (!code) throw new Error('no code in mail 2');
    for (const [name, m] of [['04m-mail-verify', verifyMail], ['06m-mail-code', codeMail]]) {
      const mp = await ctx.newPage();
      await mp.setViewportSize({ width: 720, height: 900 });
      await mp.goto(`${MAILPIT}/view/${m.ID}.html`, { waitUntil: 'load' });
      await mp.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
      log('mail', name, m.Subject);
      await mp.close();
    }
    await page.fill('#code', code);
    await Promise.all([page.waitForEvent('load'), page.click('#kc-login')]);
    await page.waitForURL(/localhost:3000\/demo\/welcome/, { timeout: 60000 });
    await page.getByTestId('welcome-title').waitFor({ timeout: 60000 });
    await sleep(1500);
    log('welcome title:', await page.getByTestId('welcome-title').innerText());
    await shot('07-welcome');

    await page.getByTestId('welcome-start-tour').click();
    await page.waitForURL(/\/office/, { timeout: 30000 });
    await page.getByTestId('office').waitFor({ timeout: 60000 });
    await sleep(3000);
    await shot('08-office-tour');
    log('tour step:', await page.getByTestId('tour').getAttribute('data-step').catch(() => 'none'));
    await page.getByTestId('tour-skip').click().catch(() => {});
    await page.goto(`${WEB}/office?scene=3d`, { waitUntil: 'load' });
    await page.getByTestId('office').waitFor({ timeout: 60000 });
    await sleep(45000);
    await shot('09-office-3d');

    await page.goto(`${WEB}/city?building=rental-2`, { waitUntil: 'load' });
    await sleep(60000);
    await shot('10-city');

    // Software GL (SwiftShader) renders the city at about 1 fps here, which can starve this tab's navigation; the
    // phone checks run in a fresh tab of the same signed-in browser.
    const city = page;
    page = await ctx.newPage();
    await city.close();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB}/demo/welcome`, { waitUntil: 'load' });
    await page.getByTestId('welcome-title').waitFor({ timeout: 60000 });
    await sleep(1500);
    await shot('11-mobile-welcome', { fullPage: true });
    await page.goto(`${WEB}/`, { waitUntil: 'load' });
    await sleep(3000);
    await shot('12-mobile-landing');
  } catch (e) {
    log('FAILED:', e.message);
    await shot('zz-failure').catch(() => {});
    process.exitCode = 1;
  } finally {
    console.log('ERRORS:', JSON.stringify(errors.slice(0, 15), null, 1));
    console.log('EMAIL:', email);
    await b.close();
  }
})();
