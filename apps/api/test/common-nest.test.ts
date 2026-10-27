// The common plumbing inside a real Nest app (Express adapter, Apollo GraphQL), wired the way the report asks the
// integrator to wire main.ts/app.module.ts. Decorators are applied as function calls: tsx compiles test files
// without experimentalDecorators (only src/ is in the API tsconfig).
import 'reflect-metadata';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Body, Controller, Get, Headers, type INestApplication, Module, Post, Put } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Field, GraphQLModule, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { z } from 'zod';
import { assertCurrent, formatETag, readPrecondition } from '../src/common/concurrency.ts';
import { ApiError } from '../src/common/errors.ts';
import { StructuredErrorFilter, expressErrorHandler } from '../src/common/error-filter.ts';
import { formatGraphqlError, queryLimitsRule } from '../src/common/graphql.ts';
import { requestIdMiddleware } from '../src/common/request-id.ts';

const Echo = z.object({ name: z.string().min(1).max(80) });

class ProbeController {
  conflict() {
    throw new ApiError('conflict', 'That approval was already decided.');
  }
  echo(body: unknown) {
    return Echo.parse(body);
  }
  boom() {
    throw new Error('relation "app.secret_table" does not exist');
  }
  update(ifMatch: string | undefined) {
    const pre = readPrecondition({ ifMatch });
    assertCurrent(5, pre);
    return { version: 6, etag: formatETag(6) };
  }
}
const decorate = (method: keyof ProbeController, ...ds: MethodDecorator[]) => {
  const d = Object.getOwnPropertyDescriptor(ProbeController.prototype, method)!;
  for (const x of ds) x(ProbeController.prototype, method, d);
};
Controller('api/probe')(ProbeController);
decorate('conflict', Get('conflict'));
decorate('echo', Post('echo'));
Body()(ProbeController.prototype, 'echo', 0);
decorate('boom', Get('boom'));
decorate('update', Put('item'));
Headers('if-match')(ProbeController.prototype, 'update', 0);

class Node {
  id!: string;
  child?: Node;
}
ObjectType('ProbeNode')(Node);
Field(() => String)(Node.prototype, 'id');
Field(() => Node, { nullable: true })(Node.prototype, 'child');

class ProbeResolver {
  probeForbidden(): string {
    throw new ApiError('forbidden', 'You do not have permission to do that.');
  }
  probeBoom(): string {
    throw new Error('password=hunter2 in connection string');
  }
  probeNode(): Node {
    return { id: 'n1' };
  }
}
const rdecorate = (method: keyof ProbeResolver, ...ds: MethodDecorator[]) => {
  const d = Object.getOwnPropertyDescriptor(ProbeResolver.prototype, method)!;
  for (const x of ds) x(ProbeResolver.prototype, method, d);
};
Resolver()(ProbeResolver);
rdecorate(
  'probeForbidden',
  Query(() => String),
);
rdecorate(
  'probeBoom',
  Query(() => String),
);
rdecorate(
  'probeNode',
  Query(() => Node),
);

class ProbeModule {}
Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      playground: false,
      introspection: false,
      includeStacktraceInErrorResponses: false,
      validationRules: [queryLimitsRule({ maxDepth: 3 })],
      formatError: formatGraphqlError,
    }),
  ],
  controllers: [ProbeController],
  providers: [ProbeResolver],
})(ProbeModule);

describe('common plumbing in a Nest app', () => {
  let app: INestApplication;
  let base: string;
  const logged: Record<string, unknown>[] = [];

  before(async () => {
    app = await NestFactory.create(ProbeModule, { logger: false });
    app.use(requestIdMiddleware());
    app.useGlobalFilters(new StructuredErrorFilter({ log: { error: (_m, meta) => logged.push(meta) } }));
    await app.init();
    app.use(expressErrorHandler({ log: { error: (_m, meta) => logged.push(meta) } }));
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  after(async () => {
    await app?.close();
  });

  const call = async (method: string, path: string, init: { body?: string; headers?: Record<string, string> } = {}) => {
    const res = await fetch(base + path, {
      method,
      body: init.body,
      headers: { 'content-type': 'application/json', ...init.headers },
    });
    return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, any> };
  };

  it('ApiError → structured body, echoed request id', async () => {
    const r = await call('GET', '/api/probe/conflict', { headers: { 'x-request-id': 'web-abc123' } });
    assert.equal(r.status, 409);
    assert.deepEqual(r.body, {
      error: 'conflict',
      message: 'That approval was already decided.',
      requestId: 'web-abc123',
    });
    assert.equal(r.headers.get('x-request-id'), 'web-abc123');
  });

  it('zod failure → validation_failed; malformed JSON → bad_request; both with a generated request id', async () => {
    const v = await call('POST', '/api/probe/echo', { body: JSON.stringify({ name: '' }) });
    assert.equal(v.status, 400);
    assert.equal(v.body.error, 'validation_failed');
    assert.deepEqual(v.body.details.issues[0].path, ['name']);
    assert.equal(v.headers.get('x-request-id'), v.body.requestId);

    const j = await call('POST', '/api/probe/echo', { body: '{"name": ' });
    assert.equal(j.status, 400);
    assert.equal(j.body.error, 'bad_request');
    assert.match(j.body.requestId, /^[0-9a-f-]{36}$/);
    assert.ok(!JSON.stringify(j.body).includes('position'));
  });

  it('unknown route → not_found in the same format', async () => {
    const r = await call('GET', '/api/nope');
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'not_found');
  });

  it('unexpected error → internal_error, no SQL in the body, stack logged with the request id', async () => {
    const r = await call('GET', '/api/probe/boom', { headers: { 'x-request-id': 'boom-1' } });
    assert.equal(r.status, 500);
    assert.equal(r.body.error, 'internal_error');
    assert.ok(!JSON.stringify(r.body).includes('secret_table'));
    assert.ok(logged.some(m => m.requestId === 'boom-1' && String(m.stack).includes('secret_table')));
  });

  it('If-Match: missing → 428, stale → 412 with current version, current → 200', async () => {
    assert.equal((await call('PUT', '/api/probe/item', { body: '{}' })).body.error, 'precondition_required');
    const stale = await call('PUT', '/api/probe/item', { body: '{}', headers: { 'if-match': '"4"' } });
    assert.equal(stale.status, 412);
    assert.equal(stale.body.error, 'stale_revision');
    assert.equal(stale.body.details.currentVersion, '5');
    const ok = await call('PUT', '/api/probe/item', { body: '{}', headers: { 'if-match': '"5"' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.etag, '"6"');
  });

  it('GraphQL errors carry the same code and request id; internal ones are hidden', async () => {
    const r = await call('POST', '/graphql', {
      body: JSON.stringify({ query: '{ probeForbidden }' }),
      headers: { 'x-request-id': 'gql-1' },
    });
    const e = r.body.errors[0];
    assert.equal(e.extensions.code, 'forbidden');
    assert.equal(e.extensions.requestId, 'gql-1');
    assert.equal(r.headers.get('x-request-id'), 'gql-1');

    const boom = await call('POST', '/graphql', { body: JSON.stringify({ query: '{ probeBoom }' }) });
    assert.equal(boom.body.errors[0].extensions.code, 'internal_error');
    assert.ok(!JSON.stringify(boom.body).includes('hunter2'));
    assert.ok(!JSON.stringify(boom.body).includes('stacktrace'));
  });

  it('GraphQL depth limit refuses before any resolver runs; batched requests are refused', async () => {
    const deep = await call('POST', '/graphql', {
      body: JSON.stringify({ query: '{ probeNode { child { child { child { id } } } } }' }),
    });
    assert.equal(deep.body.errors[0].extensions.code, 'validation_failed');
    assert.match(deep.body.errors[0].message, /nested too deeply/);
    assert.equal(deep.body.data, undefined);

    const batch = await fetch(`${base}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{ query: '{ probeNode { id } }' }, { query: '{ probeNode { id } }' }]),
    });
    assert.equal(batch.status, 400, 'Apollo batching stays off (allowBatchedHttpRequests: false is the default)');
  });
});
