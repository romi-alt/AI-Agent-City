import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import {
  currentRequestId,
  isValidRequestId,
  requestIdMiddleware,
  requestIdOf,
  type RequestWithId,
} from '../src/common/request-id.ts';

function run(header: string | string[] | undefined) {
  const req = { headers: header === undefined ? {} : { 'x-request-id': header } } as unknown as Request;
  const set: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => void (set[k] = v) } as unknown as Response;
  let inside: string | undefined;
  requestIdMiddleware({ generate: () => 'generated-1' })(req, res, () => {
    inside = currentRequestId();
  });
  return { id: (req as RequestWithId).requestId, header: set['X-Request-Id'], inside };
}

describe('request id', () => {
  it('accepts a well-formed incoming X-Request-Id and echoes it', () => {
    const r = run('web-7f3a.b2:9');
    assert.deepEqual(r, { id: 'web-7f3a.b2:9', header: 'web-7f3a.b2:9', inside: 'web-7f3a.b2:9' });
  });

  it('replaces missing, malformed, oversized or repeated ids instead of echoing them', () => {
    for (const bad of [undefined, '', 'has space', 'line\nbreak', 'x'.repeat(129), '-leading', ['a', 'b']]) {
      const r = run(bad as string | undefined);
      assert.deepEqual(r, { id: 'generated-1', header: 'generated-1', inside: 'generated-1' }, String(bad));
    }
  });

  it('generates UUIDs by default and exposes the id only inside the request', () => {
    const req = { headers: {} } as unknown as Request;
    const res = { setHeader() {} } as unknown as Response;
    requestIdMiddleware()(req, res, () => assert.equal(currentRequestId(), (req as RequestWithId).requestId));
    assert.match((req as RequestWithId).requestId, /^[0-9a-f-]{36}$/);
    assert.equal(currentRequestId(), undefined);
  });

  it('requestIdOf falls back to a fresh id for requests the middleware never saw', () => {
    assert.equal(requestIdOf({ requestId: 'abc' } as unknown as Request), 'abc');
    assert.ok(isValidRequestId(requestIdOf(undefined)));
    assert.ok(isValidRequestId(requestIdOf({ requestId: 'bad id' } as unknown as Request)));
  });
});
