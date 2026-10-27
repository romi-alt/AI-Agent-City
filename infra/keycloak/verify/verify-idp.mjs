// End-to-end verification of the local Keycloak setup for M03 (realms agentcity + agency-idp), driven through the
// real `agentcity-bff` client in Chromium. Writes planning/agentcity-migration/m03/evidence/idp-verification.json
// and exits non-zero when any check fails.
//
//   pnpm infra:up && pnpm keycloak:seed
//   node --env-file=infra/local-dev.env infra/keycloak/verify/verify-idp.mjs
//
// Needs Playwright with Chromium resolvable through NODE_PATH (pre-installed in the agent image; not a repository
// dependency). Nothing should listen on localhost:3000 for clean results: callbacks are captured from Keycloak's
// redirects and never served. It creates temporary users (deleted at the end), briefly changes the agency-sso
// issuer and the agentcity-bff secret (both restored), and finally ends every session in the agentcity realm.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminClient, findUserByEmail } from '../seed/kc-admin.mjs';
import { EMAIL_CODE_PROVIDER } from '../seed/email-code-step.mjs';
import * as L from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const evidencePath = resolve(repoRoot, 'planning/agentcity-migration/m03/evidence/idp-verification.json');
const AGENCY_PASSWORD = 'local-dev-only-agency-sso-password';
const SSO_EMAIL = 'sso.user@agency.example';

const { base, api } = await adminClient();
const { chromium } = L.loadPlaywright();
const results = [];
const cleanup = [];
const stamp = Date.now();
const temp = name => `verify.${name}.${stamp}@agentcity.test`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(id, title, fn) {
  const started = Date.now();
  try {
    const details = (await fn()) ?? {};
    results.push({ id, title, passed: true, details, ms: Date.now() - started });
    console.error(`PASS ${id}`);
  } catch (error) {
    results.push({ id, title, passed: false, error: String(error?.message ?? error), ms: Date.now() - started });
    console.error(`FAIL ${id}: ${error?.message ?? error}`);
  }
}

function pick(
  claims,
  keys = ['iss', 'aud', 'azp', 'sub', 'email', 'email_verified', 'sid', 'auth_time', 'acr', 'amr', 'idp'],
) {
  return Object.fromEntries(keys.map(k => [k, claims?.[k]]));
}

async function createAgentcityUser(email) {
  await api('POST', 'agentcity/users', {
    username: email,
    email,
    emailVerified: true,
    enabled: true,
    firstName: 'Verify',
    lastName: 'User',
  });
  const user = await findUserByEmail(api, 'agentcity', email);
  cleanup.push(() => api('DELETE', `agentcity/users/${user.id}`, undefined, { allow: [404] }));
  return user;
}

async function createAgencyUser(email) {
  await api('POST', 'agency-idp/users', {
    username: email,
    email,
    emailVerified: true,
    enabled: true,
    firstName: 'Verify',
    lastName: 'Agency',
    credentials: [{ type: 'password', value: AGENCY_PASSWORD, temporary: false }],
  });
  const user = await findUserByEmail(api, 'agency-idp', email);
  cleanup.push(() => api('DELETE', `agency-idp/users/${user.id}`, undefined, { allow: [404] }));
  cleanup.push(async () => {
    const mirrored = await findUserByEmail(api, 'agentcity', email);
    if (mirrored) await api('DELETE', `agentcity/users/${mirrored.id}`, undefined, { allow: [404] });
  });
  return user;
}

const sessionsOf = async userId => (await api('GET', `agentcity/users/${userId}/sessions`)).data;
const clearBruteForce = userId => api('DELETE', `agentcity/attack-detection/brute-force/users/${userId}`);

/** Completes a code flow from the callback captured for `req`: exchange, verify the ID token, return everything. */
async function finish(page, captured, req, timeout = 10000) {
  const callback = await L.waitForCallback(page, captured, req.state, timeout);
  if (!callback) return { callback: null, page: await L.pageText(page) };
  if (callback.error) return { callback, page: await L.pageText(page) };
  const tokens = await L.exchangeCode(callback.code, req.verifier);
  assert(tokens.status === 200, `code exchange failed: ${tokens.status} ${JSON.stringify(tokens.body)}`);
  const { header, claims } = await L.verifyJwt(tokens.body.id_token);
  return { callback, tokens: tokens.body, header, claims, problems: L.idTokenProblems(claims, req) };
}

/** Starts the WebAuthn ceremony on Keycloak's passkey page; clicks again if the page script was not ready yet. */
async function clickPasskey(page) {
  const button = page.locator('#authenticateWebAuthnButton');
  await button.waitFor({ timeout: 10000 });
  await page.waitForLoadState('load');
  const url = page.url();
  for (let attempt = 0; attempt < 3; attempt++) {
    await button.click().catch(() => {});
    try {
      await page.waitForURL(u => u.href !== url, { timeout: 5000 });
      return;
    } catch {
      if (!(await button.count())) return;
    }
  }
}

async function agencyPassword(page, email = SSO_EMAIL) {
  await page.locator('#password').waitFor({ timeout: 10000 });
  if (await page.locator('#username').count()) await page.fill('#username', email);
  await page.fill('#password', AGENCY_PASSWORD);
  await page.click('#kc-login').catch(() => {});
}

const browser = await chromium.launch();
try {
  const { data: serverInfo } = await api('GET', '../serverinfo').catch(() => ({ data: null }));
  const seeded = {};
  for (const email of ['owner@agentcity.test', 'staff@agentcity.test', SSO_EMAIL]) {
    seeded[email] = await findUserByEmail(api, 'agentcity', email);
  }

  await check('seed-present', 'Seeded development users exist (pnpm keycloak:seed)', async () => {
    for (const [email, user] of Object.entries(seeded)) {
      assert(user, `${email} missing: run pnpm keycloak:seed`);
      assert(user.emailVerified && user.enabled, `${email} not verified/enabled`);
    }
    const ssoUser = seeded[SSO_EMAIL];
    const { data: links } = await api('GET', `agentcity/users/${ssoUser.id}/federated-identity`);
    assert(
      links.some(l => l.identityProvider === 'agency-sso'),
      'sso.user not linked to agency-sso',
    );
    return { users: Object.keys(seeded) };
  });

  await check('seed-guards', 'Seed script refuses NODE_ENV=production and non-local Keycloak hosts', async () => {
    const script = resolve(repoRoot, 'infra/keycloak/seed/seed-dev-users.mjs');
    const run = env => spawnSync(process.execPath, [script], { env: { ...process.env, ...env }, encoding: 'utf8' });
    const production = run({ NODE_ENV: 'production' });
    const remote = run({ KEYCLOAK_URL: 'http://keycloak.example.com:8080' });
    assert(production.status === 2 && /Refusing/.test(production.stderr), 'production run was not refused');
    assert(remote.status === 2 && /Refusing/.test(remote.stderr), 'non-local host was not refused');
    return { production: production.stderr.trim(), remoteHost: remote.stderr.trim() };
  });

  await check('discovery', 'Discovery document: issuer, PKCE S256, endpoints', async () => {
    const doc = await (await fetch(`${L.ISSUER}/.well-known/openid-configuration`)).json();
    assert(doc.issuer === (process.env.OIDC_ISSUER ?? L.ISSUER), `issuer ${doc.issuer}`);
    assert(doc.code_challenge_methods_supported.includes('S256'), 'S256 not supported');
    return {
      issuer: doc.issuer,
      authorization_endpoint: doc.authorization_endpoint,
      token_endpoint: doc.token_endpoint,
      end_session_endpoint: doc.end_session_endpoint,
      jwks_uri: doc.jwks_uri,
      backchannel_logout_supported: doc.backchannel_logout_supported,
      acr_values_supported: doc.acr_values_supported,
      claims_supported_includes_amr: doc.claims_supported?.includes('amr') ?? null,
      keycloakVersion: serverInfo?.systemInfo?.version ?? null,
    };
  });

  await check(
    'client-config',
    'agentcity-bff is confidential, code flow only, PKCE S256; agentcity-web removed',
    async () => {
      const { data: clients } = await api('GET', 'agentcity/clients');
      const bff = clients.find(c => c.clientId === 'agentcity-bff');
      assert(bff, 'agentcity-bff missing');
      assert(!clients.some(c => c.clientId === 'agentcity-web'), 'agentcity-web still present');
      assert(bff.publicClient === false, 'public client');
      assert(bff.standardFlowEnabled && !bff.implicitFlowEnabled && !bff.directAccessGrantsEnabled, 'flows');
      assert(!bff.serviceAccountsEnabled, 'service account enabled');
      assert(bff.attributes['pkce.code.challenge.method'] === 'S256', 'PKCE not S256');
      assert(JSON.stringify(bff.redirectUris) === JSON.stringify([L.REDIRECT_URI]), `redirectUris ${bff.redirectUris}`);
      assert(bff.attributes['post.logout.redirect.uris'] === L.POST_LOGOUT_REDIRECT_URI, 'post logout redirect');
      return {
        redirectUris: bff.redirectUris,
        postLogoutRedirectUris: bff.attributes['post.logout.redirect.uris'],
        webOrigins: bff.webOrigins,
        defaultClientScopes: bff.defaultClientScopes,
        clients: clients.map(c => c.clientId),
      };
    },
  );

  await check(
    'client-rejects-misuse',
    'Direct grant, implicit, missing PKCE and foreign redirect URIs are refused',
    async () => {
      const basic = `Basic ${Buffer.from(`${L.CLIENT_ID}:${L.CLIENT_SECRET}`).toString('base64')}`;
      const direct = await fetch(`${L.ISSUER}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { authorization: basic, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'password', username: 'owner@agentcity.test', password: 'x' }),
      });
      const directBody = await direct.json();
      assert(direct.status >= 400 && directBody.error === 'unauthorized_client', `direct grant ${direct.status}`);

      const location = async extra => {
        const req = L.authRequest(extra);
        const response = await fetch(req.url, { redirect: 'manual' });
        return { status: response.status, location: response.headers.get('location'), body: await response.text() };
      };
      const noPkce = await location({ code_challenge: undefined, code_challenge_method: undefined });
      assert(noPkce.location?.includes('error=invalid_request'), `no PKCE: ${noPkce.status} ${noPkce.location}`);
      const plain = await location({ code_challenge_method: 'plain' });
      assert(plain.location?.includes('error=invalid_request'), `plain PKCE: ${plain.status} ${plain.location}`);
      const implicit = await location({ response_type: 'id_token token' });
      assert(/error=(unauthorized_client|unsupported_response_type)/.test(implicit.location ?? ''), 'implicit allowed');
      const foreign = await location({ redirect_uri: 'http://localhost:3000/evil' });
      assert(foreign.status === 400 && !foreign.location, `foreign redirect: ${foreign.status}`);
      return {
        directGrant: directBody.error,
        missingPkce: new URL(noPkce.location).searchParams.get('error_description'),
        plainPkce: new URL(plain.location).searchParams.get('error_description'),
        implicit: new URL(implicit.location.replace('#', '?')).searchParams.get('error'),
        foreignRedirect: foreign.status,
      };
    },
  );

  // ---------------------------------------------------------------- passkeys
  const passkeyEmail = temp('passkey');
  const passkeyUser = await createAgentcityUser(passkeyEmail);
  const pk = await L.newAppContext(browser);
  const pkPage = await pk.context.newPage();
  const authenticator = await L.addVirtualAuthenticator(pk.context, pkPage);
  let basicSession = null;

  await check('passkeyless-no-enrolment', 'Identification alone never lets a person register a passkey', async () => {
    const req = L.authRequest();
    await L.navigate(pkPage, req.url);
    await pkPage.fill('#username', passkeyEmail);
    await pkPage.click('#kc-login');
    await pkPage.waitForLoadState();
    const text = await L.pageText(pkPage);
    const result = await finish(pkPage, pk.captured, req, 2000);
    assert(!result.callback, 'a code was issued without any credential');
    assert(!/Passkey Registration|Register/i.test(text), `registration offered: ${text}`);
    await clearBruteForce(passkeyUser.id);
    return { page: text };
  });

  await check(
    'passkey-enrolment',
    'Passkey enrolment by admin-issued email link (Mailpit) with a virtual authenticator',
    async () => {
      const since = Date.now() - 1000;
      await api(
        'PUT',
        `agentcity/users/${passkeyUser.id}/execute-actions-email?lifespan=900&client_id=agentcity-bff&redirect_uri=${encodeURIComponent(L.REDIRECT_URI)}`,
        ['webauthn-register-passwordless'],
      );
      const mail = await L.waitForMail(passkeyEmail, { since });
      assert(mail, 'no enrolment email in Mailpit');
      await L.navigate(
        pkPage,
        mail.links.find(l => l.includes('/login-actions/action-token')),
      );
      await pkPage.click('text=Click here to proceed');
      await pkPage.click('#registerWebAuthn');
      await pkPage.locator('text=Your account has been updated').waitFor({ timeout: 10000 });
      const { data: credentials } = await api('GET', `agentcity/users/${passkeyUser.id}/credentials`);
      const virtual = await authenticator.credentials();
      assert(
        credentials.some(c => c.type === 'webauthn-passwordless'),
        'no webauthn-passwordless credential',
      );
      assert(virtual.length === 1 && virtual[0].isResidentCredential, 'virtual authenticator has no resident key');
      return {
        mailSubject: mail.subject,
        keycloakCredentialTypes: credentials.map(c => c.type),
        virtualCredentials: virtual.length,
        residentKey: virtual[0].isResidentCredential,
      };
    },
  );

  await check(
    'passkey-sign-in',
    'Passwordless sign-in with the passkey; ID token verified and claims present',
    async () => {
      await pk.context.clearCookies();
      const req = L.authRequest();
      await L.navigate(pkPage, req.url);
      await pkPage.fill('#username', passkeyEmail);
      await pkPage.click('#kc-login');
      await clickPasskey(pkPage);
      const result = await finish(pkPage, pk.captured, req);
      assert(result.claims, `no code: ${result.page}`);
      assert(result.problems.length === 0, `ID token problems: ${result.problems}`);
      assert(result.claims.acr === '1', `acr ${result.claims.acr}`);
      assert(result.claims.amr.includes('passkey'), `amr ${result.claims.amr}`);
      assert(result.claims.email_verified === true && result.claims.email === passkeyEmail, 'email claims');
      assert(result.claims.sub === passkeyUser.id, 'sub is not the Keycloak user id');
      basicSession = result;
      return {
        idTokenHeader: result.header,
        idToken: pick(result.claims),
        allClaimNames: Object.keys(result.claims).sort(),
      };
    },
  );

  await check(
    'step-up-forces-passkey',
    'acr 1 session asked for acr_values=2 (prompt=login, max_age=0) must use the passkey',
    async () => {
      assert(basicSession, 'no basic session');
      const req = L.authRequest({ acr_values: '2', prompt: 'login', max_age: '0' });
      await L.navigate(pkPage, req.url);
      await pkPage.locator('#authenticateWebAuthnButton').waitFor({ timeout: 10000 });
      const prompt = await L.pageText(pkPage);
      assert(!(await L.waitForCallback(pkPage, pk.captured, req.state, 1500)), 'code issued without a passkey prompt');
      await clickPasskey(pkPage);
      const result = await finish(pkPage, pk.captured, req);
      assert(result.claims, `no code: ${result.page}`);
      assert(result.problems.length === 0, `ID token problems: ${result.problems}`);
      assert(result.claims.acr === '2', `acr ${result.claims.acr}`);
      assert(result.claims.amr.includes('passkey'), `amr ${result.claims.amr}`);
      assert(result.claims.auth_time >= basicSession.claims.auth_time, 'auth_time went backwards');
      return {
        promptPage: prompt,
        before: pick(basicSession.claims, ['acr', 'amr', 'auth_time', 'sid']),
        after: pick(result.claims, ['acr', 'amr', 'auth_time', 'sid']),
        sameKeycloakSession: result.claims.sid === basicSession.claims.sid,
      };
    },
  );

  await check(
    'step-up-acr-values-only',
    'acr_values=2 alone (no prompt/max_age) still prompts for the passkey',
    async () => {
      const req = L.authRequest({ acr_values: '2' });
      await L.navigate(pkPage, req.url);
      await pkPage.locator('#authenticateWebAuthnButton').waitFor({ timeout: 10000 });
      assert(!(await L.waitForCallback(pkPage, pk.captured, req.state, 1500)), 'silent acr 2');
      await clickPasskey(pkPage);
      const result = await finish(pkPage, pk.captured, req);
      assert(result.claims?.acr === '2', `acr ${result.claims?.acr}`);
      return { after: pick(result.claims, ['acr', 'amr', 'auth_time']) };
    },
  );

  await check(
    'silent-sso-is-acr1',
    'A later sign-in without acr_values reuses the session at acr 1 (level 2 has max age 0)',
    async () => {
      const req = L.authRequest();
      await L.navigate(pkPage, req.url);
      const result = await finish(pkPage, pk.captured, req);
      assert(result.claims?.acr === '1', `acr ${result.claims?.acr}`);
      return { silent: pick(result.claims, ['acr', 'amr', 'auth_time', 'sid']) };
    },
  );

  await check(
    'fresh-acr2-single-passkey',
    'A fresh sign-in asking for acr 2 needs exactly one passkey ceremony',
    async () => {
      await pk.context.clearCookies();
      const req = L.authRequest({ acr_values: '2' });
      await L.navigate(pkPage, req.url);
      await pkPage.fill('#username', passkeyEmail);
      await pkPage.click('#kc-login');
      await clickPasskey(pkPage);
      const result = await finish(pkPage, pk.captured, req);
      assert(result.claims?.acr === '2', `acr ${result.claims?.acr} ${result.page ?? ''}`);
      basicSession = result;
      return { claims: pick(result.claims, ['acr', 'amr', 'auth_time']) };
    },
  );

  await check(
    'code-exchange-guards',
    'Codes are single-use, bound to the PKCE verifier and the client secret',
    async () => {
      const req = L.authRequest();
      await L.navigate(pkPage, req.url);
      const callback = await L.waitForCallback(pkPage, pk.captured, req.state);
      assert(callback?.code, 'no code');
      const wrongSecret = await L.exchangeCode(callback.code, req.verifier, { secret: 'not-the-secret' });
      const wrongVerifier = await L.exchangeCode(callback.code, 'x'.repeat(43));
      const req2 = L.authRequest();
      await L.navigate(pkPage, req2.url);
      const callback2 = await L.waitForCallback(pkPage, pk.captured, req2.state);
      const first = await L.exchangeCode(callback2.code, req2.verifier);
      const replay = await L.exchangeCode(callback2.code, req2.verifier);
      const refreshAfterReplay = await L.refresh(first.body.refresh_token);
      assert(wrongSecret.status === 401, `wrong secret ${wrongSecret.status}`);
      assert(wrongVerifier.status === 400, `wrong verifier ${wrongVerifier.status}`);
      assert(first.status === 200 && replay.status === 400, `replay ${first.status}/${replay.status}`);
      assert(refreshAfterReplay.status === 400, 'tokens from a replayed code still refresh');
      return {
        wrongSecret: wrongSecret.body.error,
        wrongVerifier: wrongVerifier.body.error_description ?? wrongVerifier.body.error,
        replay: replay.body.error_description ?? replay.body.error,
        refreshOfFirstTokensAfterReplay: refreshAfterReplay.body.error_description ?? refreshAfterReplay.body.error,
      };
    },
  );

  await check('refresh-rotation', 'Refresh tokens rotate; reusing an old refresh token fails', async () => {
    const req = L.authRequest();
    await L.navigate(pkPage, req.url);
    const session = await finish(pkPage, pk.captured, req);
    assert(session.tokens, `no session: ${session.page}`);
    const original = session.tokens.refresh_token;
    const first = await L.refresh(original);
    assert(first.status === 200, `refresh ${first.status} ${JSON.stringify(first.body)}`);
    const reuse = await L.refresh(original);
    assert(reuse.status === 400, `reuse ${reuse.status}`);
    return {
      reuse: reuse.body.error_description ?? reuse.body.error,
      accessTokenLifetime: first.body.expires_in,
      refreshLifetime: first.body.refresh_expires_in,
    };
  });

  await check('rp-logout', 'RP-initiated logout ends the Keycloak session and its refresh token', async () => {
    const req = L.authRequest();
    await L.navigate(pkPage, req.url);
    const result = await finish(pkPage, pk.captured, req);
    assert(result.claims, 'no session');
    assert((await sessionsOf(passkeyUser.id)).length >= 1, 'no session before logout');
    const url = new URL(`${L.ISSUER}/protocol/openid-connect/logout`);
    url.searchParams.set('id_token_hint', result.tokens.id_token);
    url.searchParams.set('post_logout_redirect_uri', L.POST_LOGOUT_REDIRECT_URI);
    url.searchParams.set('state', 'bye');
    await L.navigate(pkPage, url.href);
    const deadline = Date.now() + 10000;
    let landed = null;
    while (!landed && Date.now() < deadline) {
      landed = pk.captured.find(u => u.startsWith(L.POST_LOGOUT_REDIRECT_URI));
      if (!landed) await pkPage.waitForTimeout(100);
    }
    assert(landed, `no post-logout redirect: ${await L.pageText(pkPage)}`);
    const sessions = await sessionsOf(passkeyUser.id);
    const refreshAfter = await L.refresh(result.tokens.refresh_token);
    assert(!sessions.some(x => x.id === result.claims.sid), `session ${result.claims.sid} still active`);
    assert(refreshAfter.status === 400, `refresh after logout ${refreshAfter.status}`);
    const silent = L.authRequest();
    await L.navigate(pkPage, silent.url);
    await pkPage.locator('#username').waitFor({ timeout: 10000 });
    return {
      postLogoutRedirect: landed,
      loggedOutSid: result.claims.sid,
      otherSessionsOfUser: sessions.map(x => ({ id: x.id, clients: Object.values(x.clients ?? {}) })),
      refreshAfter: refreshAfter.body.error_description ?? refreshAfter.body.error,
      nextAuthorizeShowsSignIn: true,
    };
  });

  // ---------------------------------------------------------------- agency SSO
  const ssoUser = seeded[SSO_EMAIL];
  if (ssoUser) await clearBruteForce(ssoUser.id);
  const sso = await L.newAppContext(browser);
  const ssoPage = await sso.context.newPage();
  let ssoSession = null;

  await check(
    'sso-sign-in',
    'Agency SSO through the broker (button on the sign-in page), pre-linked seeded user',
    async () => {
      const req = L.authRequest();
      await L.navigate(ssoPage, req.url);
      await ssoPage.click('#social-agency-sso');
      await ssoPage.waitForURL(/realms\/agency-idp/);
      const agencyUrl = ssoPage.url();
      await agencyPassword(ssoPage);
      const result = await finish(ssoPage, sso.captured, req);
      assert(result.claims, `no code: ${result.page}`);
      assert(result.problems.length === 0, `ID token problems: ${result.problems}`);
      assert(result.claims.sub === ssoUser.id, 'sub is not the seeded agentcity user');
      assert(result.claims.acr === '1', `acr ${result.claims.acr}`);
      assert(JSON.stringify(result.claims.amr) === '["sso"]', `amr ${result.claims.amr}`);
      assert(result.claims.idp === 'agency-sso', `idp ${result.claims.idp}`);
      ssoSession = result;
      return {
        agencyAuthorizationHost: new URL(agencyUrl).host,
        idToken: pick(result.claims),
      };
    },
  );

  await check('sso-hint', 'kc_idp_hint=agency-sso goes straight to the agency IdP', async () => {
    const context = await L.newAppContext(browser);
    const page = await context.context.newPage();
    const req = L.authRequest({ kc_idp_hint: 'agency-sso' });
    await L.navigate(page, req.url);
    await page.waitForURL(/realms\/agency-idp/);
    await agencyPassword(page);
    const result = await finish(page, context.captured, req);
    await context.context.close();
    assert(result.claims?.amr?.includes('sso'), `no sso sign-in: ${result.page}`);
    return { claims: pick(result.claims, ['acr', 'amr', 'idp']) };
  });

  await check(
    'sso-cannot-step-up',
    'Agency SSO never yields acr 2; a person without a passkey is denied step-up',
    async () => {
      assert(ssoSession, 'no SSO session');
      const viaIdp = L.authRequest({ acr_values: '2', prompt: 'login', max_age: '0', kc_idp_hint: 'agency-sso' });
      await L.navigate(ssoPage, viaIdp.url);
      await ssoPage.waitForURL(/realms\/agency-idp/);
      await agencyPassword(ssoPage);
      await ssoPage.waitForTimeout(1500);
      const idpResult = await finish(ssoPage, sso.captured, viaIdp, 2000);
      assert(!idpResult.callback || idpResult.callback.error, 'code issued after SSO re-authentication for acr 2');
      const viaForm = L.authRequest({ acr_values: '2' });
      await L.navigate(ssoPage, viaForm.url);
      await ssoPage.click('#kc-login');
      await ssoPage.waitForLoadState();
      const formResult = await finish(ssoPage, sso.captured, viaForm, 2000);
      assert(!formResult.callback, 'code issued for acr 2 without a passkey');
      await clearBruteForce(ssoUser.id);
      return { viaAgencySso: idpResult.page, viaSignInForm: formResult.page };
    },
  );

  await check(
    'sso-user-adds-passkey',
    'An SSO user adds a passkey (kc_action, right after sign-in) and can then step up to acr 2',
    async () => {
      await clearBruteForce(ssoUser.id);
      const context = await L.newAppContext(browser);
      const page = await context.context.newPage();
      await L.addVirtualAuthenticator(context.context, page);
      try {
        const signIn = L.authRequest({ kc_idp_hint: 'agency-sso' });
        await L.navigate(page, signIn.url);
        await agencyPassword(page);
        assert((await finish(page, context.captured, signIn)).claims, 'no SSO session');
        const add = L.authRequest({ kc_action: 'webauthn-register-passwordless' });
        await L.navigate(page, add.url);
        await page.click('#registerWebAuthn');
        const added = await L.waitForCallback(page, context.captured, add.state);
        assert(added?.kc_action_status === 'success', `kc_action_status ${added?.kc_action_status}`);
        const stepUp = L.authRequest({ acr_values: '2', prompt: 'login', max_age: '0' });
        await L.navigate(page, stepUp.url);
        await page.click('#kc-login');
        await clickPasskey(page);
        const result = await finish(page, context.captured, stepUp);
        assert(result.claims?.acr === '2' && result.claims.amr.includes('passkey'), `step-up: ${result.page ?? ''}`);
        return { kcActionStatus: added.kc_action_status, stepUp: pick(result.claims, ['acr', 'amr', 'idp', 'sid']) };
      } finally {
        await context.context.close();
        const { data: credentials } = await api('GET', `agentcity/users/${ssoUser.id}/credentials`);
        for (const c of credentials) await api('DELETE', `agentcity/users/${ssoUser.id}/credentials/${c.id}`);
      }
    },
  );

  await check(
    'sso-first-login-new-account',
    'First SSO sign-in creates the account only after the email is verified',
    async () => {
      const email = `verify.sso-new.${stamp}@agency.example`;
      await createAgencyUser(email);
      const context = await L.newAppContext(browser);
      const page = await context.context.newPage();
      const since = Date.now() - 1000;
      const req = L.authRequest({ kc_idp_hint: 'agency-sso' });
      await L.navigate(page, req.url);
      await agencyPassword(page, email);
      await page.locator('text=verify your email').first().waitFor({ timeout: 10000 });
      const verifyPage = await L.pageText(page);
      assert(!(await L.waitForCallback(page, context.captured, req.state, 1000)), 'code issued before email proof');
      const mail = await L.waitForMail(email, { since });
      assert(mail, 'no verification email');
      await L.navigate(
        page,
        mail.links.find(l => l.includes('/login-actions/action-token')),
      );
      const result = await finish(page, context.captured, req);
      await context.context.close();
      assert(result.claims, `no code after verification: ${result.page}`);
      assert(result.claims.email_verified === true && result.claims.amr.includes('sso'), 'claims');
      const created = await findUserByEmail(api, 'agentcity', email);
      const { data: links } = await api('GET', `agentcity/users/${created.id}/federated-identity`);
      return {
        verifyPage,
        mailSubject: mail.subject,
        claims: pick(result.claims, ['email', 'email_verified', 'acr', 'amr', 'idp']),
        links: links.map(l => l.identityProvider),
      };
    },
  );

  await check(
    'sso-no-silent-link',
    'An SSO identity with the email of an existing account is not linked without confirmation + mailbox proof',
    async () => {
      const email = temp('collide');
      const existing = await createAgentcityUser(email);
      await createAgencyUser(email);
      const context = await L.newAppContext(browser);
      const page = await context.context.newPage();
      const req = L.authRequest({ kc_idp_hint: 'agency-sso' });
      await L.navigate(page, req.url);
      await agencyPassword(page, email);
      await page.locator('#linkAccount').waitFor({ timeout: 10000 });
      const existsPage = await L.pageText(page);
      assert(!(await L.waitForCallback(page, context.captured, req.state, 1000)), 'code issued before confirmation');
      const since = Date.now() - 1000;
      await page.click('#linkAccount');
      await page.waitForLoadState();
      const emailPage = await L.pageText(page);
      const linksBefore = (await api('GET', `agentcity/users/${existing.id}/federated-identity`)).data;
      assert(linksBefore.length === 0, 'linked before mailbox proof');
      assert(!(await L.waitForCallback(page, context.captured, req.state, 1000)), 'code issued before mailbox proof');
      const mail = await L.waitForMail(email, { since });
      assert(mail, 'no link-confirmation email');
      await L.navigate(
        page,
        mail.links.find(l => l.includes('/login-actions/action-token')),
      );
      const result = await finish(page, context.captured, req);
      await context.context.close();
      const linksAfter = (await api('GET', `agentcity/users/${existing.id}/federated-identity`)).data;
      assert(
        result.claims?.sub === existing.id,
        `after proof, sign-in is not the existing account: ${result.page ?? ''}`,
      );
      assert(
        linksAfter.some(l => l.identityProvider === 'agency-sso'),
        'not linked after proof',
      );
      return {
        existsPage,
        emailPage,
        linksBeforeProof: linksBefore.length,
        mailSubject: mail.subject,
        linksAfterProof: linksAfter.map(l => l.identityProvider),
        claims: pick(result.claims, ['sub', 'amr', 'idp']),
      };
    },
  );

  await check(
    'sso-issuer-validation',
    'The broker rejects agency tokens whose issuer does not match the configured issuer',
    async () => {
      const { data: idp } = await api('GET', 'agentcity/identity-provider/instances/agency-sso');
      const goodIssuer = idp.config.issuer;
      const attempt = async () => {
        const context = await L.newAppContext(browser);
        const page = await context.context.newPage();
        const req = L.authRequest({ kc_idp_hint: 'agency-sso' });
        await L.navigate(page, req.url);
        await agencyPassword(page);
        const result = await finish(page, context.captured, req, 5000);
        await context.context.close();
        return result;
      };
      let wrong;
      try {
        await api('PUT', 'agentcity/identity-provider/instances/agency-sso', {
          ...idp,
          config: { ...idp.config, issuer: 'http://localhost:58080/realms/not-the-agency' },
        });
        wrong = await attempt();
      } finally {
        await api('PUT', 'agentcity/identity-provider/instances/agency-sso', idp);
      }
      await clearBruteForce(ssoUser.id);
      const right = await attempt();
      assert(!wrong.callback?.code, 'code issued with a wrong issuer');
      assert(right.claims?.amr?.includes('sso'), `restored config does not work: ${right.page}`);
      return {
        configuredIssuer: goodIssuer,
        wrongIssuerPage: wrong.page,
        restored: pick(right.claims, ['amr', 'idp']),
      };
    },
  );

  await check(
    'agency-backchannel-logout',
    'Ending the agency session (admin logout in agency-idp) ends the brokered agentcity session',
    async () => {
      const context = await L.newAppContext(browser);
      const page = await context.context.newPage();
      const req = L.authRequest({ kc_idp_hint: 'agency-sso' });
      await L.navigate(page, req.url);
      await agencyPassword(page);
      const result = await finish(page, context.captured, req);
      await context.context.close();
      assert(result.claims, 'no SSO session');
      const before = (await sessionsOf(ssoUser.id)).length;
      const agencyUser = await findUserByEmail(api, 'agency-idp', SSO_EMAIL);
      await api('POST', `agency-idp/users/${agencyUser.id}/logout`);
      let after = before;
      for (let i = 0; i < 30 && after > 0; i++) {
        await new Promise(r => setTimeout(r, 200));
        after = (await sessionsOf(ssoUser.id)).length;
      }
      const refreshAfter = await L.refresh(result.tokens.refresh_token);
      assert(before >= 1 && after === 0, `sessions before ${before}, after ${after}`);
      assert(refreshAfter.status === 400, 'refresh still works');
      return { sessionsBefore: before, sessionsAfter: after, refreshAfter: refreshAfter.body.error };
    },
  );

  await check(
    'loa1-expiry',
    'After the level-1 max age, silent SSO gives acr 0; acr_values=1 forces a new sign-in instead',
    async () => {
      // Shortens both level-1 max ages (browser and post-broker flows) to 5 s for this check, then restores them.
      const configs = [];
      for (const flow of ['agentcity-browser', 'agentcity-post-broker-login']) {
        const { data: executions } = await api('GET', `agentcity/authentication/flows/${flow}/executions`);
        for (const e of executions.filter(x => x.providerId === 'conditional-level-of-authentication')) {
          const { data: config } = await api('GET', `agentcity/authentication/config/${e.authenticationConfig}`);
          if (config.config['loa-condition-level'] === '1') configs.push(config);
        }
      }
      assert(configs.length === 2, `found ${configs.length} level-1 conditions`);
      const context = await L.newAppContext(browser);
      const page = await context.context.newPage();
      const run = async extra => {
        const req = L.authRequest(extra);
        await L.navigate(page, req.url);
        if (await page.locator('#password').count()) await agencyPassword(page);
        return finish(page, context.captured, req, 4000);
      };
      try {
        for (const config of configs) {
          await api('PUT', `agentcity/authentication/config/${config.id}`, {
            ...config,
            config: { ...config.config, 'loa-max-age': '5' },
          });
        }
        const signIn = await run({ kc_idp_hint: 'agency-sso' });
        await new Promise(r => setTimeout(r, 7000));
        const silent = await run({});
        const withAcr1 = await run({ acr_values: '1' });
        assert(signIn.claims?.acr === '1', 'sign-in');
        assert(silent.claims?.acr === '0', `silent after expiry: acr ${silent.claims?.acr}`);
        assert(!withAcr1.callback?.code, 'acr_values=1 after expiry was silent');
        return {
          signIn: pick(signIn.claims, ['acr', 'amr', 'auth_time']),
          silentAfterExpiry: pick(silent.claims, ['acr', 'amr', 'auth_time']),
          acrValues1AfterExpiry: withAcr1.page,
        };
      } finally {
        await context.context.close();
        for (const config of configs) await api('PUT', `agentcity/authentication/config/${config.id}`, config);
      }
    },
  );

  await check(
    'backchannel-logout-token',
    'Keycloak POSTs a signed logout token (sid, sub) to the client back-channel URL',
    async () => {
      // The real URL points at the API (host.docker.internal:4000). Here a temporary listener stands in for it.
      const received = [];
      const server = createServer((request, response) => {
        let body = '';
        request.on('data', chunk => (body += chunk));
        request.on('end', () => {
          received.push({ path: request.url, contentType: request.headers['content-type'], body });
          response.writeHead(200).end();
        });
      });
      await new Promise(r => server.listen(0, '0.0.0.0', r));
      const { data: clients } = await api('GET', 'agentcity/clients?clientId=agentcity-bff');
      const client = clients[0];
      const configured = client.attributes['backchannel.logout.url'];
      // Start from no sessions for this person, so exactly one logout token is expected.
      await api('POST', `agentcity/users/${ssoUser.id}/logout`);
      try {
        const listener = `http://host.docker.internal:${server.address().port}/api/auth/backchannel-logout`;
        await api('PUT', `agentcity/clients/${client.id}`, {
          ...client,
          attributes: { ...client.attributes, 'backchannel.logout.url': listener },
        });
        const context = await L.newAppContext(browser);
        const page = await context.context.newPage();
        const req = L.authRequest({ kc_idp_hint: 'agency-sso' });
        await L.navigate(page, req.url);
        await agencyPassword(page);
        const session = await finish(page, context.captured, req);
        await context.context.close();
        assert(session.claims, 'no session');
        await api('POST', `agentcity/users/${session.claims.sub}/logout`);
        for (let i = 0; i < 50 && !received.length; i++) await new Promise(r => setTimeout(r, 200));
        assert(received.length === 1, `${received.length} logout requests received`);
        const token = new URLSearchParams(received[0].body).get('logout_token');
        const { header, claims } = await L.verifyJwt(token);
        assert(header.typ === 'logout+jwt', `typ ${header.typ}`);
        assert(claims.iss === L.ISSUER && claims.aud === L.CLIENT_ID, 'iss/aud');
        assert(
          claims.sid === session.claims.sid && claims.sub === session.claims.sub,
          'sid/sub do not match the session',
        );
        assert('http://schemas.openid.net/event/backchannel-logout' in claims.events, 'events');
        assert(!('nonce' in claims), 'nonce present');
        return {
          configuredUrl: configured,
          request: { path: received[0].path, contentType: received[0].contentType },
          header,
          claims,
        };
      } finally {
        await api('PUT', `agentcity/clients/${client.id}`, {
          ...client,
          attributes: { ...client.attributes, 'backchannel.logout.url': configured },
        });
        server.close();
      }
    },
  );

  // ---------------------------------------------------------------- operations / break-glass
  await check(
    'brute-force',
    'Repeated failed authentications lock the account temporarily (brute-force detection)',
    async () => {
      // agentcity users have no passwords; a denied authentication (here: step-up without a passkey) is a failure.
      await clearBruteForce(ssoUser.id);
      const context = await L.newAppContext(browser);
      const page = await context.context.newPage();
      const req = L.authRequest({ kc_idp_hint: 'agency-sso' });
      await L.navigate(page, req.url);
      await agencyPassword(page);
      assert((await finish(page, context.captured, req)).claims, 'no SSO session');
      const pages = [];
      for (let i = 0; i < 6; i++) {
        await L.navigate(page, L.authRequest({ acr_values: '2' }).url);
        await page.click('#kc-login');
        await page.waitForLoadState();
        pages.push(await L.pageText(page));
      }
      const { data: status } = await api('GET', `agentcity/attack-detection/brute-force/users/${ssoUser.id}`);
      const blocked = L.authRequest({ kc_idp_hint: 'agency-sso' });
      await context.context.clearCookies();
      await L.navigate(page, blocked.url);
      await agencyPassword(page);
      const blockedResult = await finish(page, context.captured, blocked, 3000);
      await context.context.close();
      await clearBruteForce(ssoUser.id);
      assert(status.disabled === true, `not locked: ${JSON.stringify(status)}`);
      assert(!blockedResult.callback?.code, 'locked account still signed in');
      const { data: realm } = await api('GET', 'agentcity');
      return {
        status,
        lastDeniedPage: pages.at(-1),
        lockedSignInPage: blockedResult.page,
        realm: pick(realm, [
          'bruteForceProtected',
          'failureFactor',
          'waitIncrementSeconds',
          'maxFailureWaitSeconds',
          'permanentLockout',
        ]),
      };
    },
  );

  await check(
    'break-glass-rotate-client-secret',
    'Rotating the agentcity-bff secret invalidates the old one (then restored for local dev)',
    async () => {
      const { data: clients } = await api('GET', 'agentcity/clients?clientId=agentcity-bff');
      const client = clients[0];
      const req = L.authRequest({ kc_idp_hint: 'agency-sso' });
      const context = await L.newAppContext(browser);
      const page = await context.context.newPage();
      await L.navigate(page, req.url);
      await agencyPassword(page);
      const callback = await L.waitForCallback(page, context.captured, req.state);
      await context.context.close();
      let oldSecret;
      let newSecret;
      try {
        const { data: rotated } = await api('POST', `agentcity/clients/${client.id}/client-secret`);
        newSecret = rotated.value;
        oldSecret = await L.exchangeCode(callback.code, req.verifier);
        const second = L.authRequest({ kc_idp_hint: 'agency-sso' });
        const ctx2 = await L.newAppContext(browser);
        const page2 = await ctx2.context.newPage();
        await L.navigate(page2, second.url);
        await agencyPassword(page2);
        const cb2 = await L.waitForCallback(page2, ctx2.captured, second.state);
        await ctx2.context.close();
        const withNew = await L.exchangeCode(cb2.code, second.verifier, { secret: newSecret });
        assert(oldSecret.status === 401, `old secret still accepted: ${oldSecret.status}`);
        assert(withNew.status === 200, `new secret rejected: ${withNew.status}`);
      } finally {
        await api('PUT', `agentcity/clients/${client.id}`, { ...client, secret: L.CLIENT_SECRET });
      }
      const { data: restored } = await api('GET', `agentcity/clients/${client.id}/client-secret`);
      assert(restored.value === L.CLIENT_SECRET, 'local secret not restored');
      return { oldSecretAfterRotation: oldSecret.body.error, newSecretWorked: true, restoredLocalSecret: true };
    },
  );

  await check(
    'break-glass-disable-user',
    'Disabling a user blocks refresh and new sign-in; admin logout ends every session',
    async () => {
      await pk.context.clearCookies();
      const req = L.authRequest();
      await L.navigate(pkPage, req.url);
      await pkPage.fill('#username', passkeyEmail);
      await pkPage.click('#kc-login');
      await clickPasskey(pkPage);
      const session = await finish(pkPage, pk.captured, req);
      assert(session.claims, 'no session');
      const before = (await sessionsOf(passkeyUser.id)).length;
      const { data: user } = await api('GET', `agentcity/users/${passkeyUser.id}`);
      await api('PUT', `agentcity/users/${passkeyUser.id}`, { ...user, enabled: false });
      const afterDisable = (await sessionsOf(passkeyUser.id)).length;
      const refreshAfterDisable = await L.refresh(session.tokens.refresh_token);
      await api('POST', `agentcity/users/${passkeyUser.id}/logout`);
      const afterLogout = (await sessionsOf(passkeyUser.id)).length;
      const silent = L.authRequest();
      await L.navigate(pkPage, silent.url);
      const silentResult = await finish(pkPage, pk.captured, silent, 2000);
      await pk.context.clearCookies();
      const fresh = L.authRequest();
      await L.navigate(pkPage, fresh.url);
      await pkPage.fill('#username', passkeyEmail);
      await pkPage.click('#kc-login');
      await pkPage.waitForLoadState();
      if (await pkPage.locator('#authenticateWebAuthnButton').count()) await clickPasskey(pkPage);
      const freshResult = await finish(pkPage, pk.captured, fresh, 3000);
      assert(before >= 1, 'no session before');
      assert(refreshAfterDisable.status === 400, `refresh after disable ${refreshAfterDisable.status}`);
      assert(afterLogout === 0, `${afterLogout} sessions after logout`);
      assert(!silentResult.callback?.code, 'silent SSO after disable issued a code');
      assert(!freshResult.callback?.code, 'disabled user signed in');
      return {
        sessionsBefore: before,
        sessionsAfterDisableOnly: afterDisable,
        refreshAfterDisable: refreshAfterDisable.body.error_description ?? refreshAfterDisable.body.error,
        sessionsAfterAdminLogout: afterLogout,
        signInPage: freshResult.page,
      };
    },
  );

  await check('email-code-provider', `Email sign-in code step (${EMAIL_CODE_PROVIDER})`, async () => {
    const { data: providers } = await api('GET', 'agentcity/authentication/authenticator-providers');
    const installed = providers.some(p => p.id === EMAIL_CODE_PROVIDER);
    const { data: executions } = await api('GET', 'agentcity/authentication/flows/agentcity-loa1/executions');
    const step = executions.find(e => e.providerId === EMAIL_CODE_PROVIDER);
    assert(installed, 'provider not installed: email codes NOT verified (see m03/IDP.md, release blocker until it is)');
    assert(step?.requirement === 'ALTERNATIVE', 'provider installed but step missing: run pnpm keycloak:seed');
    return { installed, requirement: step.requirement };
  });

  await check(
    'email-code-sign-in',
    'Email sign-in code: passkeyless person signs in with a code from Mailpit (acr 1, amr email-code)',
    async () => {
      // Best effort against the first-party authenticator's form: the code is the first 6-8 digit number in the
      // newest mail, typed into the first visible text input. Runs only once the provider is installed.
      const { data: providers } = await api('GET', 'agentcity/authentication/authenticator-providers');
      assert(
        providers.some(p => p.id === EMAIL_CODE_PROVIDER),
        'provider not installed: not run',
      );
      const email = temp('emailcode');
      await createAgentcityUser(email);
      const context = await L.newAppContext(browser);
      const page = await context.context.newPage();
      const since = Date.now() - 1000;
      const req = L.authRequest();
      await L.navigate(page, req.url);
      await page.fill('#username', email);
      await page.click('#kc-login');
      await page.waitForLoadState();
      const mail = await L.waitForMail(email, { since });
      assert(mail, `no code email; page: ${await L.pageText(page)}`);
      const code = mail.text.match(/\b\d{6,8}\b/)?.[0];
      assert(code, 'no code in the email');
      await page.locator('form input:not([type=hidden])').first().fill(code);
      await page.locator('form [type=submit]').first().click();
      const result = await finish(page, context.captured, req);
      await context.context.close();
      assert(result.claims, `no code issued: ${result.page}`);
      assert(
        result.claims.acr === '1' && result.claims.amr.includes('email-code'),
        JSON.stringify(pick(result.claims)),
      );
      return { mailSubject: mail.subject, claims: pick(result.claims, ['acr', 'amr', 'email_verified']) };
    },
  );

  await check('break-glass-logout-all', 'Ending every session in the realm (admin "logout all")', async () => {
    const { data: before } = await api('GET', 'agentcity/client-session-stats');
    await api('POST', 'agentcity/logout-all');
    const { data: after } = await api('GET', 'agentcity/client-session-stats');
    const active = after.reduce((n, c) => n + Number(c.active ?? 0), 0);
    assert(active === 0, `${active} active sessions remain`);
    return { before, after };
  });
} finally {
  await browser.close();
  for (const step of cleanup.reverse()) await step().catch(() => {});
  const failed = results.filter(r => !r.passed);
  const report = {
    generatedAt: new Date().toISOString(),
    keycloak: base,
    command: 'node --env-file=infra/local-dev.env infra/keycloak/verify/verify-idp.mjs',
    summary: { total: results.length, passed: results.length - failed.length, failed: failed.map(r => r.id) },
    checks: results,
  };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`\n${report.summary.passed}/${report.summary.total} passed. Evidence: ${evidencePath}`);
  process.exitCode = failed.length ? 1 : 0;
}
