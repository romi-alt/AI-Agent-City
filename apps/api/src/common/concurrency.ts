// Optimistic concurrency. Every editable resource has a version token: an integer `version` column for mutable
// rows (contacts, opportunities, content, settings), or the draft revision id for approvals. Reads return it as
// an ETag and in the body; writes must say which version they edited (REST: If-Match; GraphQL and JSON bodies:
// expectedVersion). A write against an older version is refused with stale_revision instead of silently
// overwriting someone else's change.
import { ApiError } from './errors.js';

/** Version tokens are digits or a revision id/hash: never quotes, commas or spaces. */
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;

export interface Precondition {
  token: string;
  /** Where it came from: decides 412 (If-Match header) versus 409 (body field / GraphQL argument). */
  source: 'if-match' | 'body';
}

/** `"7"` for version 7. Strong ETag; a proxy may weaken it to W/"7", which parseIfMatch also accepts. */
export function formatETag(version: number | string): string {
  const token = String(version);
  if (!TOKEN.test(token)) throw new Error(`Not a valid version token: ${token}`);
  return `"${token}"`;
}

/**
 * Parse an If-Match header into its tokens. "*" is returned as '*'. A malformed header is a 400, not a silent
 * "no precondition".
 */
export function parseIfMatch(header: string | string[] | undefined): string[] | '*' | undefined {
  if (header === undefined) return undefined;
  const raw = (Array.isArray(header) ? header.join(',') : header).trim();
  if (raw === '') return undefined;
  if (raw === '*') return '*';
  const tokens: string[] = [];
  for (const part of raw.split(',')) {
    const m = /^\s*(?:W\/)?"([^"]*)"\s*$/.exec(part);
    if (!m || !TOKEN.test(m[1]!))
      throw new ApiError('bad_request', 'The If-Match header is not valid. Send the ETag you received, in quotes.');
    tokens.push(m[1]!);
  }
  return tokens;
}

/**
 * The version the caller edited, from If-Match or from a body/GraphQL `expectedVersion`. Updates without one are
 * refused (428 precondition_required): blind overwrites are what lost edits in the legacy app.
 */
export function readPrecondition(input: {
  ifMatch?: string | string[] | undefined;
  expectedVersion?: number | string | null | undefined;
}): Precondition {
  const header = parseIfMatch(input.ifMatch);
  if (header === '*')
    throw new ApiError('precondition_required', 'Send the version you edited (If-Match: "<version>"), not "*".');
  if (header && header.length !== 1) throw new ApiError('bad_request', 'Send exactly one version in If-Match.');
  const fromBody =
    input.expectedVersion === null || input.expectedVersion === undefined ? undefined : String(input.expectedVersion);
  if (fromBody !== undefined && !TOKEN.test(fromBody))
    throw new ApiError('validation_failed', 'expectedVersion is not a valid version.', {
      details: { issues: [{ path: ['expectedVersion'], code: 'invalid_format', message: 'Not a version.' }] },
    });
  if (header && fromBody !== undefined && header[0] !== fromBody)
    throw new ApiError('bad_request', 'If-Match and expectedVersion disagree. Send one of them.');
  if (header) return { token: header[0]!, source: 'if-match' };
  if (fromBody !== undefined) return { token: fromBody, source: 'body' };
  throw new ApiError(
    'precondition_required',
    'This change needs the version you edited (If-Match header or expectedVersion).',
  );
}

/** The error for a stale write: 412 for If-Match, 409 otherwise; details carry the current version to reload. */
export function staleRevision(pre: Precondition, current: number | string): ApiError {
  return new ApiError('stale_revision', 'Someone changed this since you opened it. Reload to see the latest version.', {
    status: pre.source === 'if-match' ? 412 : 409,
    details: { currentVersion: String(current), expectedVersion: pre.token },
  });
}

/**
 * Check a precondition against the current version read in the same transaction (SELECT … FOR UPDATE). `null`
 * means the row is absent or outside the caller's scope: not_found, never a hint that it exists.
 */
export function assertCurrent(current: number | string | null | undefined, pre: Precondition): void {
  if (current === null || current === undefined) throw new ApiError('not_found', 'That item was not found.');
  if (String(current) !== pre.token) throw staleRevision(pre, current);
}

/**
 * For the single-statement form `UPDATE … SET version = version + 1 WHERE id = $1 AND version = $2 RETURNING
 * version`: if no row came back, look up the current version (in the same scoped transaction) and explain why.
 */
export async function explainMissedUpdate(
  pre: Precondition,
  currentVersion: () => Promise<number | string | null | undefined>,
): Promise<never> {
  const current = await currentVersion();
  assertCurrent(current, pre);
  // The row matched on re-read: it changed back between the two statements. Still a race the caller lost.
  throw staleRevision(pre, current!);
}

/** The next integer version after a successful update (for responses and ETags). */
export const nextVersion = (pre: Precondition): number => {
  const n = Number(pre.token);
  if (!Number.isInteger(n) || n < 0) throw new Error('nextVersion() applies to integer versions only.');
  return n + 1;
};
