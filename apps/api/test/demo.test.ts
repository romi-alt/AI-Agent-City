// SYNTHETIC TEST DATA — demo visitors are "Fixture …" people at example.test.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { CapturingLogger } from './access-harness.ts';
import { PUBLIC_ORIGIN, startDemoApp, type DemoApp } from './demo-harness.ts';

/**
 * The demo funnel over real HTTP: the real auth module (mock OIDC provider, device proofs), the access and demo
 * modules, a fresh database with the app role, the local Redis for rate limits, and a mock Keycloak admin API that
 * records every call. Needs `pnpm infra:up` (PostgreSQL and Redis).
 */
const LOCAL_ENV = join(import.meta.dirname, '../../../infra/local-dev.env');
if (!process.env.DATABASE_ADMIN_URL && existsSync(LOCAL_ENV)) process.loadEnvFile(LOCAL_ENV);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('demo API', () => {
  let t: DemoApp;
  const logger = new CapturingLogger();
  const output: string[] = [];
  const writes = { out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr) };
  /** Every piece of personal data sent in this run: none may appear in logs or console output. */
  const personal = new Set<string>();
  let formToken: string;
  let ipCounter = 0;
  const nextIp = () => `198.51.100.${++ipCounter}`;

  const form = (email: string, extra: Record<string, unknown> = {}) => {
    const body = {
      fullName: `Fixture ${email.split('@')[0]} Person`,
      email,
      company: `Fixture Company ${email.split('@')[0]}`,
      industry: 'Automotive',
      phone: '+1 555 0142',
      website: 'fixture-motors.example.test',
      marketingConsent: true,
      formToken,
      website2: '',
      ...extra,
    };
    for (const k of ['fullName', 'email', 'company', 'phone'] as const) personal.add(String(body[k]));
    return body;
  };
  const submit = (body: unknown, ip = nextIp(), origin?: string | null) =>
    t.request('POST', '/api/demo/requests', { body, ip, origin });
  const leadCount = async (email: string) =>
    Number((await t.admin.query('SELECT count(*) AS n FROM marketing.lead WHERE email = $1', [email])).rows[0].n);

  before(async () => {
    process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
      output.push(String(chunk));
      return (writes.out as (...a: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
      output.push(String(chunk));
      return (writes.err as (...a: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof process.stderr.write;
    t = await startDemoApp({ logger, limits: { emailPerHour: 3 } });
    const r = await t.request('GET', '/api/demo/form-token', { origin: null });
    assert.equal(r.status, 200);
    formToken = r.body.token;
    // Older than DEMO_FORM_MIN_SECONDS (1 s in these tests) before it is used.
    await sleep(1100);
  });
  after(async () => {
    process.stdout.write = writes.out;
    process.stderr.write = writes.err;
    await t?.close();
  });

  it('gives a form token to anyone, with a request id and no caching', async () => {
    const r = await t.request('GET', '/api/demo/form-token', { origin: null });
    assert.equal(r.status, 200);
    assert.match(r.body.token, /^v1\.[0-9a-z]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.ok(r.headers.get('x-request-id'));
  });

  it('answers validation errors per field, without echoing what was sent', async () => {
    const r = await submit({
      fullName: '',
      email: 'not-an-email',
      company: '   ',
      phone: 'call me <maybe>',
      website: 'javascript:alert(1)',
      marketingConsent: 'yes',
      formToken,
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'validation_failed');
    assert.ok(r.body.requestId);
    assert.deepEqual(Object.keys(r.body.details.fields).sort(), [
      'company',
      'email',
      'fullName',
      'marketingConsent',
      'phone',
      'website',
    ]);
    assert.equal(r.body.details.fields.email, 'Enter a valid email address.');
    assert.ok(Array.isArray(r.body.details.issues));
    assert.ok(!r.text.includes('not-an-email') && !r.text.includes('alert(1)'));
    assert.equal((await submit('not json', nextIp())).status, 400);
  });

  it('refuses the honeypot, a too-fast form, a forged token and posts from other origins, storing nothing', async () => {
    const before = t.kc.calls.length;
    const honey = await submit(form('honey@example.test', { website2: 'https://spam.example' }));
    assert.equal(honey.status, 400);
    assert.equal(honey.body.error, 'bad_request');

    const fresh = (await t.request('GET', '/api/demo/form-token', { origin: null })).body.token;
    const fast = await submit(form('fast@example.test', { formToken: fresh }));
    assert.equal(fast.status, 400);
    assert.equal(fast.body.message, honey.body.message, 'the refusal does not say which check failed');

    const forged = await submit(form('forged@example.test', { formToken: `${formToken.slice(0, -2)}AA` }));
    assert.equal(forged.status, 400);
    const foreign = await submit(form('foreign@example.test'), nextIp(), 'https://evil.example');
    assert.equal(foreign.status, 403);
    assert.equal(foreign.body.error, 'bad_origin');

    for (const e of ['honey@example.test', 'fast@example.test', 'forged@example.test', 'foreign@example.test'])
      assert.equal(await leadCount(e), 0, e);
    assert.equal(t.kc.calls.length, before, 'Keycloak was not called');
  });

  it('provisions a new visitor in Keycloak with exactly the expected payload: no password, verify-email only', async () => {
    t.kc.calls.length = 0;
    const r = await submit(form('new.visitor@example.test', { fullName: 'Fixture Newton Visitor' }));
    assert.equal(r.status, 202);
    assert.deepEqual(Object.keys(r.body).sort(), ['requestId', 'status']);
    assert.equal(r.body.status, 'verification-sent');
    await t.demo.whenIdle();

    const token = t.kc.calls.find(c => c.path.endsWith('/protocol/openid-connect/token'));
    assert.equal(new URLSearchParams(String(token?.body)).get('grant_type'), 'client_credentials');
    const admin = t.kc.adminCalls();
    assert.deepEqual(
      admin.map(c => `${c.method} ${c.path.replace(/[0-9a-f-]{36}/, ':id')}`),
      [
        'GET /admin/realms/agentcity/users',
        'POST /admin/realms/agentcity/users',
        'PUT /admin/realms/agentcity/users/:id/execute-actions-email',
      ],
    );
    assert.equal(admin[0]!.query.email, 'new.visitor@example.test');
    assert.equal(admin[0]!.query.exact, 'true');
    assert.deepEqual(admin[1]!.body, {
      username: 'new.visitor@example.test',
      email: 'new.visitor@example.test',
      emailVerified: false,
      enabled: true,
      firstName: 'Fixture',
      lastName: 'Newton Visitor',
      requiredActions: [],
    });
    assert.ok(!JSON.stringify(admin[1]!.body).match(/password|credential|secret/i));
    assert.deepEqual(admin[2]!.body, ['VERIFY_EMAIL']);
    assert.deepEqual(admin[2]!.query, {
      client_id: 'agentcity-provisioner',
      redirect_uri: `${PUBLIC_ORIGIN}/demo/verified?request=${r.body.requestId}`,
      lifespan: String(48 * 3600),
    });

    const status = await t.request('GET', `/api/demo/requests/${r.body.requestId}`, { origin: null });
    assert.deepEqual(status.body, { status: 'verification-sent' });
    assert.equal((await t.request('GET', `/api/demo/requests/${randomUUID()}`, { origin: null })).status, 404);
    assert.equal((await t.request('GET', '/api/demo/requests/not-a-uuid', { origin: null })).status, 404);
  });

  it('answers a known (verified) address exactly like a new one, and sends it nothing', async () => {
    const knownId = t.kc.addUser({
      email: 'known@example.test',
      emailVerified: true,
      firstName: 'Fixture',
      lastName: 'Known',
    });
    t.kc.calls.length = 0;
    const known = await submit(form('known@example.test'));
    const fresh = await submit(form('unknown@example.test'));
    await t.demo.whenIdle();
    assert.equal(known.status, fresh.status);
    assert.deepEqual(Object.keys(known.body).sort(), Object.keys(fresh.body).sort());
    assert.equal(known.body.status, fresh.body.status);
    const headerNames = (h: Headers) =>
      [...h.keys()].filter(k => !['date', 'x-request-id', 'content-length', 'etag'].includes(k)).sort();
    assert.deepEqual(headerNames(known.headers), headerNames(fresh.headers));
    const toKnown = t.kc
      .adminCalls()
      .filter(
        c =>
          c.method !== 'GET' &&
          ((c.body as { email?: string })?.email === 'known@example.test' || c.path.includes(knownId)),
      );
    assert.deepEqual(toKnown, [], 'no user created for the verified address');
    const puts = t.kc.adminCalls().filter(c => c.method === 'PUT');
    assert.equal(puts.length, 1, 'only the new address gets a verify-email link');

    // A second submission for a pending (unverified) address: the same answer, and the link is sent again.
    // A later visit: a new form (token) for the same pending address.
    const later = (await t.request('GET', '/api/demo/form-token', { origin: null })).body.token;
    await sleep(1100);
    t.kc.calls.length = 0;
    const again = await submit(form('unknown@example.test', { formToken: later }));
    await t.demo.whenIdle();
    assert.equal(again.status, 202);
    assert.notEqual(again.body.requestId, fresh.body.requestId);
    assert.deepEqual(
      t.kc.adminCalls().map(c => c.method),
      ['GET', 'PUT'],
    );
    assert.equal(await leadCount('unknown@example.test'), 1);
  });

  it('rate-limits per email address and per client address (Redis), with Retry-After', async () => {
    const email = 'limited@example.test';
    for (let i = 0; i < 3; i++) assert.equal((await submit(form(email))).status, 202);
    const over = await submit(form(email));
    assert.equal(over.status, 429);
    assert.equal(over.body.error, 'rate_limited');
    assert.ok(over.body.details.retryAfterSeconds >= 1);
    assert.ok(Number(over.headers.get('retry-after')) >= 1);

    const ip = nextIp();
    for (let i = 0; i < 100; i++) {
      const r = await submit({ email: 'x' }, ip); // invalid bodies still count against the address
      assert.equal(r.status, 400);
    }
    const blocked = await submit(form('ip-limited@example.test'), ip);
    assert.equal(blocked.status, 429);
    assert.equal(await leadCount('ip-limited@example.test'), 0);
  });

  it('replays a double-submitted form instead of creating a second request', async () => {
    const body = form('double@example.test');
    const a = await submit(body);
    const b = await submit(body);
    assert.equal(a.status, 202);
    assert.equal(b.status, 202);
    assert.equal(b.body.requestId, a.body.requestId);
  });

  it('claims the demo after sign-in with the verified address, switches the session, and shows the office', async () => {
    const email = 'claimer@example.test';
    const r = await submit(form(email, { fullName: 'Fixture Claire Claimer', company: 'Fixture Claim Motors' }));
    assert.equal(r.status, 202);

    // Not verified yet: refused, nothing changes.
    const unverified = await t.login({ sub: 'claimer-unverified', email, emailVerified: false });
    const refused = await t.request('POST', '/api/demo/claim', { ...unverified, body: {} });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error, 'email_not_verified');

    const other = await t.login({ sub: 'claimer-other', email: 'nobody@example.test', emailVerified: true });
    const none = await t.request('POST', '/api/demo/claim', { ...other, body: {} });
    assert.equal(none.status, 404);
    assert.equal((await t.request('GET', '/api/demo/workspace', other)).status, 409, 'no tenant selected');

    const s = await t.login({ sub: 'claimer', email, emailVerified: true, name: 'Fixture Claire Claimer' });
    const c = await t.request('POST', '/api/demo/claim', { ...s, body: {} });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.deepEqual(Object.keys(c.body).sort(), [
      'building',
      'company',
      'expiresAt',
      'firstName',
      'office',
      'tenantId',
      'workspaceId',
    ]);
    assert.equal(c.body.firstName, 'Fixture');
    assert.equal(c.body.company, 'Fixture Claim Motors');
    assert.deepEqual(c.body.building, { key: 'rental-2', name: 'Rental Building 2' });
    assert.ok(c.body.office.level >= 1 && c.body.office.level <= 12);
    assert.equal(c.body.office.name, 'Fixture Claim Motors office');
    const days = (Date.parse(c.body.expiresAt) - Date.now()) / 86_400_000;
    assert.ok(days > 13.9 && days <= 14);

    const me = await t.request('GET', '/api/auth/me', s);
    assert.equal(me.status, 200);
    const sess = await t.admin.query(
      `SELECT tenant_id, workspace_id FROM identity.session WHERE subject = 'kc:claimer' AND revoked_at IS NULL`,
    );
    assert.deepEqual(sess.rows, [{ tenant_id: c.body.tenantId, workspace_id: c.body.workspaceId }]);
    assert.deepEqual((await t.request('GET', `/api/demo/requests/${r.body.requestId}`, { origin: null })).body, {
      status: 'ready',
    });

    const w = await t.request('GET', '/api/demo/workspace', s);
    assert.equal(w.status, 200, JSON.stringify(w.body));
    assert.equal(w.body.simulated, true);
    assert.equal(w.body.firstName, 'Fixture');
    assert.equal(w.body.industry, 'Automotive');
    assert.deepEqual(w.body.building, c.body.building);
    assert.deepEqual(w.body.office, c.body.office);
    assert.equal(w.body.expiresAt, c.body.expiresAt);
    assert.ok(w.body.agents.length >= 6 && w.body.agents.length <= 8);
    for (const a of w.body.agents) {
      for (const k of ['id', 'name', 'role', 'status', 'summary', 'tasks', 'conversations']) assert.ok(k in a, k);
      assert.equal(a.simulated, true);
    }
    assert.ok(w.body.activity.length >= 1);
    assert.ok(w.body.samples.contacts.every((x: { name: string }) => x.name.startsWith('Sample ')));
    assert.ok(w.body.samples.messages.length >= 1);

    // Claiming again (a reload of the welcome page) is fine; nobody else can claim it.
    assert.equal((await t.request('POST', '/api/demo/claim', { ...s, body: {} })).status, 200);
    const thief = await t.login({ sub: 'claimer-thief', email, emailVerified: true });
    const stolen = await t.request('POST', '/api/demo/claim', { ...thief, body: {} });
    assert.equal(stolen.status, 410);

    // Claim is a write: it needs our Origin like every other session write.
    const noOrigin = await t.request('POST', '/api/demo/claim', { ...s, body: {}, origin: null });
    assert.equal(noOrigin.status, 403);
  });

  it('serves workspace data only to a session in a demo tenant', async () => {
    const s = await t.login({ sub: 'client-person', email: 'client.person@example.test', emailVerified: true });
    const agency = (
      await t.admin.query(`INSERT INTO app.agency (id, name) VALUES (gen_random_uuid(), 'Fixture Agency') RETURNING id`)
    ).rows[0].id;
    const tenant = randomUUID();
    await t.admin.query(
      `INSERT INTO app.tenant (id, agency_id, name, kind) VALUES ($1, $2, 'Fixture Client', 'client')`,
      [tenant, agency],
    );
    await t.admin.query(
      `INSERT INTO app.tenant_member (tenant_id, subject, role) VALUES ($1, 'kc:client-person', 'client-admin')`,
      [tenant],
    );
    const sw = await t.request('POST', '/api/session/tenant', { ...s, body: { tenantId: tenant } });
    assert.equal(sw.status, 200, JSON.stringify(sw.body));
    const w = await t.request('GET', '/api/demo/workspace', s);
    assert.equal(w.status, 404);
    assert.equal(w.body.error, 'not_found');
    assert.equal((await t.request('GET', '/api/demo/workspace', { origin: null })).status, 401);
  });

  it('shows leads (JSON pages and CSV) only to platform owners after a fresh strong sign-in', async () => {
    const owner = { sub: 'platform-owner', email: 'platform.owner@example.test', emailVerified: true };
    const s = await t.login(owner);
    const noStepUp = await t.request('GET', '/api/admin/leads', s);
    assert.equal(noStepUp.status, 403);
    assert.equal(noStepUp.body.error, 'step_up_required');
    assert.equal(noStepUp.body.reason, 'permission');

    await t.stepUp(s.device, s.jar, { ...owner, acr: '2', amr: ['passkey'] });
    const notOwner = await t.request('GET', '/api/admin/leads', s);
    assert.equal(notOwner.status, 403);
    assert.equal(notOwner.body.error, 'forbidden');

    await t.admin.query(
      `INSERT INTO app.agency_member (agency_id, subject, role) SELECT demo_agency_id, 'kc:platform-owner', 'owner' FROM marketing.settings`,
    );
    const page1 = await t.request('GET', '/api/admin/leads?first=2', s);
    assert.equal(page1.status, 200, JSON.stringify(page1.body));
    assert.equal(page1.body.items.length, 2);
    assert.equal(page1.body.pageInfo.hasNextPage, true);
    const lead = page1.body.items[0];
    for (const k of [
      'id',
      'createdAt',
      'fullName',
      'email',
      'company',
      'marketingConsent',
      'consentRecordedAt',
      'consentNoticeVersion',
      'attribution',
      'status',
      'expiresAt',
    ])
      assert.ok(k in lead, k);
    const page2 = await t.request(
      'GET',
      `/api/admin/leads?first=2&after=${encodeURIComponent(page1.body.pageInfo.endCursor)}`,
      s,
    );
    assert.equal(page2.status, 200);
    assert.ok(
      !page2.body.items.some((x: { id: string }) => page1.body.items.some((y: { id: string }) => y.id === x.id)),
    );
    const forged = await t.request(
      'GET',
      `/api/admin/leads?after=${encodeURIComponent(`${page1.body.pageInfo.endCursor}x`)}`,
      s,
    );
    assert.equal(forged.status, 400);
    assert.equal(forged.body.error, 'invalid_cursor');
    assert.equal((await t.request('GET', '/api/admin/leads?first=500', s)).status, 400);

    const csv = await t.request('GET', '/api/admin/leads.csv', s);
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type') ?? '', /^text\/csv/);
    assert.match(csv.headers.get('content-disposition') ?? '', /attachment/);
    const lines = csv.text.trim().split('\r\n');
    assert.match(lines[0]!, /^createdAt,fullName,email,company,/);
    assert.ok(lines.length >= 6);
    assert.ok(csv.text.includes('claimer@example.test'));
  });

  it('never writes personal data to logs or console output', async () => {
    await t.demo.whenIdle();
    const all = [...logger.lines, ...output].join('\n');
    assert.ok(
      logger.lines.some(l => /demo request [0-9a-f-]{36}/.test(l)),
      'the demo module did log its work',
    );
    for (const p of personal) assert.ok(!all.includes(p), `logged: ${p}`);
    assert.ok(!all.includes('@example.test'));
  });
});

describe('demo API without a provisioner client', () => {
  let t: DemoApp;
  const logger = new CapturingLogger();
  before(async () => {
    t = await startDemoApp({ provisioner: false, logger });
  });
  after(async () => {
    await t?.close();
  });

  it('answers 503 demo_unavailable, stores nothing, and logs a setup hint without personal data', async () => {
    const token = (await t.request('GET', '/api/demo/form-token', { origin: null })).body.token;
    await sleep(1100);
    const r = await t.request('POST', '/api/demo/requests', {
      body: {
        fullName: 'Fixture Nobody',
        email: 'unconfigured@example.test',
        company: 'Fixture Co',
        marketingConsent: false,
        formToken: token,
      },
    });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'demo_unavailable');
    assert.ok(r.body.requestId && r.body.message);
    assert.equal(Number((await t.admin.query('SELECT count(*) AS n FROM marketing.lead')).rows[0].n), 0);
    assert.equal(t.kc.calls.length, 0);
    const hint = logger.lines.join('\n');
    assert.match(hint, /PROVISIONER_CLIENT_ID/);
    assert.ok(!hint.includes('unconfigured@example.test') && !hint.includes('Fixture Nobody'));
  });
});
