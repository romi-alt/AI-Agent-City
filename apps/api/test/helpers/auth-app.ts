import 'reflect-metadata';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Controller, Get, type INestApplication, Module, Post, Req, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createTestDatabase } from '@agentcity/db/testing';
import pg from 'pg';
import { AuthModule } from '../../src/auth/auth.module.ts';
import type { AuthenticatedRequest } from '../../src/auth/contracts.ts';
import { Public, RequireStepUp } from '../../src/auth/decorators.ts';
import { API_ENV, loadEnv, type ApiEnv } from '../../src/env.ts';
import { PlatformModule } from '../../src/platform/platform.module.ts';
import { RevocationBus, type Revocation } from '../../src/platform/revocation-bus.ts';
import { createDevice, type ProofOverrides, type TestDevice } from './device.ts';
import { startMockOidc, type IdTokenTweaks, type MockOidc, type MockUser } from './mock-oidc.ts';

/**
 * An API instance for auth tests: a fresh migrated database (createTestDatabase), the shared local Redis, a mock
 * OIDC provider, AuthModule + PlatformModule, and a probe controller with a public, a protected and a step-up
 * route. Requests go straight to the API; PUBLIC_ORIGIN is the browser origin the proofs and Origin name.
 * Needs DATABASE_ADMIN_URL, DATABASE_URL and REDIS_URL (run with --env-file=../../infra/local-dev.env).
 */

export const PUBLIC_ORIGIN = 'http://localhost:3000';
const CLIENT_ID = 'agentcity-bff';
const CLIENT_SECRET = 'test-only-client-secret-0123456789';

/**
 * Test routes: a public one, a protected GET and POST, and a step-up route. Decorators are applied as plain calls
 * because tsx compiles test files without `experimentalDecorators` (only src/ is in the API tsconfig).
 */
class ProbeController {
  open() {
    return { ok: true };
  }
  read(req: AuthenticatedRequest) {
    return { subject: req.session.subject, sessionId: req.session.sessionId };
  }
  write(req: AuthenticatedRequest) {
    return { subject: req.session.subject };
  }
  billing() {
    return { ok: true };
  }
}
function decorate(method: keyof ProbeController, ...decorators: Array<MethodDecorator>) {
  const proto = ProbeController.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, method)!;
  for (const d of decorators) d(proto, method, descriptor);
}
Controller('api/probe')(ProbeController);
decorate('open', Public(), Get('public'));
decorate('read', Get());
Req()(ProbeController.prototype, 'read', 0);
decorate('write', Post());
Req()(ProbeController.prototype, 'write', 0);
decorate('billing', RequireStepUp('billing'), Post('billing'));

class TestEnvModule {}
Module({})(TestEnvModule);

export type Jar = Record<string, string>;

export interface ApiResponse {
  status: number;
  body: any;
  headers: Headers;
  setCookies: string[];
}

export interface AuthApp {
  app: INestApplication;
  env: ApiEnv;
  idp: MockOidc;
  admin: pg.Client;
  baseUrl: string;
  revocations: Revocation[];
  get<T>(token: unknown): T;
  request(
    method: string,
    path: string,
    o?: {
      jar?: Jar;
      device?: TestDevice;
      origin?: string | null;
      body?: unknown;
      form?: Record<string, string>;
      proof?: string | null;
      proofOverrides?: ProofOverrides;
      proofPath?: string;
      proofMethod?: string;
    },
  ): Promise<ApiResponse>;
  /** login/start for `device` (purpose login unless given). Returns the authorize URL and the jar with ac_login. */
  start(
    device: TestDevice,
    o?: { jar?: Jar; returnTo?: string; purpose?: 'login' | 'step-up'; stepUpReason?: string },
  ): Promise<{ res: ApiResponse; authorizeUrl: string; jar: Jar }>;
  callback(query: string, jar: Jar): Promise<ApiResponse>;
  /** A full sign-in. Returns the cookie jar holding ac_session. */
  login(
    device: TestDevice,
    user: MockUser,
    o?: { tweaks?: IdTokenTweaks; returnTo?: string },
  ): Promise<{ jar: Jar; sid: string; res: ApiResponse }>;
  /** A step-up round trip on the session in `jar`. Returns the callback response. */
  stepUp(device: TestDevice, jar: Jar, user: MockUser, tweaks?: IdTokenTweaks): Promise<ApiResponse>;
  close(): Promise<void>;
}

export function applyCookies(jar: Jar, setCookies: string[]): Jar {
  const next = { ...jar };
  for (const c of setCookies) {
    const [pair, ...attrs] = c.split(';');
    const eq = pair!.indexOf('=');
    const name = pair!.slice(0, eq).trim();
    const value = pair!.slice(eq + 1).trim();
    const expired = attrs.some(a => /^\s*expires=Thu, 01 Jan 1970/i.test(a)) || value === '';
    if (expired) delete next[name];
    else next[name] = decodeURIComponent(value);
  }
  return next;
}

export const cookieHeader = (jar: Jar) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');

export async function startAuthApp(envOverrides: Record<string, string> = {}): Promise<AuthApp> {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  const appUrl = process.env.DATABASE_URL;
  assert.ok(
    adminUrl && appUrl && process.env.REDIS_URL,
    'DATABASE_ADMIN_URL, DATABASE_URL and REDIS_URL must be set (see infra/local-dev.env)',
  );
  const db = await createTestDatabase({ adminUrl, appUrl });
  const idp = await startMockOidc({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  const env = loadEnv({
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
    ...envOverrides,
  });

  const moduleRef = await Test.createTestingModule({
    imports: [
      { module: TestEnvModule, global: true, providers: [{ provide: API_ENV, useValue: env }], exports: [API_ENV] },
      PlatformModule,
      AuthModule,
    ],
    controllers: [ProbeController],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

  const admin = new pg.Client({ connectionString: db.adminUrl });
  await admin.connect();

  const revocations: Revocation[] = [];
  const bus = app.get(RevocationBus);
  await bus.subscribe(r => revocations.push(r));

  const request: AuthApp['request'] = async (method, path, o = {}) => {
    const headers: Record<string, string> = {};
    if (o.jar && Object.keys(o.jar).length) headers.cookie = cookieHeader(o.jar);
    const origin = o.origin === undefined ? PUBLIC_ORIGIN : o.origin;
    if (origin) headers.origin = origin;
    if (o.proof) headers['x-device-proof'] = o.proof;
    else if (o.proof === undefined && o.device)
      headers['x-device-proof'] = await o.device.proof(
        o.proofMethod ?? method,
        PUBLIC_ORIGIN + (o.proofPath ?? path.split('?')[0]),
        o.proofOverrides,
      );
    let body: string | undefined;
    if (o.form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(o.form).toString();
    } else if (o.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(o.body);
    }
    const res = await fetch(baseUrl + path, { method, headers, body, redirect: 'manual' });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    return { status: res.status, body: parsed, headers: res.headers, setCookies: res.headers.getSetCookie() };
  };

  const start: AuthApp['start'] = async (device, o = {}) => {
    const res = await request('POST', '/api/auth/login/start', {
      jar: o.jar,
      device,
      body: {
        deviceJwk: device.jwk,
        returnTo: o.returnTo ?? '/workspace',
        purpose: o.purpose ?? 'login',
        ...(o.stepUpReason ? { stepUpReason: o.stepUpReason } : {}),
      },
    });
    return {
      res,
      authorizeUrl: (res.body as { authorizeUrl?: string })?.authorizeUrl ?? '',
      jar: applyCookies(o.jar ?? {}, res.setCookies),
    };
  };

  const callback: AuthApp['callback'] = (query, jar) =>
    request('GET', `/api/auth/callback?${query}`, { jar, origin: null });

  const login: AuthApp['login'] = async (device, user, o = {}) => {
    const s = await start(device, { returnTo: o.returnTo });
    assert.equal(s.res.status, 200, JSON.stringify(s.res.body));
    const { query, sid } = idp.authorize(s.authorizeUrl, user, { tweaks: o.tweaks });
    const res = await callback(query, s.jar);
    return { jar: applyCookies(s.jar, res.setCookies), sid, res };
  };

  const stepUp: AuthApp['stepUp'] = async (device, jar, user, tweaks) => {
    const s = await start(device, { jar, purpose: 'step-up', stepUpReason: 'credential' });
    assert.equal(s.res.status, 200, JSON.stringify(s.res.body));
    const { query } = idp.authorize(s.authorizeUrl, user, { tweaks });
    return callback(query, s.jar);
  };

  return {
    app,
    env,
    idp,
    admin,
    baseUrl,
    revocations,
    get: <T>(token: unknown) => app.get(token as Type<T>) as T,
    request,
    start,
    callback,
    login,
    stepUp,
    async close() {
      await app.close();
      await admin.end();
      await idp.close();
      await db.drop();
    },
  };
}

export { createDevice };

/** Waits until `predicate` holds (revocations arrive through Redis pub/sub, asynchronously). */
export async function eventually(predicate: () => boolean, ms = 2000) {
  const until = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > until) return false;
    await new Promise(r => setTimeout(r, 20));
  }
  return true;
}
