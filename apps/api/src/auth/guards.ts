import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { API_ENV, type ApiEnv } from '../env.js';
import { acrLevel } from './amr.js';
import {
  AUTH_ERRORS,
  DEVICE_PROOF_HEADER,
  SESSION_COOKIE,
  type AuthenticatedRequest,
  type StepUpReason,
} from './contracts.js';
import { IS_PUBLIC, STEP_UP } from './decorators.js';
import { authError, readCookie, requestPath, singleHeader } from './http-util.js';
import { SessionService } from './session.service.js';

/** Methods that must not change state, so they need no Origin check (DESIGN.md: "for non-GET requests"). */
const SAFE_METHODS = new Set(['GET', 'HEAD']);

/** The HTTP request behind a REST or GraphQL execution context; null for WebSocket/RPC contexts. */
function httpRequest(ctx: ExecutionContext): { req: Request; res?: Response } | null {
  const type = ctx.getType<string>();
  if (type === 'http') return { req: ctx.switchToHttp().getRequest<Request>(), res: ctx.switchToHttp().getResponse() };
  if (type === 'graphql') {
    const gql = ctx.getArgs()[2] as { req?: Request; res?: Response } | undefined;
    return gql?.req ? { req: gql.req, res: gql.res } : null;
  }
  return null;
}

/**
 * Global guard (APP_GUARD): every route needs a signed-in session unless marked @Public(). Checks, in order: the
 * `ac_session` cookie → a live session (not revoked, not idle/absolute-expired, person enabled, device not revoked)
 * → `X-Device-Proof` signed by the session's device key for this method and URL → for non-GET requests, Origin
 * equal to PUBLIC_ORIGIN. Attaches `req.session`.
 *
 * Socket.IO messages (context type `ws`) are not HTTP requests: their session was established at the handshake
 * through SESSION_RESOLVER and is re-checked by the realtime module, so this guard lets them through.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const type = ctx.getType<string>();
    if (type === 'ws') return true;
    const http = httpRequest(ctx);
    if (!http) throw authError(AUTH_ERRORS.notSignedIn);
    const { req, res } = http;
    const method = req.method.toUpperCase();
    try {
      const { context } = await this.sessions.authenticate({
        token: readCookie(req.headers.cookie, SESSION_COOKIE),
        proof: singleHeader(req, DEVICE_PROOF_HEADER),
        htm: method,
        htu: this.env.PUBLIC_ORIGIN + requestPath(req),
        origin: singleHeader(req, 'origin'),
        requireOrigin: !SAFE_METHODS.has(method),
      });
      (req as AuthenticatedRequest).session = context;
      return true;
    } catch (err) {
      // A dead session's cookie is useless; tell the browser to drop it.
      const body = (err as { getResponse?: () => unknown }).getResponse?.() as { error?: string } | undefined;
      if (body?.error === AUTH_ERRORS.sessionRevoked && res && typeof res.clearCookie === 'function')
        res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: this.env.COOKIE_SECURE });
      throw err;
    }
  }
}

/** True when the session has a strong (acr >= 2) sign-in no older than `maxAgeSeconds`. */
export function hasFreshStepUp(session: { stepUpAt: Date | null; acr: string | null }, maxAgeSeconds: number) {
  if (!session.stepUpAt || acrLevel(session.acr) < 2) return false;
  const age = (Date.now() - session.stepUpAt.getTime()) / 1000;
  return age >= -5 && age <= maxAgeSeconds;
}

/**
 * Enforces @RequireStepUp(reason). Runs after SessionGuard (registered after it), so `req.session` is set.
 * Otherwise: 403 `{ error: 'step_up_required', reason }`.
 */
@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const reason = this.reflector.getAllAndOverride<StepUpReason | undefined>(STEP_UP, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!reason) return true;
    const http = httpRequest(ctx);
    const session = (http?.req as AuthenticatedRequest | undefined)?.session;
    if (!session) throw authError(AUTH_ERRORS.notSignedIn);
    if (!hasFreshStepUp(session, this.env.STEP_UP_MAX_AGE_SECONDS))
      throw authError(AUTH_ERRORS.stepUpRequired, { reason });
    return true;
  }
}
