// M00 evidence: do names typed by people render as literal text? Run against a FRESH server data folder.
// Usage: node check-untrusted-names.cjs <base-url> <enroll-query> <screenshot-dir>
// Exit code 0 = safe (markup shown as text, nothing executed); 1 = unsafe rendering reproduced;
// 3 = inconclusive (the names could not be set up or the screens not reached).
const { chromium } = require('playwright');
const crypto = require('crypto');
const [BASE, Q, OUT] = process.argv.slice(2);
const b32 = s => { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.replace(/[\s=]/g, '').toUpperCase()) bits += a.indexOf(c).toString(2).padStart(5, '0'); return Buffer.from(bits.match(/.{8}/g).map(x => parseInt(x, 2))); };
const totp = sec => { const c = Math.floor(Date.now() / 30000); const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(c)); const h = crypto.createHmac('sha1', b32(sec)).update(buf).digest(); const o = h[19] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); };
// Harmless markers: if markup is parsed, an <img> with src "x" appears and its onerror sets a flag.
// Tabs, not spaces, because a rented floor's agents are named after the first space-separated word.
const RENTAL = '<img\tsrc=x\tonerror=window.__pwnedRental=1>Evil Corp';
// Person names are limited to 60 characters.
const PERSON = '<b id="pwn">B</b><img src=x onerror=__pwnedPerson=1>P';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(BASE + '/' + Q); await page.waitForSelector('#f-enroll');
  await page.fill('input[name=name]', 'Check Owner'); await page.fill('input[name=username]', 'checker');
  await page.fill('input[name=password]', 'Check-Pass-2026!'); await page.fill('input[name=password2]', 'Check-Pass-2026!');
  await page.click('#f-enroll button[type=submit]'); await page.waitForSelector('#f-confirm');
  await page.click('details.secret summary'); const secret = (await page.textContent('.secret code')).replace(/\s/g, '');
  await page.click('.otp input >> nth=0'); await page.keyboard.type(totp(secret));
  await page.waitForSelector('#saved'); await page.check('#saved'); await page.click('#go');
  await page.waitForSelector('.top', { timeout: 30000 });
  const call = (method, url, body) => page.evaluate(async ([m, u, b]) => (await fetch(u, { method: m, headers: { 'content-type': 'application/json', 'x-fs': '1' }, body: b ? JSON.stringify(b) : undefined })).status, [method, url, body]);
  const rent = await call('POST', '/api/action', { type: 'rent', buildingId: 'rental-1', level: 1, tenant: { name: RENTAL } });
  const person = await call('POST', '/api/admin/users', { username: 'markup', name: PERSON, role: 'staff' });
  console.log('rent', rent, 'add person', person);
  // Reload so the app renders the rented floor and the new person from server data.
  await page.reload(); await page.waitForSelector('.top', { timeout: 30000 });
  const act = sel => page.evaluate(s => { const el = document.querySelector(s); if (el) el.click(); return !!el; }, sel);
  // Building cards on the dashboard select a building; then its floor list has a button per floor.
  await act('[data-act="mode:dashboard"]'); await page.waitForTimeout(1200);
  await act('[data-act="building:rental-1"]'); await page.waitForTimeout(1200);
  await act('[data-act="tab:floors"]'); await page.waitForTimeout(500);
  const entered = await act('[data-act="floor:rental-1:1"]');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/rented-floor-desk-labels.png` });
  await act('[data-act="overlay:admin"]'); await page.waitForTimeout(1500);
  await page.evaluate(() => [...document.querySelectorAll('h4')].find(h => h.textContent.trim() === 'People')?.scrollIntoView());
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/settings-people.png` });
  const r = await page.evaluate(() => ({
    pwnedRental: window.__pwnedRental === 1, pwnedPerson: window.__pwnedPerson === 1,
    injectedImg: document.querySelectorAll('img[src="x"]').length, injectedBold: !!document.getElementById('pwn'),
    deskLabels: [...document.querySelectorAll('.agent-tag b')].map(b => b.textContent).filter(t => t.includes('img')),
    personText: document.body.innerText.includes('<b id="pwn">B</b>'),
  }));
  console.log(JSON.stringify({ enteredRentedFloor: entered, ...r }, null, 2));
  const unsafe = r.pwnedRental || r.pwnedPerson || r.injectedImg > 0 || r.injectedBold;
  const reached = rent === 200 && person === 200 && entered;
  const safe = !unsafe && reached && r.deskLabels.length > 0 && r.personText;
  console.log(unsafe ? 'RESULT: UNSAFE - markup in names was parsed and/or executed'
    : safe ? 'RESULT: SAFE - names rendered as literal text, nothing executed'
      : 'RESULT: INCONCLUSIVE - setup or navigation did not complete; nothing was proven');
  await browser.close();
  process.exit(unsafe ? 1 : safe ? 0 : 3);
})().catch(e => { console.error('ERROR', e.message); process.exit(3); });
