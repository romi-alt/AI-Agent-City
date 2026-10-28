// TEST-ONLY. A mock Keycloak admin API and a Nest test app with the real auth, access and demo modules, for the
// demo funnel tests. The mock records every call so tests can check exactly what would reach Keycloak.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createTestDatabase } from '@agentcity/db/testing';
import pg from 'pg';
import { AuthModule } from '../src/auth/auth.module.ts';
import { DEMO_CONFIG, demoConfigFromEnv, type DemoConfig, type DemoLimits } from '../src/demo/demo.config.ts';
import { DemoModule } from '../src/demo/demo.module.ts';
import { DemoService } from '../src/demo/demo.service.ts';
import { API_ENV, loadEnv, type ApiEnv } from '../src/env.ts';
import { PlatformModule } from '../src/platform/platform.module.ts';
import { CapturingLogger } from './access-harness.ts';
import { applyCookies, cookieHeader, type Jar } from './helpers/auth-app.ts';
import { createDevice, type TestDevice } from './helpers/device.ts';
import { startMockOidc, type MockOidc, type MockUser } from './helpers/mock-oidc.ts';

export const PUBLIC_ORIGIN = 'http://localhost:3000';
const CLIENT_ID = 'agentcity-bff';
const CLIENT_SECRET = 'test-only-client-secret-0123456789';
export const PROVISIONER = { clientId: 'agentcity-provisioner', clientSecret: 'test-only-provisioner-secret' };

export interface KcUser {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  enabled: boolean;
  firstName?: string;
  lastName?: string;
  [k: string]: unknown;
}
export interface KcCall {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
}

/** A Keycloak stand-in: client-credentials token endpoint and the three admin calls the demo module makes. */
export async function startMockKeycloak(realm = 'agentcity') {
  const users = new Map<string, KcUser>();
  const calls: KcCall[] = [];
  const tokens = new Set<string>();
  const state = { failCreate: 0 as number };

  const send = (res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  const read = async (req: IncomingMessage) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const raw = await read(req);
    let body: unknown = raw;
    try {
      body = raw && req.headers['content-type']?.includes('json') ? JSON.parse(raw) : raw;
    } catch {
      /* keep raw */
    }
    calls.push({ method: req.method ?? '', path: url.pathname, query: Object.fromEntries(url.searchParams), body });

    if (req.method === 'POST' && url.pathname === `/realms/${realm}/protocol/openid-connect/token`) {
      const [id, secret] = Buffer.from((req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64')
        .toString()
        .split(':')
        .map(decodeURIComponent);
      const form = new URLSearchParams(raw);
      if (id !== PROVISIONER.clientId || secret !== PROVISIONER.clientSecret)
        return send(res, 401, { error: 'invalid_client' });
      if (form.get('grant_type') !== 'client_credentials') return send(res, 400, { error: 'unsupported_grant_type' });
      const token = randomBytes(16).toString('hex');
      tokens.add(token);
      return send(res, 200, { access_token: token, expires_in: 300, token_type: 'Bearer' });
    }
    const prefix = `/admin/realms/${realm}`;
    if (!url.pathname.startsWith(prefix)) return send(res, 404);
    if (!tokens.has((req.headers.authorization ?? '').replace(/^Bearer /, ''))) return send(res, 401);
    const path = url.pathname.slice(prefix.length);

    if (req.method === 'GET' && path === '/users') {
      const email = (url.searchParams.get('email') ?? '').toLowerCase();
      return send(
        res,
        200,
        [...users.values()].filter(u => u.email === email),
      );
    }
    if (req.method === 'POST' && path === '/users') {
      if (state.failCreate > 0) {
        state.failCreate--;
        return send(res, 500, { error: 'boom' });
      }
      const b = body as KcUser;
      if ([...users.values()].some(u => u.username === b.username)) return send(res, 409, { errorMessage: 'exists' });
      const id = randomUUID();
      users.set(id, { ...b, id, email: String(b.email).toLowerCase() });
      return send(res, 201, undefined, { location: `http://kc${prefix}/users/${id}` });
    }
    const m = /^\/users\/([^/]+)\/send-verify-email$/.exec(path);
    if (req.method === 'PUT' && m) {
      if (!users.has(m[1]!)) return send(res, 404, { error: 'User not found' });
      return send(res, 204);
    }
    return send(res, 404);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    issuer: `${base}/realms/${realm}`,
    users,
    calls,
    state,
    /** Admin calls only (the token endpoint left out). */
    adminCalls: () => calls.filter(c => c.path.startsWith('/admin/')),
    addUser(u: Partial<KcUser> & { email: string }) {
      const id = randomUUID();
      users.set(id, { id, username: u.email, emailVerified: false, enabled: true, ...u });
      return id;
    },
    close: () => new Promise<void>(r => server.close(() => r())),
  };
}
export type MockKeycloak = Awaited<ReturnType<typeof startMockKeycloak>>;

export interface DemoApp {
  app: NestExpressApplication;
  env: ApiEnv;
  config: DemoConfig;
  idp: MockOidc;
  kc: MockKeycloak;
  admin: pg.Client;
  demo: DemoService;
  logger: CapturingLogger;
  request(
    method: string,
    path: string,
    o?: {
      jar?: Jar;
      device?: TestDevice;
      origin?: string | null;
      body?: unknown;
      ip?: string;
      headers?: Record<string, string>;
    },
  ): Promise<{ status: number; body: any; headers: Headers; text: string; setCookies: string[] }>;
  login(user: MockUser): Promise<{ jar: Jar; device: TestDevice }>;
  stepUp(device: TestDevice, jar: Jar, user: MockUser): Promise<void>;
  close(): Promise<void>;
}

class TestEnvModule {}
Module({})(TestEnvModule);

/** The demo API on a fresh database, a mock OIDC provider and a mock Keycloak admin API. */
export async function startDemoApp(
  o: { provisioner?: boolean; limits?: Partial<DemoLimits>; formMinSeconds?: number; logger?: CapturingLogger } = {},
): Promise<DemoApp> {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  const appUrl = process.env.DATABASE_URL;
  assert.ok(adminUrl && appUrl && process.env.REDIS_URL, 'DATABASE_ADMIN_URL, DATABASE_URL and REDIS_URL must be set');
  const db = await createTestDatabase({ adminUrl, appUrl });
  const idp = await startMockOidc({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  const kc = await startMockKeycloak();
  const withProvisioner = o.provisioner !== false;
  const source: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: db.appUrl,
    PUBLIC_ORIGIN,
    OIDC_ISSUER: idp.issuer,
    OIDC_CLIENT_ID: CLIENT_ID,
    OIDC_CLIENT_SECRET: CLIENT_SECRET,
    OIDC_REDIRECT_URI: `${PUBLIC_ORIGIN}/api/auth/callback`,
    OIDC_POST_LOGOUT_REDIRECT_URI: `${PUBLIC_ORIGIN}/signed-out`,
    SESSION_ENCRYPTION_KEY: 'test-only-session-encryption-key-0123456789',
    COOKIE_SECURE: 'false',
    S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:59000',
    S3_REGION: process.env.S3_REGION ?? 'us-east-1',
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? 'unused',
    S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? 'unused',
    S3_BUCKET: process.env.S3_BUCKET ?? 'unused',
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS ?? '127.0.0.1:7233',
    TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE ?? 'default',
    PROVISIONER_CLIENT_ID: PROVISIONER.clientId,
    PROVISIONER_CLIENT_SECRET: PROVISIONER.clientSecret,
  };
  if (!withProvisioner) {
    delete source.PROVISIONER_CLIENT_ID;
    delete source.PROVISIONER_CLIENT_SECRET;
  }
  const env = loadEnv(source);
  const base = demoConfigFromEnv(env);
  const config: DemoConfig = {
    ...base,
    keycloakIssuer: kc.issuer,
    provisioner: withProvisioner ? PROVISIONER : null,
    formMinSeconds: o.formMinSeconds ?? 1,
    limits: { ...base.limits, ipPerTenMinutes: 100, ipPerDay: 1000, emailPerHour: 100, ...o.limits },
    rateKeyPrefix: `rl-test-${randomBytes(4).toString('hex')}`,
  };

  const logger = o.logger ?? new CapturingLogger();
  const moduleRef = await Test.createTestingModule({
    imports: [
      { module: TestEnvModule, global: true, providers: [{ provide: API_ENV, useValue: env }], exports: [API_ENV] },
      PlatformModule,
      AuthModule,
      DemoModule,
    ],
  })
    .overrideProvider(DEMO_CONFIG)
    .useValue(config)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger });
  // As in main.ts: the web app's proxy on loopback forwards the visitor's address.
  app.set('trust proxy', 'loopback');
  await app.listen(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  const admin = new pg.Client({ connectionString: db.adminUrl });
  await admin.connect();

  const request: DemoApp['request'] = async (method, path, r = {}) => {
    const headers: Record<string, string> = { ...r.headers };
    if (r.jar && Object.keys(r.jar).length) headers.cookie = cookieHeader(r.jar);
    const origin = r.origin === undefined ? PUBLIC_ORIGIN : r.origin;
    if (origin) headers.origin = origin;
    if (r.ip) headers['x-forwarded-for'] = r.ip;
    if (r.device) headers['x-device-proof'] = await r.device.proof(method, PUBLIC_ORIGIN + path.split('?')[0]);
    let body: string | undefined;
    if (r.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    }
    const res = await fetch(baseUrl + path, { method, headers, body, redirect: 'manual' });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    return { status: res.status, body: parsed, headers: res.headers, text, setCookies: res.headers.getSetCookie() };
  };

  const start = async (device: TestDevice, jar: Jar, purpose: 'login' | 'step-up') => {
    const res = await request('POST', '/api/auth/login/start', {
      jar,
      device,
      body: {
        deviceJwk: device.jwk,
        returnTo: '/demo/welcome',
        purpose,
        ...(purpose === 'step-up' ? { stepUpReason: 'permission' } : {}),
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return { authorizeUrl: res.body.authorizeUrl as string, jar: applyCookies(jar, res.setCookies) };
  };
  const callback = async (authorizeUrl: string, jar: Jar, user: MockUser) => {
    const { query } = idp.authorize(authorizeUrl, user);
    const res = await request('GET', `/api/auth/callback?${query}`, { jar, origin: null });
    return applyCookies(jar, res.setCookies);
  };

  return {
    app,
    env,
    config,
    idp,
    kc,
    admin,
    demo: app.get(DemoService),
    logger,
    request,
    async login(user) {
      const device = await createDevice();
      const s = await start(device, {}, 'login');
      const jar = await callback(s.authorizeUrl, s.jar, user);
      assert.ok(jar.ac_session, 'signed in');
      return { jar, device };
    },
    async stepUp(device, jar, user) {
      const s = await start(device, jar, 'step-up');
      await callback(s.authorizeUrl, s.jar, user);
    },
    async close() {
      await app.close();
      await admin.end();
      await idp.close();
      await kc.close();
      await db.drop();
    },
  };
}
