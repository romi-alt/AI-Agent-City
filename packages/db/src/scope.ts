import type pg from 'pg';

/** Who is acting, for which tenant, and optionally which workspace. Comes from server-side membership, never from request headers. */
export interface Scope {
  subject: string;
  tenantId: string;
  workspaceId?: string | null;
}

/**
 * Runs `fn` in one transaction whose row-level security scope is `scope`. The database checks membership and
 * signs the scope (app.enter_scope); it ends with the transaction, so a pooled connection never carries it into
 * the next caller. Any error rolls back; a connection whose rollback fails is discarded instead of reused.
 */
export async function withScope<T>(pool: pg.Pool, scope: Scope, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query('BEGIN');
    await client.query('SELECT app.enter_scope($1, $2, $3)', [
      scope.subject,
      scope.tenantId,
      scope.workspaceId ?? null,
    ]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch((e: Error) => {
      broken = e;
    });
    throw err;
  } finally {
    client.release(broken);
  }
}
