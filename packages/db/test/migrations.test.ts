import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readdirSync } from 'node:fs';
import pg from 'pg';
import { MIGRATIONS_DIR, migrate } from '../src/index.ts';
import { createTestDatabase } from '../src/testing.ts';

/** Needs the local services: `pnpm infra:up`. These tests fail (never skip) when the database is missing. */
const adminUrl = process.env.DATABASE_ADMIN_URL;
const appUrl = process.env.DATABASE_URL;
const ALL = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .map(f => f.replace(/\.sql$/, ''))
  .sort();

describe('migrations', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => {
    assert.ok(adminUrl && appUrl, 'DATABASE_ADMIN_URL and DATABASE_URL must be set (see infra/local-dev.env)');
    db = await createTestDatabase({ adminUrl, appUrl });
  });
  after(async () => {
    await db?.drop();
  });

  const asApp = async <T>(fn: (c: pg.Client) => Promise<T>) => {
    const c = new pg.Client({ connectionString: db.appUrl });
    await c.connect();
    try {
      return await fn(c);
    } finally {
      await c.end();
    }
  };

  it('applies cleanly to an empty database', () => {
    assert.ok(ALL.length >= 2);
    assert.deepEqual(db.applied, ALL);
  });

  it('lets the app role record heartbeats, once per step', async () => {
    await asApp(async c => {
      await c.query("INSERT INTO platform.heartbeat (run_id, step, worker_id) VALUES ('test-run-1', 'started', 'w1')");
      await assert.rejects(
        c.query("INSERT INTO platform.heartbeat (run_id, step, worker_id) VALUES ('test-run-1', 'started', 'w2')"),
        /duplicate key/,
      );
      const r = await c.query("SELECT count(*)::int AS n FROM platform.heartbeat WHERE run_id = 'test-run-1'");
      assert.equal(r.rows[0].n, 1);
    });
  });

  it('does not let the app role change the schema or bypass grants', async () => {
    await asApp(async c => {
      await assert.rejects(c.query('CREATE TABLE platform.sneaky (x int)'), /permission denied/);
      await assert.rejects(c.query('CREATE TABLE public.sneaky (x int)'), /permission denied/);
      await assert.rejects(c.query('DELETE FROM platform.heartbeat'), /permission denied/);
      await assert.rejects(c.query('DROP TABLE platform.heartbeat'), /must be owner/);
      const role = await c.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
      assert.deepEqual(role.rows[0], { rolsuper: false, rolbypassrls: false });
    });
  });

  it('rolls back and re-applies (reversible)', async () => {
    assert.deepEqual(await migrate(db.adminUrl, 'down', Infinity), [...ALL].reverse());
    await asApp(async c => assert.rejects(c.query('SELECT 1 FROM platform.heartbeat'), /does not exist/));
    await asApp(async c => assert.rejects(c.query('SELECT 1 FROM app.contact'), /does not exist/));
    assert.deepEqual(await migrate(db.adminUrl, 'up'), ALL);
    assert.deepEqual(await migrate(db.adminUrl, 'up'), [], 'a second run is a no-op');
  });
});
