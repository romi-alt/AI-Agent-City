// Backup and restore rehearsal for M02, using the SYNTHETIC fixtures. Needs `pnpm infra:up`.
//
// 1. Legacy files: back up to a folder outside the repository, fingerprint, restore into a fresh folder, verify;
//    a damaged copy is refused by the importer and the original is unchanged.
// 2. Database: import into a fresh database, pg_dump it, restore into a second fresh database, and compare row
//    totals and content hashes; check row-level security, ranked search and import idempotency on the restored copy.
// Writes planning/agentcity-migration/m02/evidence/backup-restore.json. Never touches the development database.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, withScope } from '@agentcity/db';
import { createTestDatabase } from '@agentcity/db/testing';
import pg from 'pg';
import { buildPlan } from '../src/plan.ts';
import { apply, ImportRefused, loadCatalog, readInputs, reconcile } from '../src/run.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const EVIDENCE = join(ROOT, 'planning/agentcity-migration/m02/evidence');
const COMPOSE = ['compose', '-f', join(ROOT, 'infra/compose.yaml'), '--env-file', join(ROOT, 'infra/local-dev.env')];
const adminUrl = process.env.DATABASE_ADMIN_URL!;
const appUrl = process.env.DATABASE_URL!;
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const steps: { step: string; ok: boolean; detail?: unknown }[] = [];
const check = (step: string, ok: boolean, detail?: unknown) => {
  steps.push({ step, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${step}`);
};

const work = mkdtempSync(join(tmpdir(), 'agentcity-rehearsal-'));
const dbs: Awaited<ReturnType<typeof createTestDatabase>>[] = [];
try {
  // ── 1. Legacy files ──
  const originals = ['state.v2.fixture.json', 'auth.fixture.json', 'mapping.fixture.json'].map(n =>
    fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url)),
  );
  const backup = join(work, 'backup');
  mkdirSync(backup);
  const manifest = originals.map(p => {
    const to = join(backup, p.split('/').pop()!);
    copyFileSync(p, to);
    chmodSync(to, 0o444);
    return { file: p.split('/').pop()!, sha256: sha(p) };
  });
  writeFileSync(join(backup, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
  const restored = join(work, 'restored');
  mkdirSync(restored);
  for (const m of manifest) copyFileSync(join(backup, m.file), join(restored, m.file));
  check(
    'legacy files: backup and restore are byte-identical',
    manifest.every(m => sha(join(restored, m.file)) === m.sha256),
    manifest,
  );

  const damaged = join(work, 'damaged-state.json');
  writeFileSync(damaged, readFileSync(join(restored, manifest[0]!.file)).subarray(0, 4096));
  const before = sha(originals[0]!);
  let refused = '';
  try {
    readInputs({
      statePath: damaged,
      authPath: join(restored, manifest[1]!.file),
      mappingPath: join(restored, manifest[2]!.file),
    });
  } catch (e) {
    if (e instanceof ImportRefused) refused = e.message;
  }
  check(
    'legacy files: a damaged copy is refused and the original is unchanged',
    !!refused && sha(originals[0]!) === before,
    refused,
  );

  // ── 2. Database ──
  const inputs = {
    statePath: join(restored, manifest[0]!.file),
    authPath: join(restored, manifest[1]!.file),
    mappingPath: join(restored, manifest[2]!.file),
  };
  const source = await createTestDatabase({ adminUrl, appUrl });
  dbs.push(source);
  const imported = await apply(inputs, source.adminUrl);
  check('database: fixture imported', true, { rows: imported.inserted, quarantine: imported.newQuarantine });

  const dump = join(work, 'agentcity.dump');
  writeFileSync(
    dump,
    execFileSync(
      'docker',
      [...COMPOSE, 'exec', '-T', 'postgres', 'pg_dump', '-U', new URL(adminUrl).username, '-d', source.name, '-Fc'],
      { maxBuffer: 1 << 28 },
    ),
  );
  const target = `agentcity_restore_${randomBytes(4).toString('hex')}`;
  const a = new pg.Client({ connectionString: adminUrl });
  await a.connect();
  // Restores go into an empty database (template0); template1 here already carries the image's extensions.
  await a.query(`CREATE DATABASE ${target} TEMPLATE template0`);
  await a.query(`GRANT CONNECT ON DATABASE ${target} TO ${pg.escapeIdentifier(new URL(appUrl).username)}`);
  await a.end();
  const targetUrl = (url: string) => Object.assign(new URL(url), { pathname: `/${target}` }).toString();
  dbs.push({
    name: target,
    adminUrl: targetUrl(adminUrl),
    appUrl: targetUrl(appUrl),
    applied: [],
    drop: async () => dropDb(target),
  });
  execFileSync(
    'docker',
    [
      ...COMPOSE,
      'exec',
      '-T',
      'postgres',
      'pg_restore',
      '-U',
      new URL(adminUrl).username,
      '-d',
      target,
      '--exit-on-error',
    ],
    { input: readFileSync(dump) },
  );
  check('database: pg_dump / pg_restore completed', true, { dumpBytes: readFileSync(dump).length });

  const { state, auth, mapping } = readInputs(inputs);
  const compare = async (url: string) => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      return await reconcile(c, buildPlan(state, auth, mapping, await loadCatalog(c)));
    } finally {
      await c.end();
    }
  };
  const [r1, r2] = [await compare(source.adminUrl), await compare(targetUrl(adminUrl))];
  check('database: restored totals and content hashes equal the source', JSON.stringify(r1) === JSON.stringify(r2), r2);
  check('database: restored copy has no pending migrations', (await migrate(targetUrl(adminUrl), 'up')).length === 0);

  const pool = new pg.Pool({ connectionString: targetUrl(appUrl), max: 1 });
  const ac = new pg.Client({ connectionString: targetUrl(adminUrl) });
  await ac.connect();
  const tenant = (await ac.query(`SELECT id FROM app.tenant WHERE name = 'Fixture Honda Client'`)).rows[0].id;
  await ac.query(
    `INSERT INTO app.tenant_member (tenant_id, subject, role) VALUES ($1, 'fixture:restore-check', 'client-admin')`,
    [tenant],
  );
  const unscoped = (await pool.query('SELECT count(*)::int AS n FROM app.contact')).rows[0].n;
  const scoped = await withScope(pool, { subject: 'fixture:restore-check', tenantId: tenant }, async c => ({
    contacts: (await c.query('SELECT count(*)::int AS n FROM app.contact')).rows[0].n,
    otherTenants: (await c.query('SELECT count(*)::int AS n FROM app.contact WHERE tenant_id <> $1', [tenant])).rows[0]
      .n,
    search: (await c.query(`SELECT count(*)::int AS n FROM app.search_notes('hybrid')`)).rows[0].n,
  }));
  await ac.end();
  await pool.end();
  check(
    'database: row-level security and ranked search work on the restored copy',
    unscoped === 0 && scoped.contacts === 3 && scoped.otherTenants === 0 && scoped.search === 1,
    { unscoped, scoped },
  );

  const again = await apply(inputs, targetUrl(adminUrl));
  check(
    'database: importing again into the restored copy adds nothing',
    Object.values(again.inserted).every(n => n === 0),
    again.inserted,
  );
} finally {
  for (const d of dbs) await d.drop().catch(() => {});
  rmSync(work, { recursive: true, force: true });
}

async function dropDb(name: string) {
  const c = new pg.Client({ connectionString: adminUrl });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await c.end();
}

mkdirSync(EVIDENCE, { recursive: true });
const passed = steps.length === 8 && steps.every(s => s.ok);
writeFileSync(
  join(EVIDENCE, 'backup-restore.json'),
  JSON.stringify({ ranAt: new Date().toISOString(), fixtures: 'SYNTHETIC', passed, steps }, null, 2) + '\n',
);
console.log(passed ? 'rehearsal: PASSED' : 'rehearsal: FAILED');
process.exit(passed ? 0 : 1);
