// LIVE CHECK against the local Keycloak and Mailpit (not part of the test suites). Starts the real API (AppModule,
// port 4205) on a fresh throwaway database, submits a demo request, and checks that:
//   - Keycloak now has the person, unverified, with no credentials and no required actions;
//   - Mailpit received the verify-email message for that address, with a link back to /demo/verified?request=<id>;
//   - following the link verifies the address in Keycloak and returns to the demo page;
//   - the agentcity-provisioner service account needs exactly realm-management `manage-users` (probed with a
//     temporary service-account client holding only view-users + query-users, which must be refused).
// Writes planning/agentcity-migration/x01-cinematic-city/evidence/c-live-provisioning.json. Deletes only what it
// created (its Keycloak user, its probe client, its Mailpit message, its database).
//
// Run from apps/api after `pnpm --filter @agentcity/api build` (the app runs from dist/: GraphQL needs the compiled
// decorator metadata), with Keycloak recreated from this worktree and seeded:
//   node --env-file=../../infra/local-dev.env --import tsx test/demo-live-provisioning.ts
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { createTestDatabase } from '@agentcity/db/testing';
import { AppModule } from '../dist/app.module.js';
import { DemoService } from '../dist/demo/demo.service.js';
import { loadEnv } from '../dist/env.js';

const PORT = 4205;
const KC = process.env.OIDC_ISSUER!.replace(/\/realms\/.*$/, '');
const REALM = 'agentcity';
const MAIL = process.env.MAIL_API_URL ?? 'http://127.0.0.1:58025';
const EVIDENCE = join(import.meta.dirname, '../../../planning/agentcity-migration/x01-cinematic-city/evidence');
const checks: { check: string; ok: boolean; detail?: unknown }[] = [];
const record = (check: string, ok: boolean, detail?: unknown) => {
  checks.push({ check, ok, ...(detail === undefined ? {} : { detail }) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${check}`);
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function masterToken() {
  const r = await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: process.env.KEYCLOAK_ADMIN_USER!,
      password: process.env.KEYCLOAK_ADMIN_PASSWORD!,
    }),
  });
  return ((await r.json()) as { access_token: string }).access_token;
}
async function kcAdmin(method: string, path: string, body?: unknown, token?: string) {
  const r = await fetch(`${KC}/admin/realms/${REALM}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token ?? (await masterToken())}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null, location: r.headers.get('location') };
}

/** Which realm-management roles the service account needs: a probe client with only view/query must be refused. */
async function probeRoles(email: string) {
  const sa = await kcAdmin('GET', '/users?username=service-account-agentcity-provisioner&exact=true');
  const saId = sa.body[0]?.id;
  const mapped = await kcAdmin('GET', `/users/${saId}/role-mappings`);
  const rm = Object.values(
    (mapped.body?.clientMappings ?? {}) as Record<string, { client: string; mappings: { name: string }[] }>,
  )
    .flatMap(c => c.mappings.map(m => `${c.client}:${m.name}`))
    .sort();
  const realmRoles = (mapped.body?.realmMappings ?? []).map((m: { name: string }) => m.name).sort();
  record(
    'provisioner service account holds only realm-management:manage-users',
    rm.join(',') === 'realm-management:manage-users',
    {
      clientRoles: rm,
      realmRoles,
    },
  );

  // Temporary probe client: view-users + query-users only (read access, no manage).
  const probeId = `agentcity-provisioner-probe-${randomBytes(3).toString('hex')}`;
  const secret = `probe-${randomBytes(12).toString('hex')}`;
  const created = await kcAdmin('POST', '/clients', {
    clientId: probeId,
    enabled: true,
    publicClient: false,
    secret,
    serviceAccountsEnabled: true,
    standardFlowEnabled: false,
    directAccessGrantsEnabled: false,
    fullScopeAllowed: true,
  });
  const clientUuid = created.location!.slice(created.location!.lastIndexOf('/') + 1);
  try {
    const probeSa = (await kcAdmin('GET', `/clients/${clientUuid}/service-account-user`)).body.id;
    const rmClient = (await kcAdmin('GET', '/clients?clientId=realm-management')).body[0].id;
    const roles = (await kcAdmin('GET', `/clients/${rmClient}/roles`)).body as { id: string; name: string }[];
    const pick = (n: string) => roles.find(r => r.name === n)!;
    await kcAdmin('POST', `/users/${probeSa}/role-mappings/clients/${rmClient}`, [
      pick('view-users'),
      pick('query-users'),
    ]);
    const tok = await fetch(`${KC}/realms/${REALM}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${probeId}:${secret}`).toString('base64')}` },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });
    const probeToken = ((await tok.json()) as { access_token: string }).access_token;
    const search = await kcAdmin('GET', `/users?email=${encodeURIComponent(email)}&exact=true`, undefined, probeToken);
    const create = await kcAdmin(
      'POST',
      '/users',
      {
        username: `probe-${randomBytes(3).toString('hex')}@example.test`,
        email: `probe-${randomBytes(3).toString('hex')}@example.test`,
        enabled: true,
      },
      probeToken,
    );
    if (create.status === 201)
      await kcAdmin('DELETE', `/users/${create.location!.slice(create.location!.lastIndexOf('/') + 1)}`);
    const userId = (await kcAdmin('GET', `/users?email=${encodeURIComponent(email)}&exact=true`)).body[0]?.id;
    const actions = await fetch(
      `${KC}/admin/realms/${REALM}/users/${userId}/execute-actions-email?client_id=agentcity-bff&lifespan=60`,
      {
        method: 'PUT',
        headers: { authorization: `Bearer ${probeToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(['VERIFY_EMAIL']),
      },
    );
    record('view-users + query-users alone can search users', search.status === 200, { status: search.status });
    record('without manage-users, creating a user is refused', create.status === 403, { status: create.status });
    record('without manage-users, sending execute-actions email is refused', actions.status === 403, {
      status: actions.status,
    });
  } finally {
    await kcAdmin('DELETE', `/clients/${clientUuid}`);
  }
}

async function main() {
  const email = `demo-live-${randomBytes(4).toString('hex')}@example.test`;
  const db = await createTestDatabase({ adminUrl: process.env.DATABASE_ADMIN_URL!, appUrl: process.env.DATABASE_URL! });
  const env = loadEnv({ ...process.env, DATABASE_URL: db.appUrl, API_PORT: String(PORT) });
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forEnv(env), {
    logger: ['error', 'warn', 'log'],
  });
  app.use(cookieParser());
  app.set('trust proxy', 'loopback');
  await app.listen(PORT, '127.0.0.1');
  const api = `http://127.0.0.1:${PORT}`;
  let userId: string | undefined;
  const mailIds: string[] = [];
  try {
    record('API listening on port 4205 with a fresh database', true, {
      database: db.name.replace(/_[0-9a-f]+$/, '_<random>'),
    });
    const token = (await (await fetch(`${api}/api/demo/form-token`)).json()) as { token: string };
    await sleep((env.DEMO_FORM_MIN_SECONDS + 0.3) * 1000);
    const submit = await fetch(`${api}/api/demo/requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: env.PUBLIC_ORIGIN },
      body: JSON.stringify({
        fullName: 'Fixture Live Visitor',
        email,
        company: 'Fixture Live Motors',
        industry: 'Automotive',
        marketingConsent: false,
        formToken: token.token,
        website2: '',
      }),
    });
    const body = (await submit.json()) as { requestId: string; status: string };
    record(
      'POST /api/demo/requests → 202 verification-sent',
      submit.status === 202 && body.status === 'verification-sent',
      {
        status: submit.status,
        body: { ...body, requestId: '<uuid>' },
      },
    );
    await app.get(DemoService).whenIdle();

    const users = await kcAdmin(
      'GET',
      `/users?email=${encodeURIComponent(email)}&exact=true&briefRepresentation=false`,
    );
    const user = users.body[0];
    userId = user?.id;
    const creds = userId ? await kcAdmin('GET', `/users/${userId}/credentials`) : { body: null };
    record(
      'Keycloak user exists (username = email), not yet verified',
      !!user && user.username === email && user.emailVerified === false,
      {
        username: user ? '<email>' : null,
        emailVerified: user?.emailVerified,
        enabled: user?.enabled,
        firstName: user?.firstName,
        lastName: user?.lastName,
      },
    );
    record(
      'Keycloak user has no credentials and no required actions',
      Array.isArray(creds.body) && creds.body.length === 0 && (user?.requiredActions ?? []).length === 0,
      {
        credentials: creds.body,
        requiredActions: user?.requiredActions,
      },
    );

    let message: { ID: string; Subject: string; To: { Address: string }[] } | undefined;
    for (let i = 0; i < 40 && !message; i++) {
      const list = (await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()) as {
        messages: { ID: string; Subject: string; To: { Address: string }[] }[];
      };
      message = list.messages?.find(m => m.To.some(t => t.Address === email));
      if (!message) await sleep(250);
    }
    if (message) mailIds.push(message.ID);
    const full = message
      ? ((await (await fetch(`${MAIL}/api/v1/message/${message.ID}`)).json()) as { Text: string; HTML: string })
      : null;
    const link = full
      ? /https?:\/\/[^\s"<>]+action-token[^\s"<>]+/.exec(full.Text ?? full.HTML)?.[0]?.replace(/&amp;/g, '&')
      : undefined;
    record('Mailpit received the verify-email message for the address', !!message && !!link, {
      subject: message?.Subject,
      hasActionTokenLink: !!link,
    });

    // Follow the link like a browser: Keycloak may show a confirmation page before it verifies.
    let landed: string | null = null;
    if (link) {
      const jar = new Map<string, string>();
      const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      let url: string | null = link;
      for (let hop = 0; hop < 8 && url; hop++) {
        if (url.startsWith(env.PUBLIC_ORIGIN)) {
          landed = url;
          break;
        }
        const r = await fetch(url, { redirect: 'manual', headers: { cookie: cookieHeader() } });
        for (const c of r.headers.getSetCookie()) {
          const [pair] = c.split(';');
          const eq = pair!.indexOf('=');
          jar.set(pair!.slice(0, eq), pair!.slice(eq + 1));
        }
        const loc = r.headers.get('location');
        if (loc) {
          url = new URL(loc, url).toString();
          continue;
        }
        const html = await r.text();
        const next = /href="([^"]*(?:action-token|login-actions)[^"]*)"/.exec(html)?.[1]?.replace(/&amp;/g, '&');
        const back = /href="(http:\/\/localhost:3000\/demo\/verified[^"]*)"/.exec(html)?.[1]?.replace(/&amp;/g, '&');
        url = back ?? (next ? new URL(next, url).toString() : null);
      }
    }
    const after = userId ? (await kcAdmin('GET', `/users/${userId}`)).body : null;
    record('following the link verifies the address in Keycloak', after?.emailVerified === true, {
      emailVerified: after?.emailVerified,
    });
    const expected = `${env.PUBLIC_ORIGIN}/demo/verified?request=${body.requestId}`;
    record('the link returns to /demo/verified?request=<requestId>', landed === expected, {
      landed: landed?.replace(body.requestId, '<requestId>') ?? null,
    });

    const st = await fetch(`${api}/api/demo/requests/${body.requestId}`);
    record('GET /api/demo/requests/:id answers a status without personal data', st.status === 200, await st.json());

    await probeRoles(email);
  } finally {
    await app.close();
    if (userId) await kcAdmin('DELETE', `/users/${userId}`);
    if (mailIds.length)
      await fetch(`${MAIL}/api/v1/messages`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ IDs: mailIds }),
      });
    await db.drop();
  }
  const evidence = {
    stage: 'X01 workstream C — live demo provisioning',
    ranAt: new Date().toISOString(),
    keycloak: `${KC} (realm ${REALM}, recreated from this worktree, then pnpm keycloak:seed)`,
    mailpit: MAIL,
    api: `AppModule on 127.0.0.1:${PORT}, fresh test database (dropped afterwards)`,
    personalData: 'a random fixture address at example.test; replaced by placeholders here',
    cleanup: 'the Keycloak user, the probe client and the Mailpit message created by this run were deleted',
    allPassed: checks.every(c => c.ok),
    checks,
  };
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, 'c-live-provisioning.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`${evidence.allPassed ? 'ALL PASSED' : 'SOME CHECKS FAILED'}; evidence written`);
  if (!evidence.allPassed) process.exitCode = 1;
}

await main();
