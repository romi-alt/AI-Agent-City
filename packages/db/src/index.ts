import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import pg from 'pg';

export { withScope, type Scope } from './scope.js';

/** Where the SQL migrations live (shipped with the package, next to dist/). */
export const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), '../../migrations');
export const MIGRATIONS_TABLE = 'pgmigrations';

/**
 * Apply (or roll back) schema migrations. Runs as the admin role: the app role cannot change the schema.
 * Returns the names of the migrations that ran.
 */
export async function migrate(adminUrl: string, direction: 'up' | 'down' = 'up', count?: number) {
  const ran = await runner({
    databaseUrl: adminUrl,
    dir: MIGRATIONS_DIR,
    direction,
    count: count ?? (direction === 'up' ? Infinity : 1),
    migrationsTable: MIGRATIONS_TABLE,
    checkOrder: true,
    log: () => {},
  });
  return ran.map(m => m.name);
}

/** A small pool for the app role. The API and worker each create one. */
export function createPool(url: string, max = 5) {
  return new pg.Pool({ connectionString: url, max, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30_000 });
}
