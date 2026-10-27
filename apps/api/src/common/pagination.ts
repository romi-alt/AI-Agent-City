// Cursor pagination. A cursor is opaque to clients: base64url(JSON position) + "." + HMAC. The HMAC also covers
// what the cursor was issued for (resource, tenant, workspace, filter), which is not written into the cursor, so
// a cursor from another tenant, workspace, list or filter (or an edited one) fails verification. RLS still decides
// which rows a page can contain; the cursor only says where to continue.
import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
/** Cursors are short-lived bookmarks, not permanent links. */
export const DEFAULT_CURSOR_MAX_AGE_SECONDS = 24 * 60 * 60;
const MAX_CURSOR_LENGTH = 1024;
const DOMAIN = 'agentcity.cursor.v1';

/** The keyset position of the last row on a page, e.g. [createdAtIso, id]. */
export type CursorPosition = readonly (string | number | null)[];

/** What a cursor is valid for. Every field must match on decode. */
export interface CursorBinding {
  /** The list, e.g. "contacts" or "approvals.pending". */
  resource: string;
  tenantId: string;
  workspaceId?: string | null;
  /** stableFilterKey() of the list's filters and sort, so changing them invalidates the cursor. */
  filter?: string;
}

export interface CursorCodec {
  encode(position: CursorPosition, binding: CursorBinding): string;
  /** null/undefined/"" → null (first page). Anything forged, expired or bound elsewhere → ApiError invalid_cursor. */
  decode(cursor: string | null | undefined, binding: CursorBinding): CursorPosition | null;
}

/**
 * Derive a purpose-specific 32-byte key from a deployment secret (HKDF-SHA256), so one secret
 * (e.g. SESSION_ENCRYPTION_KEY) can serve several purposes without the derived keys being related.
 */
export function deriveKey(secret: string, purpose: string): Buffer {
  if (secret.length < 32) throw new Error('The secret used to derive a key must be at least 32 characters.');
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), `agentcity/${purpose}`, 32));
}

/** A stable key for a filter object: key order does not matter, values do. */
export function stableFilterKey(filter: unknown): string {
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .filter(k => (v as Record<string, unknown>)[k] !== undefined)
              .map(k => [k, canon((v as Record<string, unknown>)[k])]),
          )
        : v;
  return createHash('sha256')
    .update(JSON.stringify(canon(filter ?? null)))
    .digest('base64url')
    .slice(0, 22);
}

const invalid = () =>
  new ApiError('invalid_cursor', 'This page link is no longer valid. Start again from the first page.');

/**
 * @param keys signing keys, newest first. New cursors use keys[0]; any listed key verifies (rotation).
 */
export function createCursorCodec(opts: {
  keys: readonly Buffer[];
  maxAgeSeconds?: number;
  now?: () => number;
}): CursorCodec {
  if (!opts.keys.length || opts.keys.some(k => k.length < 32)) throw new Error('Cursor keys must be 32+ bytes.');
  const maxAge = opts.maxAgeSeconds ?? DEFAULT_CURSOR_MAX_AGE_SECONDS;
  const now = opts.now ?? Date.now;
  const mac = (key: Buffer, payload: string, b: CursorBinding) =>
    createHmac('sha256', key)
      .update(`${DOMAIN}\n${JSON.stringify([b.resource, b.tenantId, b.workspaceId ?? '', b.filter ?? ''])}\n${payload}`)
      .digest();

  return {
    encode(position, binding) {
      const payload = Buffer.from(JSON.stringify({ p: position, iat: Math.floor(now() / 1000) })).toString('base64url');
      return `${payload}.${mac(opts.keys[0]!, payload, binding).toString('base64url')}`;
    },

    decode(cursor, binding) {
      if (cursor === null || cursor === undefined || cursor === '') return null;
      if (typeof cursor !== 'string' || cursor.length > MAX_CURSOR_LENGTH) throw invalid();
      const [payload, sig, extra] = cursor.split('.');
      if (!payload || !sig || extra !== undefined) throw invalid();
      const given = Buffer.from(sig, 'base64url');
      const ok = opts.keys.some(k => {
        const expected = mac(k, payload, binding);
        return given.length === expected.length && timingSafeEqual(given, expected);
      });
      if (!ok) throw invalid();
      let parsed: { p?: unknown; iat?: unknown };
      try {
        parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      } catch {
        throw invalid();
      }
      const ageSeconds = Math.floor(now() / 1000) - Number(parsed.iat);
      if (!Number.isFinite(ageSeconds) || ageSeconds < -60 || ageSeconds > maxAge) throw invalid();
      if (
        !Array.isArray(parsed.p) ||
        !parsed.p.every(x => x === null || typeof x === 'string' || typeof x === 'number')
      )
        throw invalid();
      return parsed.p as CursorPosition;
    },
  };
}

/** `first`/`limit` from a query string or GraphQL argument: default when absent, refused (not clamped) when too big. */
export function parsePageSize(input: unknown, opts: { defaultSize?: number; maxSize?: number } = {}): number {
  const def = opts.defaultSize ?? DEFAULT_PAGE_SIZE;
  const max = opts.maxSize ?? MAX_PAGE_SIZE;
  if (input === undefined || input === null || input === '') return def;
  const n = typeof input === 'string' && /^\d+$/.test(input) ? Number(input) : input;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > max)
    throw new ApiError('validation_failed', `Page size must be a whole number from 1 to ${max}.`, {
      details: { issues: [{ path: ['first'], code: 'too_big', message: `Must be between 1 and ${max}.` }] },
    });
  return n;
}

export interface PageInfo {
  hasNextPage: boolean;
  /** Pass back as `after` for the next page; null on the last page. */
  endCursor: string | null;
}
export interface Page<T> {
  items: T[];
  pageInfo: PageInfo;
}

/**
 * Build a page from rows fetched with `LIMIT pageSize + 1` in a stable order (always ending in a unique column,
 * e.g. ORDER BY created_at DESC, id DESC). The extra row only tells us that a next page exists.
 */
export function buildPage<T>(
  rows: readonly T[],
  pageSize: number,
  positionOf: (row: T) => CursorPosition,
  encode: (position: CursorPosition) => string,
): Page<T> {
  const hasNextPage = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  return {
    items,
    pageInfo: { hasNextPage, endCursor: hasNextPage && last !== undefined ? encode(positionOf(last)) : null },
  };
}
