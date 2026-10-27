import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { migrate } from './index.js';

/**
 * Test fixture: a fresh, migrated database of its own, so integration tests never touch development data
 * and can run in parallel. The app role gets the same grants it has in the real database.
 */
export async function createTestDatabase(opts: { adminUrl: string; appUrl: string }) {
  const name = `agentcity_test_${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: opts.adminUrl });
  await admin.connect();
  const appRole = new URL(opts.appUrl).username;
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.query(`GRANT CONNECT ON DATABASE ${name} TO ${pg.escapeIdentifier(appRole)}`);
  } finally {
    await admin.end();
  }
  const withDb = (url: string) => {
    const u = new URL(url);
    u.pathname = `/${name}`;
    return u.toString();
  };
  const adminUrl = withDb(opts.adminUrl);
  const appUrl = withDb(opts.appUrl);
  // A new database starts with CREATE on public for everyone; match the hardened main database.
  const c = new pg.Client({ connectionString: adminUrl });
  await c.connect();
  await c.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await c.end();
  const applied = await migrate(adminUrl, 'up');
  return {
    name,
    adminUrl,
    appUrl,
    applied,
    async drop() {
      const a = new pg.Client({ connectionString: opts.adminUrl });
      await a.connect();
      try {
        await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await a.end();
      }
    },
  };
}
