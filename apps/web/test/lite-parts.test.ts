// Unit tests for the small parts of the lite backend: form tokens, session cookies, validation, mailer, office, schema.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadConfig } from '../lib/lite/config.ts';
import { checkFormToken, issueFormToken } from '../lib/lite/form-token.ts';
import {
  createConsoleMailer,
  createResendMailer,
  mailerFromEnv,
  VERIFICATION_SUBJECT,
  verificationHtml,
} from '../lib/lite/mailer.ts';
import { buildOffice } from '../lib/lite/office.ts';
import { SCHEMA_SQL } from '../lib/lite/schema.ts';
import { readSession, signSession } from '../lib/lite/session.ts';
import { parseAttribution, parseDemoRequest, ValidationError } from '../lib/lite/validate.ts';

const key = Buffer.alloc(32, 7);

test('form tokens: ok inside the window, too-fast, expired, forged', () => {
  const t = issueFormToken(key, 1_000_000);
  assert.equal(checkFormToken(key, t, 3, 7200, 1_000_000 + 1000), 'too-fast');
  assert.equal(checkFormToken(key, t, 3, 7200, 1_000_000 + 5000), 'ok');
  assert.equal(checkFormToken(key, t, 3, 7200, 1_000_000 + 7201_000), 'expired');
  assert.equal(checkFormToken(Buffer.alloc(32, 8), t, 3, 7200, 1_000_000 + 5000), 'invalid');
  assert.equal(checkFormToken(key, t.slice(0, -2) + 'xx', 3, 7200, 1_000_000 + 5000), 'invalid');
});

test('session cookie round trip and tampering', () => {
  const c = signSession(key, { leadId: 'abc', generation: 2, expiresAt: 5000 });
  assert.deepEqual(readSession(key, c), { leadId: 'abc', generation: 2, expiresAt: 5000 });
  assert.equal(readSession(key, c.replace('abc', 'abd')), null);
  assert.equal(readSession(Buffer.alloc(32, 1), c), null);
});

test('validation trims, lowercases the email and drops empty optional fields', () => {
  const v = parseDemoRequest({
    fullName: ' Ada ',
    email: ' ADA@Acme.test ',
    company: 'C',
    industry: ' ',
    marketingConsent: false,
    formToken: 't',
  });
  assert.equal(v.email, 'ada@acme.test');
  assert.equal(v.fullName, 'Ada');
  assert.equal(v.industry, undefined);
  assert.throws(() => parseDemoRequest(null), ValidationError);
});

test('attribution keeps utm values and the referrer host only', () => {
  assert.deepEqual(parseAttribution({ utmSource: 'x', referrer: 'https://news.example/path?q=1' }), {
    utmSource: 'x',
    referrerHost: 'news.example',
  });
  assert.deepEqual(parseAttribution({ referrerHost: 'Blog.Example' }), { referrerHost: 'blog.example' });
  assert.deepEqual(parseAttribution('x'), {});
});

test('the Resend mailer posts the documented message and never leaks the body in errors', async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const ok = createResendMailer('key', 'AutoSalesCity <hi@x.test>', (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch);
  await ok.sendVerification({ email: 'a@b.test', firstName: 'A<b>' }, 'https://x.test/api/lite/demo/verify?t=abc');
  const sent = JSON.parse(String(seen!.init.body));
  assert.equal(seen!.url, 'https://api.resend.com/emails');
  assert.equal(sent.subject, VERIFICATION_SUBJECT);
  assert.deepEqual(sent.to, ['a@b.test']);
  assert.match(sent.text, /simulated demo/);
  assert.match(sent.text, /verify\?t=abc/);
  assert.equal(sent.html.includes('A<b>'), false);
  const bad = createResendMailer(
    'key',
    'f',
    (async () => new Response('secret detail a@b.test', { status: 422 })) as unknown as typeof fetch,
  );
  const err = await bad.sendVerification({ email: 'a@b.test', firstName: 'A' }, 'l').catch(e => e);
  assert.equal(err.name, 'ResendHttp422');
  assert.equal(err.message.includes('a@b.test'), false);
  assert.match(verificationHtml('A', 'https://x.test/?a=1&b=2'), /a=1&amp;b=2/);
});

test('console mailer prints the link; it only exists outside production', () => {
  const lines: string[] = [];
  void createConsoleMailer(l => lines.push(l)).sendVerification({ email: 'a@b.test', firstName: 'A' }, 'LINK');
  assert.deepEqual(lines, ['[lite-mailer] verification link: LINK']);
  assert.equal(
    mailerFromEnv({ NODE_ENV: 'production', LITE_MAILER: 'console', LITE_STORE: 'memory' } as NodeJS.ProcessEnv),
    null,
  );
  assert.equal(
    mailerFromEnv({ NODE_ENV: 'development', LITE_MAILER: 'console' } as NodeJS.ProcessEnv)?.name,
    'console',
  );
  assert.equal(
    mailerFromEnv({ NODE_ENV: 'production', RESEND_API_KEY: 'k', MAIL_FROM: 'f' } as NodeJS.ProcessEnv)?.name,
    'resend',
  );
});

test('the simulated office is deterministic per lead, different between leads, and flagged simulated', () => {
  const now = new Date('2026-10-28T10:00:00Z');
  const a = buildOffice('lead-a', 'Acme', now);
  assert.deepEqual(buildOffice('lead-a', 'Acme', now), a);
  assert.notDeepEqual(
    buildOffice('lead-b', 'Acme', now).agents.map(x => x.status + x.lastUpdated),
    a.agents.map(x => x.status + x.lastUpdated),
  );
  assert.equal(a.tasks.length, 24);
  assert.ok(a.tasks.every(t => t.simulated === true));
  assert.ok(a.daySummary.simulated && a.simulated);
});

test('config: production without LITE_SECRET has no secret; a short one is ignored', () => {
  assert.equal(loadConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv).secret, null);
  assert.equal(loadConfig({ NODE_ENV: 'production', LITE_SECRET: 'short' } as NodeJS.ProcessEnv).secret, null);
  assert.ok(loadConfig({ NODE_ENV: 'production', LITE_SECRET: 'x'.repeat(20) } as NodeJS.ProcessEnv).secret);
  assert.equal(loadConfig({ NODE_ENV: 'test', DEMO_TTL_DAYS: '3' } as NodeJS.ProcessEnv).demoTtlDays, 3);
  assert.equal(loadConfig({ NODE_ENV: 'test', DEMO_TTL_DAYS: '999' } as NodeJS.ProcessEnv).demoTtlDays, 7);
});

test('schema.sql is the same text as the migration the runner executes', () => {
  const file = readFileSync(new URL('../lib/lite/schema.sql', import.meta.url), 'utf8');
  assert.ok(file.endsWith(SCHEMA_SQL));
  assert.match(SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS lite_lead/);
});

test('the session cookie is HttpOnly and SameSite=Lax, and Secure in production', async () => {
  const { sessionCookie, clearedCookie } = await import('../lib/lite/http.ts');
  const before = process.env.NODE_ENV;
  const env = process.env as Record<string, string | undefined>;
  try {
    env.NODE_ENV = 'production';
    assert.match(sessionCookie('v', 60), /^ac_demo=v; Path=\/; Max-Age=60; HttpOnly; SameSite=Lax; Secure$/);
    assert.match(clearedCookie(), /Max-Age=0; HttpOnly; SameSite=Lax; Secure$/);
  } finally {
    env.NODE_ENV = before;
  }
});

test('accepts the visitor name as `name` too (the form field)', () => {
  const v = parseDemoRequest({
    name: 'Ada Lovelace',
    email: 'ada@acme.test',
    company: 'Acme',
    marketingConsent: false,
    formToken: 'x',
    website2: '',
  });
  assert.equal(v.fullName, 'Ada Lovelace');
});

test('the expiry route accepts the cron token, which cannot read leads', async () => {
  const { adminGate } = await import('../lib/lite/http.ts');
  const env = process.env;
  const saved = { a: env.ADMIN_TOKEN, c: env.CRON_TOKEN, s: env.LITE_SECRET };
  env.ADMIN_TOKEN = 'a'.repeat(24);
  env.CRON_TOKEN = 'c'.repeat(24);
  env.LITE_SECRET = 'x'.repeat(32);
  const req = (t: string) => new Request('https://x.test/', { headers: { authorization: `Bearer ${t}` } });
  try {
    assert.equal(adminGate(req('c'.repeat(24)), { allowCron: true }), null);
    assert.equal(adminGate(req('a'.repeat(24)), { allowCron: true }), null);
    assert.equal(adminGate(req('c'.repeat(24)))?.status, 401, 'the cron token is not an admin token');
    assert.equal(adminGate(req('wrong'.repeat(5)), { allowCron: true })?.status, 401);
  } finally {
    env.ADMIN_TOKEN = saved.a;
    env.CRON_TOKEN = saved.c;
    env.LITE_SECRET = saved.s;
  }
});
