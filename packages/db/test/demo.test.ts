// SYNTHETIC TEST DATA — demo visitors are "Fixture …" people at example.test.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { withScope } from '../src/index.ts';
import { createTestDatabase } from '../src/testing.ts';
import { ACCESS_SUBJECTS as S, seedAccess, seedSession } from './access-fixture.ts';
import { expireDemos } from '../../../apps/worker/src/demo-expire.ts';

/**
 * The demo funnel's database side (migration 1793318400000_demo.sql), with the real application role against a
 * freshly migrated database: lead capture and reuse, the demo tenant and its sample data, isolation, claiming,
 * the platform lead list, and expiry (also through the worker's demo-expire module). Needs `pnpm infra:up`.
 */
const adminUrl = process.env.DATABASE_ADMIN_URL;
const appUrl = process.env.DATABASE_URL;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

interface Submitted {
  request_id: string;
  lead_id: string;
  demo_tenant_id: string;
  send_verification: boolean;
  replayed: boolean;
}

describe('demo funnel (app role)', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let f: Awaited<ReturnType<typeof seedAccess>>;
  let pool: pg.Pool;
  let admin: pg.Client;
  let demoAgency: string;
  const platformOwner = 'fixture:platform-owner';

  const submit = async (
    email: string,
    o: Partial<{ name: string; company: string; consent: boolean; key: string; attribution: object }> = {},
  ) =>
    (
      await pool.query<Submitted>(
        `SELECT * FROM app.submit_demo_request($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::interval, $12::interval)`,
        [
          email,
          o.name ?? 'Fixture Visitor',
          o.company ?? 'Fixture Motors',
          'Automotive',
          '+1 555 0100',
          'https://fixture.example.test',
          o.consent ?? true,
          'test-notice-1',
          JSON.stringify(o.attribution ?? { utmSource: 'fixture' }),
          sha(o.key ?? randomUUID()),
          '14 days',
          '48 hours',
        ],
      )
    ).rows[0]!;
  const claim = (subject: string, email: string | null, verified = true) =>
    pool.query('SELECT * FROM app.claim_demo($1, $2, $3)', [subject, email, verified]).then(r => r.rows[0]);
  const status = async (requestId: string) =>
    (await pool.query('SELECT app.demo_request_status($1) AS s', [requestId])).rows[0].s as string | null;
  const count = async (sql: string, params: unknown[]) => Number((await admin.query(sql, params)).rows[0].n);
  const tenantData = async (t: string) => ({
    contacts: await count('SELECT count(*) AS n FROM app.contact WHERE tenant_id = $1', [t]),
    notes: await count('SELECT count(*) AS n FROM app.note WHERE tenant_id = $1', [t]),
    opportunities: await count('SELECT count(*) AS n FROM app.opportunity WHERE tenant_id = $1', [t]),
    content: await count('SELECT count(*) AS n FROM app.content_item WHERE tenant_id = $1', [t]),
    messages: await count('SELECT count(*) AS n FROM app.message_evidence WHERE tenant_id = $1', [t]),
    profiles: await count('SELECT count(*) AS n FROM app.demo_profile WHERE tenant_id = $1', [t]),
    invitations: await count('SELECT count(*) AS n FROM app.invitation WHERE tenant_id = $1', [t]),
    tokens: await count('SELECT count(*) AS n FROM identity.invitation_token WHERE tenant_id = $1', [t]),
    activeMembers: await count(
      'SELECT count(*) AS n FROM app.tenant_member WHERE tenant_id = $1 AND revoked_at IS NULL',
      [t],
    ),
  });

  before(async () => {
    assert.ok(adminUrl && appUrl, 'DATABASE_ADMIN_URL and DATABASE_URL must be set (see infra/local-dev.env)');
    db = await createTestDatabase({ adminUrl, appUrl });
    f = await seedAccess(db.adminUrl);
    pool = new pg.Pool({ connectionString: db.appUrl, max: 4 });
    admin = new pg.Client({ connectionString: db.adminUrl });
    await admin.connect();
    demoAgency = (await admin.query('SELECT demo_agency_id FROM marketing.settings')).rows[0].demo_agency_id;
  });
  after(async () => {
    await pool?.end();
    await admin?.end();
    await db?.drop();
  });

  it('keeps marketing.* away from the app role; writes only through owned definer functions', async () => {
    for (const sql of [
      'SELECT * FROM marketing.lead',
      'SELECT * FROM marketing.demo_request',
      'SELECT * FROM marketing.settings',
      `INSERT INTO marketing.lead (email) VALUES ('x@example.test')`,
    ])
      await assert.rejects(pool.query(sql), /permission denied/, sql);
    const privs = await admin.query(`
      SELECT c.relname, has_table_privilege('agentcity_app', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS any
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'marketing' AND c.relkind = 'r'`);
    assert.equal(privs.rows.length, 3);
    assert.ok(privs.rows.every(r => r.any === false));
    assert.equal(
      (await admin.query(`SELECT has_schema_privilege('agentcity_app', 'marketing', 'USAGE') AS u`)).rows[0].u,
      false,
    );
    // The profile is read-only to the app role, even inside a writable scope of its own demo tenant.
    await assert.rejects(
      withScope(pool, { subject: S.owner, tenantId: f.t.demo }, c =>
        c.query(`DELETE FROM app.demo_profile WHERE tenant_id = $1`, [f.t.demo]),
      ),
      /permission denied/,
    );

    const fns = await admin.query(`
      SELECT p.oid::regprocedure::text AS f, pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig,
             has_function_privilege('agentcity_app', p.oid, 'EXECUTE') AS app_exec,
             coalesce(p.proacl::text, '') ~ '(^|[{,])=X' AS public_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE (n.nspname = 'app' AND p.proname IN ('submit_demo_request', 'demo_request_status', 'claim_demo', 'list_leads', 'expire_demos'))
         OR (n.nspname = 'app_private' AND p.proname IN ('guard_demo_profile', 'demo_agency', 'seed_demo', 'provision_demo', 'expire_lead'))`);
    assert.equal(fns.rows.length, 10);
    for (const r of fns.rows) {
      assert.equal(r.owner, 'agentcity_scope', r.f);
      assert.equal(r.prosecdef, true, r.f);
      assert.deepEqual(r.proconfig, ['search_path=pg_catalog, pg_temp'], r.f);
      assert.equal(r.public_exec, false, r.f);
      assert.equal(r.app_exec, r.f.startsWith('app.'), r.f);
    }
    await assert.rejects(pool.query(`SELECT app_private.expire_lead(gen_random_uuid())`), /permission denied/);

    const cls = await admin.query(
      `SELECT table_schema || '.' || table_name AS t, class FROM platform.table_classification
       WHERE table_schema = 'marketing' OR table_name = 'demo_profile' ORDER BY 1`,
    );
    assert.deepEqual(cls.rows, [
      { t: 'app.demo_profile', class: 'tenant' },
      { t: 'marketing.demo_request', class: 'private' },
      { t: 'marketing.lead', class: 'private' },
      { t: 'marketing.settings', class: 'private' },
    ]);
  });

  it('provisions a demo tenant with an office, a simulated team, safe sample data and a pending invitation', async () => {
    const r = await submit('  Fixture.Visitor@Example.TEST ', {
      attribution: { utmSource: 'fixture', referrerHost: 'example.test' },
    });
    assert.equal(r.send_verification, true);
    assert.equal(r.replayed, false);

    const lead = (await admin.query('SELECT * FROM marketing.lead WHERE id = $1', [r.lead_id])).rows[0];
    assert.equal(lead.email, 'fixture.visitor@example.test', 'email is stored lower-cased and trimmed');
    assert.equal(lead.status, 'verification-sent');
    assert.equal(lead.marketing_consent, true);
    assert.ok(lead.consent_recorded_at instanceof Date, 'the consent choice is stored with its time');
    assert.equal(lead.consent_notice_version, 'test-notice-1');
    assert.deepEqual(lead.attribution, { utmSource: 'fixture', referrerHost: 'example.test' });
    const days = (lead.expires_at.getTime() - lead.created_at.getTime()) / 86_400_000;
    assert.ok(Math.abs(days - 14) < 0.01, `expires in 14 days, got ${days}`);

    const tenant = (await admin.query('SELECT * FROM app.tenant WHERE id = $1', [r.demo_tenant_id])).rows[0];
    assert.equal(tenant.kind, 'demo');
    assert.equal(tenant.agency_id, demoAgency);
    assert.equal(
      (await admin.query('SELECT name FROM app.agency WHERE id = $1', [demoAgency])).rows[0].name,
      'AgentCity demos',
    );
    assert.doesNotMatch(tenant.name, /fixture/i, 'the tenant name holds no personal data');
    const ws = await admin.query('SELECT id, kind FROM app.workspace WHERE tenant_id = $1', [r.demo_tenant_id]);
    assert.deepEqual(ws.rows, [{ id: lead.demo_workspace_id, kind: 'demo' }]);
    assert.equal(
      await count('SELECT count(*) AS n FROM app.workspace_placement WHERE tenant_id = $1', [r.demo_tenant_id]),
      0,
      'no placement',
    );
    assert.equal(
      await count('SELECT count(*) AS n FROM app.agent_installation WHERE tenant_id = $1', [r.demo_tenant_id]),
      0,
    );

    const profile = (await admin.query('SELECT * FROM app.demo_profile WHERE tenant_id = $1', [r.demo_tenant_id]))
      .rows[0];
    assert.equal(profile.first_name, 'Fixture');
    assert.equal(profile.company, 'Fixture Motors');
    assert.equal(profile.building_key, 'rental-2');
    assert.ok(profile.office_level >= 1 && profile.office_level <= 12);
    assert.ok(profile.agents.length >= 6 && profile.agents.length <= 8);
    const roles = new Set((await admin.query('SELECT role FROM catalog.agent_template')).rows.map(x => x.role));
    const personas = new Set(
      (await admin.query(`SELECT persona_name FROM catalog.desk WHERE kind = 'ai'`)).rows.map(x => x.persona_name),
    );
    for (const a of profile.agents) {
      assert.ok(roles.has(a.role), `role ${a.role} is a catalog AI role`);
      assert.ok(personas.has(a.name), `name ${a.name} is a catalog AI persona`);
      assert.equal(a.simulated, true);
      assert.ok(a.summary && a.tasks.length >= 2 && a.conversations.length >= 1);
      assert.ok(a.tasks.every((t: { simulated: boolean }) => t.simulated));
      assert.ok(a.conversations.every((c: { simulated: boolean }) => c.simulated));
    }
    assert.ok(profile.activity.length >= 1 && profile.activity.every((x: { simulated: boolean }) => x.simulated));

    const contacts = await admin.query('SELECT display_name, email, provenance FROM app.contact WHERE tenant_id = $1', [
      r.demo_tenant_id,
    ]);
    assert.ok(contacts.rows.length >= 3);
    for (const c of contacts.rows) {
      assert.match(c.display_name, /^Sample /);
      assert.match(c.email, /@example\.test$/);
      assert.equal(c.provenance.simulated, true);
    }
    const msgs = await admin.query('SELECT verification FROM app.message_evidence WHERE tenant_id = $1', [
      r.demo_tenant_id,
    ]);
    assert.ok(msgs.rows.length >= 1 && msgs.rows.every(m => m.verification === 'simulated'));
    const opps = await admin.query('SELECT value_cents FROM app.opportunity WHERE tenant_id = $1', [r.demo_tenant_id]);
    assert.ok(opps.rows.length >= 1 && opps.rows.every(o => o.value_cents === null), 'no synthesised money values');
    const content = await admin.query('SELECT status FROM app.content_item WHERE tenant_id = $1', [r.demo_tenant_id]);
    assert.ok(content.rows.length >= 1 && content.rows.every(c => c.status !== 'legacy-simulated'));

    const inv = await admin.query(
      `SELECT i.email, i.role, i.status, i.workspace_id, extract(epoch FROM t.expires_at - t.created_at)::int / 3600 AS ttl
       FROM app.invitation i JOIN identity.invitation_token t ON t.tenant_id = i.tenant_id AND t.invitation_id = i.id
       WHERE i.tenant_id = $1`,
      [r.demo_tenant_id],
    );
    assert.equal(inv.rows.length, 1);
    assert.deepEqual(inv.rows[0], {
      email: 'fixture.visitor@example.test',
      role: 'client-admin',
      status: 'pending',
      workspace_id: null,
      ttl: 48,
    });
    // The email address stays out of immutable records.
    const audit = await admin.query('SELECT detail::text AS d FROM app.audit_event WHERE tenant_id = $1', [
      r.demo_tenant_id,
    ]);
    assert.ok(audit.rows.length >= 1 && audit.rows.every(a => !a.d.includes('fixture.visitor')));
    assert.equal(await count('SELECT count(*) AS n FROM app.outbox_event WHERE tenant_id = $1', [r.demo_tenant_id]), 0);
  });

  it('reuses the lead and the demo tenant for the same email, and replays a double submit', async () => {
    const first = await submit('reuse@example.test', { key: 'form-1', company: 'Fixture First Co' });
    const again = await submit('REUSE@example.test', { key: 'form-2', company: 'Someone Else Typed This' });
    assert.equal(again.lead_id, first.lead_id);
    assert.equal(again.demo_tenant_id, first.demo_tenant_id);
    assert.notEqual(again.request_id, first.request_id, 'each submission has its own request id');
    assert.equal(again.send_verification, true, 'still unverified: the verification can be sent again');
    const replay = await submit('reuse@example.test', { key: 'form-1' });
    assert.deepEqual(
      { id: replay.request_id, send: replay.send_verification, replayed: replay.replayed },
      { id: first.request_id, send: false, replayed: true },
    );
    assert.equal(await count('SELECT count(*) AS n FROM marketing.lead WHERE email = $1', ['reuse@example.test']), 1);
    assert.equal(
      await count(
        `SELECT count(*) AS n FROM app.demo_profile p JOIN marketing.lead l ON l.demo_tenant_id = p.tenant_id WHERE l.email = $1`,
        ['reuse@example.test'],
      ),
      1,
      'one demo tenant per lead',
    );
    const lead = (await admin.query('SELECT company FROM marketing.lead WHERE id = $1', [first.lead_id])).rows[0];
    assert.equal(lead.company, 'Fixture First Co', 'a resubmission does not overwrite an active lead');
    assert.equal(await status(first.request_id), 'verification-sent');
    assert.equal(await status(randomUUID()), null);
  });

  it('isolates the demo tenant (RLS, composite keys) and refuses dispatches and money facts', async () => {
    const r = await submit('isolated@example.test');
    const subject = 'kc:fixture-isolated';
    await claim(subject, 'isolated@example.test');
    // The demo visitor sees exactly their own sample data, nothing of the client tenants.
    await withScope(pool, { subject, tenantId: r.demo_tenant_id }, async c => {
      const t = await c.query('SELECT DISTINCT tenant_id FROM app.contact');
      assert.deepEqual(t.rows, [{ tenant_id: r.demo_tenant_id }]);
      assert.equal(
        (await c.query('SELECT count(*)::int AS n FROM app.contact WHERE tenant_id = $1', [f.t.A])).rows[0].n,
        0,
      );
      assert.equal((await c.query('SELECT count(*)::int AS n FROM app.demo_profile')).rows[0].n, 1);
      // A row that points into another tenant's workspace is refused.
      await assert.rejects(
        c.query(
          `INSERT INTO app.contact (tenant_id, workspace_id, id, display_name, kind) VALUES ($1, $2, gen_random_uuid(), 'x', 'customer')`,
          [r.demo_tenant_id, f.ws.A],
        ),
        /foreign key|row-level security/,
      );
    });
    assert.equal(await code(withScope(pool, { subject, tenantId: f.t.A }, async () => {})), '42501');
    // Client A's admin cannot see into the demo.
    await withScope(pool, { subject: S.alice, tenantId: f.t.A }, async c => {
      assert.equal((await c.query('SELECT count(*)::int AS n FROM app.demo_profile')).rows[0].n, 0);
      assert.equal(
        (await c.query('SELECT count(*)::int AS n FROM app.contact WHERE tenant_id = $1', [r.demo_tenant_id])).rows[0]
          .n,
        0,
      );
    });
    // No provider authority: refused even for the administrator.
    const ws = (await admin.query('SELECT demo_workspace_id AS w FROM marketing.lead WHERE id = $1', [r.lead_id]))
      .rows[0].w;
    await assert.rejects(
      admin.query(
        `INSERT INTO app.money_fact (tenant_id, id, kind, amount_cents, currency, provider, provider_ref, verified, occurred_at)
         VALUES ($1, gen_random_uuid(), 'invoice', 100, 'USD', 'stripe', 'in_fixture', true, now())`,
        [r.demo_tenant_id],
      ),
      /no provider authority/,
    );
    await assert.rejects(
      admin.query(
        `INSERT INTO app.dispatch_attempt (tenant_id, workspace_id, id, approval_id, draft_revision_id, connector, recipient, payload_sha256, idempotency_key)
         VALUES ($1, $2, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'smtp', 'x@example.test', $3, 'k1')`,
        [r.demo_tenant_id, ws, sha('x')],
      ),
      /no provider authority/,
    );
  });

  it('claims only for the verified, matching email; once; and hides known addresses afterwards', async () => {
    const r = await submit('claim@example.test', { name: 'Fixture Claimer' });
    assert.equal(await code(claim('kc:fixture-claimer', 'claim@example.test', false)), 'ACI05');
    assert.equal(await code(claim('kc:fixture-claimer', null, true)), 'ACI05');
    assert.equal(await code(claim('kc:fixture-claimer', 'unknown@example.test')), 'DEM01');
    assert.equal(await code(claim('bad subject|x', 'claim@example.test')), '22023');

    const ctx = await claim('kc:fixture-claimer', 'Claim@Example.test');
    assert.equal(ctx.tenant_id, r.demo_tenant_id);
    assert.equal(ctx.first_name, 'Fixture');
    assert.equal(ctx.building_key, 'rental-2');
    assert.equal(ctx.building_name, 'Rental Building 2');
    assert.ok(ctx.workspace_id && ctx.office_level >= 1 && ctx.expires_at instanceof Date);
    const m = await admin.query(
      'SELECT role, workspace_id FROM app.tenant_member WHERE tenant_id = $1 AND subject = $2',
      [r.demo_tenant_id, 'kc:fixture-claimer'],
    );
    assert.deepEqual(m.rows, [{ role: 'client-admin', workspace_id: null }]);
    assert.equal(await status(r.request_id), 'ready');
    assert.equal(
      await count(`SELECT count(*) AS n FROM app.invitation WHERE tenant_id = $1 AND status = 'accepted'`, [
        r.demo_tenant_id,
      ]),
      1,
    );

    // The same person again: the same demo (a reload of the welcome page). Anyone else: refused.
    assert.equal((await claim('kc:fixture-claimer', 'claim@example.test')).tenant_id, r.demo_tenant_id);
    assert.equal(await code(claim('kc:fixture-other', 'claim@example.test')), 'ACI03');

    // A later submission for this (now known) address sends nothing, and its status never turns 'ready'.
    const shadow = await submit('claim@example.test');
    assert.equal(shadow.send_verification, false);
    assert.equal(shadow.demo_tenant_id, r.demo_tenant_id);
    assert.equal(await status(shadow.request_id), 'verification-sent');
  });

  it('lists leads only for an owner of the platform demo agency, newest first, in pages', async () => {
    const list = (actor: string, after: [Date, string] | null = null, limit = 2) =>
      pool.query('SELECT * FROM app.list_leads($1, $2, $3, $4)', [
        actor,
        after?.[0] ?? null,
        after?.[1] ?? null,
        limit,
      ]);
    for (const actor of [S.owner, S.alice, S.stranger, platformOwner])
      assert.equal(await code(list(actor)), '42501', actor); // owner of another agency, client admin, nobody
    await admin.query(`INSERT INTO app.agency_member (agency_id, subject, role) VALUES ($1, $2, 'owner')`, [
      demoAgency,
      platformOwner,
    ]);
    const all = (await list(platformOwner, null, 1000)).rows;
    assert.ok(all.length >= 4);
    const page1 = (await list(platformOwner)).rows;
    const last = page1[page1.length - 1];
    const page2 = (await list(platformOwner, [last.created_at, last.id])).rows;
    assert.deepEqual(
      [...page1, ...page2].map(x => x.id),
      all.slice(0, 4).map(x => x.id),
    );
    assert.ok(all.every(x => typeof x.email === 'string' && typeof x.marketing_consent === 'boolean'));
    assert.equal(await code(list(platformOwner, null, 0)), '22023');
    await admin.query(`UPDATE app.agency_member SET revoked_at = now() WHERE agency_id = $1 AND subject = $2`, [
      demoAgency,
      platformOwner,
    ]);
    assert.equal(await code(list(platformOwner)), '42501', 'a revoked owner');
    await admin.query(`UPDATE app.agency_member SET revoked_at = NULL WHERE agency_id = $1 AND subject = $2`, [
      demoAgency,
      platformOwner,
    ]);
  });

  it('expires demos: access ends, sessions are cleared, demo data is removed, the lead is kept as expired', async () => {
    const r = await submit('expire@example.test');
    const subject = 'kc:fixture-expire';
    await seedSession(admin, subject, { email: 'expire@example.test' });
    const ctx = await claim(subject, 'expire@example.test');
    await admin.query('UPDATE identity.session SET tenant_id = $1, workspace_id = $2 WHERE subject = $3', [
      r.demo_tenant_id,
      ctx.workspace_id,
      subject,
    ]);
    // The visitor adds a contact of their own, and a consent event (immutable) that points at it.
    await withScope(pool, { subject, tenantId: r.demo_tenant_id, workspaceId: ctx.workspace_id }, async c => {
      const id = randomUUID();
      await c.query(
        `INSERT INTO app.contact (tenant_id, workspace_id, id, display_name, kind) VALUES ($1, $2, $3, 'Fixture own contact', 'customer')`,
        [r.demo_tenant_id, ctx.workspace_id, id],
      );
      await c.query(
        `INSERT INTO app.consent_event (tenant_id, workspace_id, id, contact_id, channel, state, source, evidence, recorded_by)
         VALUES ($1, $2, gen_random_uuid(), $3, 'email', 'granted', 'fixture', 'fixture', $4)`,
        [r.demo_tenant_id, ctx.workspace_id, id, subject],
      );
    });
    const before = await tenantData(r.demo_tenant_id);
    assert.ok(before.contacts >= 4 && before.profiles === 1 && before.activeMembers === 1);

    // Not yet due: nothing happens, and a timestamp in the future cannot force it.
    const early = await pool.query('SELECT * FROM app.expire_demos($1)', [new Date(Date.now() + 30 * 86_400_000)]);
    assert.ok(!early.rows.some(x => x.tenant_id === r.demo_tenant_id));

    await admin.query(`UPDATE marketing.lead SET expires_at = now() - interval '1 minute' WHERE id = $1`, [r.lead_id]);
    const run = await expireDemos(pool);
    assert.ok(run.tenantIds.includes(r.demo_tenant_id));
    assert.ok(run.membershipsEnded >= 1);

    assert.deepEqual(await tenantData(r.demo_tenant_id), {
      contacts: 1, // the visitor's own contact stays only because an immutable consent event points at it
      notes: 0,
      opportunities: 0,
      content: 0,
      messages: before.messages, // simulated, immutable, no personal data
      profiles: 0,
      invitations: 0,
      tokens: 0,
      activeMembers: 0,
    });
    assert.equal(await code(withScope(pool, { subject, tenantId: r.demo_tenant_id }, async () => {})), '42501');
    const s = await admin.query('SELECT tenant_id FROM identity.session WHERE subject = $1', [subject]);
    assert.ok(
      s.rows.every(x => x.tenant_id === null),
      'sessions no longer point into the demo',
    );
    const lead = (await admin.query('SELECT status, expired_at, email FROM marketing.lead WHERE id = $1', [r.lead_id]))
      .rows[0];
    assert.equal(lead.status, 'expired');
    assert.ok(lead.expired_at instanceof Date);
    assert.equal(await status(r.request_id), 'expired');
    assert.equal(await code(claim(subject, 'expire@example.test')), 'DEM02');

    // Running again changes nothing; a new submission starts a fresh demo for the same lead.
    assert.ok(!(await expireDemos(pool)).tenantIds.includes(r.demo_tenant_id));
    const fresh = await submit('expire@example.test');
    assert.equal(fresh.lead_id, r.lead_id);
    assert.notEqual(fresh.demo_tenant_id, r.demo_tenant_id);
    assert.equal(fresh.send_verification, true);
    assert.equal(await status(r.request_id), 'expired');
    assert.equal(await status(fresh.request_id), 'verification-sent');
  });

  it('stores no secrets, passwords or credentials, and no raw invitation tokens', async () => {
    const cols = await admin.query(`
      SELECT table_schema || '.' || table_name || '.' || column_name AS c FROM information_schema.columns
      WHERE (table_schema = 'marketing' OR (table_schema = 'app' AND table_name = 'demo_profile'))
        AND column_name ~* '(password|secret|credential|token|otp|hash)' AND column_name <> 'idempotency_sha256'`);
    assert.deepEqual(cols.rows, []);
    const leads = await admin.query('SELECT to_jsonb(l)::text AS j FROM marketing.lead l');
    assert.ok(leads.rows.every(x => !/password|secret|credential/i.test(x.j)));
    const tokens = await admin.query(
      `SELECT token_sha256 FROM identity.invitation_token t JOIN app.tenant x ON x.id = t.tenant_id WHERE x.kind = 'demo'`,
    );
    assert.ok(tokens.rows.length >= 1 && tokens.rows.every(t => /^[0-9a-f]{64}$/.test(t.token_sha256)));
    const profiles = await admin.query('SELECT agents::text AS a FROM app.demo_profile');
    assert.ok(profiles.rows.every(p => !/password|secret|token/i.test(p.a)));
  });

  it('refuses malformed submissions', async () => {
    const bad = (overrides: unknown[]) =>
      code(
        pool.query(
          `SELECT * FROM app.submit_demo_request($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::interval, $12::interval)`,
          overrides,
        ),
      );
    const ok = [
      'ok@example.test',
      'Fixture',
      'Fixture Co',
      null,
      null,
      null,
      false,
      'v1',
      '{}',
      sha('k'),
      '14 days',
      '48 hours',
    ];
    const swap = (i: number, v: unknown) => ok.map((x, j) => (j === i ? v : x));
    assert.equal(await bad(swap(0, 'not-an-email')), '22023');
    assert.equal(await bad(swap(1, '  ')), '22023');
    assert.equal(await bad(swap(2, '')), '22023');
    assert.equal(await bad(swap(6, null)), '22023');
    assert.equal(await bad(swap(8, '[]')), '22023');
    assert.equal(await bad(swap(9, 'short')), '22023');
    assert.equal(await bad(swap(10, '1 year')), '22023');
  });
});
