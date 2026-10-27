// Captures the main screens of a running Sales City server into an evidence folder.
// Usage: node capture-screens.cjs <base-url> <enroll-query> <out-dir>
// Signs up a throwaway first owner through the one-time setup link of a FRESH, empty data directory.
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const [BASE, Q, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const b32 = s => { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.replace(/[\s=]/g, '').toUpperCase()) bits += a.indexOf(c).toString(2).padStart(5, '0'); return Buffer.from(bits.match(/.{8}/g).map(x => parseInt(x, 2))); };
const totp = sec => { const c = Math.floor(Date.now() / 30000); const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(c)); const h = crypto.createHmac('sha1', b32(sec)).update(buf).digest(); const o = h[19] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const shot = async (name, wait = 1500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('captured', name); };
  // The side panel re-renders with live data, so click through the DOM instead of waiting for it to settle.
  const act = async sel => { const ok = await page.evaluate(s => { const el = document.querySelector(s); if (el) el.click(); return !!el; }, sel); if (!ok) throw new Error('missing ' + sel); };
  await page.goto(BASE + '/'); await page.waitForSelector('#f-pass, #f-enroll, .auth'); await shot('01-sign-in', 800);
  await page.goto(BASE + '/' + Q); await page.waitForSelector('#f-enroll');
  await page.fill('input[name=name]', 'Baseline Owner'); await page.fill('input[name=username]', 'baseline');
  await page.fill('input[name=password]', 'Baseline-Pass-2026'); await page.fill('input[name=password2]', 'Baseline-Pass-2026');
  await page.click('#f-enroll button[type=submit]'); await page.waitForSelector('#f-confirm');
  await page.click('details.secret summary'); const secret = (await page.textContent('.secret code')).replace(/\s/g, '');
  await page.click('.otp input >> nth=0'); await page.keyboard.type(totp(secret));
  await page.waitForSelector('#saved'); await page.check('#saved'); await page.click('#go');
  await page.waitForSelector('.top', { timeout: 30000 });
  await shot('02-office-floor-L12', 3000);
  await act('[data-act="agent:fast-sales-L12-1:focus"]'); await shot('03-desk-max', 2500);
  await act('[data-act="mode:city"]'); await page.waitForTimeout(1000); await act('[data-act="cam:home"]'); await shot('04-city', 3000);
  await act('[data-act="tab:floors"]'); await shot('05-building-floors', 1200);
  await act('[data-act="mode:dashboard"]'); await shot('06-dashboard', 2000);
  await act('[data-act="overlay:crm"]'); await shot('07-crm', 1500);
  await act('[data-act^="lead:"]'); await shot('08-lead-drawer', 1500);
  await act('[data-act="lead:"]').catch(() => {}); await act('[data-act="overlay:"]').catch(() => {});
  await act('[data-act="mode:office"]').catch(() => {}); await page.waitForTimeout(800);
  await act('[data-act="tab:ok"]'); await shot('09-approvals', 1500);
  await act('[data-act="overlay:content"]'); await shot('10-content-wall', 1500);
  await act('[data-act="overlay:outbox"]'); await shot('11-outbox-reports', 1500);
  await act('[data-act="overlay:admin"]'); await shot('12-settings', 2000);
  await page.goto(BASE + '/proposal?lang=en', { waitUntil: 'networkidle' }); await shot('13-proposal-en', 2500);
  await page.goto(BASE + '/proposal?lang=es', { waitUntil: 'networkidle' }); await shot('14-proposal-es', 2500);
  const pulse = await page.evaluate(async () => (await fetch('/api/public/pulse')).text());
  fs.writeFileSync(`${OUT}/public-pulse.json`, pulse);
  fs.writeFileSync(`${OUT}/page-errors.json`, JSON.stringify(errors, null, 2));
  console.log('page errors:', errors.length);
  await browser.close();
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
