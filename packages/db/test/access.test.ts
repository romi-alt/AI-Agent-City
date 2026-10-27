import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { ActorNotAuthorizedError, withActorScope } from '../src/actor.ts';
import { withScope } from '../src/index.ts';
import { createTestDatabase } from '../src/testing.ts';
import { ACCESS_SUBJECTS as S, emailOf, newToken, seedAccess, seedSession } from './access-fixture.ts';

/**
 * Invitations, role changes, removals and staff assignments (migration 1793145600001_access.sql), exercised with
 * the real application role against a freshly migrated database. Needs `pnpm infra:up`.
 */
const adminUrl = process.env.DATABASE_ADMIN_URL;
const appUrl = process.env.DATABASE_URL;

/** The SQLSTATE a call fails with, or 'ok'. */
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe('access: invitations, roles, removals, assignments (app role)', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let f: Awaited<ReturnType<typeof seedAccess>>;
  let pool: pg.Pool;
  let admin: pg.Client;

  const invite = async (actor: string, tenant: string, email: string, role: string, ws: string | null = null) => {
    const t = newToken();
    const r = await pool.query('SELECT * FROM app.create_invitation($1, $2, $3, $4, $5, $6, $7::interval)', [
      actor,
      tenant,
      email,
      role,
      ws,
      t.hash,
      '48 hours',
    ]);
    return { id: r.rows[0].invitation_id as string, expiresAt: r.rows[0].expires_at as Date, ...t };
  };
  const accept = async (subject: string, hash: string, email: string | null = emailOf(subject), verified = true) =>
    (await pool.query('SELECT * FROM app.accept_invitation($1, $2, $3, $4)', [subject, email, verified, hash])).rows[0];
  const setRole = (actor: string, tenant: string, subject: string, role: string, ws: string | null = null) =>
    pool.query('SELECT * FROM app.set_member_role($1, $2, $3, $4, $5)', [actor, tenant, subject, role, ws]);
  const remove = (actor: string, tenant: string, subject: string) =>
    pool.query('SELECT * FROM app.remove_member($1, $2, $3)', [actor, tenant, subject]);
  const assign = async (actor: string, tenant: string, subject: string, on: boolean) =>
    (await pool.query('SELECT app.set_assignment($1, $2, $3, $4) AS changed', [actor, tenant, subject, on])).rows[0]
      .changed as boolean;
  /** The role app.enter_scope gives, or null when it refuses. */
  const enters = (subject: string, tenantId: string, workspaceId: string | null = null) =>
    withScope(pool, { subject, tenantId, workspaceId }, async c => {
      const r = await c.query('SELECT app.current_scope_role() AS role, app.current_can_write() AS write');
      return r.rows[0] as { role: string; write: boolean };
    }).catch(e => {
      if ((e as { code?: string }).code === '42501') return null;
      throw e;
    });
  const audits = async (action: string, tenant: string) =>
    Number(
      (
        await admin.query('SELECT count(*) AS n FROM app.audit_event WHERE action = $1 AND tenant_id = $2', [
          action,
          tenant,
        ])
      ).rows[0].n,
    );

  before(async () => {
    assert.ok(adminUrl && appUrl, 'DATABASE_ADMIN_URL and DATABASE_URL must be set (see infra/local-dev.env)');
    db = await createTestDatabase({ adminUrl, appUrl });
    f = await seedAccess(db.adminUrl);
    pool = new pg.Pool({ connectionString: db.appUrl, max: 4 });
    admin = new pg.Client({ connectionString: db.adminUrl });
    await admin.connect();
  });
  after(async () => {
    await pool?.end();
    await admin?.end();
    await db?.drop();
  });

  it('keeps membership writes out of the app role’s reach; only the definer functions can make them', async () => {
    for (const sql of [
      `INSERT INTO app.tenant_member (tenant_id, subject, role) VALUES ($1, 'fixture:sneaky', 'client-admin')`,
      `UPDATE app.tenant_member SET role = 'client-admin' WHERE tenant_id = $1`,
      `DELETE FROM app.tenant_member WHERE tenant_id = $1`,
      `INSERT INTO app.agency_assignment (agency_id, tenant_id, subject) SELECT agency_id, $1, 'fixture:staff-b' FROM app.tenant WHERE id = $1`,
      `UPDATE app.invitation SET status = 'accepted' WHERE tenant_id = $1`,
    ]) {
      // Not even inside a writable client-admin scope.
      assert.equal(
        await code(withScope(pool, { subject: S.alice, tenantId: f.t.A }, c => c.query(sql, [f.t.A]))),
        '42501',
        sql,
      );
    }
    await assert.rejects(pool.query(`UPDATE app.agency_member SET role = 'owner'`), /permission denied/);
    await assert.rejects(pool.query('SELECT * FROM identity.invitation_token'), /permission denied/);
    const privs = await admin.query(`
      SELECT t, has_table_privilege('agentcity_app', t, 'INSERT') OR has_table_privilege('agentcity_app', t, 'UPDATE')
             OR has_table_privilege('agentcity_app', t, 'DELETE') AS writes
      FROM unnest(ARRAY['app.tenant_member', 'app.agency_member', 'app.agency_assignment', 'app.invitation',
                        'identity.invitation_token']) AS t`);
    assert.deepEqual(
      privs.rows.filter(r => r.writes),
      [],
    );
    // Every new function: owned by the scope role, SECURITY DEFINER with a fixed search_path, not executable by
    // PUBLIC; the private helpers are not executable by the app role at all.
    const fns = await admin.query(`
      SELECT p.oid::regprocedure::text AS f, pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig,
             has_function_privilege('agentcity_app', p.oid, 'EXECUTE') AS app_exec,
             coalesce(p.proacl::text, '') ~ '(^|[{,])=X' AS public_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE (n.nspname = 'app' AND p.proname IN ('list_memberships', 'create_invitation', 'issue_invitation_token',
              'accept_invitation', 'set_member_role', 'remove_member', 'set_assignment'))
         OR (n.nspname = 'app_private' AND p.proname IN ('actor_authority', 'put_client_member', 'put_agency_member',
              'put_token', 'clear_sessions', 'guard_last_admin', 'guard_last_owner', 'check_grant'))`);
    assert.equal(fns.rows.length, 15);
    for (const r of fns.rows) {
      assert.equal(r.owner, 'agentcity_scope', r.f);
      assert.equal(r.prosecdef, true, r.f);
      assert.deepEqual(r.proconfig, ['search_path=pg_catalog, pg_temp'], r.f);
      assert.equal(r.public_exec, false, r.f);
      assert.equal(r.app_exec, r.f.startsWith('app.'), r.f);
    }
    await assert.rejects(
      pool.query(`SELECT app_private.put_client_member($1, 'fixture:sneaky', 'client-admin', NULL)`, [f.t.A]),
      /permission denied/,
    );
    const cls = await admin.query(
      `SELECT class FROM platform.table_classification WHERE table_schema = 'identity' AND table_name = 'invitation_token'`,
    );
    assert.deepEqual(cls.rows, [{ class: 'private' }]);
  });

  it('create_invitation: allow/deny matrix and escalation attempts', async () => {
    // Open (and commit) a support session on B, so "support" is a real, live role there.
    await pool.query('SELECT app.open_support_session($1, $2)', [S.support, f.t.B]);
    const cases: [string, string, string, string, string | null, string][] = [
      // actor, tenant, email, role, workspace, expected
      [S.owner, f.t.A, 'owner-a@example.test', 'client-admin', null, 'ok'],
      [S.owner, f.t.B, 'owner-b@example.test', 'client-viewer', f.ws.B, 'ok'],
      [S.owner, f.t.hq, 'owner-hq@example.test', 'agency-staff', null, 'ok'],
      [S.owner, f.t.hq, 'owner-hq2@example.test', 'agency-owner', null, 'ok'],
      [S.owner, f.t.A, 'owner-a2@example.test', 'agency-staff', null, '42501'], // agency roles only in the agency tenant
      [S.owner, f.t.hq, 'owner-hq3@example.test', 'agency-staff', f.ws.hq, '22023'], // agency roles have no workspace
      [S.alice, f.t.A, 'alice-1@example.test', 'client-viewer', null, 'ok'],
      [S.alice, f.t.A, 'alice-2@example.test', 'client-admin', f.ws.A, 'ok'],
      [S.alice, f.t.A, 'alice-3@example.test', 'agency-staff', null, '42501'], // escalation
      [S.alice, f.t.A, 'alice-4@example.test', 'agency-owner', null, '42501'], // escalation
      [S.alice, f.t.B, 'alice-5@example.test', 'client-viewer', null, '42501'], // another tenant
      [S.alice, f.t.A, 'alice-6@example.test', 'client-viewer', f.ws.B, '22023'], // another tenant's workspace
      [S.alice, f.t.A, 'not-an-email', 'client-viewer', null, '22023'],
      [S.alice, f.t.A, 'alice-7@example.test', 'superuser', null, '22023'],
      [S.carolFloor1, f.t.C, 'floor-1@example.test', 'client-viewer', f.ws.C1, 'ok'],
      [S.carolFloor1, f.t.C, 'floor-2@example.test', 'client-admin', f.ws.C1, 'ok'],
      [S.carolFloor1, f.t.C, 'floor-3@example.test', 'client-viewer', null, '42501'], // tenant-wide: escalation
      [S.carolFloor1, f.t.C, 'floor-4@example.test', 'client-viewer', f.ws.C2, '42501'], // other workspace
      [S.viewerA, f.t.A, 'viewer@example.test', 'client-viewer', null, '42501'],
      [S.staffA, f.t.A, 'staff-a@example.test', 'client-viewer', null, '42501'], // assigned staff
      [S.staffB, f.t.A, 'staff-b@example.test', 'client-viewer', null, '42501'], // unassigned staff
      [S.support, f.t.B, 'support@example.test', 'client-viewer', null, '42501'],
      [S.stranger, f.t.A, 'stranger@example.test', 'client-viewer', null, '42501'],
      [S.alice, randomUUID(), 'nowhere@example.test', 'client-viewer', null, '42501'], // unknown tenant
      ['bad subject|x', f.t.A, 'bad@example.test', 'client-viewer', null, '22023'],
    ];
    for (const [actor, tenant, email, role, ws, expected] of cases) {
      assert.equal(await code(invite(actor, tenant, email, role, ws)), expected, `${actor} ${role} ${email}`);
    }
    // A workspace-limited admin cannot overwrite a tenant-wide invitation by re-inviting the same address.
    await invite(S.carol, f.t.C, 'wide@example.test', 'client-admin');
    assert.equal(await code(invite(S.carolFloor1, f.t.C, 'WIDE@example.test', 'client-viewer', f.ws.C1)), '42501');
    // Audit and outbox: one row each per invitation, and neither holds the token or its hash.
    const created = await invite(S.alice, f.t.A, 'Audited@Example.test', 'client-viewer');
    const ob = await admin.query(
      `SELECT payload FROM app.outbox_event WHERE topic = 'invitation.created' AND payload->>'invitationId' = $1`,
      [created.id],
    );
    assert.equal(ob.rows.length, 1);
    assert.equal(ob.rows[0].payload.email, 'audited@example.test', 'stored lower-case');
    const dump = JSON.stringify(
      (
        await admin.query(
          `SELECT a.detail, o.payload FROM app.audit_event a, app.outbox_event o WHERE a.target_id = $1 AND o.payload->>'invitationId' = $1`,
          [created.id],
        )
      ).rows,
    );
    assert.ok(!dump.includes(created.token) && !dump.includes(created.hash), 'no token material in audit/outbox');
    assert.equal(
      (
        await admin.query(`SELECT count(*)::int AS n FROM identity.invitation_token WHERE token_sha256 = $1`, [
          created.hash,
        ])
      ).rows[0].n,
      1,
      'only the hash is stored',
    );
    assert.equal(await audits('invitation-created', f.t.A), 4, 'owner 1, alice 2, audited 1');
  });

  it('accept_invitation: happy path creates exactly the invited membership', async () => {
    const inv = await invite(S.alice, f.t.A, emailOf(S.dave), 'client-viewer');
    assert.equal(await enters(S.dave, f.t.A), null, 'not a member before accepting');
    const r = await accept(S.dave, inv.hash, emailOf(S.dave).toUpperCase());
    assert.deepEqual(r, { tenant_id: f.t.A, workspace_id: null, role: 'client-viewer' });
    assert.deepEqual(await enters(S.dave, f.t.A), { role: 'client-viewer', write: false });
    // Nothing implicit: no other tenant, no agency membership or assignment.
    assert.equal(await enters(S.dave, f.t.B), null);
    const extra = await admin.query(
      `SELECT (SELECT count(*) FROM app.agency_member WHERE subject = $1)::int + (SELECT count(*) FROM app.agency_assignment WHERE subject = $1)::int AS n`,
      [S.dave],
    );
    assert.equal(extra.rows[0].n, 0);
    const state = await admin.query(
      `SELECT i.status, t.used_by, t.used_at IS NOT NULL AS used FROM app.invitation i JOIN identity.invitation_token t ON t.invitation_id = i.id WHERE i.id = $1`,
      [inv.id],
    );
    assert.deepEqual(state.rows, [{ status: 'accepted', used_by: S.dave, used: true }]);
    assert.equal(await audits('invitation-accepted', f.t.A), 1);
  });

  it('accept_invitation: replayed, expired, replaced, unknown tokens; unverified or mismatched email', async () => {
    const ACI = (p: Promise<unknown>) => code(p);
    // Replayed: the token Dave used above is gone for good, for him and for anyone else.
    const inv = await invite(S.alice, f.t.A, emailOf(S.erin), 'client-viewer');
    // Unknown and malformed tokens.
    assert.equal(await ACI(accept(S.erin, newToken().hash)), 'ACI01');
    assert.equal(await ACI(accept(S.erin, 'not-a-hash')), 'ACI01');
    // Wrong person (email mismatch) and unverified email: refused without using up the token.
    assert.equal(await ACI(accept(S.erin, inv.hash, 'someone-else@example.test')), 'ACI04');
    assert.equal(await ACI(accept(S.erin, inv.hash, emailOf(S.erin), false)), 'ACI05');
    assert.equal(await ACI(accept(S.erin, inv.hash, null)), 'ACI05');
    // Error messages name no tenant, email or person.
    try {
      await accept(S.stranger, inv.hash, 'stranger@example.test');
      assert.fail('should be refused');
    } catch (e) {
      const msg = (e as Error).message;
      assert.ok(!msg.includes(emailOf(S.erin)) && !msg.includes(f.t.A) && !msg.includes('Fixture'), msg);
    }
    // Re-inviting replaces the earlier token.
    const again = await invite(S.alice, f.t.A, emailOf(S.erin), 'client-viewer');
    assert.equal(await ACI(accept(S.erin, inv.hash)), 'ACI03', 'replaced token');
    // Expired.
    await admin.query(
      `UPDATE identity.invitation_token SET created_at = now() - interval '49 hours', expires_at = now() - interval '1 hour' WHERE token_sha256 = $1`,
      [again.hash],
    );
    assert.equal(await ACI(accept(S.erin, again.hash)), 'ACI02', 'expired');
    assert.equal(await enters(S.erin, f.t.A), null);
    // A fresh link works once; the replay fails.
    const fresh = await invite(S.alice, f.t.A, emailOf(S.erin), 'client-viewer');
    await accept(S.erin, fresh.hash);
    assert.equal(await ACI(accept(S.erin, fresh.hash)), 'ACI03', 'replayed');
    assert.equal(await ACI(accept(S.stranger, fresh.hash, emailOf(S.erin))), 'ACI03', 'replayed by someone else');
  });

  it('accept_invitation: of two concurrent accepts of one token, exactly one wins', async () => {
    const subject = 'fixture:race';
    const inv = await invite(S.alice, f.t.A, emailOf(subject), 'client-viewer');
    const c1 = await pool.connect();
    const c2 = await pool.connect();
    try {
      await c1.query('BEGIN');
      await c2.query('BEGIN');
      await c1.query('SELECT * FROM app.accept_invitation($1, $2, true, $3)', [subject, emailOf(subject), inv.hash]);
      // c2 blocks on the token row until c1 commits, then finds it used.
      const second = c2.query('SELECT * FROM app.accept_invitation($1, $2, true, $3)', [
        subject,
        emailOf(subject),
        inv.hash,
      ]);
      const secondCode = code(second);
      await new Promise(r => setTimeout(r, 100));
      await c1.query('COMMIT');
      assert.equal(await secondCode, 'ACI03');
      await c2.query('ROLLBACK');
    } finally {
      c1.release();
      c2.release();
    }
    // Also with both racing freely on separate connections.
    const inv2 = await invite(S.alice, f.t.A, 'race-2@example.test', 'client-viewer');
    const results = await Promise.allSettled([
      accept('fixture:race-2', inv2.hash, 'race-2@example.test'),
      accept('fixture:race-2b', inv2.hash, 'race-2@example.test'),
      accept('fixture:race-2c', inv2.hash, 'race-2@example.test'),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(
      (await admin.query(`SELECT count(*)::int AS n FROM app.tenant_member WHERE subject LIKE 'fixture:race-2%'`))
        .rows[0].n,
      1,
    );
  });

  it('agency invitations grant only the agency membership; staff assignment is a separate owner decision', async () => {
    const subject = 'fixture:new-staff';
    const inv = await invite(S.owner, f.t.hq, emailOf(subject), 'agency-staff');
    await accept(subject, inv.hash);
    const m = await admin.query('SELECT role FROM app.agency_member WHERE subject = $1', [subject]);
    assert.deepEqual(m.rows, [{ role: 'staff' }]);
    assert.equal(await enters(subject, f.t.A), null, 'no implicit assignment');
    assert.equal(await enters(subject, f.t.hq), null);
    // set_assignment: owner only.
    for (const actor of [S.alice, S.staffA, S.viewerA, S.support, S.stranger]) {
      assert.equal(await code(assign(actor, f.t.A, subject, true)), '42501', actor);
    }
    assert.equal(await code(assign(S.owner, f.t.A, S.alice, true)), 'ACM02', 'only agency staff can be assigned');
    assert.equal(await assign(S.owner, f.t.A, subject, true), true);
    assert.equal(await assign(S.owner, f.t.A, subject, true), false, 'idempotent');
    assert.deepEqual(await enters(subject, f.t.A), { role: 'agency-staff', write: true });
    assert.equal(await enters(subject, f.t.B), null, 'only the assigned tenant');
    // Unassigning ends access at once and clears a session pointing there.
    const sid = await seedSession(admin, subject);
    await admin.query('UPDATE identity.session SET tenant_id = $1 WHERE id = $2', [f.t.A, sid]);
    assert.equal(await assign(S.owner, f.t.A, subject, false), true);
    assert.equal(await assign(S.owner, f.t.A, subject, false), false);
    assert.equal(await enters(subject, f.t.A), null);
    assert.equal(
      (await admin.query('SELECT tenant_id FROM identity.session WHERE id = $1', [sid])).rows[0].tenant_id,
      null,
    );
    assert.equal(await audits('staff-assigned', f.t.A), 1);
    assert.equal(await audits('staff-unassigned', f.t.A), 1);
  });

  it('issue_invitation_token: owners only, for pending invitations (e.g. from the legacy import)', async () => {
    const legacy = randomUUID();
    await admin.query(
      `INSERT INTO app.invitation (tenant_id, id, email, role, provenance) VALUES ($1, $2, 'legacy-user@example.test', 'client-viewer', '{"source":"legacy-import"}')`,
      [f.t.B, legacy],
    );
    const issue = (actor: string, tenant: string, id: string) => {
      const t = newToken();
      return pool
        .query('SELECT app.issue_invitation_token($1, $2, $3, $4, $5::interval) AS e', [
          actor,
          tenant,
          id,
          t.hash,
          '48 hours',
        ])
        .then(() => t);
    };
    for (const actor of [S.bob, S.staffA, S.support, S.stranger, S.alice]) {
      assert.equal(await code(issue(actor, f.t.B, legacy)), '42501', actor);
    }
    assert.equal(await code(issue(S.owner, f.t.B, randomUUID())), 'ACM02');
    assert.equal(await code(issue(S.owner, f.t.A, legacy)), 'ACM02', 'invitation of another tenant');
    const first = await issue(S.owner, f.t.B, legacy);
    const t = await issue(S.owner, f.t.B, legacy);
    assert.equal(
      await code(accept('fixture:legacy-user', first.hash, 'legacy-user@example.test')),
      'ACI03',
      'replaced',
    );
    await accept('fixture:legacy-user', t.hash, 'legacy-user@example.test');
    assert.deepEqual(await enters('fixture:legacy-user', f.t.B), { role: 'client-viewer', write: false });
    assert.equal(await code(issue(S.owner, f.t.B, legacy)), 'ACI03', 'already accepted');
    assert.equal(await audits('invitation-token-issued', f.t.B), 2);
  });

  it('set_member_role: allow/deny matrix; the change is visible to enter_scope immediately', async () => {
    const sid = await seedSession(admin, S.viewerA);
    await admin.query('UPDATE identity.session SET tenant_id = $1 WHERE id = $2', [f.t.A, sid]);
    // Nobody without authority can change (or probe) roles.
    for (const actor of [S.viewerA, S.staffA, S.staffB, S.support, S.stranger, S.bob]) {
      assert.equal(await code(setRole(actor, f.t.A, S.viewerA, 'client-admin')), '42501', actor);
      assert.equal(await code(setRole(actor, f.t.A, 'fixture:nobody', 'client-admin')), '42501', actor);
    }
    assert.equal(await code(setRole(S.alice, f.t.A, 'fixture:nobody', 'client-viewer')), 'ACM02');
    assert.equal(await code(setRole(S.alice, f.t.A, S.viewerA, 'agency-owner')), '42501', 'escalation');
    // Promote: immediately a writable admin scope.
    assert.deepEqual(await enters(S.viewerA, f.t.A), { role: 'client-viewer', write: false });
    const r = await setRole(S.alice, f.t.A, S.viewerA, 'client-admin');
    assert.deepEqual(r.rows[0], { previous_role: 'client-viewer', affected_tenants: [f.t.A] });
    assert.deepEqual(await enters(S.viewerA, f.t.A), { role: 'client-admin', write: true });
    assert.equal(
      (await admin.query('SELECT tenant_id FROM identity.session WHERE id = $1', [sid])).rows[0].tenant_id,
      null,
    );
    // Demote back (alice remains the tenant-wide admin).
    await setRole(S.alice, f.t.A, S.viewerA, 'client-viewer');
    assert.deepEqual(await enters(S.viewerA, f.t.A), { role: 'client-viewer', write: false });
    // A workspace-limited admin manages only its own workspace's members, and cannot widen anyone.
    assert.equal(await code(setRole(S.carolFloor1, f.t.C, S.carol, 'client-viewer', f.ws.C1)), '42501');
    assert.equal(await code(setRole(S.carolFloor1, f.t.C, S.carolFloor1, 'client-admin', null)), '42501');
    // The agency owner can change client roles; agency roles only in the agency tenant.
    await setRole(S.owner, f.t.C, S.carolFloor1, 'client-viewer', f.ws.C1);
    assert.deepEqual(await enters(S.carolFloor1, f.t.C, f.ws.C1), { role: 'client-viewer', write: false });
    await setRole(S.owner, f.t.C, S.carolFloor1, 'client-admin', f.ws.C1);
    assert.equal(await code(setRole(S.owner, f.t.A, S.staffA, 'agency-owner')), '42501');
    await setRole(S.owner, f.t.hq, S.staffB, 'agency-owner');
    assert.deepEqual(await enters(S.staffB, f.t.B), { role: 'agency-owner', write: true });
    await setRole(S.owner, f.t.hq, S.staffB, 'agency-staff');
    assert.equal(await enters(S.staffB, f.t.B), null);
    assert.ok((await audits('member-role-changed', f.t.A)) >= 2);
  });

  it('protects the last tenant-wide client admin (and the last agency owner), even under concurrency', async () => {
    assert.equal(await code(setRole(S.alice, f.t.A, S.alice, 'client-viewer')), 'ACM01');
    assert.equal(await code(setRole(S.alice, f.t.A, S.alice, 'client-admin', f.ws.A)), 'ACM01', 'narrowing counts');
    assert.equal(await code(remove(S.alice, f.t.A, S.alice)), 'ACM01');
    assert.equal(await code(remove(S.owner, f.t.A, S.alice)), 'ACM01', 'the owner too');
    assert.equal(await code(remove(S.owner, f.t.hq, S.owner)), 'ACM01', 'last agency owner');
    assert.equal(await code(setRole(S.owner, f.t.hq, S.owner, 'agency-staff')), 'ACM01');
    // Two tenant-wide admins removing each other at the same time: only one succeeds.
    const bob2 = 'fixture:bob-2';
    await accept(bob2, (await invite(S.bob, f.t.B, emailOf(bob2), 'client-admin')).hash);
    const c1 = await pool.connect();
    const c2 = await pool.connect();
    try {
      await c1.query('BEGIN');
      await c2.query('BEGIN');
      await c1.query('SELECT * FROM app.remove_member($1, $2, $3)', [S.bob, f.t.B, bob2]);
      const other = code(c2.query('SELECT * FROM app.remove_member($1, $2, $3)', [bob2, f.t.B, S.bob]));
      await new Promise(r => setTimeout(r, 100));
      await c1.query('COMMIT');
      assert.equal(await other, '42501', 'bob-2 lost authority while waiting');
      await c2.query('ROLLBACK');
    } finally {
      c1.release();
      c2.release();
    }
    assert.deepEqual(await enters(S.bob, f.t.B), { role: 'client-admin', write: true });
    assert.equal(await enters(bob2, f.t.B), null);
  });

  it('remove_member: allow/deny; the removed member loses enter_scope; queued work re-checks and fails; re-invitation restores', async () => {
    const victim = S.viewerA;
    const job = () =>
      withActorScope(pool, { subject: victim, tenantId: f.t.A }, async c =>
        Number((await c.query('SELECT count(*) AS n FROM app.contact')).rows[0].n),
      );
    // Work queued while the person is a member runs.
    assert.ok((await job()) >= 1);
    for (const actor of [S.viewerA, S.staffA, S.support, S.stranger, S.bob]) {
      assert.equal(await code(remove(actor, f.t.A, victim)), '42501', actor);
    }
    assert.equal(await code(remove(S.carolFloor1, f.t.C, S.carol)), '42501', 'workspace-limited admin, wide member');
    assert.equal(await code(remove(S.alice, f.t.A, 'fixture:nobody')), 'ACM02');
    const sid = await seedSession(admin, victim);
    await admin.query('UPDATE identity.session SET tenant_id = $1 WHERE id = $2', [f.t.A, sid]);
    const r = await remove(S.alice, f.t.A, victim);
    assert.deepEqual(r.rows[0], { removed_role: 'client-viewer', affected_tenants: [f.t.A] });
    assert.equal(await enters(victim, f.t.A), null);
    assert.equal(
      (await admin.query('SELECT tenant_id FROM identity.session WHERE id = $1', [sid])).rows[0].tenant_id,
      null,
    );
    // The same queued work, executed now, fails its membership check instead of running on stale permission.
    await assert.rejects(job(), (e: unknown) => e instanceof ActorNotAuthorizedError && e.nonRetryable);
    await assert.rejects(
      withActorScope(pool, { subject: S.viewerA, tenantId: f.t.B }, async () => 1),
      ActorNotAuthorizedError,
    );
    // A refusal by row-level security inside the work is not mistaken for a lost membership.
    await assert.rejects(
      withActorScope(pool, { subject: S.dave, tenantId: f.t.A }, c =>
        c.query(`INSERT INTO app.note (tenant_id, workspace_id, id, body, created_by) VALUES ($1, $2, $3, 'x', 'x')`, [
          f.t.A,
          f.ws.A,
          randomUUID(),
        ]),
      ),
      (e: unknown) => !(e instanceof ActorNotAuthorizedError) && /row-level security/.test(String(e)),
    );
    // Re-invited and accepted: access (and the queued work) works again.
    await accept(victim, (await invite(S.alice, f.t.A, emailOf(victim), 'client-viewer')).hash);
    assert.deepEqual(await enters(victim, f.t.A), { role: 'client-viewer', write: false });
    assert.ok((await job()) >= 1);
    // Removing an agency person from the agency tenant ends the agency membership and all assignments.
    await accept('fixture:leaver', (await invite(S.owner, f.t.hq, emailOf('fixture:leaver'), 'agency-staff')).hash);
    await assign(S.owner, f.t.B, 'fixture:leaver', true);
    assert.ok(await enters('fixture:leaver', f.t.B));
    assert.equal(await code(remove(S.alice, f.t.hq, 'fixture:leaver')), '42501');
    const gone = await remove(S.owner, f.t.hq, 'fixture:leaver');
    assert.equal(gone.rows[0].removed_role, 'agency-staff');
    assert.ok((gone.rows[0].affected_tenants as string[]).includes(f.t.B));
    assert.equal(await enters('fixture:leaver', f.t.B), null);
    assert.ok((await audits('member-removed', f.t.A)) >= 1);
  });

  it('tenant switching: only into a tenant the person can enter (proved with enter_scope)', async () => {
    const sid = await seedSession(admin, S.alice);
    // What POST /api/session/tenant does: enter scope, then store the choice, in one transaction.
    const switchTo = (tenantId: string, workspaceId: string | null = null) =>
      withScope(pool, { subject: S.alice, tenantId, workspaceId }, c =>
        c.query('UPDATE identity.session SET tenant_id = $1, workspace_id = $2 WHERE id = $3 AND subject = $4', [
          tenantId,
          workspaceId,
          sid,
          S.alice,
        ]),
      );
    await switchTo(f.t.A);
    assert.equal(await code(switchTo(f.t.B)), '42501');
    assert.equal(await code(switchTo(f.t.A, f.ws.B)), '42501', 'another tenant’s workspace');
    assert.equal(await code(switchTo(randomUUID())), '42501');
    const s = await admin.query('SELECT tenant_id, workspace_id FROM identity.session WHERE id = $1', [sid]);
    assert.deepEqual(s.rows[0], { tenant_id: f.t.A, workspace_id: null }, 'refused switches change nothing');
  });

  it('list_memberships: tenants and workspaces with the role enter_scope would give', async () => {
    const list = async (subject: string) =>
      (await pool.query('SELECT * FROM app.list_memberships($1)', [subject])).rows.map(r => ({
        tenant: r.tenant_id,
        role: r.role,
        ws: (r.workspaces as { id: string }[]).map(w => w.id).sort(),
      }));
    const owner = await list(S.owner);
    assert.deepEqual(new Set(owner.map(m => m.tenant)), new Set([f.t.A, f.t.B, f.t.C, f.t.demo, f.t.hq]));
    assert.ok(owner.every(m => m.role === 'agency-owner'));
    assert.deepEqual(await list(S.carolFloor1), [{ tenant: f.t.C, role: 'client-admin', ws: [f.ws.C1] }]);
    assert.deepEqual(await list(S.carol), [{ tenant: f.t.C, role: 'client-admin', ws: [f.ws.C1, f.ws.C2].sort() }]);
    assert.deepEqual(await list(S.staffA), [{ tenant: f.t.A, role: 'agency-staff', ws: [f.ws.A] }]);
    assert.deepEqual(await list(S.support), [{ tenant: f.t.B, role: 'support', ws: [f.ws.B] }]);
    assert.deepEqual(await list(S.stranger), []);
    assert.equal(await code(list('bad subject|x')), '22023');
  });
});
