#!/usr/bin/env node
// Live verification of the agentcity-email-code authenticator in a throwaway Keycloak.
//
// Starts its own Keycloak container (never the shared one) with the built jar, on the compose network so it can
// reach the shared Mailpit sink at mail:1025. Creates a test realm, client and users through the admin API, wires a
// browser flow (Username Form -> agentcity-email-code) and drives real sign-ins with Playwright (Chromium), reading
// codes from Mailpit's API (only messages to this run's own addresses, which are deleted afterwards). Writes
// planning/agentcity-migration/m03/evidence/email-code-verification.json and removes the container.
//
// Prerequisites: `pnpm keycloak:providers` (builds the jar), the compose stack's `mail` service running
// (`pnpm infra:up`), Docker, and Playwright with Chromium available to Node.
// Usage: node infra/keycloak/email-code-authenticator/verify/verify-email-code.mjs [--keep]
//   --keep  leave the container running for inspection (remove it with `docker rm -f m03-email-kc`).
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = join(import.meta.dirname, '../../../..');
const JAR = join(ROOT, 'infra/keycloak/providers/agentcity-email-code-authenticator.jar');
const EVIDENCE_DIR = join(ROOT, 'planning/agentcity-migration/m03/evidence');
const EVIDENCE = join(EVIDENCE_DIR, 'email-code-verification.json');
const SCREENSHOT = join(EVIDENCE_DIR, 'email-code-verification-page.png');

const IMAGE =
  'quay.io/keycloak/keycloak:26.8.1@sha256:a78d6b79572168cb25886b80a8b5b8d4ed4390743e3eecb810538683e209dd6b';
const CONTAINER = process.env.VERIFY_KC_CONTAINER ?? 'm03-email-kc';
const PORT = Number(process.env.VERIFY_KC_PORT ?? 58180);
const NETWORK = process.env.VERIFY_KC_NETWORK ?? 'agentcity_default';
const KC = `http://127.0.0.1:${PORT}`;
const MAILPIT = process.env.MAIL_API_URL ?? 'http://127.0.0.1:58025';
const REALM = 'email-code-verify';
const CLIENT_ID = 'verify-client';
const CALLBACK_PORT = Number(process.env.VERIFY_CALLBACK_PORT ?? 58199);
const REDIRECT = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
const TTL_SECONDS = 60; // the authenticator's minimum, so the expiry check takes one minute
const COOLDOWN_SECONDS = 10;
const MAX_ATTEMPTS = 5;
const KEEP = process.argv.includes('--keep');

const RUN = randomBytes(4).toString('hex');
const ADMIN_USER = 'verify-admin';
const ADMIN_PASSWORD = `local-dev-only-${randomBytes(12).toString('hex')}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const checks = [];
const ownMessageIds = new Set();

function check(name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ''}`);
}

function docker(...args) {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}

// --- Keycloak admin API ----------------------------------------------------------------------------------------

let adminToken;
async function admin(method, path, body) {
  const res = await fetch(`${KC}/admin/realms${path}`, {
    method,
    headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok && res.status !== 404) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, location: res.headers.get('location') };
}

async function startKeycloak() {
  if (!existsSync(JAR)) throw new Error(`${JAR} is missing; run pnpm keycloak:providers first`);
  docker('rm', '-f', CONTAINER);
  docker(
    'run',
    '-d',
    '--name',
    CONTAINER,
    '--network',
    NETWORK,
    '-p',
    `127.0.0.1:${PORT}:8080`,
    '-e',
    `KC_BOOTSTRAP_ADMIN_USERNAME=${ADMIN_USER}`,
    '-e',
    `KC_BOOTSTRAP_ADMIN_PASSWORD=${ADMIN_PASSWORD}`,
    '-v',
    `${JAR}:/opt/keycloak/providers/agentcity-email-code-authenticator.jar:ro`,
    IMAGE,
    'start-dev',
  );
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${KC}/realms/master`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await sleep(1000);
  }
  throw new Error(`Keycloak did not start:\n${docker('logs', '--tail', '80', CONTAINER)}`);
}

async function adminLogin() {
  const res = await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
    }),
  });
  if (!res.ok) throw new Error(`admin login failed: ${res.status}`);
  adminToken = (await res.json()).access_token;
}

async function setUpRealm() {
  await admin('DELETE', `/${REALM}`);
  await admin('POST', '', {
    realm: REALM,
    enabled: true,
    displayName: 'AgentCity verify',
    loginWithEmailAllowed: true,
    bruteForceProtected: true,
    // High enough that the attempt-limit check does not lock the account, and no "quick login" lockout for the
    // fast automated submissions. The brute-force check below lowers failureFactor on purpose.
    failureFactor: 30,
    quickLoginCheckMilliSeconds: 1,
    smtpServer: { host: 'mail', port: '1025', from: 'noreply@agentcity.local', fromDisplayName: 'AgentCity (verify)' },
  });

  const flow = 'email-code-browser';
  await admin('POST', `/${REALM}/authentication/flows`, {
    alias: flow,
    description: 'Username, then email sign-in code',
    providerId: 'basic-flow',
    topLevel: true,
    builtIn: false,
  });
  for (const provider of ['auth-username-form', 'agentcity-email-code']) {
    await admin('POST', `/${REALM}/authentication/flows/${flow}/executions/execution`, { provider });
  }
  const executions = (await admin('GET', `/${REALM}/authentication/flows/${flow}/executions`)).body;
  for (const execution of executions) {
    await admin('PUT', `/${REALM}/authentication/flows/${flow}/executions`, { ...execution, requirement: 'REQUIRED' });
  }
  const emailCode = executions.find(e => e.providerId === 'agentcity-email-code');
  await admin('POST', `/${REALM}/authentication/executions/${emailCode.id}/config`, {
    alias: 'email-code-verify-config',
    config: {
      codeLength: '6',
      codeTtlSeconds: String(TTL_SECONDS),
      maxAttempts: String(MAX_ATTEMPTS),
      resendCooldownSeconds: String(COOLDOWN_SECONDS),
      maxSends: '5',
      // Keycloak's common execution config: the amr value and how long it stays in tokens.
      'default.reference.value': 'email-code',
      'default.reference.maxAge': '36000',
    },
  });
  const realm = (await admin('GET', `/${REALM}`)).body;
  await admin('PUT', `/${REALM}`, { ...realm, browserFlow: flow });

  await admin('POST', `/${REALM}/clients`, {
    clientId: CLIENT_ID,
    publicClient: true,
    standardFlowEnabled: true,
    directAccessGrantsEnabled: false,
    redirectUris: [REDIRECT],
    attributes: { 'pkce.code.challenge.method': 'S256' },
    protocolMappers: [
      {
        name: 'amr',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-amr-mapper',
        config: { 'id.token.claim': 'true', 'access.token.claim': 'true', 'introspection.token.claim': 'true' },
      },
    ],
  });
  return { flow, executions: executions.map(e => e.providerId) };
}

async function createUser(label, emailVerified) {
  const email = `ecv-${RUN}-${label}@example.test`;
  const res = await admin('POST', `/${REALM}/users`, {
    username: email,
    email,
    emailVerified,
    enabled: true,
    firstName: 'Verify',
    lastName: label,
  });
  return { email, id: res.location.split('/').pop() };
}

// --- Mailpit (read-only except deleting this run's own messages) -----------------------------------------------

async function messagesTo(email) {
  const query = encodeURIComponent(`to:"${email}"`);
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${query}&limit=50`);
  if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}`);
  const list = (await res.json()).messages.filter(m => m.To.some(t => t.Address.toLowerCase() === email));
  for (const m of list) ownMessageIds.add(m.ID);
  return list;
}

async function waitForMessages(email, count, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const list = await messagesTo(email);
    if (list.length >= count || Date.now() > deadline) return list;
    await sleep(300);
  }
}

async function latestCode(email, count) {
  const list = await waitForMessages(email, count);
  if (list.length < count) throw new Error(`expected ${count} message(s) to ${email}, found ${list.length}`);
  const newest = list.sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];
  const message = await (await fetch(`${MAILPIT}/api/v1/message/${newest.ID}`)).json();
  const code = /\b(\d{6})\b/.exec(message.Text)?.[1];
  return { code, message };
}

async function deleteOwnMessages() {
  if (!ownMessageIds.size) return 0;
  const res = await fetch(`${MAILPIT}/api/v1/messages`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ IDs: [...ownMessageIds] }),
  });
  return res.ok ? ownMessageIds.size : 0;
}

// --- Browser sign-in --------------------------------------------------------------------------------------------

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function beginSignIn(browser, email) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const { verifier, challenge } = pkce();
  const state = randomBytes(8).toString('hex');
  // A tiny local server answers the redirect; the authorization code is read from the request URL.
  let callbackUrl = null;
  page.on('request', request => {
    if (request.url().startsWith(REDIRECT)) callbackUrl = request.url();
  });
  const authorize = new URL(`${KC}/realms/${REALM}/protocol/openid-connect/auth`);
  authorize.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: 'openid email',
    state,
    nonce: randomBytes(8).toString('hex'),
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  await page.goto(authorize.toString());
  await page.fill('#username', email);
  await Promise.all([page.waitForEvent('load'), page.click('#kc-login')]);
  await page.waitForSelector('#kc-email-code-form');
  return { context, page, verifier, callback: () => callbackUrl };
}

async function submitCode(page, code) {
  await page.fill('#code', code);
  await Promise.all([page.waitForEvent('load'), page.click('#kc-login')]);
}

async function resend(page) {
  await Promise.all([page.waitForEvent('load'), page.click('#kc-email-code-resend')]);
}

async function fieldError(page) {
  const el = await page.$('#input-error-code');
  return el ? (await el.innerText()).trim() : null;
}

async function exchange(callbackUrl, verifier) {
  const code = new URL(callbackUrl).searchParams.get('code');
  const res = await fetch(`${KC}/realms/${REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`token exchange failed: ${JSON.stringify(body)}`);
  const claims = jwt => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
  return { id: claims(body.id_token), access: claims(body.access_token) };
}

function wrongCode(code) {
  return code.slice(0, 5) + String((Number(code[5]) + 1) % 10);
}

// --- Scenarios --------------------------------------------------------------------------------------------------

async function happyPath(browser) {
  const user = await createUser('happy', true);
  const s = await beginSignIn(browser, user.email);
  const intro = await s.page.innerText('#agentcity-email-code-sent');
  const masked = `${user.email[0]}***@example.test`;
  check(
    'code page says where the code went (masked) and how long it lasts',
    intro.includes(masked) && /6-digit/.test(intro),
    {
      text: intro,
    },
  );
  check(
    'code page has a labelled one-time-code input',
    await s.page
      .$eval('#code', el => ({
        label: document.querySelector('label[for="code"]')?.textContent.trim(),
        autocomplete: el.getAttribute('autocomplete'),
        inputmode: el.getAttribute('inputmode'),
      }))
      .then(a => a.label === 'Sign-in code' && a.autocomplete === 'one-time-code' && a.inputmode === 'numeric'),
  );
  await s.page.screenshot({ path: SCREENSHOT, fullPage: true });

  const { code, message } = await latestCode(user.email, 1);
  check(
    'email arrives in Mailpit with a 6-digit code, text and HTML parts',
    Boolean(code) && message.HTML.includes(code),
    {
      subject: message.Subject,
      from: message.From.Address,
      textPreview: message.Text.split('\n').filter(Boolean).slice(0, 3),
    },
  );
  check('email and page do not leak the code into the subject', !message.Subject.includes(code));

  await submitCode(s.page, code);
  const callback = s.callback();
  check('correct code completes sign-in (redirect with authorization code)', Boolean(callback));
  if (callback) {
    const tokens = await exchange(callback, s.verifier);
    check('ID token amr contains email-code', Array.isArray(tokens.id.amr) && tokens.id.amr.includes('email-code'), {
      amr: tokens.id.amr,
    });
    check('ID token acr is 1 (basic level)', tokens.id.acr === '1', { acr: tokens.id.acr });
    check(
      'ID token is for the signed-in user with a verified email',
      tokens.id.email === user.email && tokens.id.email_verified === true,
      {
        email: tokens.id.email,
        email_verified: tokens.id.email_verified,
      },
    );
    check('access token amr contains email-code', tokens.access.amr?.includes('email-code'), {
      amr: tokens.access.amr,
    });
  }
  await s.context.close();
}

async function wrongCodeAndAttemptLimit(browser) {
  const user = await createUser('attempts', true);
  const s = await beginSignIn(browser, user.email);
  const { code } = await latestCode(user.email, 1);
  await submitCode(s.page, wrongCode(code));
  const first = await fieldError(s.page);
  check(
    'wrong code is refused with tries left',
    first?.includes('not right') && first.includes(String(MAX_ATTEMPTS - 1)),
    {
      error: first,
    },
  );
  for (let i = 2; i <= MAX_ATTEMPTS; i++) await submitCode(s.page, wrongCode(code));
  const limit = await fieldError(s.page);
  check(`after ${MAX_ATTEMPTS} wrong codes the code stops working`, limit?.includes('Too many wrong codes'), {
    error: limit,
  });
  await submitCode(s.page, code);
  const after = await fieldError(s.page);
  check('the right code is refused once the attempt limit is reached', !s.callback() && after?.includes('Too many'), {
    error: after,
  });

  // Each wrong code is recorded on the user by brute-force protection (updated asynchronously).
  let status = null;
  for (let i = 0; i < 20; i++) {
    status = (await admin('GET', `/${REALM}/attack-detection/brute-force/users/${user.id}`)).body;
    if (status?.numFailures >= MAX_ATTEMPTS) break;
    await sleep(250);
  }
  check('each wrong code is recorded as a login failure on the user', status?.numFailures >= MAX_ATTEMPTS, {
    numFailures: status?.numFailures,
  });
  await s.context.close();
}

async function bruteForceLockout(browser) {
  const realm = (await admin('GET', `/${REALM}`)).body;
  await admin('PUT', `/${REALM}`, { ...realm, failureFactor: 3, waitIncrementSeconds: 60 });
  try {
    const user = await createUser('bruteforce', true);
    const s = await beginSignIn(browser, user.email);
    const { code } = await latestCode(user.email, 1);
    for (let i = 0; i < 3; i++) await submitCode(s.page, wrongCode(code));
    let status = null;
    for (let i = 0; i < 20; i++) {
      status = (await admin('GET', `/${REALM}/attack-detection/brute-force/users/${user.id}`)).body;
      if (status?.disabled) break;
      await sleep(250);
    }
    check('wrong codes count towards Keycloak brute-force protection (user temporarily locked)', status?.disabled, {
      numFailures: status?.numFailures,
      disabled: status?.disabled,
    });
    await submitCode(s.page, code);
    const error = await fieldError(s.page);
    check(
      'while locked, even the right code is refused with a generic message',
      !s.callback() && error?.includes('not possible'),
      {
        error,
      },
    );
  } finally {
    await admin('PUT', `/${REALM}`, realm);
  }
}

async function expiry(browser) {
  const user = await createUser('expiry', true);
  const s = await beginSignIn(browser, user.email);
  const { code } = await latestCode(user.email, 1);
  console.log(`waiting ${TTL_SECONDS + 2}s for the code to expire...`);
  await sleep((TTL_SECONDS + 2) * 1000);
  await submitCode(s.page, code);
  const error = await fieldError(s.page);
  check('expired code is refused', !s.callback() && error?.includes('expired'), { error });
  await resend(s.page);
  const fresh = await latestCode(user.email, 2);
  await submitCode(s.page, fresh.code);
  check('after expiry a new code can be requested and works', Boolean(s.callback()));
  await s.context.close();
}

async function resendCooldown(browser) {
  const user = await createUser('resend', true);
  const s = await beginSignIn(browser, user.email);
  const first = await latestCode(user.email, 1);
  await resend(s.page);
  const error = await fieldError(s.page);
  const count = (await messagesTo(user.email)).length;
  check('resend during the cooldown is refused and sends nothing', error?.includes('wait') && count === 1, {
    error,
    messages: count,
  });
  await s.page.reload(); // reloading the page must not send another code either
  check('reloading the code page does not send another code', (await messagesTo(user.email)).length === 1);
  await sleep(COOLDOWN_SECONDS * 1000 + 500);
  await resend(s.page);
  const info = await s.page.innerText('body');
  const second = await latestCode(user.email, 2);
  check('resend after the cooldown sends a new code', info.includes('We sent a new code') && second.code, {
    messages: (await messagesTo(user.email)).length,
  });
  if (first.code !== second.code) {
    await submitCode(s.page, first.code);
    const old = await fieldError(s.page);
    check('the earlier code no longer works after a resend', !s.callback() && old?.includes('not right'), {
      error: old,
    });
  }
  await submitCode(s.page, second.code);
  check('the new code completes sign-in', Boolean(s.callback()));
  await s.context.close();
}

async function unverifiedEmail(browser, happyIntroShape) {
  const user = await createUser('unverified', false);
  const s = await beginSignIn(browser, user.email);
  const intro = await s.page.innerText('#agentcity-email-code-sent');
  check(
    'unverified account sees the same page as a verified one (no enumeration)',
    intro === happyIntroShape(user.email),
    {
      text: intro,
    },
  );
  await sleep(3000);
  const count = (await messagesTo(user.email)).length;
  check('no email is sent to an unverified address', count === 0, { messages: count });
  await submitCode(s.page, '123456');
  const error = await fieldError(s.page);
  check('unverified account cannot sign in with a code', !s.callback() && error?.includes('not right'), { error });
  await s.context.close();
}

async function classicTheme(browser) {
  const realm = (await admin('GET', `/${REALM}`)).body;
  await admin('PUT', `/${REALM}`, { ...realm, loginTheme: 'keycloak' });
  const user = await createUser('classic', true);
  const s = await beginSignIn(browser, user.email);
  const { code } = await latestCode(user.email, 1);
  await submitCode(s.page, code);
  check('page also works with the classic "keycloak" login theme', Boolean(s.callback()));
  await s.context.close();
  await admin('PUT', `/${REALM}`, { ...realm, loginTheme: null });
}

// --- Main -------------------------------------------------------------------------------------------------------

const started = new Date();
let browser;
let callbackServer;
let realmSetup = null;
let fatal = null;
try {
  callbackServer = createServer((req, res) => res.end('signed in')).listen(CALLBACK_PORT, '127.0.0.1');
  await startKeycloak();
  await adminLogin();
  realmSetup = await setUpRealm();
  const provider = (await admin('GET', `/${REALM}/authentication/authenticator-providers`)).body.find(
    p => p.id === 'agentcity-email-code',
  );
  check('Keycloak loaded the agentcity-email-code provider', Boolean(provider), { provider });
  browser = await chromium.launch();
  const happyIntro = email => `We sent a 6-digit code to ${email[0]}***@example.test. It works for 1 minute.`;
  await happyPath(browser);
  await wrongCodeAndAttemptLimit(browser);
  await resendCooldown(browser);
  await unverifiedEmail(browser, happyIntro);
  await classicTheme(browser);
  await bruteForceLockout(browser);
  await expiry(browser);
} catch (error) {
  fatal = error.stack ?? String(error);
  console.error(error);
} finally {
  await browser?.close();
  callbackServer?.close();
  let logs = '';
  try {
    logs = docker('logs', '--tail', '400', CONTAINER);
  } catch {
    // container never started
  }
  const errors = logs.split('\n').filter(l => / ERROR /.test(l));
  if (!KEEP) {
    try {
      docker('rm', '-f', CONTAINER);
    } catch {
      // already gone
    }
  }
  const deleted = await deleteOwnMessages().catch(() => 0);
  const jarSha256 = existsSync(JAR) ? createHash('sha256').update(readFileSync(JAR)).digest('hex') : null;
  const allPassed = !fatal && checks.length > 0 && checks.every(c => c.passed);
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    EVIDENCE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        durationSeconds: Math.round((Date.now() - started.getTime()) / 1000),
        command: 'node infra/keycloak/email-code-authenticator/verify/verify-email-code.mjs',
        keycloakImage: IMAGE,
        container: { name: CONTAINER, port: PORT, network: NETWORK, removed: !KEEP },
        jar: { path: 'infra/keycloak/providers/agentcity-email-code-authenticator.jar', sha256: jarSha256 },
        realm: {
          name: REALM,
          ...realmSetup,
          ttlSeconds: TTL_SECONDS,
          cooldownSeconds: COOLDOWN_SECONDS,
          maxAttempts: MAX_ATTEMPTS,
        },
        mailpit: { api: MAILPIT, ownMessagesDeleted: deleted },
        browser: 'Playwright Chromium',
        checks,
        keycloakErrorLogLines: errors.slice(-20),
        fatal,
        allPassed,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`${allPassed ? 'ALL PASSED' : 'FAILED'}: ${checks.filter(c => c.passed).length}/${checks.length} checks`);
  console.log(`Evidence: ${EVIDENCE}`);
  process.exitCode = allPassed ? 0 : 1;
}
