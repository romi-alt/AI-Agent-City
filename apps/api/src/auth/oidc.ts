import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import * as oidc from 'openid-client';
import { API_ENV, type ApiEnv } from '../env.js';

export interface IdTokenClaims extends JWTPayload {
  sub: string;
  auth_time: number;
  acr?: string;
  amr?: unknown;
  sid?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  identity_provider?: unknown;
}

export interface TokenSet {
  claims: IdTokenClaims;
  idToken: string;
  refreshToken: string | null;
}

/** The IdP refused (as opposed to being unreachable): the grant is dead and the session must end. */
export class IdpRejectedError extends Error {
  override name = 'IdpRejectedError';
}

export interface LogoutTokenClaims {
  iss: string;
  sub?: string;
  sid?: string;
  jti: string;
}

const BACKCHANNEL_EVENT = 'http://schemas.openid.net/event/backchannel-logout';
const CLOCK_TOLERANCE_SECONDS = 30;

/**
 * The OIDC relying party (backend for frontend). Discovery happens on first use and is retried after a failure, so
 * the API starts even while the IdP is down. ID tokens are checked by signature against the IdP's JWKS (not only
 * trusted because they came over TLS), plus `iss`, `aud`, `azp`, `exp`, `iat`, `auth_time` and `nonce`.
 */
@Injectable()
export class OidcClient {
  private configuration?: Promise<oidc.Configuration>;
  private logoutJwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  config(): Promise<oidc.Configuration> {
    this.configuration ??= this.discover().catch((err: unknown) => {
      this.configuration = undefined;
      throw err;
    });
    return this.configuration;
  }

  private async discover() {
    const issuer = new URL(this.env.OIDC_ISSUER);
    const execute: Array<(c: oidc.Configuration) => void> = [oidc.enableNonRepudiationChecks];
    // Plain http only for a loopback IdP outside production (env.ts already demands https in production).
    if (issuer.protocol === 'http:') {
      if (this.env.NODE_ENV === 'production' || !isLoopback(issuer.hostname))
        throw new Error('OIDC_ISSUER must use https unless it is a loopback address outside production');
      execute.push(oidc.allowInsecureRequests);
    }
    return oidc.discovery(
      issuer,
      this.env.OIDC_CLIENT_ID,
      {
        client_secret: this.env.OIDC_CLIENT_SECRET,
        require_auth_time: true,
        [oidc.clockTolerance]: CLOCK_TOLERANCE_SECONDS,
      },
      oidc.ClientSecretBasic(this.env.OIDC_CLIENT_SECRET),
      { execute, timeout: 10 },
    );
  }

  async authorizeUrl(input: {
    state: string;
    nonce: string;
    codeVerifier: string;
    stepUp: boolean;
    idpHint?: string;
  }): Promise<string> {
    const config = await this.config();
    const params: Record<string, string> = {
      response_type: 'code',
      redirect_uri: this.env.OIDC_REDIRECT_URI,
      scope: 'openid email profile',
      state: input.state,
      nonce: input.nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(input.codeVerifier),
      code_challenge_method: 'S256',
    };
    if (input.stepUp) Object.assign(params, { acr_values: '2', prompt: 'login', max_age: '0' });
    if (input.idpHint) params.kc_idp_hint = input.idpHint;
    return oidc.buildAuthorizationUrl(config, params).href;
  }

  /** Code exchange with PKCE and every ID token check. `callbackQuery` is the raw query string of the callback. */
  async exchangeCode(input: {
    callbackQuery: string;
    state: string;
    nonce: string;
    codeVerifier: string;
    maxAge?: number;
  }): Promise<TokenSet> {
    const config = await this.config();
    const currentUrl = new URL(this.env.OIDC_REDIRECT_URI);
    currentUrl.search = input.callbackQuery;
    const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      expectedState: input.state,
      expectedNonce: input.nonce,
      pkceCodeVerifier: input.codeVerifier,
      idTokenExpected: true,
      ...(input.maxAge !== undefined ? { maxAge: input.maxAge } : {}),
    });
    return this.checked(tokens, null);
  }

  /** Uses the refresh token: proves the person is still active at the IdP and returns the new tokens. */
  async refresh(refreshToken: string, expectedSub: string): Promise<TokenSet> {
    const config = await this.config();
    let tokens: Awaited<ReturnType<typeof oidc.refreshTokenGrant>>;
    try {
      tokens = await oidc.refreshTokenGrant(config, refreshToken);
    } catch (err) {
      // A 4xx OAuth error (invalid_grant: user disabled, session ended, token revoked) is a definite refusal.
      if (err instanceof oidc.ResponseBodyError && err.status >= 400 && err.status < 500)
        throw new IdpRejectedError(err.error);
      throw err;
    }
    if (!tokens.id_token) {
      // Some IdPs return no ID token on refresh; the grant itself proved the session is alive.
      return { claims: { sub: expectedSub } as IdTokenClaims, idToken: '', refreshToken: tokens.refresh_token ?? null };
    }
    return this.checked(tokens, expectedSub);
  }

  /** The ID token's own claims checks on top of the library's (which already did signature, iss, aud, exp, nonce). */
  private checked(tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers, expectedSub: string | null) {
    const claims = tokens.claims();
    if (!claims || !tokens.id_token) throw new IdTokenError('no ID token');
    if (claims.azp !== this.env.OIDC_CLIENT_ID) throw new IdTokenError('azp');
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(this.env.OIDC_CLIENT_ID)) throw new IdTokenError('aud');
    const now = Date.now() / 1000;
    if (typeof claims.iat !== 'number' || claims.iat > now + CLOCK_TOLERANCE_SECONDS) throw new IdTokenError('iat');
    if (typeof claims.auth_time !== 'number' || claims.auth_time > now + CLOCK_TOLERANCE_SECONDS)
      throw new IdTokenError('auth_time');
    if (typeof claims.sub !== 'string' || !/^[A-Za-z0-9._@:+-]{1,190}$/.test(claims.sub)) throw new IdTokenError('sub');
    if (expectedSub !== null && claims.sub !== expectedSub) throw new IdTokenError('sub changed');
    return {
      claims: claims as IdTokenClaims,
      idToken: tokens.id_token,
      refreshToken: tokens.refresh_token ?? null,
    };
  }

  /** RP-initiated logout URL (null if the IdP advertises no end-session endpoint). */
  async endSessionUrl(idTokenHint: string | null): Promise<string | null> {
    const config = await this.config();
    if (!config.serverMetadata().end_session_endpoint) return null;
    const params: Record<string, string> = {
      post_logout_redirect_uri: this.env.OIDC_POST_LOGOUT_REDIRECT_URI,
      client_id: this.env.OIDC_CLIENT_ID,
    };
    if (idTokenHint) params.id_token_hint = idTokenHint;
    return oidc.buildEndSessionUrl(config, params).href;
  }

  /** Best effort: tells the IdP the refresh token is no longer wanted. */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const config = await this.config();
    if (!config.serverMetadata().revocation_endpoint) return;
    await oidc.tokenRevocation(config, refreshToken, { token_type_hint: 'refresh_token' });
  }

  /**
   * OIDC Back-Channel Logout 1.0 §2.6: signature (IdP JWKS), iss, aud, iat (recent), exp, the back-channel `events`
   * member, `sid` and/or `sub`, a `jti`, and no `nonce`. Replay of the `jti` is checked by the caller.
   */
  async verifyLogoutToken(token: string): Promise<LogoutTokenClaims> {
    const config = await this.config();
    const meta = config.serverMetadata();
    if (!meta.jwks_uri) throw new IdTokenError('no jwks_uri');
    this.logoutJwks ??= createRemoteJWKSet(new URL(meta.jwks_uri));
    const { payload } = await jwtVerify(token, this.logoutJwks, {
      issuer: meta.issuer,
      audience: this.env.OIDC_CLIENT_ID,
      algorithms: ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512', 'EdDSA'],
      requiredClaims: ['iat', 'exp', 'jti', 'events'],
      maxTokenAge: '5m',
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });
    const events = payload.events as Record<string, unknown> | undefined;
    if (!events || typeof events !== 'object' || Array.isArray(events)) throw new IdTokenError('events');
    const ev = events[BACKCHANNEL_EVENT];
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) throw new IdTokenError('events');
    if ('nonce' in payload) throw new IdTokenError('nonce present');
    const sid = typeof payload.sid === 'string' && payload.sid ? payload.sid : undefined;
    const sub = typeof payload.sub === 'string' && payload.sub ? payload.sub : undefined;
    if (!sid && !sub) throw new IdTokenError('no sid or sub');
    if (typeof payload.jti !== 'string' || !payload.jti) throw new IdTokenError('jti');
    return { iss: meta.issuer, sid, sub, jti: payload.jti };
  }
}

/** An ID or logout token failed one of our own claim checks; the message names the check (safe to log). */
export class IdTokenError extends Error {
  override name = 'IdTokenError';
}

function isLoopback(host: string) {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}
