import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import pg from 'pg';
import { z } from 'zod';
import { API_ERRORS, ApiError, ERROR_STATUS, isApiErrorCode } from '../src/common/errors.ts';
import { renderError, StructuredErrorFilter, expressErrorHandler } from '../src/common/error-filter.ts';
import { AUTH_ERRORS } from '../src/auth/contracts.ts';

const RID = 'req-123';

function pgError(code: string, message: string) {
  const e = new pg.DatabaseError(message, message.length, 'error');
  e.code = code;
  e.severity = 'ERROR';
  e.constraint = 'contact_email_key';
  e.detail = 'Key (email)=(someone@example.com) already exists.';
  return e;
}

/** A minimal Express response double that records what the filter wrote. */
function fakeRes() {
  const out = { status: 0, headers: {} as Record<string, string>, body: undefined as unknown, ended: false };
  const res = {
    headersSent: false,
    setHeader: (k: string, v: string) => void (out.headers[k.toLowerCase()] = v),
    status(s: number) {
      out.status = s;
      return res;
    },
    json(b: unknown) {
      out.body = b;
      return res;
    },
    end: () => void (out.ended = true),
  };
  return { res, out };
}

function httpHost(req: object, res: object): ArgumentsHost {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res, getNext: () => undefined }),
    getArgByIndex: () => undefined,
    getArgs: () => [req, res],
  } as unknown as ArgumentsHost;
}

describe('error codes', () => {
  it('include every M03 auth code, each with a status', () => {
    for (const code of Object.values(AUTH_ERRORS)) {
      assert.ok(isApiErrorCode(code), code);
      assert.ok(ERROR_STATUS[code] >= 400);
    }
    for (const code of Object.values(API_ERRORS)) assert.ok(ERROR_STATUS[code] >= 400, code);
  });
});

describe('renderError', () => {
  it('passes an ApiError through with its code, status and details', () => {
    const r = renderError(new ApiError('conflict', 'Already decided.', { details: { approvalId: 'a1' } }), RID);
    assert.equal(r.status, 409);
    assert.deepEqual(r.body, {
      error: 'conflict',
      message: 'Already decided.',
      requestId: RID,
      details: { approvalId: 'a1' },
    });
  });

  it('turns a zod error into validation_failed with paths, never the received values', () => {
    const parsed = z.object({ email: z.string().email(), n: z.number() }).safeParse({ email: 'secret-value', n: 'x' });
    assert.equal(parsed.success, false);
    const r = renderError(parsed.error, RID);
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'validation_failed');
    const issues = r.body.details!.issues as { path: unknown[] }[];
    assert.deepEqual(issues.map(i => i.path).sort(), [['email'], ['n']]);
    assert.ok(!JSON.stringify(r.body).includes('secret-value'));
  });

  it('keeps an M03 guard code and its reason (step-up), and fills in a message', () => {
    const r = renderError(new HttpException({ error: 'step_up_required', reason: 'billing' }, 403), RID);
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'step_up_required');
    assert.equal(r.body.reason, 'billing');
    assert.equal(r.body.details?.reason, 'billing');
    assert.ok(r.body.message.length > 0);
  });

  it('maps plain Nest exceptions by status', () => {
    assert.equal(renderError(new NotFoundException(), RID).body.error, 'not_found');
    assert.equal(renderError(new ForbiddenException(), RID).body.error, 'forbidden');
    const bad = renderError(new BadRequestException('Pick a person’s desk.'), RID);
    assert.deepEqual([bad.status, bad.body.error, bad.body.message], [400, 'bad_request', 'Pick a person’s desk.']);
  });

  it('never sends a 5xx exception message', () => {
    const r = renderError(new HttpException('connect ECONNREFUSED 10.0.0.5:5432', 502), RID);
    assert.equal(r.status, 502);
    assert.equal(r.body.error, 'internal_error');
    assert.ok(!r.body.message.includes('ECONNREFUSED'));
  });

  it('maps database errors without SQL, constraint names or values', () => {
    const cases: [string, number, string][] = [
      ['23505', 409, 'conflict'],
      ['23503', 404, 'not_found'],
      ['42501', 403, 'forbidden'],
      ['23514', 400, 'validation_failed'],
      ['40001', 409, 'conflict'],
      ['57014', 503, 'service_unavailable'],
      ['XX000', 500, 'internal_error'],
    ];
    for (const [sqlstate, status, code] of cases) {
      const r = renderError(
        pgError(sqlstate, 'duplicate key value violates unique constraint "contact_email_key"'),
        RID,
      );
      assert.deepEqual([r.status, r.body.error], [status, code], sqlstate);
      const text = JSON.stringify(r.body);
      assert.ok(!/contact_email_key|someone@example|duplicate key|SELECT/.test(text), text);
    }
  });

  it('maps body-parser errors (bad JSON, too large)', () => {
    const parse = Object.assign(new SyntaxError('Unexpected token } in JSON at position 9'), {
      status: 400,
      type: 'entity.parse.failed',
      expose: true,
    });
    const r = renderError(parse, RID);
    assert.deepEqual([r.status, r.body.error], [400, 'bad_request']);
    assert.ok(!r.body.message.includes('position'));
    const big = Object.assign(new Error('request entity too large'), { status: 413, type: 'entity.too.large' });
    assert.equal(renderError(big, RID).body.error, 'payload_too_large');
  });

  it('hides unknown errors behind internal_error', () => {
    const r = renderError(new TypeError("Cannot read properties of undefined (reading 'tenant_id')"), RID);
    assert.deepEqual([r.status, r.body.error], [500, 'internal_error']);
    assert.ok(!r.body.message.includes('tenant_id'));
    assert.equal(r.serverFault, true);
  });

  it('adds Retry-After for rate limits', () => {
    const r = renderError(new ApiError('rate_limited', 'Slow down.', { details: { retryAfterSeconds: 12.2 } }), RID);
    assert.equal(r.status, 429);
    assert.equal(r.headers['Retry-After'], '13');
  });
});

describe('StructuredErrorFilter', () => {
  it('writes the structured body with the request id, no-store, and logs 5xx with the stack server-side only', () => {
    const logged: Record<string, unknown>[] = [];
    const filter = new StructuredErrorFilter({ log: { error: (_m, meta) => logged.push(meta) } });
    const { res, out } = fakeRes();
    filter.catch(new Error('boom at db.ts:12'), httpHost({ requestId: RID, headers: {} }, res));
    assert.equal(out.status, 500);
    assert.equal(out.headers['x-request-id'], RID);
    assert.equal(out.headers['cache-control'], 'no-store');
    assert.deepEqual(Object.keys(out.body as object).sort(), ['error', 'message', 'requestId']);
    assert.ok(!JSON.stringify(out.body).includes('boom'));
    assert.equal(logged.length, 1);
    assert.equal(logged[0]!.requestId, RID);
    assert.match(String(logged[0]!.stack), /boom/);
  });

  it('does not log 4xx, and drops the first line of a pg error (it can quote values) from the log', () => {
    const logged: Record<string, unknown>[] = [];
    const filter = new StructuredErrorFilter({ log: { error: (_m, meta) => logged.push(meta) } });
    filter.catch(new NotFoundException(), httpHost({ requestId: RID }, fakeRes().res));
    assert.equal(logged.length, 0);
    filter.catch(
      pgError('XX000', 'Key (email)=(someone@example.com) broke'),
      httpHost({ requestId: RID }, fakeRes().res),
    );
    assert.equal(logged.length, 1);
    assert.ok(!JSON.stringify(logged[0]).includes('someone@example.com'));
    assert.equal(logged[0]!.sqlstate, 'XX000');
  });

  it('generates a request id if the middleware did not run', () => {
    const { res, out } = fakeRes();
    new StructuredErrorFilter({ log: { error: () => {} } }).catch(new NotFoundException(), httpHost({}, res));
    assert.match((out.body as { requestId: string }).requestId, /^[0-9a-f-]{36}$/);
  });

  it('only ends a response whose headers were already sent (a started stream)', () => {
    const { res, out } = fakeRes();
    res.headersSent = true;
    new StructuredErrorFilter({ log: { error: () => {} } }).catch(new Error('x'), httpHost({}, res));
    assert.equal(out.ended, true);
    assert.equal(out.status, 0);
  });

  it('returns a GraphQLError with the same code, request id and details in GraphQL', () => {
    const host = {
      getType: () => 'graphql',
      getArgByIndex: (i: number) => (i === 2 ? { req: { requestId: RID } } : undefined),
    } as unknown as ArgumentsHost;
    const out = new StructuredErrorFilter({ log: { error: () => {} } }).catch(
      new ApiError('stale_revision', 'Changed.', { status: 409, details: { currentVersion: '4' } }),
      host,
    );
    assert.ok(out instanceof GraphQLError);
    assert.equal(out.message, 'Changed.');
    assert.deepEqual(out.extensions, {
      code: 'stale_revision',
      requestId: RID,
      status: 409,
      details: { currentVersion: '4' },
    });
  });
});

describe('expressErrorHandler', () => {
  it('renders errors raised outside Nest the same way', () => {
    const { res, out } = fakeRes();
    const parse = Object.assign(new SyntaxError('Unexpected token'), { status: 400, type: 'entity.parse.failed' });
    expressErrorHandler({ log: { error: () => {} } })(parse, { requestId: RID } as never, res as never, () => {});
    assert.equal(out.status, 400);
    assert.deepEqual(out.body, {
      error: 'bad_request',
      message: 'The request body is not valid JSON.',
      requestId: RID,
    });
  });
});
