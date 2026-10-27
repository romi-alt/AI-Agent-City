import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertCurrent,
  explainMissedUpdate,
  formatETag,
  nextVersion,
  parseIfMatch,
  readPrecondition,
} from '../src/common/concurrency.ts';
import { ApiError } from '../src/common/errors.ts';

const is = (code: string, status?: number) => (e: unknown) =>
  e instanceof ApiError && e.code === code && (status === undefined || e.status === status);

describe('ETag and If-Match', () => {
  it('formats strong ETags and parses them back, accepting a proxy-weakened W/ form', () => {
    assert.equal(formatETag(7), '"7"');
    assert.deepEqual(parseIfMatch('"7"'), ['7']);
    assert.deepEqual(parseIfMatch('W/"7"'), ['7']);
    assert.deepEqual(parseIfMatch('"7", "8"'), ['7', '8']);
    assert.equal(parseIfMatch('*'), '*');
    assert.equal(parseIfMatch(undefined), undefined);
    assert.throws(() => formatETag('has space'));
  });

  it('refuses malformed If-Match instead of treating it as absent', () => {
    for (const bad of ['7', '"7', '"a b"', '"7";drop', '""'])
      assert.throws(() => parseIfMatch(bad), is('bad_request', 400), bad);
  });
});

describe('readPrecondition', () => {
  it('takes the version from If-Match or from expectedVersion', () => {
    assert.deepEqual(readPrecondition({ ifMatch: '"3"' }), { token: '3', source: 'if-match' });
    assert.deepEqual(readPrecondition({ expectedVersion: 3 }), { token: '3', source: 'body' });
    assert.deepEqual(readPrecondition({ ifMatch: '"3"', expectedVersion: '3' }), { token: '3', source: 'if-match' });
  });

  it('refuses updates without a version, with "*", with several, or with two that disagree', () => {
    assert.throws(() => readPrecondition({}), is('precondition_required', 428));
    assert.throws(() => readPrecondition({ ifMatch: '*' }), is('precondition_required', 428));
    assert.throws(() => readPrecondition({ ifMatch: '"1", "2"' }), is('bad_request'));
    assert.throws(() => readPrecondition({ ifMatch: '"1"', expectedVersion: 2 }), is('bad_request'));
    assert.throws(() => readPrecondition({ expectedVersion: 'a b' }), is('validation_failed'));
  });
});

describe('assertCurrent', () => {
  it('passes when the version matches', () => {
    assertCurrent(3, { token: '3', source: 'if-match' });
    assertCurrent('rev-abc', { token: 'rev-abc', source: 'body' });
  });

  it('is stale_revision: 412 for If-Match, 409 for body/GraphQL, with the current version to reload', () => {
    assert.throws(() => assertCurrent(4, { token: '3', source: 'if-match' }), is('stale_revision', 412));
    try {
      assertCurrent(4, { token: '3', source: 'body' });
      assert.fail('should throw');
    } catch (e) {
      assert.ok(is('stale_revision', 409)(e));
      assert.deepEqual((e as ApiError).details, { currentVersion: '4', expectedVersion: '3' });
    }
  });

  it('is not_found when the row is missing or out of scope (never reveals which)', () => {
    assert.throws(() => assertCurrent(null, { token: '3', source: 'body' }), is('not_found', 404));
    assert.throws(() => assertCurrent(undefined, { token: '3', source: 'if-match' }), is('not_found', 404));
  });

  it('explains a conditional UPDATE that matched no row', async () => {
    await assert.rejects(
      explainMissedUpdate({ token: '3', source: 'if-match' }, async () => 5),
      is('stale_revision', 412),
    );
    await assert.rejects(
      explainMissedUpdate({ token: '3', source: 'body' }, async () => null),
      is('not_found'),
    );
    await assert.rejects(
      explainMissedUpdate({ token: '3', source: 'body' }, async () => 3),
      is('stale_revision', 409),
    );
  });

  it('computes the next integer version', () => {
    assert.equal(nextVersion({ token: '3', source: 'body' }), 4);
    assert.throws(() => nextVersion({ token: 'rev-abc', source: 'body' }));
  });
});
