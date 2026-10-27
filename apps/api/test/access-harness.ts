// TEST-ONLY. Stand-ins for the auth module's global guards, used inside the access tests' Nest testing module and
// nowhere else. Production sessions come from the auth module's SessionGuard (cookie + device proof); this guard
// trusts a header naming a session id, which is only acceptable in a test process against a throwaway database.
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  type LoggerService,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { AccessModule } from '../src/access/access.module.ts';
import { AUTH_ERRORS, type AuthenticatedRequest, type SessionContext } from '../src/auth/contracts.ts';
import { IS_PUBLIC, STEP_UP } from '../src/auth/decorators.ts';
import { API_ENV, type ApiEnv } from '../src/env.ts';
import { APP_POOL, PlatformModule } from '../src/platform/platform.module.ts';

export const TEST_SESSION_HEADER = 'x-test-session';

// No decorators in this file: tsx applies the experimental-decorator settings only to src/, so providers are built
// with factories instead of constructor injection.
class TestSessionGuard implements CanActivate {
  private readonly reflector: Reflector;
  private readonly pool: pg.Pool;
  constructor(reflector: Reflector, pool: pg.Pool) {
    this.reflector = reflector;
    this.pool = pool;
  }

  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const id = req.headers[TEST_SESSION_HEADER];
    if (typeof id !== 'string') throw new UnauthorizedException({ error: AUTH_ERRORS.notSignedIn });
    // Read the stored session like the real guard would, so a tenant switch is visible on the next request.
    const r = await this.pool.query(
      `SELECT s.id, s.subject, p.email, p.email_verified, s.device_id, s.amr, s.acr, s.auth_time, s.step_up_at,
              s.tenant_id, s.workspace_id
       FROM identity.session s JOIN identity.person p ON p.subject = s.subject
       WHERE s.id = $1 AND s.revoked_at IS NULL`,
      [id],
    );
    const row = r.rows[0];
    if (!row) throw new UnauthorizedException({ error: AUTH_ERRORS.sessionRevoked });
    const session: SessionContext = {
      sessionId: row.id,
      subject: row.subject,
      email: row.email,
      emailVerified: row.email_verified,
      deviceId: row.device_id,
      amr: row.amr,
      acr: row.acr,
      authTime: row.auth_time,
      stepUpAt: row.step_up_at,
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id,
    };
    req.session = session;
    return true;
  }
}

/** Same rule as DESIGN.md: a strong sign-in (acr >= 2) within the step-up window. */
class TestStepUpGuard implements CanActivate {
  private readonly reflector: Reflector;
  private readonly env: ApiEnv;
  constructor(reflector: Reflector, env: ApiEnv) {
    this.reflector = reflector;
    this.env = env;
  }

  canActivate(ctx: ExecutionContext) {
    const reason = this.reflector.getAllAndOverride<string>(STEP_UP, [ctx.getHandler(), ctx.getClass()]);
    if (!reason) return true;
    const s = ctx.switchToHttp().getRequest<AuthenticatedRequest>().session;
    const fresh =
      s?.stepUpAt != null &&
      Date.now() - new Date(s.stepUpAt).getTime() <= this.env.STEP_UP_MAX_AGE_SECONDS * 1000 &&
      Number(s.acr ?? 0) >= 2;
    if (!fresh) throw new ForbiddenException({ error: AUTH_ERRORS.stepUpRequired, reason });
    return true;
  }
}

/** Keeps every log line, so tests can prove a token never reaches the logs. */
export class CapturingLogger implements LoggerService {
  readonly lines: string[] = [];
  private keep(level: string, args: unknown[]) {
    this.lines.push(
      `${level} ${args.map(a => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a))).join(' ')}`,
    );
  }
  log(...a: unknown[]) {
    this.keep('log', a);
  }
  error(...a: unknown[]) {
    this.keep('error', a);
  }
  warn(...a: unknown[]) {
    this.keep('warn', a);
  }
  debug(...a: unknown[]) {
    this.keep('debug', a);
  }
  verbose(...a: unknown[]) {
    this.keep('verbose', a);
  }
}

/** The access module with the real platform providers (pool, Redis, RevocationBus), behind the test guards. */
export async function startAccessApp(env: ApiEnv, logger: CapturingLogger) {
  class TestEnvModule {}
  const moduleRef = await Test.createTestingModule({
    imports: [
      { module: TestEnvModule, global: true, providers: [{ provide: API_ENV, useValue: env }], exports: [API_ENV] },
      PlatformModule,
      AccessModule,
    ],
    providers: [
      {
        provide: APP_GUARD,
        inject: [Reflector, APP_POOL],
        useFactory: (r: Reflector, pool: pg.Pool) => new TestSessionGuard(r, pool),
      },
      {
        provide: APP_GUARD,
        inject: [Reflector, API_ENV],
        useFactory: (r: Reflector, e: ApiEnv) => new TestStepUpGuard(r, e),
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger });
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as { port: number };
  return { app, baseUrl: `http://127.0.0.1:${address.port}` };
}
