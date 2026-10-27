import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { withScope, type Scope } from '../src/index.ts';
import { createTestDatabase } from '../src/testing.ts';
import { SUBJECTS, seedTenancy } from './tenancy-fixture.ts';

/**
 * Database-level tenant isolation, exercised with the real application role (agentcity_app: not superuser, not
 * BYPASSRLS, not table owner) against a freshly migrated database. Needs `pnpm infra:up`.
 */
const adminUrl = process.env.DATABASE_ADMIN_URL;
const appUrl = process.env.DATABASE_URL;

describe('tenant isolation (row-level security, app role)', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let f: Awaited<ReturnType<typeof seedTenancy>>;
  let pool: pg.Pool;
  let admin: pg.Client;

  const A = (): Scope => ({ subject: SUBJECTS.alice, tenantId: f.t.A });
  const B = (): Scope => ({ subject: SUBJECTS.bob, tenantId: f.t.B });
  const asA = <T>(fn: (c: pg.PoolClient) => Promise<T>) => withScope(pool, A(), fn);
  const ids = (r: pg.QueryResult) => r.rows.map(x => x.id).sort();
  const count = async (sql: string, params: unknown[] = []) => Number((await admin.query(sql, params)).rows[0].n);

  before(async () => {
    assert.ok(adminUrl && appUrl, 'DATABASE_ADMIN_URL and DATABASE_URL must be set (see infra/local-dev.env)');
    db = await createTestDatabase({ adminUrl, appUrl });
    f = await seedTenancy(db.adminUrl);
    pool = new pg.Pool({ connectionString: db.appUrl, max: 1 }); // one connection: every test reuses it
    admin = new pg.Client({ connectionString: db.adminUrl });
    await admin.connect();
  });
  after(async () => {
    await pool?.end();
    await admin?.end();
    await db?.drop();
  });

  it('connects as a role that cannot bypass row-level security', async () => {
    const r = await pool.query(
      `SELECT r.rolsuper, r.rolbypassrls, (SELECT count(*) FROM pg_class c WHERE c.relowner = r.oid)::int AS owns
       FROM pg_roles r WHERE r.rolname = current_user`,
    );
    assert.deepEqual(r.rows[0], { rolsuper: false, rolbypassrls: false, owns: 0 });
  });

  it('sees nothing in any tenant table without a scope (fails closed)', async () => {
    const tables = await admin.query(
      `SELECT format('%I.%I', table_schema, table_name) AS t FROM platform.table_classification WHERE class IN ('tenant', 'agency')`,
    );
    assert.ok(tables.rows.length >= 25);
    for (const { t } of tables.rows) {
      const r = await pool.query(`SELECT count(*)::int AS n FROM ${t}`);
      assert.equal(r.rows[0].n, 0, `${t} must be empty without a scope`);
    }
  });

  it('SELECT and joins return only the scoped tenant', async () => {
    await asA(async c => {
      assert.deepEqual(ids(await c.query('SELECT id FROM app.contact')), [f.contacts.A]);
      const j = await c.query(
        `SELECT o.id, ct.tenant_id AS ct, n.tenant_id AS nt FROM app.opportunity o
         JOIN app.contact ct ON ct.tenant_id = o.tenant_id AND ct.id = o.contact_id
         LEFT JOIN app.note n ON n.contact_id = ct.id`,
      );
      assert.deepEqual(j.rows, [{ id: f.opps.A, ct: f.t.A, nt: f.t.A }]);
      // Even a join that names another tenant's ids directly finds nothing.
      const cross = await c.query('SELECT * FROM app.contact WHERE id = ANY($1)', [[f.contacts.B, f.contacts.C1]]);
      assert.equal(cross.rowCount, 0);
      assert.deepEqual(ids(await c.query('SELECT id FROM app.tenant')), [f.t.A]);
    });
  });

  it('BM25 search returns only the scoped tenant’s rows, ranked', async () => {
    assert.equal(
      await count(`SELECT count(*) AS n FROM app.note WHERE body @@@ 'hybrid'`),
      4,
      'all four match as admin',
    );
    // Directly through RLS: correct rows (but unranked; see app.search_notes in the migration).
    const direct = (s: Scope) =>
      withScope(pool, s, async c =>
        (await c.query(`SELECT id FROM app.note WHERE body @@@ 'hybrid'`)).rows.map(r => r.id),
      );
    assert.deepEqual(await direct(A()), [f.notes.A]);
    assert.deepEqual(await direct(B()), [f.notes.B]);
    // Ranked search through the scoped function.
    const ranked = (s: Scope) =>
      withScope(pool, s, async c => (await c.query(`SELECT id, score FROM app.search_notes('hybrid')`)).rows);
    const a = await ranked(A());
    assert.deepEqual(
      a.map(r => r.id),
      [f.notes.A],
    );
    assert.ok(a[0].score > 0, 'has a BM25 score');
    assert.deepEqual(
      (await ranked(B())).map(r => r.id),
      [f.notes.B],
    );
    assert.deepEqual(
      (
        await withScope(
          pool,
          { subject: SUBJECTS.carolFloor1, tenantId: f.t.C, workspaceId: f.ws.C1 },
          async c => (await c.query(`SELECT id FROM app.search_notes('hybrid')`)).rows,
        )
      ).map(r => r.id),
      [f.notes.C1],
    );
    assert.equal(
      (await pool.query(`SELECT count(*)::int AS n FROM app.search_notes('hybrid')`)).rows[0].n,
      0,
      'no scope, no results',
    );
    const plan = await asA(async c =>
      (await c.query(`EXPLAIN (VERBOSE) SELECT * FROM app.search_notes('hybrid')`)).rows
        .map(r => r['QUERY PLAN'])
        .join('\n'),
    );
    assert.match(plan, /Function Scan/);
  });

  it('INSERT into another tenant is refused', async () => {
    await assert.rejects(
      asA(c =>
        c.query(
          `INSERT INTO app.contact (tenant_id, workspace_id, id, display_name, kind) VALUES ($1, $2, $3, 'Fixture forged', 'customer')`,
          [f.t.B, f.ws.B, randomUUID()],
        ),
      ),
      /row-level security/,
    );
    // Writing into the scoped tenant works.
    await asA(c =>
      c.query(
        `INSERT INTO app.contact (tenant_id, workspace_id, id, display_name, kind) VALUES ($1, $2, $3, 'Fixture new A', 'customer')`,
        [f.t.A, f.ws.A, randomUUID()],
      ),
    );
  });

  it('UPDATE and DELETE cannot reach another tenant, and cannot move a row out of the tenant', async () => {
    const before = await admin.query('SELECT display_name FROM app.contact WHERE id = $1', [f.contacts.B]);
    await asA(async c => {
      assert.equal(
        (await c.query(`UPDATE app.contact SET display_name = 'hacked' WHERE id = $1`, [f.contacts.B])).rowCount,
        0,
      );
      assert.equal((await c.query('DELETE FROM app.note WHERE id = $1', [f.notes.B])).rowCount, 0);
    });
    await assert.rejects(
      asA(c => c.query('UPDATE app.contact SET tenant_id = $1 WHERE id = $2', [f.t.B, f.contacts.A])),
      /row-level security|violates foreign key/,
    );
    assert.deepEqual(
      (await admin.query('SELECT display_name FROM app.contact WHERE id = $1', [f.contacts.B])).rows,
      before.rows,
    );
    assert.equal(await count('SELECT count(*) AS n FROM app.note WHERE id = $1', [f.notes.B]), 1);
  });

  it('a client on rental L1 cannot reach the client on L2 of the same building', async () => {
    // Same building (Rental Building 1), different floors and tenants.
    const sameBuilding = await admin.query(
      `SELECT count(DISTINCT building_id)::int AS n FROM catalog.floor WHERE id = ANY($1)`,
      [[f.floors.r1L1, f.floors.r1L2]],
    );
    assert.equal(sameBuilding.rows[0].n, 1);
    await assert.rejects(
      withScope(pool, { subject: SUBJECTS.alice, tenantId: f.t.B }, async () => {}),
      /not authorized for this tenant/,
    );
    await assert.rejects(
      withScope(pool, { subject: SUBJECTS.alice, tenantId: f.t.A, workspaceId: f.ws.B }),
      /not authorized for this workspace/,
    );
    await asA(async c => {
      // The public map shows both floors; only A's placement and data are visible.
      assert.equal(
        (await c.query('SELECT id FROM catalog.floor WHERE id = ANY($1)', [[f.floors.r1L1, f.floors.r1L2]])).rowCount,
        2,
      );
      const placements = await c.query('SELECT floor_id FROM app.workspace_placement');
      assert.deepEqual(placements.rows, [{ floor_id: f.floors.r1L1 }]);
    });
  });

  it('a member limited to one workspace cannot see the tenant’s other floor', async () => {
    const floor1 = { subject: SUBJECTS.carolFloor1, tenantId: f.t.C, workspaceId: f.ws.C1 };
    await assert.rejects(withScope(pool, { ...floor1, workspaceId: null }), /not authorized for this workspace/);
    await assert.rejects(withScope(pool, { ...floor1, workspaceId: f.ws.C2 }), /not authorized for this workspace/);
    await withScope(pool, floor1, async c => {
      assert.deepEqual(ids(await c.query('SELECT id FROM app.contact')), [f.contacts.C1]);
      assert.deepEqual(
        (await c.query(`SELECT id FROM app.note WHERE body @@@ 'hybrid'`)).rows.map(r => r.id),
        [f.notes.C1],
      );
    });
    await assert.rejects(
      withScope(pool, floor1, c =>
        c.query(
          `INSERT INTO app.contact (tenant_id, workspace_id, id, display_name, kind) VALUES ($1, $2, $3, 'Fixture x', 'customer')`,
          [f.t.C, f.ws.C2, randomUUID()],
        ),
      ),
      /row-level security/,
    );
    // The tenant-wide admin sees both floors.
    await withScope(pool, { subject: SUBJECTS.carol, tenantId: f.t.C }, async c => {
      assert.deepEqual(ids(await c.query('SELECT id FROM app.contact')), [f.contacts.C1, f.contacts.C2].sort());
    });
  });

  it('a pooled connection never carries scope into the next transaction', async () => {
    const pidInScope = await asA(async c => (await c.query('SELECT pg_backend_pid() AS p')).rows[0].p);
    const after = await pool.query(
      'SELECT pg_backend_pid() AS p, app.current_tenant_id() AS t, (SELECT count(*)::int FROM app.contact) AS n',
    );
    assert.deepEqual(after.rows[0], { p: pidInScope, t: null, n: 0 }, 'same connection, no scope, no rows');
    // After a failure inside a scoped transaction, too.
    await assert.rejects(
      asA(c => c.query('SELECT 1/0')),
      /division by zero/,
    );
    const afterError = await pool.query('SELECT pg_backend_pid() AS p, app.current_tenant_id() AS t');
    assert.deepEqual(afterError.rows[0], { p: pidInScope, t: null });
    // And B, on the same connection next, sees only B.
    await withScope(pool, B(), async c =>
      assert.deepEqual(ids(await c.query('SELECT id FROM app.contact')), [f.contacts.B]),
    );
  });

  it('rejects forged, tampered and replayed scope values', async () => {
    const c = await pool.connect();
    try {
      // Hand-made value: right shape, wrong signature.
      await c.query('BEGIN');
      const xid = (await c.query('SELECT pg_current_xact_id()::text AS x, pg_backend_pid() AS p')).rows[0];
      await c.query(`SELECT set_config('app.scope', $1, true)`, [
        `v1|${f.t.B}|-|${f.t.agency}|client-admin|1|${SUBJECTS.alice}|${xid.x}|${xid.p}.${'0'.repeat(64)}`,
      ]);
      assert.equal((await c.query('SELECT app.current_tenant_id() AS t')).rows[0].t, null);
      assert.equal((await c.query('SELECT count(*)::int AS n FROM app.contact')).rows[0].n, 0);
      // Settings the policies do not use change nothing.
      await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [f.t.B]);
      assert.equal((await c.query('SELECT count(*)::int AS n FROM app.contact')).rows[0].n, 0);
      await c.query('ROLLBACK');

      // A genuine value with the tenant swapped keeps an invalid signature.
      await c.query('BEGIN');
      await c.query('SELECT app.enter_scope($1, $2)', [SUBJECTS.alice, f.t.A]);
      const valid = (await c.query(`SELECT current_setting('app.scope') AS s`)).rows[0].s as string;
      assert.equal((await c.query('SELECT app.current_tenant_id() AS t')).rows[0].t, f.t.A);
      await assert.rejects(c.query('SELECT app.enter_scope($1, $2)', [SUBJECTS.bob, f.t.B]), /already set/);
      await c.query('ROLLBACK');
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.scope', $1, true)`, [valid.replace(f.t.A, f.t.B)]);
      assert.equal((await c.query('SELECT count(*)::int AS n FROM app.contact')).rows[0].n, 0, 'tampered');
      await c.query('ROLLBACK');

      // The exact valid value, replayed in a later transaction, is dead.
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.scope', $1, true)`, [valid]);
      assert.equal((await c.query('SELECT app.current_tenant_id() AS t')).rows[0].t, null, 'replayed');
      await c.query('ROLLBACK');

      // The signing key and the private functions are out of reach.
      await assert.rejects(c.query('SELECT key FROM app_private.scope_key'), /permission denied/);
      await assert.rejects(c.query('SELECT app_private.scope_fields()'), /permission denied/);
      await assert.rejects(c.query('SELECT * FROM migration.quarantine'), /permission denied/);
      await assert.rejects(c.query('ALTER TABLE app.contact DISABLE ROW LEVEL SECURITY'), /must be owner/);
      await assert.rejects(c.query('SET row_security = off; SELECT * FROM app.contact'), /row-level security/);
    } finally {
      await c.query('ROLLBACK').catch(() => {});
      c.release();
    }
  });

  it('checks who may enter a scope: unknown people, staff assignments, viewers and support', async () => {
    await assert.rejects(
      withScope(pool, { subject: SUBJECTS.stranger, tenantId: f.t.A }),
      /not authorized for this tenant/,
    );
    await assert.rejects(withScope(pool, { subject: 'bad subject|x', tenantId: f.t.A }), /invalid subject/);
    await assert.rejects(
      withScope(pool, { subject: SUBJECTS.alice, tenantId: randomUUID() }),
      /not authorized for this tenant/,
    );
    // Staff: only assigned tenants. Owner: all tenants of the agency.
    await withScope(pool, { subject: SUBJECTS.staffA, tenantId: f.t.A }, async c =>
      assert.deepEqual(
        ids(await c.query('SELECT id FROM app.contact')),
        [f.contacts.A]
          .concat(
            (await c.query(`SELECT id FROM app.contact WHERE display_name = 'Fixture new A'`)).rows.map(r => r.id),
          )
          .sort(),
      ),
    );
    await assert.rejects(withScope(pool, { subject: SUBJECTS.staffA, tenantId: f.t.B }), /not authorized/);
    await withScope(pool, { subject: SUBJECTS.owner, tenantId: f.t.B }, async c =>
      assert.deepEqual(ids(await c.query('SELECT id FROM app.contact')), [f.contacts.B]),
    );
    // A viewer reads but cannot write.
    const insertNote = (c: pg.PoolClient, tenant: string, ws: string) =>
      c.query(
        `INSERT INTO app.note (tenant_id, workspace_id, id, body, created_by) VALUES ($1, $2, $3, 'Fixture', 'x')`,
        [tenant, ws, randomUUID()],
      );
    await assert.rejects(
      withScope(pool, { subject: SUBJECTS.viewerA, tenantId: f.t.A }, c => insertNote(c, f.t.A, f.ws.A)),
      /row-level security/,
    );
    // Support: a live grant is not enough; a session must be opened and committed first, and it is audited.
    const support = { subject: SUBJECTS.support, tenantId: f.t.B };
    await assert.rejects(withScope(pool, support), /not authorized for this tenant/);
    const sameTx = await pool.connect();
    try {
      await sameTx.query('BEGIN');
      await sameTx.query('SELECT app.open_support_session($1, $2)', [SUBJECTS.support, f.t.B]);
      await assert.rejects(sameTx.query('SELECT app.enter_scope($1, $2)', [SUBJECTS.support, f.t.B]), /not authorized/);
    } finally {
      await sameTx.query('ROLLBACK');
      sameTx.release();
    }
    const audits = await count(`SELECT count(*) AS n FROM app.audit_event WHERE action = 'support-session-opened'`);
    await pool.query('SELECT app.open_support_session($1, $2)', [SUBJECTS.support, f.t.B]);
    await assert.rejects(
      pool.query('SELECT app.open_support_session($1, $2)', [SUBJECTS.support, f.t.A]),
      /no active support grant/,
    );
    assert.equal(
      await count(`SELECT count(*) AS n FROM app.audit_event WHERE action = 'support-session-opened'`),
      audits + 1,
    );
    await withScope(pool, support, async c =>
      assert.deepEqual(ids(await c.query('SELECT id FROM app.contact')), [f.contacts.B]),
    );
    await assert.rejects(
      withScope(pool, { subject: SUBJECTS.support, tenantId: f.t.B }, c => insertNote(c, f.t.B, f.ws.B)),
      /row-level security/,
    );
    await assert.rejects(withScope(pool, { subject: SUBJECTS.support, tenantId: f.t.A }), /not authorized/);
  });

  it('foreign keys reject cross-tenant references, even for a role that bypasses RLS', async () => {
    // As admin (superuser, RLS bypassed): the composite key alone refuses the association.
    await assert.rejects(
      admin.query(
        `INSERT INTO app.opportunity (tenant_id, workspace_id, id, contact_id, stage) VALUES ($1, $2, $3, $4, 'new')`,
        [f.t.A, f.ws.A, randomUUID(), f.contacts.B],
      ),
      /violates foreign key constraint/,
    );
    await assert.rejects(
      admin.query(
        `INSERT INTO app.contact (tenant_id, workspace_id, id, display_name, kind) VALUES ($1, $2, $3, 'x', 'customer')`,
        [f.t.A, f.ws.B, randomUUID()],
      ),
      /violates foreign key constraint/,
    );
    // And as the app role in scope.
    await assert.rejects(
      asA(c =>
        c.query(
          `INSERT INTO app.note (tenant_id, workspace_id, id, contact_id, body, created_by) VALUES ($1, $2, $3, $4, 'x', 'x')`,
          [f.t.A, f.ws.A, randomUUID(), f.contacts.B],
        ),
      ),
      /violates foreign key constraint/,
    );
  });

  it('keeps unique keys per tenant: the same external id can exist in two tenants, never twice in one', async () => {
    const add = (s: Scope, tenant: string, ws: string, contact: string) =>
      withScope(pool, s, c =>
        c.query(
          `INSERT INTO app.contact_external_id (tenant_id, workspace_id, contact_id, provider, external_id) VALUES ($1, $2, $3, 'crm', 'EXT-1')`,
          [tenant, ws, contact],
        ),
      );
    await add(A(), f.t.A, f.ws.A, f.contacts.A);
    await add(B(), f.t.B, f.ws.B, f.contacts.B);
    await assert.rejects(add(A(), f.t.A, f.ws.A, f.contacts.A), /duplicate key/);
  });

  it('keeps facts immutable and approvals bound to one revision', async () => {
    const draft = randomUUID();
    const approval = randomUUID();
    await asA(async c => {
      await c.query(
        `INSERT INTO app.draft_revision (tenant_id, workspace_id, id, contact_id, channel, recipient, body, body_sha256, created_by)
         VALUES ($1, $2, $3, $4, 'email', 'a@example.test', 'Fixture body', 'caller-supplied-hash', 'fixture')`,
        [f.t.A, f.ws.A, draft, f.contacts.A],
      );
      const h = (await c.query('SELECT body_sha256 FROM app.draft_revision WHERE id = $1', [draft])).rows[0]
        .body_sha256;
      assert.match(h, /^[0-9a-f]{64}$/, 'the database computes the hash, ignoring the caller');
      await c.query(
        `INSERT INTO app.approval (tenant_id, workspace_id, id, draft_revision_id, expires_at) VALUES ($1, $2, $3, $4, now() + interval '1 day')`,
        [f.t.A, f.ws.A, approval, draft],
      );
    });
    await assert.rejects(
      asA(c => c.query(`UPDATE app.draft_revision SET body = 'changed' WHERE id = $1`, [draft])),
      /permission denied/,
    );
    await assert.rejects(
      admin.query(`UPDATE app.draft_revision SET body = 'changed' WHERE id = $1`, [draft]),
      /immutable record/,
    );
    await assert.rejects(admin.query(`DELETE FROM app.audit_event`), /immutable record/);
    await assert.rejects(admin.query(`TRUNCATE app.outbox_event`), /immutable record/);
    await asA(c =>
      c.query(
        `UPDATE app.approval SET status = 'approved', decided_by = 'fixture:alice', decided_at = now() WHERE id = $1`,
        [approval],
      ),
    );
    await assert.rejects(
      asA(c => c.query(`UPDATE app.approval SET status = 'rejected', decided_at = now() WHERE id = $1`, [approval])),
      /already approved/,
    );
    await assert.rejects(
      asA(c => c.query('DELETE FROM app.approval WHERE id = $1', [approval])),
      /permission denied/,
    );
  });

  it('gives the demo tenant no provider authority and never records an unverified payment', async () => {
    await assert.rejects(
      admin.query(
        `INSERT INTO app.money_fact (tenant_id, id, kind, amount_cents, currency, provider, provider_ref, verified, occurred_at)
         VALUES ($1, gen_random_uuid(), 'invoice', 100, 'USD', 'stripe', 'in_fixture', true, now())`,
        [f.t.demo],
      ),
      /no provider authority/,
    );
    await assert.rejects(
      admin.query(
        `INSERT INTO app.money_fact (tenant_id, id, kind, amount_cents, currency, provider, provider_ref, verified, occurred_at)
         VALUES ($1, gen_random_uuid(), 'payment', 100, 'USD', 'stripe', 'pi_fixture', false, now())`,
        [f.t.A],
      ),
      /check constraint/,
    );
  });

  it('places one occupant per floor and installs agents only on occupied floors and AI desks', async () => {
    await assert.rejects(
      admin.query(
        `INSERT INTO app.workspace_placement (tenant_id, workspace_id, id, floor_id) VALUES ($1, $2, gen_random_uuid(), $3)`,
        [f.t.B, f.ws.B, f.floors.r1L1],
      ),
      /workspace_placement_one_occupant/,
    );
    const tv = (await admin.query(`SELECT id FROM catalog.agent_template_version LIMIT 1`)).rows[0].id;
    const install = (floor: string, desk: string | null, slot = 0) =>
      admin.query(
        `INSERT INTO app.agent_installation (tenant_id, workspace_id, id, template_version_id, floor_id, slot, desk_id, display_name)
         VALUES ($1, $2, gen_random_uuid(), $3, $4, $6, $5, 'Fixture agent')`,
        [f.t.A, f.ws.A, tv, floor, desk, slot],
      );
    await assert.rejects(install(f.floors.r1L3, null), /does not occupy this floor/);
    await install(f.floors.r1L1, null);
    await assert.rejects(install(f.floors.r1L1, null), /agent_installation_one_per_seat/);
    const humanDesk = (await admin.query(`SELECT id FROM catalog.desk WHERE kind = 'human' LIMIT 1`)).rows[0].id;
    await assert.rejects(install(f.floors.r1L1, humanDesk, 1), /violates foreign key constraint/);
  });

  it('classifies every table, and protects every tenant table with forced RLS', async () => {
    const unclassified = await admin.query(`
      SELECT n.nspname || '.' || c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('platform', 'catalog', 'app', 'app_private', 'migration')
        AND NOT EXISTS (SELECT 1 FROM platform.table_classification k WHERE k.table_schema = n.nspname AND k.table_name = c.relname)`);
    assert.deepEqual(unclassified.rows, []);
    const weak = await admin.query(`
      SELECT k.table_schema || '.' || k.table_name AS t, c.relrowsecurity, c.relforcerowsecurity,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policies,
             EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname IN ('tenant_id', 'agency_id') AND NOT a.attisdropped) AS keyed,
             (k.immutable = EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = c.oid AND tg.tgname = 'immutable')) AS immutable_ok
      FROM platform.table_classification k
      JOIN pg_class c ON c.relname = k.table_name JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = k.table_schema
      WHERE k.class IN ('tenant', 'agency')`);
    for (const r of weak.rows) {
      const ok =
        r.relrowsecurity &&
        r.relforcerowsecurity &&
        r.policies >= 1 &&
        (r.keyed || r.t === 'app.tenant' || r.t === 'app.agency') &&
        r.immutable_ok;
      assert.ok(ok, `${r.t}: ${JSON.stringify(r)}`);
    }
    const leaks = await admin.query(`
      SELECT k.table_schema || '.' || k.table_name AS t FROM platform.table_classification k
      WHERE k.class IN ('private', 'migration')
        AND has_table_privilege('agentcity_app', format('%I.%I', k.table_schema, k.table_name), 'SELECT')`);
    assert.deepEqual(leaks.rows, [], 'the app role cannot read private or migration tables');
    const catalogWrites = await admin.query(`
      SELECT k.table_name FROM platform.table_classification k WHERE k.class = 'catalog'
        AND has_table_privilege('agentcity_app', format('%I.%I', k.table_schema, k.table_name), 'INSERT,UPDATE,DELETE')`);
    assert.deepEqual(catalogWrites.rows, [], 'the catalog is read-only to the app role');
  });

  it('seeds the catalog with the exact legacy inventory', async () => {
    const r = await admin.query(`SELECT
      (SELECT count(*) FROM catalog.building)::int AS buildings, (SELECT count(*) FROM catalog.floor)::int AS floors,
      (SELECT count(*) FROM catalog.desk WHERE kind = 'ai')::int AS ai, (SELECT count(*) FROM catalog.desk WHERE kind = 'human')::int AS humans`);
    assert.deepEqual(r.rows[0], { buildings: 15, floors: 183, ai: 281, humans: 22 });
    const alias = await admin.query(
      `SELECT b.name FROM catalog.building_alias a JOIN catalog.building b ON b.id = a.building_id WHERE a.alias = 'fast-sales'`,
    );
    assert.deepEqual(alias.rows, [{ name: 'Fast Sales Training Center' }]);
  });
});
