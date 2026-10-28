// Tests of the lite backend's rules against the in-memory store: the funnel, abuse limits, expiry and isolation.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../lib/lite/config.ts';
import { LiteError } from '../lib/lite/errors.ts';
import type { Mailer } from '../lib/lite/mailer.ts';
import { createService } from '../lib/lite/service.ts';
import { createMemoryStore } from '../lib/lite/store-memory.ts';
import { createMysqlStore } from '../lib/lite/store-mysql.ts';
import mysql from 'mysql2/promise';
import type { Store } from '../lib/lite/store.ts';

const ENV = {
  NODE_ENV: 'test',
  LITE_SECRET: 'x'.repeat(32),
  PUBLIC_ORIGIN: 'https://demo.example',
  DEMO_FORM_MIN_SECONDS: '3',
};

// Set LITE_TEST_MYSQL_URL to run every test below against a real MySQL/MariaDB instead of the in-memory store.
const MYSQL_URL = process.env.LITE_TEST_MYSQL_URL;

async function freshStore(): Promise<Store> {
  if (!MYSQL_URL) return createMemoryStore();
  const store = createMysqlStore(MYSQL_URL);
  await store.migrate();
  const c = await mysql.createConnection(MYSQL_URL);
  for (const t of ['lite_lead', 'lite_request', 'lite_link', 'lite_workspace', 'lite_rate'])
    await c.query(`TRUNCATE TABLE ${t}`);
  await c.end();
  return store;
}

async function setup(env: Record<string, string> = {}) {
  const clock = { t: Date.parse('2026-10-28T10:00:00Z') };
  const sent: { email: string; link: string }[] = [];
  const mailer: Mailer = {
    name: 'test',
    async sendVerification(to, link) {
      sent.push({ email: to.email, link });
    },
  };
  const store = await freshStore();
  const logs: string[] = [];
  const service = createService({
    store,
    mailer,
    config: loadConfig({ ...ENV, ...env } as NodeJS.ProcessEnv),
    now: () => clock.t,
    log: l => logs.push(l),
  });
  return { clock, sent, service, store, logs };
}

type Ctx = Awaited<ReturnType<typeof setup>>;
const tokenOf = (link: string) => new URL(link).searchParams.get('t');

async function body(ctx: Ctx, over: Record<string, unknown> = {}) {
  const { token } = await ctx.service.formToken('1.1.1.1');
  ctx.clock.t += 5000; // past the minimum form age
  return {
    fullName: 'Ada Lovelace',
    email: 'ada@acme.test',
    company: 'Acme Ltd',
    marketingConsent: false,
    formToken: token,
    ...over,
  };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof LiteError) return e.code;
    throw e;
  }
  return 'none';
}

test('full journey: submit, status, verify, me, office, expiry', async () => {
  const ctx = await setup();
  const { requestId, status } = await ctx.service.submit(await body(ctx), '1.1.1.1');
  assert.equal(status, 'verification-sent');
  await ctx.service.whenIdle();
  assert.equal(ctx.sent.length, 1);
  assert.match(ctx.sent[0]!.link, /^https:\/\/demo\.example\/api\/lite\/demo\/verify\?t=/);
  assert.deepEqual(await ctx.service.status(requestId, '1.1.1.1'), { status: 'verification-sent' });

  const outcome = await ctx.service.verify(tokenOf(ctx.sent[0]!.link), '1.1.1.1');
  assert.ok(outcome);
  assert.deepEqual(await ctx.service.status(requestId, '1.1.1.1'), { status: 'ready' });
  const me = await ctx.service.me(outcome.cookie);
  assert.equal(me.firstName, 'Ada');
  assert.equal(me.company, 'Acme Ltd');
  assert.match(me.building.key, /^rental-[123]$/);
  assert.equal(me.office.level, 1);
  const office = await ctx.service.office(outcome.cookie);
  assert.equal(office.simulated, true);
  assert.equal(office.agents.length, 8);
  assert.ok(office.agents.every(a => a.simulated === true && ['working', 'idle', 'needs-you'].includes(a.status)));
  assert.deepEqual(await ctx.service.office(outcome.cookie), office);

  ctx.clock.t += 8 * 86_400_000;
  assert.equal(await code(ctx.service.me(outcome.cookie)), 'gone');
});

test('the link works once, and an unknown or garbled token goes nowhere', async () => {
  const ctx = await setup();
  await ctx.service.submit(await body(ctx), '1.1.1.1');
  await ctx.service.whenIdle();
  const t = tokenOf(ctx.sent[0]!.link);
  assert.ok(await ctx.service.verify(t, '1.1.1.1'));
  assert.equal(await ctx.service.verify(t, '1.1.1.1'), null);
  assert.equal(await ctx.service.verify('nope', '1.1.1.1'), null);
  assert.equal(await ctx.service.verify(null, '1.1.1.1'), null);
});

test('the link expires after 24 hours', async () => {
  const ctx = await setup();
  await ctx.service.submit(await body(ctx), '1.1.1.1');
  await ctx.service.whenIdle();
  ctx.clock.t += 24 * 3600_000 + 1000;
  assert.equal(await ctx.service.verify(tokenOf(ctx.sent[0]!.link), '1.1.1.1'), null);
});

test('a second submission sends a new link and voids the first', async () => {
  const ctx = await setup();
  await ctx.service.submit(await body(ctx), '1.1.1.1');
  await ctx.service.submit(await body(ctx), '1.1.1.1');
  await ctx.service.whenIdle();
  assert.equal(ctx.sent.length, 2);
  assert.equal(await ctx.service.verify(tokenOf(ctx.sent[0]!.link), '1.1.1.1'), null);
  assert.ok(await ctx.service.verify(tokenOf(ctx.sent[1]!.link), '1.1.1.1'));
});

test('a verified address gets the same answer but no email, and details are not overwritten', async () => {
  const ctx = await setup();
  await ctx.service.submit(await body(ctx), '1.1.1.1');
  await ctx.service.whenIdle();
  const first = await ctx.service.verify(tokenOf(ctx.sent[0]!.link), '1.1.1.1');
  const again = await ctx.service.submit(await body(ctx, { fullName: 'Mallory X', company: 'Evil' }), '1.1.1.1');
  await ctx.service.whenIdle();
  assert.equal(again.status, 'verification-sent');
  assert.equal(ctx.sent.length, 1);
  assert.deepEqual(await ctx.service.status(again.requestId, '1.1.1.1'), { status: 'verification-sent' });
  assert.equal((await ctx.service.me(first!.cookie)).company, 'Acme Ltd');
});

test('replaying the same form submission returns the first request and sends nothing more', async () => {
  const ctx = await setup();
  const b = await body(ctx);
  const a = await ctx.service.submit(b, '1.1.1.1');
  const c = await ctx.service.submit(b, '1.1.1.1');
  await ctx.service.whenIdle();
  assert.equal(a.requestId, c.requestId);
  assert.equal(ctx.sent.length, 1);
});

test('validation: required fields, email, phone, website, consent choice', async () => {
  const ctx = await setup();
  const e = await ctx.service
    .submit(
      await body(ctx, {
        fullName: '',
        email: 'nope',
        company: '',
        phone: 'abc',
        website: 'x',
        marketingConsent: undefined,
      }),
      '1.1.1.1',
    )
    .catch(x => x);
  assert.equal(e.code, 'validation_failed');
  assert.deepEqual(Object.keys(e.details.fields).sort(), [
    'company',
    'email',
    'fullName',
    'marketingConsent',
    'phone',
    'website',
  ]);
  assert.equal(JSON.stringify(e).includes('nope'), false);
});

test('honeypot, missing token, forged token, too-fast and stale tokens are refused as bad_request', async () => {
  const ctx = await setup();
  assert.equal(await code(ctx.service.submit(await body(ctx, { website2: 'http://spam' }), '1.1.1.1')), 'bad_request');
  assert.equal(await code(ctx.service.submit(await body(ctx, { formToken: 'v1.a.b.c' }), '1.1.1.1')), 'bad_request');
  const { token } = await ctx.service.formToken('1.1.1.1');
  const b = { fullName: 'A B', email: 'a@b.test', company: 'C', marketingConsent: true, formToken: token };
  assert.equal(await code(ctx.service.submit(b, '1.1.1.1')), 'bad_request'); // instantly
  ctx.clock.t += 3 * 3600_000;
  assert.equal(await code(ctx.service.submit(b, '1.1.1.1')), 'bad_request'); // stale
  assert.equal(ctx.sent.length, 0);
});

test('rate limits: per IP in ten minutes, and per email in an hour', async () => {
  const ctx = await setup();
  for (let i = 0; i < 5; i++) await ctx.service.submit(await body(ctx, { email: `p${i}@x.test` }), '9.9.9.9');
  assert.equal(await code(ctx.service.submit(await body(ctx, { email: 'p9@x.test' }), '9.9.9.9')), 'rate_limited');
  await ctx.service.submit(await body(ctx, { email: 'p9@x.test' }), '8.8.8.8'); // another address is fine
  for (let i = 0; i < 3; i++) await ctx.service.submit(await body(ctx, { email: 'same@x.test' }), `7.7.7.${i}`);
  assert.equal(await code(ctx.service.submit(await body(ctx, { email: 'same@x.test' }), '7.7.7.9')), 'rate_limited');
  ctx.clock.t += 3601_000;
  await ctx.service.submit(await body(ctx, { email: 'same@x.test' }), '7.7.7.9'); // the hour passed
});

test('public endpoints are limited per IP per minute', async () => {
  const ctx = await setup();
  for (let i = 0; i < 60; i++) await ctx.service.formToken('5.5.5.5');
  assert.equal(await code(ctx.service.formToken('5.5.5.5')), 'rate_limited');
});

test('without a mailer or secret the demo is unavailable', async () => {
  const ctx = await setup();
  const noMail = createService({ store: ctx.store, mailer: null, config: loadConfig(ENV as NodeJS.ProcessEnv) });
  assert.equal(await code(noMail.submit({}, '1.1.1.1')), 'demo_unavailable');
  const prod = loadConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
  assert.equal(prod.secret, null);
  const noSecret = createService({ store: ctx.store, mailer: null, config: prod });
  assert.equal(await code(noSecret.formToken('1.1.1.1')), 'demo_unavailable');
});

test('a tampered or foreign cookie is rejected, and each cookie only opens its own office', async () => {
  const ctx = await setup();
  const ids: string[] = [];
  const cookies: string[] = [];
  for (const email of ['one@x.test', 'two@x.test']) {
    await ctx.service.submit(await body(ctx, { email, company: email }), '1.1.1.1');
    await ctx.service.whenIdle();
    const o = await ctx.service.verify(tokenOf(ctx.sent.at(-1)!.link), '1.1.1.1');
    cookies.push(o!.cookie);
    ids.push((await ctx.service.me(o!.cookie)).company);
  }
  assert.deepEqual(ids, ['one@x.test', 'two@x.test']);
  const a = await ctx.service.office(cookies[0]!);
  const b = await ctx.service.office(cookies[1]!);
  assert.notDeepEqual(
    a.agents.map(x => x.id),
    b.agents.map(x => x.id),
  );
  const parts = cookies[0]!.split('.');
  parts[1] = cookies[1]!.split('.')[1]!; // swap in another lead id, keep the signature
  assert.equal(await code(ctx.service.me(parts.join('.'))), 'unauthorized');
  assert.equal(await code(ctx.service.me(undefined)), 'unauthorized');
  assert.equal(await code(ctx.service.me('garbage')), 'unauthorized');
});

test('expiry: past the demo lifetime reads answer 410, status says expired, a returning visitor gets a fresh demo', async () => {
  const ctx = await setup({ DEMO_TTL_DAYS: '1' });
  const { requestId } = await ctx.service.submit(await body(ctx), '1.1.1.1');
  await ctx.service.whenIdle();
  const o = (await ctx.service.verify(tokenOf(ctx.sent[0]!.link), '1.1.1.1'))!;
  ctx.clock.t += 86_400_000 + 10_000;
  assert.equal(await code(ctx.service.me(o.cookie)), 'gone');
  assert.deepEqual(await ctx.service.status(requestId, '1.1.1.1'), { status: 'expired' });
  const cleaned = await ctx.service.adminExpire();
  assert.equal(cleaned.expired, 1);
  await ctx.service.submit(await body(ctx, { company: 'Acme Two' }), '1.1.1.1');
  await ctx.service.whenIdle();
  assert.equal(ctx.sent.length, 2);
  assert.equal(await code(ctx.service.me(o.cookie)), 'unauthorized'); // the old cookie is for an older demo
  const o2 = (await ctx.service.verify(tokenOf(ctx.sent[1]!.link), '1.1.1.1'))!;
  assert.equal((await ctx.service.me(o2.cookie)).company, 'Acme Two');
});

test('a demo ended by the store while the cookie is still valid answers 410', async () => {
  const ctx = await setup();
  await ctx.service.submit(await body(ctx), '1.1.1.1');
  await ctx.service.whenIdle();
  const o = (await ctx.service.verify(tokenOf(ctx.sent[0]!.link), '1.1.1.1'))!;
  const lead = (await ctx.store.findLeadByEmail('ada@acme.test'))!;
  await ctx.store.expireLead(lead.id);
  assert.equal(await code(ctx.service.me(o.cookie)), 'gone');
  assert.equal(await code(ctx.service.office(o.cookie)), 'gone');
});

test('admin leads: email masked unless full, paged, consent stored with version and time', async () => {
  const ctx = await setup();
  await ctx.service.submit(await body(ctx, { marketingConsent: true, phone: '+1 555 0100' }), '1.1.1.1');
  const masked = await ctx.service.adminLeads(1, 50, false);
  assert.equal(masked.total, 1);
  assert.equal(masked.leads[0]!.email, 'a***@acme.test');
  assert.equal(masked.leads[0]!.phone, '*********00');
  const full = await ctx.service.adminLeads(1, 50, true);
  assert.equal(full.leads[0]!.email, 'ada@acme.test');
  assert.equal(full.leads[0]!.marketingConsent, true);
  assert.equal(full.leads[0]!.consentNoticeVersion, '2026-10-x01');
  assert.ok(full.leads[0]!.consentRecordedAt);
  assert.equal((await ctx.service.adminLeads(2, 50, true)).leads.length, 0);
});

test('logs never contain email addresses or names', async () => {
  const ctx = await setup();
  await ctx.service.submit(await body(ctx), '1.1.1.1');
  await ctx.service.whenIdle();
  await ctx.service.verify(tokenOf(ctx.sent[0]!.link), '1.1.1.1');
  const all = ctx.logs.join('\n');
  assert.ok(all.length > 0);
  assert.equal(/ada|lovelace|acme|@/i.test(all), false);
});

test('sign-in: a verified visitor gets a fresh link into the same demo; unknown addresses get the same answer and no mail', async () => {
  const ctx = await setup();
  await ctx.service.submit(await body(ctx), '1.1.1.1');
  await ctx.service.whenIdle();
  const first = await ctx.service.verify(tokenOf(ctx.sent[0]!.link), '1.1.1.1');
  assert.ok(first);
  const before = await ctx.service.me(first.cookie);

  const ask = async (email: string) => {
    const { token } = await ctx.service.formToken('2.2.2.2');
    ctx.clock.t += 5000;
    return ctx.service.signIn({ email, formToken: token }, '2.2.2.2');
  };
  assert.deepEqual(await ask('ada@acme.test'), { status: 'sent' });
  assert.deepEqual(await ask('nobody@acme.test'), { status: 'sent' });
  await ctx.service.whenIdle();
  assert.equal(ctx.sent.length, 2, 'one verification and one sign-in; nothing for the unknown address');
  assert.equal(ctx.sent[1]!.email, 'ada@acme.test');

  const again = await ctx.service.verify(tokenOf(ctx.sent[1]!.link), '1.1.1.1');
  assert.ok(again);
  assert.deepEqual(await ctx.service.me(again.cookie), before, 'the same demo, not a new one');
  assert.equal(await ctx.service.verify(tokenOf(ctx.sent[1]!.link), '1.1.1.1'), null, 'single use');
});

test('sign-in sends nothing to an address whose demo has expired, and refuses bad input', async () => {
  const ctx = await setup();
  await ctx.service.submit(await body(ctx), '1.1.1.1');
  await ctx.service.whenIdle();
  await ctx.service.verify(tokenOf(ctx.sent[0]!.link), '1.1.1.1');
  ctx.clock.t += 8 * 86_400_000;
  const { token } = await ctx.service.formToken('3.3.3.3');
  ctx.clock.t += 5000;
  assert.deepEqual(await ctx.service.signIn({ email: 'ada@acme.test', formToken: token }, '3.3.3.3'), {
    status: 'sent',
  });
  await ctx.service.whenIdle();
  assert.equal(ctx.sent.length, 1);
  assert.equal(
    await code(ctx.service.signIn({ email: 'not-an-email', formToken: token }, '3.3.3.3')),
    'validation_failed',
  );
  assert.equal(await code(ctx.service.signIn({ email: 'a@b.test', formToken: 'bad' }, '3.3.3.3')), 'bad_request');
});

test('status says so when the email provider refused the confirmation link', async () => {
  const ctx = await setup();
  const failing: Mailer = {
    name: 'failing',
    async sendVerification() {
      const err = new Error('rejected');
      err.name = 'ResendHttp422';
      throw err;
    },
  };
  const service = createService({
    store: ctx.store,
    mailer: failing,
    config: loadConfig(ENV as NodeJS.ProcessEnv),
    now: () => ctx.clock.t,
    log: l => ctx.logs.push(l),
  });
  const { token } = await service.formToken('1.1.1.1');
  ctx.clock.t += 5000;
  const { requestId } = await service.submit(
    { fullName: 'Ada Lovelace', email: 'ada@acme.test', company: 'Acme', marketingConsent: false, formToken: token },
    '1.1.1.1',
  );
  await service.whenIdle();
  assert.deepEqual(await service.status(requestId, '1.1.1.1'), { status: 'verification-sent', delivery: 'failed' });
  assert.ok(ctx.logs.some(l => l.includes('verify link not sent (ResendHttp422)')));
  assert.ok(!ctx.logs.some(l => l.includes('ada@acme.test')), 'no address in the logs');
});

test('funnel traffic sweeps expired demos by itself, at most once an hour', async () => {
  const ctx = await setup();
  await ctx.service.submit(await body(ctx), '1.1.1.1');
  await ctx.service.whenIdle();
  await ctx.service.verify(tokenOf(ctx.sent[0]!.link), '1.1.1.1');
  const sweeps = () => ctx.logs.filter(l => l.includes('lite: expired')).length;
  const before = sweeps(); // the first form token of the journey already swept once
  ctx.clock.t += 8 * 86_400_000; // the demo is over
  await ctx.service.formToken('9.9.9.9');
  await ctx.service.whenIdle();
  assert.equal(sweeps(), before + 1, 'swept once more');
  const lead = (await ctx.service.adminLeads(1, 10, true)).leads[0]!;
  assert.equal(lead.status, 'expired');
  await ctx.service.formToken('9.9.9.9');
  await ctx.service.whenIdle();
  assert.equal(sweeps(), before + 1, 'not again within the hour');
});
