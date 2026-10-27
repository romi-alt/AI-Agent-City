import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { migrate } from '../src/index.ts';
import { createTestDatabase } from '../src/testing.ts';

/**
 * The identity schema (M03) as the app role sees it: what it may write, what it may not, and the constraints that
 * keep secrets out of the tables. Needs the local services (`pnpm infra:up`).
 */
const adminUrl = process.env.DATABASE_ADMIN_URL;
const appUrl = process.env.DATABASE_URL;
const HASH = 'a'.repeat(64);

describe('identity schema', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: pg.Client;
  let admin: pg.Client;

  before(async () => {
    assert.ok(adminUrl && appUrl, 'DATABASE_ADMIN_URL and DATABASE_URL must be set (see infra/local-dev.env)');
    db = await createTestDatabase({ adminUrl, appUrl });
    app = new pg.Client({ connectionString: db.appUrl });
    admin = new pg.Client({ connectionString: db.adminUrl });
    await app.connect();
    await admin.connect();
  });
  after(async () => {
    await app?.end();
    await admin?.end();
    await db?.drop();
  });

  async function person(subject: string) {
    await app.query(
      `INSERT INTO identity.person (subject, issuer, idp_subject, email) VALUES ($1, 'https://idp', $2, $3)`,
      [subject, subject.slice(3), `${subject.slice(3)}@example.com`],
    );
    const d = await app.query(
      `INSERT INTO identity.device (subject, jkt, public_jwk) VALUES ($1, $2, '{}') RETURNING id`,
      [subject, 'A'.repeat(43)],
    );
    return d.rows[0].id as string;
  }

  it('classifies every identity table', async () => {
    const r = await admin.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN platform.table_classification t ON t.table_schema = n.nspname AND t.table_name = c.relname
       WHERE n.nspname = 'identity' AND c.relkind IN ('r', 'p') AND t.class IS DISTINCT FROM 'identity'`,
    );
    assert.deepEqual(r.rows, []);
  });

  it('lets the app role create people, devices and sessions, but never delete them', async () => {
    const device = await person('kc:p1');
    const s = await app.query(
      `INSERT INTO identity.session (token_sha256, subject, device_id, amr, auth_time, idle_expires_at, absolute_expires_at)
       VALUES ($1, 'kc:p1', $2, '{}', now(), now() + interval '1 hour', now() + interval '1 day') RETURNING revalidated_at`,
      [HASH, device],
    );
    assert.ok(s.rows[0].revalidated_at);
    for (const t of ['person', 'device', 'session'])
      await assert.rejects(app.query(`DELETE FROM identity.${t}`), /permission denied/);
  });

  it('stores only hashes of cookie tokens and states, and lower-case emails', async () => {
    const device = await person('kc:p2');
    await assert.rejects(
      app.query(
        `INSERT INTO identity.session (token_sha256, subject, device_id, amr, auth_time, idle_expires_at, absolute_expires_at)
         VALUES ('raw-cookie-token', 'kc:p2', $1, '{}', now(), now(), now())`,
        [device],
      ),
      /check constraint/,
    );
    await assert.rejects(
      app.query(
        `INSERT INTO identity.person (subject, issuer, idp_subject, email) VALUES ('kc:p3', 'i', 'p3', 'Upper@Example.com')`,
      ),
      /check constraint/,
    );
  });

  it('accepts only same-origin paths as returnTo, and step-ups only for a session with a reason', async () => {
    const insert = (returnTo: string, purpose = 'login', reason: string | null = null) =>
      app.query(
        `INSERT INTO identity.login_attempt (state_sha256, nonce, code_verifier, device_jkt, device_jwk, purpose,
           step_up_reason, return_to, expires_at)
         VALUES (encode(sha256(random()::text::bytea), 'hex'), 'n', 'v', $1, '{}', $2, $3, $4, now() + interval '10 minutes')`,
        ['A'.repeat(43), purpose, reason, returnTo],
      );
    await insert('/');
    await insert('/workspace?x=1');
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'relative'])
      await assert.rejects(insert(bad), /check constraint/, bad);
    await assert.rejects(insert('/', 'step-up', 'billing'), /check constraint/);
    // Expired attempts can be purged.
    await app.query(`DELETE FROM identity.login_attempt WHERE expires_at < now() - interval '1 day'`);
  });

  it('keeps the security log append-only', async () => {
    await app.query(`INSERT INTO identity.security_event (subject, kind) VALUES ('kc:p1', 'sign_in')`);
    await assert.rejects(app.query(`UPDATE identity.security_event SET kind = 'x'`), /permission denied/);
    await assert.rejects(app.query(`DELETE FROM identity.security_event`), /permission denied/);
    await assert.rejects(
      admin.query(`UPDATE identity.security_event SET kind = 'x'`),
      /append-only|immutable|not allowed|forbid/i,
    );
  });

  it('rolls back and re-applies cleanly', async () => {
    await app.end();
    await admin.end();
    const down = await migrate(db.adminUrl, 'down', 1);
    assert.equal(down.length, 1);
    const up = await migrate(db.adminUrl, 'up');
    assert.deepEqual(up, down);
    app = new pg.Client({ connectionString: db.appUrl });
    admin = new pg.Client({ connectionString: db.adminUrl });
    await app.connect();
    await admin.connect();
  });
});
