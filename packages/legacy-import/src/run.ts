import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { buildPlan, type CatalogView, type Plan, sha256, TABLES } from './plan.js';
import { ImportMapping, LegacyAuth, LegacyState } from './schema.js';

/** The import refused its input. Nothing was written anywhere. */
export class ImportRefused extends Error {}

export interface Inputs {
  statePath: string;
  authPath: string;
  mappingPath: string;
}

/** Reads a file without ever opening it for writing, and fingerprints the exact bytes read. */
function readOnly(path: string) {
  const bytes = readFileSync(path, { flag: 'r' });
  return { bytes, sha256: sha256(bytes) };
}

function parse<T>(
  what: string,
  bytes: Buffer,
  schema: {
    safeParse(
      v: unknown,
    ): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
  },
): T {
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString('utf8'));
  } catch (e) {
    throw new ImportRefused(`${what} is not valid JSON (${(e as Error).message})`);
  }
  const p = schema.safeParse(json);
  if (!p.success) {
    const i = p.error.issues[0]!;
    throw new ImportRefused(`${what} is not a supported format: ${i.path.join('.') || '(top level)'} ${i.message}`);
  }
  return p.data;
}

export function readInputs(inputs: Inputs) {
  const state = readOnly(inputs.statePath);
  const auth = readOnly(inputs.authPath);
  const mapping = readOnly(inputs.mappingPath);
  return {
    state: parse('the legacy state (state.json)', state.bytes, LegacyState),
    auth: parse('the legacy auth file (auth.json)', auth.bytes, LegacyAuth),
    mapping: parse('the import mapping', mapping.bytes, ImportMapping),
    sources: { state: state.sha256, auth: auth.sha256, mapping: mapping.sha256 },
  };
}

/** The catalog as the app role sees it: read-only, no tenant data. */
export async function loadCatalog(client: pg.ClientBase): Promise<CatalogView> {
  const floors = await client.query(
    `SELECT a.alias, f.level, f.id, f.rentable, b.kind FROM catalog.floor f
     JOIN catalog.building b ON b.id = f.building_id JOIN catalog.building_alias a ON a.building_id = b.id`,
  );
  const desks = await client.query(
    `SELECT d.legacy_id, d.id, d.kind, d.slot, d.persona_name, d.template_version_id, a.alias, f.level
     FROM catalog.desk d JOIN catalog.floor f ON f.id = d.floor_id JOIN catalog.building_alias a ON a.building_id = f.building_id`,
  );
  const templates = await client.query(
    `SELECT t.task_set, t.role, v.categories, v.id FROM catalog.agent_template t JOIN catalog.agent_template_version v ON v.template_id = t.id`,
  );
  const view: CatalogView = { floors: new Map(), buildings: new Map(), desks: new Map(), templates: new Map() };
  for (const r of floors.rows) {
    view.floors.set(`${r.alias}|${r.level}`, { id: r.id, rentable: r.rentable });
    const b = view.buildings.get(r.alias) ?? { kind: r.kind as string, levels: [] as number[] };
    b.levels.push(r.level);
    view.buildings.set(r.alias, b);
  }
  for (const b of view.buildings.values()) b.levels.sort((x, y) => x - y);
  for (const r of desks.rows) {
    view.desks.set(r.legacy_id, {
      id: r.id,
      kind: r.kind,
      floorKey: `${r.alias}|${r.level}`,
      slot: r.slot,
      name: r.persona_name,
      templateVersionId: r.template_version_id,
    });
  }
  for (const r of templates.rows) view.templates.set(`${r.task_set}|${r.role}|${r.categories.join('|')}`, r.id);
  return view;
}

/**
 * Dry run: validates everything and returns the full report. It connects as the application role, which can
 * read the catalog but cannot write any tenant data, so a dry run cannot change the database even by mistake.
 */
export async function dryRun(inputs: Inputs, appUrl: string) {
  const { state, auth, mapping, sources } = readInputs(inputs);
  const client = new pg.Client({ connectionString: appUrl });
  await client.connect();
  try {
    const plan = buildPlan(state, auth, mapping, await loadCatalog(client));
    return { mode: 'dry-run' as const, sources, report: plan.report };
  } finally {
    await client.end();
    assertUnchanged(inputs, sources);
  }
}

/**
 * Apply: one transaction. New rows are inserted; rows already imported (same deterministic id) are left alone,
 * so a second run with unchanged input changes nothing. A legacy record that changed since it was imported is
 * refused: deltas belong to the cutover (MIGRATION-MAP "Cutover"), not to a silent overwrite.
 */
export async function apply(inputs: Inputs, adminUrl: string) {
  const { state, auth, mapping, sources } = readInputs(inputs);
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  const runId = randomUUID();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('agentcity-legacy-import'))`);
    const plan = buildPlan(state, auth, mapping, await loadCatalog(client));
    const conflicts = await findConflicts(client, plan);
    if (conflicts.length) {
      throw new ImportRefused(
        `${conflicts.length} legacy record(s) changed since they were imported (first: ${conflicts[0]}). Deltas need the cutover procedure.`,
      );
    }
    await client.query(
      `INSERT INTO migration.import_run (id, mode, source_sha256, mapping_sha256) VALUES ($1, 'apply', $2, $3)`,
      [runId, { state: sources.state, auth: sources.auth }, sources.mapping],
    );
    const inserted: Record<string, number> = {};
    for (const table of TABLES) {
      inserted[table] = 0;
      for (const row of plan.rows[table]) inserted[table] += await insert(client, table, row);
    }
    let mapped = 0;
    for (const m of plan.recordMap) {
      const r = await client.query(
        `INSERT INTO migration.record_map (legacy_kind, legacy_id, target_table, tenant_id, target_id, record_sha256, first_run_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
        [m.legacyKind, m.legacyId, m.targetTable, m.tenantId, m.targetId, m.recordSha256, runId],
      );
      mapped += r.rowCount ?? 0;
    }
    let quarantined = 0;
    for (const q of plan.quarantine) {
      const r = await client.query(
        `INSERT INTO migration.quarantine (legacy_kind, legacy_id, reason, record, record_sha256, first_run_id)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [q.legacyKind, q.legacyId, q.reason, JSON.stringify(q.record), q.recordSha256, runId],
      );
      quarantined += r.rowCount ?? 0;
    }
    const reconciliation = await reconcile(client, plan);
    const result = {
      mode: 'apply' as const,
      runId,
      sources,
      inserted,
      newRecordMap: mapped,
      newQuarantine: quarantined,
      reconciliation,
      report: plan.report,
    };
    await client.query(`UPDATE migration.import_run SET finished_at = clock_timestamp(), report = $2 WHERE id = $1`, [
      runId,
      JSON.stringify({
        inserted,
        newRecordMap: mapped,
        newQuarantine: quarantined,
        reconciliation,
        report: plan.report,
      }),
    ]);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
    assertUnchanged(inputs, sources);
  }
}

async function insert(client: pg.ClientBase, table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  const values = cols.map(c => {
    const v = row[c];
    return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  });
  const r = await client.query(
    `INSERT INTO ${table} (${cols.map(c => pg.escapeIdentifier(c)).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) ON CONFLICT DO NOTHING`,
    values,
  );
  return r.rowCount ?? 0;
}

async function findConflicts(client: pg.ClientBase, plan: Plan) {
  const existing = await client.query(
    `SELECT legacy_kind, legacy_id, target_table, target_id, record_sha256 FROM migration.record_map`,
  );
  const known = new Map(existing.rows.map(r => [`${r.legacy_kind}|${r.legacy_id}|${r.target_table}`, r]));
  const out: string[] = [];
  for (const m of plan.recordMap) {
    const k = known.get(`${m.legacyKind}|${m.legacyId}|${m.targetTable}`);
    if (k && (k.target_id !== m.targetId || k.record_sha256 !== m.recordSha256))
      out.push(`${m.legacyKind} ${m.legacyId}`);
  }
  return out;
}

/** Row totals and content hashes of everything this plan covers, so two runs can be compared exactly. */
export async function reconcile(client: pg.ClientBase, plan: Plan) {
  const tables: Record<string, { rows: number; sha256: string }> = {};
  for (const table of TABLES) {
    const ids = plan.rows[table].map(r => r.id as string);
    const r = await client.query(
      `SELECT count(*)::int AS n, coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY t.id), '') AS body
       FROM ${table} t WHERE t.id = ANY($1::uuid[])`,
      [ids],
    );
    tables[table] = { rows: r.rows[0].n, sha256: sha256(r.rows[0].body) };
  }
  const q = await client.query(
    `SELECT count(*)::int AS n, coalesce(string_agg(legacy_kind || '|' || legacy_id || '|' || reason || '|' || record_sha256, E'\\n' ORDER BY legacy_kind, legacy_id), '') AS body
     FROM migration.quarantine`,
  );
  return { tables, quarantine: { rows: q.rows[0].n, sha256: sha256(q.rows[0].body) } };
}

function assertUnchanged(inputs: Inputs, before: { state: string; auth: string; mapping: string }) {
  const after = {
    state: readOnly(inputs.statePath).sha256,
    auth: readOnly(inputs.authPath).sha256,
    mapping: readOnly(inputs.mappingPath).sha256,
  };
  for (const k of ['state', 'auth', 'mapping'] as const) {
    if (after[k] !== before[k]) throw new Error(`input ${k} changed while importing (it must be a read-only copy)`);
  }
}
