import type pg from 'pg';
import { withScope, type Scope } from './scope.js';

/**
 * The person a background job acts for no longer has access to that tenant (or workspace). Workers should treat
 * it as final, not retry it: the work was queued on a permission that has since been taken away.
 */
export class ActorNotAuthorizedError extends Error {
  readonly nonRetryable = true;
  readonly actor: Scope;
  constructor(actor: Scope, options?: { cause?: unknown }) {
    super(`${actor.subject} is no longer authorized for tenant ${actor.tenantId}`, options);
    this.name = 'ActorNotAuthorizedError';
    this.actor = actor;
  }
}

/**
 * Runs work done on a person's behalf (a workflow activity, a scheduled job) in that person's scope, checking their
 * membership again at execution time rather than trusting the permission they had when the work was queued. A
 * failed membership check becomes ActorNotAuthorizedError; any other error (including a row-level security refusal
 * inside `fn`) is passed through unchanged.
 */
export async function withActorScope<T>(
  pool: pg.Pool,
  actor: Scope,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  let entered = false;
  try {
    return await withScope(pool, actor, client => {
      entered = true;
      return fn(client);
    });
  } catch (err) {
    if (!entered && (err as { code?: string }).code === '42501')
      throw new ActorNotAuthorizedError(actor, { cause: err });
    throw err;
  }
}
