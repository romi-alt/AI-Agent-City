import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from '../src/common/errors.ts';
import {
  buildPage,
  createCursorCodec,
  deriveKey,
  MAX_PAGE_SIZE,
  parsePageSize,
  stableFilterKey,
  type CursorBinding,
} from '../src/common/pagination.ts';

const SECRET = 'local-test-secret-of-at-least-32-characters';
const key = deriveKey(SECRET, 'cursor');
const tenantA: CursorBinding = { resource: 'contacts', tenantId: 'tenant-a', workspaceId: 'ws-1', filter: 'f1' };

const isInvalidCursor = (e: unknown) => e instanceof ApiError && e.code === 'invalid_cursor' && e.status === 400;

describe('cursor codec', () => {
  it('round-trips a keyset position for the same binding', () => {
    const codec = createCursorCodec({ keys: [key] });
    const c = codec.encode(['2026-10-27T10:00:00.000Z', 'id-9'], tenantA);
    assert.deepEqual(codec.decode(c, tenantA), ['2026-10-27T10:00:00.000Z', 'id-9']);
    assert.equal(codec.decode(undefined, tenantA), null);
    assert.equal(codec.decode('', tenantA), null);
  });

  it('does not write the tenant, workspace or filter into the cursor', () => {
    const c = createCursorCodec({ keys: [key] }).encode([1], tenantA);
    const payload = Buffer.from(c.split('.')[0]!, 'base64url').toString();
    assert.ok(!/tenant-a|ws-1|contacts/.test(payload), payload);
  });

  it('refuses a cursor used for another tenant, workspace, list or filter', () => {
    const codec = createCursorCodec({ keys: [key] });
    const c = codec.encode(['x', 'y'], tenantA);
    for (const other of [
      { ...tenantA, tenantId: 'tenant-b' },
      { ...tenantA, workspaceId: 'ws-2' },
      { ...tenantA, workspaceId: null },
      { ...tenantA, resource: 'approvals' },
      { ...tenantA, filter: 'f2' },
    ])
      assert.throws(() => codec.decode(c, other), isInvalidCursor, JSON.stringify(other));
  });

  it('refuses edited, truncated, junk and oversized cursors', () => {
    const codec = createCursorCodec({ keys: [key] });
    const c = codec.encode(['a'], tenantA);
    const [payload, sig] = c.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ p: ['z'], iat: Math.floor(Date.now() / 1000) })).toString('base64url');
    for (const bad of [
      `${forged}.${sig}`,
      payload,
      `${payload}.`,
      `${c}.x`,
      'not-a-cursor',
      'a'.repeat(5000),
      `${payload}.${sig.slice(1)}`,
    ])
      assert.throws(() => codec.decode(bad, tenantA), isInvalidCursor, bad.slice(0, 40));
  });

  it('refuses a cursor signed with another key (another deployment or purpose)', () => {
    const c = createCursorCodec({ keys: [deriveKey(SECRET, 'other-purpose')] }).encode(['a'], tenantA);
    assert.throws(() => createCursorCodec({ keys: [key] }).decode(c, tenantA), isInvalidCursor);
  });

  it('accepts cursors from the previous key during rotation', () => {
    const next = deriveKey('another-secret-that-is-32-characters-long', 'cursor');
    const old = createCursorCodec({ keys: [key] }).encode(['a'], tenantA);
    assert.deepEqual(createCursorCodec({ keys: [next, key] }).decode(old, tenantA), ['a']);
  });

  it('expires cursors after maxAge', () => {
    let t = Date.parse('2026-10-27T10:00:00Z');
    const codec = createCursorCodec({ keys: [key], maxAgeSeconds: 60, now: () => t });
    const c = codec.encode(['a'], tenantA);
    t += 59_000;
    assert.deepEqual(codec.decode(c, tenantA), ['a']);
    t += 2_000;
    assert.throws(() => codec.decode(c, tenantA), isInvalidCursor);
  });

  it('refuses short keys and short secrets', () => {
    assert.throws(() => createCursorCodec({ keys: [Buffer.alloc(16)] }));
    assert.throws(() => createCursorCodec({ keys: [] }));
    assert.throws(() => deriveKey('short', 'cursor'));
  });
});

describe('page helpers', () => {
  it('parses page sizes: default, numeric strings, refuses out of range', () => {
    assert.equal(parsePageSize(undefined), 25);
    assert.equal(parsePageSize('10'), 10);
    assert.equal(parsePageSize(MAX_PAGE_SIZE), MAX_PAGE_SIZE);
    for (const bad of [0, -1, MAX_PAGE_SIZE + 1, 2.5, '1e3', 'ten', {}])
      assert.throws(
        () => parsePageSize(bad),
        (e: unknown) => e instanceof ApiError && e.code === 'validation_failed',
        String(bad),
      );
  });

  it('stableFilterKey ignores key order and undefined, but not values', () => {
    assert.equal(
      stableFilterKey({ a: 1, b: [2, { c: 3 }] }),
      stableFilterKey({ b: [2, { c: 3 }], a: 1, z: undefined }),
    );
    assert.notEqual(stableFilterKey({ stage: 'new' }), stableFilterKey({ stage: 'won' }));
  });

  it('builds a page from limit+1 rows, with a cursor only when there is more', () => {
    const codec = createCursorCodec({ keys: [key] });
    const rows = [1, 2, 3, 4].map(n => ({ id: `id-${n}`, at: n }));
    const enc = (p: readonly (string | number | null)[]) => codec.encode(p, tenantA);
    const first = buildPage(rows, 3, r => [r.at, r.id], enc);
    assert.deepEqual(
      first.items.map(r => r.id),
      ['id-1', 'id-2', 'id-3'],
    );
    assert.equal(first.pageInfo.hasNextPage, true);
    assert.deepEqual(codec.decode(first.pageInfo.endCursor, tenantA), [3, 'id-3']);
    const last = buildPage(rows.slice(3), 3, r => [r.at, r.id], enc);
    assert.deepEqual(last.pageInfo, { hasNextPage: false, endCursor: null });
  });
});
