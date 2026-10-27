import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { Redis } from 'ioredis';
import * as oidc from 'openid-client';
import { z } from 'zod';
import { API_ENV, type ApiEnv } from '../env.js';
import { REDIS } from '../platform/platform.module.js';
import {
  AUTH_ERRORS,
  DEVICE_PROOF_HEADER,
  LOGIN_COOKIE,
  SESSION_COOKIE,
  type AuthenticatedRequest,
} from './contracts.js';
import { safeEqual, sha256Hex } from './crypto.js';
import { Public, RequireStepUp } from './decorators.js';
import { DeviceProofError, DeviceProofVerifier, deviceThumbprint, parseDevicePublicJwk } from './device-proof.js';
import { authError, deviceLabel, isSafeReturnTo, readCookie, requestPath, singleHeader } from './http-util.js';
import { OidcClient, type TokenSet } from './oidc.js';
import {
  errorName,
  invalidReason,
  LOGIN_ATTEMPT_TTL_SECONDS,
  LoginRefused,
  SessionService,
} from './session.service.js';

const LoginStartBody = z.object({
  deviceJwk: z.unknown(),
  returnTo: z.string(),
  purpose: z.enum(['login', 'step-up']),
  stepUpReason: z.enum(['credential', 'billing', 'permission']).optional(),
  idpHint: z.literal('agency-sso').optional(),
});

const badRequest = (error: string) => new HttpException({ error }, HttpStatus.BAD_REQUEST);
const loginFailed = () => badRequest('login_failed');

/** DESIGN.md "Auth": sign-in, the current session, sessions and devices, logout and back-channel logout. */
@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  private readonly log = new Logger('Auth');

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(OidcClient) private readonly oidc: OidcClient,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(DeviceProofVerifier) private readonly proofs: DeviceProofVerifier,
  ) {}

  private cookieOptions(path: string, maxAgeMs: number): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.env.COOKIE_SECURE, path, maxAge: maxAgeMs };
  }
  private get loginCookiePath() {
    return new URL(this.env.OIDC_REDIRECT_URI).pathname;
  }

  /**
   * Starts a sign-in (or a step-up on the current session). The request must come from PUBLIC_ORIGIN and carry a
   * device proof made with `deviceJwk`'s private key, so the session is bound to a key the browser holds.
   */
  @Public()
  @Post('login/start')
  @HttpCode(200)
  async loginStart(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: unknown) {
    if (singleHeader(req, 'origin') !== this.env.PUBLIC_ORIGIN) throw authError(AUTH_ERRORS.badOrigin);
    const parsed = LoginStartBody.safeParse(body);
    if (!parsed.success) throw badRequest('invalid_request');
    const input = parsed.data;
    const deviceJwk = parseDevicePublicJwk(input.deviceJwk);
    if (!deviceJwk) throw badRequest('invalid_device_key');
    if (!isSafeReturnTo(input.returnTo)) throw badRequest('invalid_return_to');

    const jkt = await deviceThumbprint(deviceJwk);
    try {
      const proven = await this.proofs.verify(singleHeader(req, DEVICE_PROOF_HEADER), {
        htm: 'POST',
        htu: this.env.PUBLIC_ORIGIN + requestPath(req),
      });
      if (proven.jkt !== jkt) throw new DeviceProofError('key differs from deviceJwk');
    } catch (err) {
      if (err instanceof DeviceProofError) throw authError(AUTH_ERRORS.deviceProofRequired);
      throw err;
    }

    let sessionId: string | null = null;
    if (input.purpose === 'step-up') {
      if (!input.stepUpReason) throw badRequest('invalid_request');
      const row = await this.sessions.findByToken(readCookie(req.headers.cookie, SESSION_COOKIE));
      if (!row) throw authError(AUTH_ERRORS.notSignedIn);
      if (invalidReason(row)) throw authError(AUTH_ERRORS.sessionRevoked);
      // A step-up strengthens the session of the device asking for it, never another one.
      if (row.device_jkt !== jkt) throw authError(AUTH_ERRORS.deviceProofRequired);
      sessionId = row.id;
    }

    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    let authorizeUrl: string;
    try {
      authorizeUrl = await this.oidc.authorizeUrl({
        state,
        nonce,
        codeVerifier,
        stepUp: input.purpose === 'step-up',
        idpHint: input.idpHint,
      });
    } catch (err) {
      this.log.error(`Identity provider unavailable (${errorName(err)})`);
      throw new HttpException({ error: 'idp_unavailable' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    await this.sessions.createLoginAttempt({
      state,
      nonce,
      codeVerifier,
      deviceJkt: jkt,
      deviceJwk,
      deviceLabel: deviceLabel(singleHeader(req, 'user-agent')),
      purpose: input.purpose,
      stepUpReason: input.purpose === 'step-up' ? input.stepUpReason! : null,
      sessionId,
      returnTo: input.returnTo,
    });
    res.cookie(LOGIN_COOKIE, state, this.cookieOptions(this.loginCookiePath, LOGIN_ATTEMPT_TTL_SECONDS * 1000));
    return { authorizeUrl };
  }

  /**
   * The IdP's redirect back. `state` must equal the `ac_login` cookie set by login/start in this browser; the
   * attempt is single use. Then the code is exchanged (PKCE) and the ID token checked before any session changes.
   */
  @Public()
  @ApiExcludeEndpoint()
  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.clearCookie(LOGIN_COOKIE, {
      path: this.loginCookiePath,
      httpOnly: true,
      sameSite: 'lax',
      secure: this.env.COOKIE_SECURE,
    });
    const query = new URLSearchParams((req.originalUrl.split('?')[1] ?? '').slice(0, 8192));
    const state = query.get('state');
    const cookie = readCookie(req.headers.cookie, LOGIN_COOKIE);
    if (!state || !cookie || !safeEqual(cookie, state)) throw loginFailed();

    const attempt = await this.sessions.consumeLoginAttempt(state);
    if (!attempt) throw loginFailed(); // unknown, expired or already used

    let tokens: TokenSet;
    try {
      if (query.has('error')) throw new Error('authorization error response');
      tokens = await this.oidc.exchangeCode({
        callbackQuery: query.toString(),
        state,
        nonce: attempt.nonce,
        codeVerifier: attempt.code_verifier,
        maxAge: attempt.purpose === 'step-up' ? this.env.STEP_UP_MAX_AGE_SECONDS : undefined,
      });
    } catch (err) {
      await this.sessions.recordEvent({
        subject: null,
        sessionId: attempt.session_id,
        kind: attempt.purpose === 'step-up' ? 'step_up_failed' : 'sign_in_failed',
        detail: { reason: query.has('error') ? 'idp_error' : errorName(err) },
      });
      throw loginFailed();
    }

    try {
      if (attempt.purpose === 'login') {
        const { token } = await this.sessions.completeLogin(attempt, tokens);
        res.cookie(SESSION_COOKIE, token, this.cookieOptions('/', this.env.SESSION_ABSOLUTE_HOURS * 3600 * 1000));
      } else {
        const current = await this.sessions.findByToken(readCookie(req.headers.cookie, SESSION_COOKIE));
        await this.sessions.completeStepUp(attempt, tokens, current?.id ?? null);
      }
    } catch (err) {
      if (tokens.refreshToken) await this.oidc.revokeRefreshToken(tokens.refreshToken).catch(() => {});
      if (err instanceof LoginRefused) {
        this.log.warn(`Sign-in refused: ${err.detail}`);
        throw new HttpException({ error: err.code }, err.status);
      }
      throw err;
    }
    res.redirect(303, attempt.return_to);
  }

  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    const s = req.session;
    const device = await this.sessions.deviceInfo(s.deviceId);
    return {
      subject: s.subject,
      email: s.email,
      emailVerified: s.emailVerified,
      amr: s.amr,
      acr: s.acr,
      authTime: s.authTime.toISOString(),
      stepUpAt: s.stepUpAt?.toISOString() ?? null,
      device: { id: s.deviceId, label: device?.label ?? null },
      tenantId: s.tenantId,
      workspaceId: s.workspaceId,
    };
  }

  /** Ends this session here and returns the IdP's end-session URL (RP-initiated logout with id_token_hint). */
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const { idToken, refreshToken } = await this.sessions.logout(req.session.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: this.env.COOKIE_SECURE });
    if (refreshToken)
      await this.oidc
        .revokeRefreshToken(refreshToken)
        .catch(err => this.log.warn(`Refresh token revocation at the IdP failed (${errorName(err)})`));
    let endSessionUrl: string | null = null;
    try {
      endSessionUrl = await this.oidc.endSessionUrl(idToken);
    } catch (err) {
      this.log.warn(`No end-session URL: identity provider unavailable (${errorName(err)})`);
    }
    return { endSessionUrl };
  }

  @Get('sessions')
  async list(@Req() req: AuthenticatedRequest) {
    const { sessions, devices } = await this.sessions.listForPerson(req.session.subject);
    return {
      sessions: sessions.map(s => ({
        id: s.id,
        deviceId: s.device_id,
        amr: s.amr,
        acr: s.acr,
        authTime: s.auth_time.toISOString(),
        createdAt: s.created_at.toISOString(),
        lastSeenAt: s.last_seen_at.toISOString(),
        current: s.id === req.session.sessionId,
      })),
      devices: devices.map(d => ({
        id: d.id,
        label: d.label,
        createdAt: d.created_at.toISOString(),
        lastSeenAt: d.last_seen_at.toISOString(),
        current: d.id === req.session.deviceId,
      })),
    };
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const ok = await this.sessions.revokeSession(id, 'revoked_by_user', { subject: req.session.subject });
    if (!ok) throw new HttpException({ error: 'not_found' }, HttpStatus.NOT_FOUND);
    if (id === req.session.sessionId)
      res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: this.env.COOKIE_SECURE });
  }

  /** Revokes a device key and every session bound to it. A credential change: needs a fresh strong sign-in. */
  @Delete('devices/:id')
  @RequireStepUp('credential')
  @HttpCode(204)
  async revokeDevice(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const ok = await this.sessions.revokeDevice(id, req.session.subject, 'revoked_by_user');
    if (!ok) throw new HttpException({ error: 'not_found' }, HttpStatus.NOT_FOUND);
    if (id === req.session.deviceId)
      res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: this.env.COOKIE_SECURE });
  }

  /** OIDC Back-Channel Logout 1.0: the IdP tells us a session ended. Form-encoded `logout_token`. */
  @Public()
  @ApiExcludeEndpoint()
  @Post('backchannel-logout')
  @HttpCode(200)
  async backchannelLogout(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    const token = (body as { logout_token?: unknown } | undefined)?.logout_token;
    if (typeof token !== 'string' || token.length > 16_384) throw badRequest('invalid_request');
    let claims: Awaited<ReturnType<OidcClient['verifyLogoutToken']>>;
    try {
      claims = await this.oidc.verifyLogoutToken(token);
    } catch (err) {
      this.log.warn(`Back-channel logout token refused (${errorName(err)})`);
      throw badRequest('invalid_request');
    }
    const fresh = await this.redis.set(
      `agentcity:auth:logout-jti:${sha256Hex(`${claims.iss}\n${claims.jti}`)}`,
      '1',
      'EX',
      15 * 60,
      'NX',
    );
    if (fresh !== 'OK') throw badRequest('invalid_request');
    await this.sessions.revokeByIdp({ sid: claims.sid, sub: claims.sub });
    return {};
  }
}
