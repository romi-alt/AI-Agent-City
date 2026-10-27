import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWTPayload } from 'jose';

/**
 * A small local OpenID Provider for tests (plain node:http + jose), so the API's OIDC client can be exercised
 * end to end without Keycloak: discovery, JWKS, a token endpoint that checks client authentication, the redirect
 * URI and PKCE (S256), refresh tokens that can be invalidated, revocation, end-session, and back-channel logout
 * tokens. The "browser at the IdP" step is `authorize(authorizeUrl, user)`, which returns the callback query.
 */

export interface MockUser {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  /** Recorded as the `acr` claim ("1" basic, "2" strong). */
  acr?: string;
  amr?: string[];
}

/** Ways to make the issued ID token wrong, one check at a time. */
export interface IdTokenTweaks {
  iss?: string;
  aud?: string | string[];
  azp?: string | null;
  exp?: number;
  iat?: number;
  authTime?: number;
  nonce?: string | null;
  /** Sign with a key that is not in the JWKS (same kid). */
  rogueSignature?: boolean;
  extra?: Record<string, unknown>;
}

interface CodeEntry {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  nonce: string | undefined;
  user: MockUser;
  tweaks: IdTokenTweaks;
  sid: string;
  used: boolean;
}

interface RefreshEntry {
  sub: string;
  sid: string;
  user: MockUser;
  active: boolean;
}

export interface MockOidc {
  issuer: string;
  clientId: string;
  /** Simulates the person signing in at the IdP. Returns the query string the IdP redirects back with. */
  authorize(
    authorizeUrl: string,
    user: MockUser,
    opts?: { tweaks?: IdTokenTweaks; tamperChallenge?: boolean },
  ): { query: string; sid: string; params: URLSearchParams };
  /** The user is disabled at the IdP: refresh grants for them now fail with invalid_grant. */
  disableUser(sub: string): void;
  /** Signs a back-channel logout token (valid by default; override claims or use `rogue` to break it). */
  logoutToken(claims: JWTPayload, opts?: { rogue?: boolean; omitEvents?: boolean }): Promise<string>;
  /** Counts of token-endpoint grants served, by grant type (for asserting that revalidation happened). */
  grants: Record<string, number>;
  revoked: string[];
  close(): Promise<void>;
}

const KID = 'test-key-1';

export async function startMockOidc(opts: { clientId: string; clientSecret: string }): Promise<MockOidc> {
  const signing = await generateKeyPair('RS256', { extractable: true });
  const rogue = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = { ...(await exportJWK(signing.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
  const codes = new Map<string, CodeEntry>();
  const refreshTokens = new Map<string, RefreshEntry>();
  const disabled = new Set<string>();
  const grants: Record<string, number> = {};
  const revoked: string[] = [];
  let issuer = '';

  const sign = (payload: JWTPayload, key: CryptoKey, typ?: string) =>
    new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: KID, ...(typ ? { typ } : {}) }).sign(key);

  async function idToken(user: MockUser, sid: string, nonce: string | undefined, tweaks: IdTokenTweaks = {}) {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload & Record<string, unknown> = {
      iss: tweaks.iss ?? issuer,
      sub: user.sub,
      aud: tweaks.aud ?? opts.clientId,
      exp: tweaks.exp ?? now + 300,
      iat: tweaks.iat ?? now,
      auth_time: tweaks.authTime ?? now,
      sid,
      acr: user.acr ?? '1',
      ...(user.amr ? { amr: user.amr } : {}),
      ...(user.email !== undefined ? { email: user.email, email_verified: user.emailVerified ?? false } : {}),
      ...(user.name ? { name: user.name } : {}),
      ...tweaks.extra,
    };
    if (tweaks.azp !== null) payload.azp = tweaks.azp ?? opts.clientId;
    const n = tweaks.nonce === undefined ? nonce : tweaks.nonce;
    if (n !== null && n !== undefined) payload.nonce = n;
    return sign(payload, tweaks.rogueSignature ? rogue.privateKey : signing.privateKey);
  }

  function clientAuthenticated(req: IncomingMessage) {
    const h = req.headers.authorization ?? '';
    if (!h.startsWith('Basic ')) return false;
    const [id, secret] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':');
    const dec = (v: string | undefined) => decodeURIComponent((v ?? '').replace(/\+/g, ' '));
    return dec(id) === opts.clientId && dec(secret) === opts.clientSecret;
  }

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const readBody = async (req: IncomingMessage) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  };

  async function token(req: IncomingMessage, res: ServerResponse) {
    if (!clientAuthenticated(req)) return json(res, 401, { error: 'invalid_client' });
    const form = await readBody(req);
    const grant = form.get('grant_type') ?? '';
    grants[grant] = (grants[grant] ?? 0) + 1;
    if (grant === 'authorization_code') {
      const entry = codes.get(form.get('code') ?? '');
      if (!entry || entry.used) return json(res, 400, { error: 'invalid_grant' });
      entry.used = true;
      if (entry.redirectUri !== form.get('redirect_uri')) return json(res, 400, { error: 'invalid_grant' });
      const verifier = form.get('code_verifier') ?? '';
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      if (!verifier || challenge !== entry.codeChallenge)
        return json(res, 400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
      const refresh = randomBytes(24).toString('base64url');
      refreshTokens.set(refresh, { sub: entry.user.sub, sid: entry.sid, user: entry.user, active: true });
      return json(res, 200, {
        access_token: randomBytes(24).toString('base64url'),
        token_type: 'Bearer',
        expires_in: 300,
        refresh_token: refresh,
        id_token: await idToken(entry.user, entry.sid, entry.nonce, entry.tweaks),
        scope: 'openid email profile',
      });
    }
    if (grant === 'refresh_token') {
      const old = form.get('refresh_token') ?? '';
      const entry = refreshTokens.get(old);
      if (!entry || !entry.active || disabled.has(entry.sub))
        return json(res, 400, { error: 'invalid_grant', error_description: 'Session not active' });
      entry.active = false; // rotation
      const refresh = randomBytes(24).toString('base64url');
      refreshTokens.set(refresh, { ...entry, active: true });
      return json(res, 200, {
        access_token: randomBytes(24).toString('base64url'),
        token_type: 'Bearer',
        expires_in: 300,
        refresh_token: refresh,
        id_token: await idToken(entry.user, entry.sid, undefined),
      });
    }
    return json(res, 400, { error: 'unsupported_grant_type' });
  }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', issuer);
    const path = url.pathname.slice(new URL(issuer).pathname.length);
    const done = (p: Promise<void> | void) =>
      Promise.resolve(p).catch(() => {
        if (!res.headersSent) json(res, 500, { error: 'server_error' });
      });
    switch (`${req.method} ${path}`) {
      case 'GET /.well-known/openid-configuration':
        return json(res, 200, {
          issuer,
          authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
          token_endpoint: `${issuer}/protocol/openid-connect/token`,
          jwks_uri: `${issuer}/protocol/openid-connect/certs`,
          end_session_endpoint: `${issuer}/protocol/openid-connect/logout`,
          revocation_endpoint: `${issuer}/protocol/openid-connect/revoke`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['client_secret_basic'],
          backchannel_logout_supported: true,
          backchannel_logout_session_supported: true,
        });
      case 'GET /protocol/openid-connect/certs':
        return json(res, 200, { keys: [publicJwk] });
      case 'POST /protocol/openid-connect/token':
        return void done(token(req, res));
      case 'POST /protocol/openid-connect/revoke':
        return void done(
          readBody(req).then(form => {
            if (!clientAuthenticated(req)) return json(res, 401, { error: 'invalid_client' });
            const t = form.get('token') ?? '';
            revoked.push(t);
            const e = refreshTokens.get(t);
            if (e) e.active = false;
            res.writeHead(200).end();
          }),
        );
      case 'GET /protocol/openid-connect/logout':
        res.writeHead(200, { 'content-type': 'text/plain' });
        return void res.end('signed out');
      default:
        return json(res, 404, { error: 'not_found' });
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}/realms/test`;

  return {
    issuer,
    clientId: opts.clientId,
    grants,
    revoked,
    authorize(authorizeUrl, user, o = {}) {
      const u = new URL(authorizeUrl);
      const p = u.searchParams;
      if (`${u.origin}${u.pathname}` !== `${issuer}/protocol/openid-connect/auth`) throw new Error('wrong endpoint');
      if (p.get('response_type') !== 'code' || p.get('code_challenge_method') !== 'S256')
        throw new Error('not a PKCE code request');
      if (p.get('client_id') !== opts.clientId) throw new Error('wrong client_id');
      const code = randomBytes(24).toString('base64url');
      const sid = randomUUID();
      codes.set(code, {
        clientId: opts.clientId,
        redirectUri: p.get('redirect_uri') ?? '',
        codeChallenge: o.tamperChallenge
          ? createHash('sha256').update('another verifier').digest('base64url')
          : (p.get('code_challenge') ?? ''),
        nonce: p.get('nonce') ?? undefined,
        user,
        tweaks: o.tweaks ?? {},
        sid,
        used: false,
      });
      const back = new URLSearchParams({ code, state: p.get('state') ?? '' });
      return { query: back.toString(), sid, params: p };
    },
    disableUser(sub) {
      disabled.add(sub);
    },
    async logoutToken(claims, o = {}) {
      const now = Math.floor(Date.now() / 1000);
      const payload: JWTPayload = {
        iss: issuer,
        aud: opts.clientId,
        iat: now,
        exp: now + 120,
        jti: randomUUID(),
        ...(o.omitEvents ? {} : { events: { 'http://schemas.openid.net/event/backchannel-logout': {} } }),
        ...claims,
      };
      return sign(payload, o.rogue ? rogue.privateKey : signing.privateKey, 'logout+jwt');
    },
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}
