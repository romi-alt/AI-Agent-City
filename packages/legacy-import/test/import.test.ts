import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { withScope } from '@agentcity/db';
import { createTestDatabase } from '@agentcity/db/testing';
import { deterministicId } from '@agentcity/domain';
import pg from 'pg';
import { MappingError } from '../src/plan.ts';
import { apply, dryRun, ImportRefused, type Inputs } from '../src/run.ts';

/**
 * The legacy importer against a freshly migrated database, with the SYNTHETIC fixtures (fixtures/README.md).
 * Inputs are copied to a temporary folder and made read-only, as the procedure requires for real backups.
 */
const adminUrl = process.env.DATABASE_ADMIN_URL;
const appUrl = process.env.DATABASE_URL;
const FIXTURES = new URL('../fixtures/', import.meta.url);
const SECRET = 'FIXTURE-NOT-A-REAL-SECRET';

describe('legacy import (version 2)', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let admin: pg.Client;
  let dir: string;
  let inputs: Inputs;
  let state: {
    leads: { id: string; real: boolean; buildingId: string }[];
    messages: { id: string; status: string; real: boolean }[];
  };
  let first: Awaited<ReturnType<typeof apply>>;

  const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
  const fileState = () => Object.values(inputs).map(sha);
  /** Every row count in every application and migration table: proves "nothing written". */
  const dbState = async () => {
    const r = await admin.query(
      `SELECT table_schema || '.' || table_name AS t FROM platform.table_classification WHERE class IN ('tenant', 'agency', 'migration') ORDER BY 1`,
    );
    const out: Record<string, number> = {};
    for (const { t } of r.rows) out[t] = Number((await admin.query(`SELECT count(*) AS n FROM ${t}`)).rows[0].n);
    return out;
  };
  const variant = (name: string, from: 'state' | 'auth' | 'mapping', edit: (v: any) => unknown) => {
    const src = { state: inputs.statePath, auth: inputs.authPath, mapping: inputs.mappingPath }[from];
    const path = join(dir, `${name}.json`);
    const v = edit(JSON.parse(readFileSync(src, 'utf8')));
    writeFileSync(path, typeof v === 'string' ? v : JSON.stringify(v));
    chmodSync(path, 0o444);
    return { ...inputs, [`${from}Path`]: path } as Inputs;
  };

  before(async () => {
    assert.ok(adminUrl && appUrl, 'DATABASE_ADMIN_URL and DATABASE_URL must be set (see infra/local-dev.env)');
    db = await createTestDatabase({ adminUrl, appUrl });
    admin = new pg.Client({ connectionString: db.adminUrl });
    await admin.connect();
    dir = mkdtempSync(join(tmpdir(), 'agentcity-import-'));
    const copy = (name: string) => {
      const p = join(dir, name);
      copyFileSync(new URL(name, FIXTURES), p);
      chmodSync(p, 0o444);
      return p;
    };
    inputs = {
      statePath: copy('state.v2.fixture.json'),
      authPath: copy('auth.fixture.json'),
      mappingPath: copy('mapping.fixture.json'),
    };
    state = JSON.parse(readFileSync(inputs.statePath, 'utf8'));
  });
  after(async () => {
    await admin?.end();
    await db?.drop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('dry run reports everything and writes nothing (it runs as the app role)', async () => {
    const before = await dbState();
    const files = fileState();
    const r = await dryRun(inputs, db.appUrl);
    assert.deepEqual(await dbState(), before);
    assert.deepEqual(fileState(), files);
    for (const [kind, c] of Object.entries(r.report.counts)) {
      assert.equal(c.input, c.imported + c.quarantined + c.skipped, `${kind} reconciles`);
    }
    assert.equal(r.report.counts.lead!.input, state.leads.length);
    assert.equal(r.report.counts.message!.input, state.messages.length);
  });

  it('refuses unknown or corrupt input before writing anything', async () => {
    const before = await dbState();
    const cases: [string, Inputs, RegExp][] = [
      ['version 3', variant('v3', 'state', s => ({ ...s, version: 3 })), /not a supported format: version/],
      ['version 1', variant('v1', 'state', s => ({ ...s, version: 1 })), /not a supported format: version/],
      ['not JSON', variant('broken', 'state', () => '{"version": 2, "leads": ['), /not valid JSON/],
      ['missing list', variant('nomsg', 'state', s => ({ ...s, messages: undefined })), /messages/],
      ['wrong type', variant('wrongtype', 'state', s => ({ ...s, leads: {} })), /leads/],
      ['auth not a list', variant('badauth', 'auth', a => ({ ...a, users: 'x' })), /auth file.*users/],
      [
        'unknown mapping field',
        variant('mapextra', 'mapping', m => ({ ...m, autoAssign: true })),
        /mapping.*autoAssign|Unrecognized/i,
      ],
    ];
    for (const [name, i, re] of cases) {
      await assert.rejects(apply(i, db.adminUrl), (e: Error) => e instanceof ImportRefused && re.test(e.message), name);
    }
    // Mapping that would infer ownership from a shared building, or place one floor twice.
    const shared = variant('shared', 'mapping', m => ({
      ...m,
      contactOwnership: [
        ...m.contactOwnership,
        { tenant: 'rental-one', workspace: 'floor', legacyBuilding: 'rental-1', evidence: 'FIXTURE: by proximity' },
      ],
    }));
    await assert.rejects(
      apply(shared, db.adminUrl),
      (e: Error) => e instanceof MappingError && /only occupant/.test(e.message),
    );
    const twice = variant('twice', 'mapping', m => ({
      ...m,
      tenants: m.tenants.map((t: any) =>
        t.key === 'rental-two'
          ? { ...t, workspaces: [{ ...t.workspaces[0], floors: [{ building: 'rental-1', level: 1 }] }] }
          : t,
      ),
    }));
    await assert.rejects(
      apply(twice, db.adminUrl),
      (e: Error) => e instanceof MappingError && /placed for both/.test(e.message),
    );
    assert.deepEqual(await dbState(), before, 'no row anywhere, not even an import_run');
  });

  it('imports, and a second run with the same input changes nothing', async () => {
    const files = fileState();
    first = await apply(inputs, db.adminUrl);
    for (const [table, n] of Object.entries(first.report.plannedRows)) {
      assert.equal(first.inserted[table], n, `${table}: every planned row inserted`);
      assert.equal(first.reconciliation.tables[table]!.rows, n, `${table}: totals match the plan`);
    }
    assert.equal(
      first.reconciliation.quarantine.rows,
      Object.values(first.report.counts).reduce((s, c) => s + c.quarantined, 0),
    );
    const second = await apply(inputs, db.adminUrl);
    assert.ok(
      Object.values(second.inserted).every(n => n === 0),
      'no new rows',
    );
    assert.equal(second.newRecordMap, 0);
    assert.equal(second.newQuarantine, 0);
    assert.deepEqual(second.reconciliation, first.reconciliation, 'identical totals and content hashes');
    assert.deepEqual(fileState(), files, 'inputs untouched');
    const runs = await admin.query('SELECT count(*)::int AS n FROM migration.import_run WHERE finished_at IS NOT NULL');
    assert.equal(runs.rows[0].n, 2);
  });

  it('refuses a record that changed since it was imported, instead of overwriting', async () => {
    const before = await dbState();
    const real = state.leads.find(l => l.real && l.buildingId === 'honda')!;
    const changed = variant('changed', 'state', s => ({
      ...s,
      leads: s.leads.map((l: any) => (l.id === real.id ? { ...l, name: 'Fixture Renamed' } : l)),
    }));
    await assert.rejects(
      apply(changed, db.adminUrl),
      (e: Error) => e instanceof ImportRefused && /changed since they were imported/.test(e.message),
    );
    assert.deepEqual(await dbState(), before);
  });

  it('never imports credentials, sessions or remembered devices', async () => {
    const tables = await admin.query(
      `SELECT table_schema || '.' || table_name AS t FROM platform.table_classification WHERE class IN ('tenant', 'agency', 'migration')`,
    );
    for (const { t } of tables.rows) {
      const r = await admin.query(`SELECT count(*)::int AS n FROM ${t} x WHERE row_to_json(x)::text LIKE $1`, [
        `%${SECRET}%`,
      ]);
      assert.equal(r.rows[0].n, 0, `${t} contains a legacy credential`);
    }
    assert.equal(first.report.notImportedByDesign.passHash, 6);
    assert.equal(first.report.notImportedByDesign.sessions, 1);
    assert.equal(first.report.notImportedByDesign.rememberedDevices, 1);
    const inv = await admin.query(`SELECT email, role FROM app.invitation ORDER BY email`);
    assert.deepEqual(
      inv.rows.map(r => r.email),
      [
        'fixture.honda.admin@example.test',
        'fixture.honda.viewer@example.test',
        'fixture.owner@example.test',
        'fixture.staff@example.test',
      ],
    );
  });

  it('derives no sends, payments, consent or pending approvals from legacy state', async () => {
    const n = async (sql: string) => Number((await admin.query(sql)).rows[0].n);
    for (const t of [
      'app.dispatch_attempt',
      'app.dispatch_receipt',
      'app.money_fact',
      'app.usage_fact',
      'app.consent_event',
    ]) {
      assert.equal(await n(`SELECT count(*) AS n FROM ${t}`), 0, t);
    }
    assert.equal(await n(`SELECT count(*) AS n FROM app.approval WHERE status <> 'expired'`), 0);
    assert.ok((await n(`SELECT count(*) AS n FROM app.approval`)) > 0);
    assert.equal(await n(`SELECT count(*) AS n FROM app.schedule WHERE enabled`), 0);
    assert.equal(await n(`SELECT count(*) AS n FROM app.schedule`), 1);
    assert.equal(await n(`SELECT count(*) AS n FROM app.opportunity WHERE value_cents IS NOT NULL`), 0);
    // The message the legacy app marked "sent" is kept as unverified evidence, not as a delivery.
    const sent = state.messages.find(m => m.real && m.status === 'sent')!;
    const ev = await admin.query(
      `SELECT legacy_status, verification FROM app.message_evidence WHERE provenance->>'legacyId' = $1`,
      [sent.id],
    );
    assert.deepEqual(ev.rows, [{ legacy_status: 'sent', verification: 'legacy-unverified' }]);
    const revenue = await admin.query(`SELECT reason FROM migration.quarantine WHERE legacy_kind = 'revenue'`);
    assert.deepEqual(revenue.rows, [{ reason: 'simulated revenue is not a payment or invoice fact' }]);
  });

  it('keeps simulated data in the marked demo tenant and real data with its mapped owner only', async () => {
    const byTenant = await admin.query(`
      SELECT t.name, t.kind, bool_and((c.provenance->>'legacyReal')::boolean) AS all_real, bool_or((c.provenance->>'legacyReal')::boolean) AS any_real, count(*)::int AS n
      FROM app.contact c JOIN app.tenant t ON t.id = c.tenant_id GROUP BY 1, 2 ORDER BY 1`);
    const demo = byTenant.rows.find(r => r.kind === 'demo')!;
    assert.equal(demo.any_real, false, 'no real contact in the demo tenant');
    assert.equal(demo.n, state.leads.filter(l => !l.real).length - 1, 'every simulated lead, minus the duplicate');
    for (const r of byTenant.rows.filter(r => r.kind !== 'demo'))
      assert.equal(r.all_real, true, `${r.name} holds only real contacts`);
    const q = await admin.query(
      `SELECT legacy_id, reason FROM migration.quarantine WHERE legacy_kind = 'lead' ORDER BY reason`,
    );
    const rentalUnmapped = state.leads.filter(l => l.real && l.buildingId === 'rental-1').length - 1;
    assert.equal(q.rows.filter(r => /shared rental building/.test(r.reason)).length, rentalUnmapped);
    assert.ok(q.rows.some(r => r.reason === 'real contact without a verified ownership mapping'));
    assert.ok(q.rows.some(r => r.reason === 'duplicate legacy id'));
  });

  it('gives imported records provenance, a reversible map and deterministic ids', async () => {
    const real = state.leads.find(l => l.real && l.buildingId === 'honda')!;
    const expected = deterministicId('contact', 'honda-client', real.id);
    const c = await admin.query(`SELECT id, provenance FROM app.contact WHERE provenance->>'legacyId' = $1`, [real.id]);
    assert.equal(c.rows[0].id, expected);
    assert.equal(c.rows[0].provenance.source, 'legacy-v2');
    const map = await admin.query(
      `SELECT target_table, target_id FROM migration.record_map WHERE legacy_kind = 'lead' AND legacy_id = $1`,
      [real.id],
    );
    assert.deepEqual(map.rows, [{ target_table: 'app.contact', target_id: expected }]);
    const unmapped = await admin.query(`
      SELECT count(*)::int AS n FROM app.contact c
      WHERE NOT EXISTS (SELECT 1 FROM migration.record_map m WHERE m.target_table = 'app.contact' AND m.target_id = c.id)`);
    assert.equal(unmapped.rows[0].n, 0, 'every contact maps back to its legacy lead');
  });

  it('enforces tenant isolation on imported data: the L1 client cannot see the L2 client in the same building', async () => {
    const tenants = await admin.query(`SELECT id, name FROM app.tenant`);
    const id = (name: string) => tenants.rows.find(r => r.name === name)!.id;
    const [one, two] = [id('Fixture Rental One'), id('Fixture Rental Two')];
    await admin.query(
      `INSERT INTO app.tenant_member (tenant_id, subject, role) VALUES ($1, 'fixture:one', 'client-admin'), ($2, 'fixture:two', 'client-admin')`,
      [one, two],
    );
    const pool = new pg.Pool({ connectionString: db.appUrl, max: 1 });
    try {
      const contacts = (subject: string, tenantId: string) =>
        withScope(pool, { subject, tenantId }, async c =>
          (await c.query(`SELECT display_name FROM app.contact`)).rows.map(r => r.display_name),
        );
      assert.deepEqual(await contacts('fixture:one', one), ['Fixture Real rental-1 1']);
      assert.deepEqual(await contacts('fixture:two', two), []);
      await assert.rejects(contacts('fixture:one', two), /not authorized for this tenant/);
      const floors = await withScope(pool, { subject: 'fixture:two', tenantId: two }, async c =>
        (
          await c.query(`SELECT f.level FROM app.workspace_placement p JOIN catalog.floor f ON f.id = p.floor_id`)
        ).rows.map(r => r.level),
      );
      assert.deepEqual(floors, [2]);
    } finally {
      await pool.end();
    }
  });
});
