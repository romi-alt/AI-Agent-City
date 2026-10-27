// Helpers for verify-idp.mjs: the agentcity-bff authorization-code + PKCE dance driven in Chromium, the code
// exchange, ID token verification (signature via JWKS, iss/aud/azp/nonce/exp), and the Mailpit sink.
import { createHash, createPublicKey, randomBytes, verify as verifySignature } from 'node:crypto';
import { createRequire } from 'node:module';

export const KC = 'http://localhost:58080';
export const ISSUER = `${KC}/realms/agentcity`;
export const CLIENT_ID = 'agentcity-bff';
export const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET ?? 'local-dev-only-oidc-bff-secret';
export const REDIRECT_URI = process.env.OIDC_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback';
export const POST_LOGOUT_REDIRECT_URI = process.env.OIDC_POST_LOGOUT_REDIRECT_URI ?? 'http://localhost:3000/signed-out';
export const MAIL_API = process.env.MAIL_API_URL ?? 'http://127.0.0.1:58025';
const APP_ORIGIN = new URL(REDIRECT_URI).origin;

/** Playwright is provided by the environment (not a repository dependency); resolve it through NODE_PATH. */
export function loadPlaywright() {
  return createRequire(import.meta.url)('playwright');
}

const b64url = buffer => Buffer.from(buffer).toString('base64url');

/** A fresh authorization request for agentcity-bff (state, nonce, PKCE S256). */
export function authRequest(extra = {}) {
  const verifier = b64url(randomBytes(32));
  const params = {
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid',
    state: b64url(randomBytes(16)),
    nonce: b64url(randomBytes(16)),
    code_challenge: b64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
    ...extra,
  };
  for (const key of Object.keys(params)) if (params[key] === undefined) delete params[key];
  const url = new URL(`${ISSUER}/protocol/openid-connect/auth`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return { url: url.href, verifier, state: params.state, nonce: params.nonce };
}

/**
 * A browser context that records every navigation to the app origin (localhost:3000): the authorization callback
 * and the post-logout redirect. Playwright cannot intercept redirect targets, so the URL is taken from Keycloak's
 * redirect response (Location) and from the request event; the navigation itself then fails harmlessly when
 * nothing listens on :3000. (If the web app is running, it rejects the callback: no `ac_login` cookie.)
 */
export async function newAppContext(browser) {
  const context = await browser.newContext();
  const captured = [];
  const record = url => {
    if (url && url.startsWith(`${APP_ORIGIN}/`) && !captured.includes(url)) captured.push(url);
  };
  context.on('response', response => {
    if (response.status() >= 300 && response.status() < 400) record(response.headers().location);
  });
  context.on('request', request => record(request.url()));
  await context.route(
    url => url.origin === APP_ORIGIN,
    route => route.fulfill({ status: 200, contentType: 'text/plain', body: 'captured by verify-idp' }),
  );
  return { context, captured };
}

/** Adds a CTAP2 platform authenticator with resident keys and user verification to a page (Chrome DevTools). */
export async function addVirtualAuthenticator(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return {
    cdp,
    authenticatorId,
    async credentials() {
      return (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials;
    },
  };
}

/** Waits until the captured list holds a callback for `state`, then returns its URL params. */
export async function waitForCallback(page, captured, state, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const hit = captured.find(u => u.startsWith(REDIRECT_URI) && new URL(u).searchParams.get('state') === state);
    if (hit) return Object.fromEntries(new URL(hit).searchParams);
    await page.waitForTimeout(100);
  }
  return null;
}

/** Text of the current Keycloak page (for evidence and assertions). */
export async function pageText(page) {
  try {
    return (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 400);
  } catch {
    return '';
  }
}

/** Exchanges an authorization code (client_secret_basic + PKCE verifier). */
export async function exchangeCode(code, verifier, { secret = CLIENT_SECRET } = {}) {
  const response = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${secret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  return { status: response.status, body: await response.json() };
}

export async function refresh(refreshToken, { secret = CLIENT_SECRET } = {}) {
  const response = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${secret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  return { status: response.status, body: await response.json() };
}

let jwksCache;
/** Verifies an RS256/ES256 JWT against the realm JWKS and returns { header, claims }. Throws on a bad signature. */
export async function verifyJwt(token, issuer = ISSUER) {
  const [h, p, s] = token.split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  jwksCache ??= {};
  jwksCache[issuer] ??= (await (await fetch(`${issuer}/protocol/openid-connect/certs`)).json()).keys;
  const jwk = jwksCache[issuer].find(k => k.kid === header.kid);
  if (!jwk) throw new Error(`no JWKS key for kid ${header.kid}`);
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const algorithm = header.alg === 'RS256' ? 'RSA-SHA256' : header.alg === 'ES256' ? 'SHA256' : null;
  if (!algorithm) throw new Error(`unexpected alg ${header.alg}`);
  const ok = verifySignature(
    algorithm,
    Buffer.from(`${h}.${p}`),
    header.alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key,
    Buffer.from(s, 'base64url'),
  );
  if (!ok) throw new Error('bad signature');
  return { header, claims };
}

/** The ID token checks the API performs (DESIGN.md), returned as a list of failures (empty = all good). */
export function idTokenProblems(claims, { nonce }) {
  const problems = [];
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER) problems.push(`iss ${claims.iss}`);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(CLIENT_ID)) problems.push(`aud ${claims.aud}`);
  if (claims.azp !== CLIENT_ID) problems.push(`azp ${claims.azp}`);
  if (claims.nonce !== nonce) problems.push('nonce mismatch');
  if (!(claims.exp > now)) problems.push('expired');
  if (!(claims.iat <= now + 5)) problems.push('iat in the future');
  for (const claim of ['sub', 'email', 'email_verified', 'sid', 'auth_time', 'acr', 'amr']) {
    if (claims[claim] === undefined) problems.push(`missing ${claim}`);
  }
  return problems;
}

/** Waits for a Mailpit message to `to` (newer than `since`) and returns { subject, text, links }. */
export async function waitForMail(to, { since = 0, timeout = 15000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const search = await (await fetch(`${MAIL_API}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
    const message = (search.messages ?? []).find(m => Date.parse(m.Created) >= since);
    if (message) {
      const full = await (await fetch(`${MAIL_API}/api/v1/message/${message.ID}`)).json();
      const links = [...new Set(full.Text.match(/https?:\/\/[^\s<>"]+/g) ?? [])];
      return { subject: full.Subject, text: full.Text, links };
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return null;
}

/** page.goto that tolerates the final hop to the app origin failing (see newAppContext). */
export async function navigate(page, url) {
  try {
    await page.goto(url);
  } catch (error) {
    if (
      !/ERR_CONNECTION_REFUSED|ERR_ABORTED|ERR_EMPTY_RESPONSE|interrupted by another navigation/.test(String(error))
    ) {
      throw error;
    }
  }
}
