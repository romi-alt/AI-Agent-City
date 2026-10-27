// Realtime gateway: handshake authentication, tenant rooms and revocation, against the real RevocationBus on the
// local Redis (REDIS_URL, from infra/local-dev.env when not set). SESSION_RESOLVER is a fake the test controls.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Global, type INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { SESSION_RESOLVER, type SessionContext, type SessionResolver } from '../src/auth/contracts.ts';
import { API_ENV, type ApiEnv } from '../src/env.ts';
import { RevocationBus } from '../src/platform/revocation-bus.ts';
import { RealtimeGateway } from '../src/realtime/realtime.gateway.ts';
import { RealtimeModule } from '../src/realtime/realtime.module.ts';
import { REALTIME_OPTIONS } from '../src/realtime/realtime.options.ts';
import { RealtimeService } from '../src/realtime/realtime.service.ts';

const envFile = join(import.meta.dirname, '..', '..', '..', 'infra', 'local-dev.env');
if (!process.env.REDIS_URL && existsSync(envFile)) process.loadEnvFile(envFile);
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) throw new Error('REDIS_URL is not set and infra/local-dev.env was not found');

const ORIGIN = 'http://localhost:3999';
const RECHECK_MS = 300;

/** Fake resolver: cookie `ac_session=<token>` + proof `proof:<token>` + the right Origin → that token's session. */
class FakeResolver implements SessionResolver {
  readonly byToken = new Map<string, SessionContext>();
  readonly byId = new Map<string, SessionContext | null>();
  private readonly calls = new Map<string, number>();
  /** Lets a test hold a handshake check open (to publish a revocation while it is in flight). */
  readonly holds = new Map<string, Promise<void>>();
  handshakesFor(token: string) {
    return this.calls.get(token) ?? 0;
  }
  async resolveHandshake(input: { cookieHeader?: string; proof?: string; origin?: string }) {
    const token = /(?:^|;\s*)ac_session=([^;]+)/.exec(input.cookieHeader ?? '')?.[1];
    if (token) this.calls.set(token, this.handshakesFor(token) + 1);
    if (token) await this.holds.get(token);
    if (!token || input.proof !== `proof:${token}` || input.origin !== ORIGIN) return null;
    const s = this.byToken.get(token);
    if (!s) return null;
    // Like the real resolver: a session that has since been revoked does not resolve.
    return this.byId.get(s.sessionId) ?? null;
  }
  async current(sessionId: string) {
    return this.byId.get(sessionId) ?? null;
  }
}

const resolver = new FakeResolver();
let app: INestApplication;
let url: string;
let bus: RevocationBus;
const clients: ClientSocket[] = [];

function makeSession(over: Partial<SessionContext> = {}): { token: string; session: SessionContext } {
  const token = randomUUID();
  const session: SessionContext = {
    sessionId: `s-${randomUUID()}`,
    subject: `kc:${randomUUID()}`,
    email: null,
    emailVerified: true,
    deviceId: `d-${randomUUID()}`,
    amr: ['passkey'],
    acr: '2',
    authTime: new Date(),
    stepUpAt: null,
    tenantId: `t-${randomUUID()}`,
    workspaceId: null,
    ...over,
  };
  resolver.byToken.set(token, session);
  resolver.byId.set(session.sessionId, session);
  return { token, session };
}

function connect(
  token: string | undefined,
  opts: { origin?: string | null; proof?: string; transports?: ('websocket' | 'polling')[] } = {},
): ClientSocket {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `other=1; ac_session=${token}`;
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  const c = io(url, {
    path: '/socket.io',
    transports: opts.transports ?? ['websocket'],
    extraHeaders: headers,
    auth: { proof: opts.proof ?? (token ? `proof:${token}` : undefined) },
    reconnection: false,
    forceNew: true,
    timeout: 3000,
  });
  clients.push(c);
  return c;
}

/** Resolves on connect, rejects with the connect_error message. */
function connected(c: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    c.once('connect', () => resolve());
    c.once('connect_error', err => reject(err));
  });
}

async function refused(c: ClientSocket): Promise<Error> {
  return new Promise((resolve, reject) => {
    c.once('connect', () => reject(new Error('connection was accepted')));
    c.once('connect_error', err => resolve(err));
  });
}

/** Resolves with the `revoked` payload once the socket has been disconnected, and how long that took. */
function revokedAndDisconnected(
  c: ClientSocket,
  limitMs = 3000,
): Promise<{ payload: unknown; reason: string; ms: number }> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    let payload: unknown;
    const t = setTimeout(() => reject(new Error(`still connected after ${limitMs} ms`)), limitMs);
    c.once('revoked', p => (payload = p));
    c.once('disconnect', reason => {
      clearTimeout(t);
      resolve({ payload, reason, ms: Date.now() - start });
    });
  });
}

function nextEvent(c: ClientSocket, event: string, ms = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ${event} within ${ms} ms`)), ms);
    c.once(event, p => {
      clearTimeout(t);
      resolve(p);
    });
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

before(async () => {
  const env = { REDIS_URL, PUBLIC_ORIGIN: ORIGIN } as ApiEnv;
  @Global()
  @Module({
    providers: [{ provide: API_ENV, useValue: env }, RevocationBus, { provide: SESSION_RESOLVER, useValue: resolver }],
    exports: [API_ENV, RevocationBus, SESSION_RESOLVER],
  })
  class TestPlatform {}
  const moduleRef = await Test.createTestingModule({ imports: [TestPlatform, RealtimeModule] })
    .overrideProvider(REALTIME_OPTIONS)
    .useValue({ recheckIntervalMs: RECHECK_MS })
    .compile();
  app = moduleRef.createNestApplication({ logger: ['error'] });
  await app.listen(0, '127.0.0.1');
  url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  bus = app.get(RevocationBus);
});

after(async () => {
  for (const c of clients) c.disconnect();
  await app?.close();
});

describe('handshake', () => {
  it('refuses a handshake without a session cookie', async () => {
    const err = await refused(connect(undefined));
    assert.equal(err.message, 'not_signed_in');
  });

  it('refuses a valid cookie with a missing or wrong device proof, with the same generic error', async () => {
    const { token } = makeSession();
    assert.equal((await refused(connect(token, { proof: 'proof:someone-else' }))).message, 'not_signed_in');
    const c = io(url, {
      path: '/socket.io',
      transports: ['websocket'],
      extraHeaders: { cookie: `ac_session=${token}`, origin: ORIGIN },
      reconnection: false,
      forceNew: true,
    });
    clients.push(c);
    assert.equal((await refused(c)).message, 'not_signed_in');
  });

  it('refuses a handshake from another Origin, or with no Origin, before the session is looked at', async () => {
    const { token } = makeSession();
    // Refused at the transport (a transport error), not by the session check (which would say not_signed_in).
    for (const c of [
      connect(token, { origin: 'https://evil.example' }),
      connect(token, { origin: null }),
      connect(token, { origin: 'https://evil.example', transports: ['polling'] }),
    ]) {
      const err = await refused(c);
      assert.notEqual(err.message, 'not_signed_in', 'refused by the Origin check, before authentication');
    }
    assert.equal(resolver.handshakesFor(token), 0);
  });

  it('accepts a valid session and joins only its tenant and workspace rooms', async () => {
    const { token, session } = makeSession({ workspaceId: `w-${randomUUID()}` });
    const c = connect(token);
    await connected(c);
    const server = app.get(RealtimeGateway)['server']!;
    const sockets = await server.in(`tenant:${session.tenantId}`).fetchSockets();
    assert.equal(sockets.length, 1);
    assert.deepEqual(
      [...sockets[0]!.rooms].filter(r => r !== sockets[0]!.id).sort(),
      [`tenant:${session.tenantId}`, `workspace:${session.workspaceId}`].sort(),
    );
  });

  it('accepts a polling handshake from PUBLIC_ORIGIN with credentialed CORS headers', async () => {
    const res = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, { headers: { origin: ORIGIN } });
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
    await res.text();
    const bad = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, {
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
    assert.ok(bad.status >= 400);
    await bad.text();
    const c = connect(makeSession().token, { transports: ['polling'] });
    await connected(c);
  });
});

describe('tenant rooms', () => {
  it('delivers a tenant event only to that tenant, and nothing to a session without a tenant', async () => {
    const a = makeSession();
    const b = makeSession();
    const none = makeSession({ tenantId: null });
    const ca = connect(a.token);
    const cb = connect(b.token);
    const cn = connect(none.token);
    await Promise.all([connected(ca), connected(cb), connected(cn)]);
    const seen: string[] = [];
    cb.on('lead.updated', () => seen.push('b'));
    cn.on('lead.updated', () => seen.push('none'));
    const got = nextEvent(ca, 'lead.updated');
    app.get(RealtimeService).publishToTenant(a.session.tenantId!, 'lead.updated', { id: 'L1' });
    assert.deepEqual(await got, { id: 'L1' });
    await sleep(200);
    assert.deepEqual(seen, []);
    assert.throws(() => app.get(RealtimeService).publishToTenant('', 'x', {}));
  });
});

describe('revocation', () => {
  it('session revocation disconnects that socket within a second and leaves another session connected', async () => {
    const victim = makeSession();
    const other = makeSession({ subject: victim.session.subject, deviceId: victim.session.deviceId });
    const cv = connect(victim.token);
    const co = connect(other.token);
    await Promise.all([connected(cv), connected(co)]);
    const done = revokedAndDisconnected(cv);
    resolver.byId.set(victim.session.sessionId, null);
    await bus.publish({ kind: 'session', sessionId: victim.session.sessionId, reason: 'signed_out' });
    const r = await done;
    assert.deepEqual(r.payload, { reason: 'signed_out' });
    assert.equal(r.reason, 'io server disconnect');
    assert.ok(r.ms < 1000, `took ${r.ms} ms`);
    await sleep(150);
    assert.equal(co.connected, true);
  });

  it('reconnecting after revocation is refused', async () => {
    const s = makeSession();
    const c = connect(s.token);
    await connected(c);
    const done = revokedAndDisconnected(c);
    resolver.byId.set(s.session.sessionId, null);
    await bus.publish({ kind: 'session', sessionId: s.session.sessionId, reason: 'revoked' });
    await done;
    assert.equal((await refused(connect(s.token))).message, 'not_signed_in');
  });

  it('device revocation disconnects every session on that device only', async () => {
    const deviceId = `d-${randomUUID()}`;
    const s1 = makeSession({ deviceId });
    const s2 = makeSession({ deviceId, subject: s1.session.subject });
    const elsewhere = makeSession({ subject: s1.session.subject });
    const [c1, c2, c3] = [connect(s1.token), connect(s2.token), connect(elsewhere.token)];
    await Promise.all([connected(c1), connected(c2), connected(c3)]);
    const d1 = revokedAndDisconnected(c1);
    const d2 = revokedAndDisconnected(c2);
    await bus.publish({ kind: 'device', deviceId, reason: 'device_revoked' });
    const [r1, r2] = await Promise.all([d1, d2]);
    assert.deepEqual(r1.payload, { reason: 'device_revoked' });
    assert.deepEqual(r2.payload, { reason: 'device_revoked' });
    assert.ok(r1.ms < 1000 && r2.ms < 1000);
    await sleep(150);
    assert.equal(c3.connected, true);
  });

  it('person revocation disconnects all of that person’s sockets and nobody else’s', async () => {
    const subject = `kc:${randomUUID()}`;
    const s1 = makeSession({ subject });
    const s2 = makeSession({ subject, tenantId: null });
    const stranger = makeSession({ tenantId: s1.session.tenantId });
    const [c1, c2, c3] = [connect(s1.token), connect(s2.token), connect(stranger.token)];
    await Promise.all([connected(c1), connected(c2), connected(c3)]);
    const done = Promise.all([revokedAndDisconnected(c1), revokedAndDisconnected(c2)]);
    await bus.publish({ kind: 'person', subject, reason: 'person_disabled' });
    for (const r of await done) {
      assert.deepEqual(r.payload, { reason: 'person_disabled' });
      assert.ok(r.ms < 1000);
    }
    await sleep(150);
    assert.equal(c3.connected, true);
  });

  it('membership revocation ends the person’s sockets in that tenant only', async () => {
    const subject = `kc:${randomUUID()}`;
    const inTenant = makeSession({ subject });
    const otherTenant = makeSession({ subject });
    const colleague = makeSession({ tenantId: inTenant.session.tenantId });
    const [c1, c2, c3] = [connect(inTenant.token), connect(otherTenant.token), connect(colleague.token)];
    await Promise.all([connected(c1), connected(c2), connected(c3)]);
    const done = revokedAndDisconnected(c1);
    await bus.publish({
      kind: 'membership',
      subject,
      tenantId: inTenant.session.tenantId!,
      reason: 'membership_removed',
    });
    const r = await done;
    assert.deepEqual(r.payload, { reason: 'membership_removed' });
    assert.ok(r.ms < 1000);
    // A membership change in a tenant the socket is not working in does not affect it.
    await bus.publish({ kind: 'membership', subject, tenantId: `t-${randomUUID()}`, reason: 'membership_removed' });
    await sleep(200);
    assert.equal(c2.connected, true);
    assert.equal(c3.connected, true);
  });
});

describe('revocation racing a handshake', () => {
  it('a revocation published while the handshake was being checked still ends the new socket', async () => {
    const s = makeSession();
    let release!: () => void;
    resolver.holds.set(s.token, new Promise<void>(r => (release = r)));
    const c = connect(s.token);
    const done = revokedAndDisconnected(c);
    while (resolver.handshakesFor(s.token) === 0) await sleep(10);
    // The session resolved as valid a moment ago; now it is revoked and the event goes out before the socket exists.
    await bus.publish({ kind: 'session', sessionId: s.session.sessionId, reason: 'signed_out' });
    await sleep(100);
    release();
    assert.deepEqual((await done).payload, { reason: 'signed_out' });
  });
});

describe('backstop re-check', () => {
  it('disconnects a socket whose session stops resolving, without any bus event', async () => {
    const s = makeSession();
    const keep = makeSession();
    const c = connect(s.token);
    const k = connect(keep.token);
    await Promise.all([connected(c), connected(k)]);
    const done = revokedAndDisconnected(c);
    resolver.byId.set(s.session.sessionId, null);
    const r = await done;
    assert.deepEqual(r.payload, { reason: 'session_invalid' });
    assert.ok(r.ms < RECHECK_MS * 3, `took ${r.ms} ms`);
    assert.equal(k.connected, true);
  });

  it('disconnects a socket whose session switched tenant, so it rejoins the right room', async () => {
    const s = makeSession();
    const c = connect(s.token);
    await connected(c);
    const done = revokedAndDisconnected(c);
    resolver.byId.set(s.session.sessionId, { ...s.session, tenantId: `t-${randomUUID()}` });
    assert.deepEqual((await done).payload, { reason: 'tenant_changed' });
  });
});
