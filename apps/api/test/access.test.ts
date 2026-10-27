import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { createTestDatabase } from '@agentcity/db/testing';
import pg from 'pg';
import { loadEnv } from '../src/env.ts';
import { RevocationBus, type Revocation } from '../src/platform/revocation-bus.ts';
import {
  ACCESS_SUBJECTS as S,
  emailOf,
  seedAccess,
  seedSession,
  sha256,
} from '../../../packages/db/test/access-fixture.ts';
import { CapturingLogger, TEST_SESSION_HEADER, startAccessApp } from './access-harness.ts';

/**
 * The access endpoints over real HTTP: the access module with the real pool (app role, throwaway database), the real
 * RevocationBus on the local Redis, and test-only stand-ins for the auth module's session and step-up guards.
 * Needs `pnpm infra:up` (PostgreSQL and Redis).
 */
const LOCAL_ENV = join(import.meta.dirname, '../../../infra/local-dev.env');
// `pnpm --filter @agentcity/api test` runs without --env-file; use the committed local-only settings then.
if (!process.env.DATABASE_ADMIN_URL && existsSync(LOCAL_ENV)) process.loadEnvFile(LOCAL_ENV);
const adminUrl = process.env.DATABASE_ADMIN_URL;
const appUrl = process.env.DATABASE_URL;

describe('access API', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let f: Awaited<ReturnType<typeof seedAccess>>;
  let admin: pg.Client;
  let app: INestApplication;
  let base: string;
  const logger = new CapturingLogger();
  const output: string[] = [];
  const events: Revocation[] = [];
  let unsubscribe: (() => void) | undefined;
  const writes = { out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr) };
  /** Every token the API handed out in this run: none may ever appear in logs or console output. */
  const issuedTokens: string[] = [];
  const sid: Record<string, string> = {};

  const call = async (method: string, path: string, session?: string, body?: unknown) => {
    const headers: Record<string, string> = {};
    if (session) headers[TEST_SESSION_HEADER] = session;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const r = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null, headers: r.headers };
  };
  const tokenOf = (link: string) => {
    const m = /#token=([A-Za-z0-9_-]{43})$/.exec(link);
    assert.ok(m, `token in the link fragment: ${link.replace(/#.*/, '#…')}`);
    issuedTokens.push(m[1]!);
    return m[1]!;
  };
  const sessionTenant = async (id: string) =>
    (await admin.query('SELECT tenant_id, workspace_id FROM identity.session WHERE id = $1', [id])).rows[0];
  const waitForEvent = async (match: (r: Revocation) => boolean) => {
    for (let i = 0; i < 40; i++) {
      const e = events.find(match);
      if (e) return e;
      await new Promise(r => setTimeout(r, 50));
    }
    return undefined;
  };

  before(async () => {
    assert.ok(adminUrl && appUrl, 'DATABASE_ADMIN_URL and DATABASE_URL must be set (see infra/local-dev.env)');
    db = await createTestDatabase({ adminUrl, appUrl });
    f = await seedAccess(db.adminUrl);
    admin = new pg.Client({ connectionString: db.adminUrl });
    await admin.connect();
    for (const subject of [S.alice, S.owner, S.viewerA, S.carolFloor1, S.dave, S.staffB, S.bob, S.stranger]) {
      sid[subject] = await seedSession(admin, subject);
    }
    sid.aliceNoStepUp = await seedSession(admin, S.alice, { stepUp: false });
    sid.unverified = await seedSession(admin, 'fixture:unverified', { emailVerified: false });
    // Capture everything the process prints from here on (and still print it).
    process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
      output.push(String(chunk));
      return (writes.out as (...a: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
      output.push(String(chunk));
      return (writes.err as (...a: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof process.stderr.write;
    const env = loadEnv({ ...process.env, NODE_ENV: 'test', DATABASE_URL: db.appUrl });
    const started = await startAccessApp(env, logger);
    app = started.app;
    base = started.baseUrl;
    unsubscribe = await app.get(RevocationBus).subscribe(r => events.push(r));
  });
  after(async () => {
    process.stdout.write = writes.out;
    process.stderr.write = writes.err;
    unsubscribe?.();
    await app?.close();
    await admin?.end();
    await db?.drop();
  });

  it('GET /api/access/memberships lists the tenants and workspaces the person can enter', async () => {
    assert.equal((await call('GET', '/api/access/memberships')).status, 401);
    const alice = await call('GET', '/api/access/memberships', sid[S.alice]);
    assert.equal(alice.status, 200);
    assert.deepEqual(alice.body.current, { tenantId: null, workspaceId: null });
    assert.deepEqual(
      alice.body.memberships.map((m: { tenantId: string; role: string }) => [m.tenantId, m.role]),
      [[f.t.A, 'client-admin']],
    );
    const owner = await call('GET', '/api/access/memberships', sid[S.owner]);
    assert.equal(owner.body.memberships.length, 5);
    const floor = await call('GET', '/api/access/memberships', sid[S.carolFloor1]);
    assert.deepEqual(
      floor.body.memberships[0].workspaces.map((w: { id: string }) => w.id),
      [f.ws.C1],
    );
    assert.equal(floor.body.memberships[0].workspaceId, f.ws.C1);
    assert.deepEqual((await call('GET', '/api/access/memberships', sid[S.stranger])).body.memberships, []);
  });

  it('POST /api/session/tenant switches only into a tenant the person can enter, and persists it', async () => {
    const ok = await call('POST', '/api/session/tenant', sid[S.alice], { tenantId: f.t.A });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { tenantId: f.t.A, workspaceId: null, role: 'client-admin' });
    assert.deepEqual(await sessionTenant(sid[S.alice]!), { tenant_id: f.t.A, workspace_id: null });
    // The next request sees it on req.session.
    assert.equal((await call('GET', '/api/access/memberships', sid[S.alice])).body.current.tenantId, f.t.A);
    const refused = await call('POST', '/api/session/tenant', sid[S.alice], { tenantId: f.t.B });
    assert.equal(refused.status, 403);
    assert.deepEqual(refused.body, { error: 'forbidden' });
    assert.equal(
      (await call('POST', '/api/session/tenant', sid[S.alice], { tenantId: f.t.A, workspaceId: f.ws.B })).status,
      403,
    );
    assert.equal((await call('POST', '/api/session/tenant', sid[S.alice], { tenantId: randomUUID() })).status, 403);
    assert.equal((await call('POST', '/api/session/tenant', sid[S.alice], { tenantId: 'nope' })).status, 400);
    assert.deepEqual(await sessionTenant(sid[S.alice]!), { tenant_id: f.t.A, workspace_id: null }, 'unchanged');
    // A workspace-limited member gets its workspace when none is named.
    const floor = await call('POST', '/api/session/tenant', sid[S.carolFloor1], { tenantId: f.t.C });
    assert.equal(floor.status, 200);
    assert.deepEqual(await sessionTenant(sid[S.carolFloor1]!), { tenant_id: f.t.C, workspace_id: f.ws.C1 });
    for (const [s, t] of [
      [S.owner, f.t.B],
      [S.viewerA, f.t.A],
      [S.bob, f.t.B],
    ] as const) {
      assert.equal((await call('POST', '/api/session/tenant', sid[s], { tenantId: t })).status, 200, s);
    }
  });

  it('POST /api/invitations: needs a tenant, step-up and authority; returns the link once and never logs it', async () => {
    const body = { email: 'Dave@Example.test', role: 'client-viewer' };
    assert.deepEqual((await call('POST', '/api/invitations', sid[S.dave], body)).body, { error: 'no_tenant_selected' });
    await admin.query('UPDATE identity.session SET tenant_id = $1 WHERE id = $2', [f.t.A, sid.aliceNoStepUp]);
    const noStepUp = await call('POST', '/api/invitations', sid.aliceNoStepUp, body);
    assert.equal(noStepUp.status, 403);
    assert.deepEqual(noStepUp.body, { error: 'step_up_required', reason: 'permission' });
    assert.equal((await call('POST', '/api/invitations', sid[S.viewerA], body)).status, 403, 'viewer');
    assert.equal(
      (await call('POST', '/api/invitations', sid[S.alice], { ...body, role: 'agency-owner' })).status,
      403,
      'escalation',
    );
    assert.equal((await call('POST', '/api/invitations', sid[S.alice], { ...body, role: 'root' })).status, 400);
    assert.equal((await call('POST', '/api/invitations', sid[S.alice], { email: 'x' })).status, 400);

    const created = await call('POST', '/api/invitations', sid[S.alice], body);
    assert.equal(created.status, 201);
    assert.equal(created.headers.get('cache-control'), 'no-store');
    assert.equal(created.body.tenantId, f.t.A);
    assert.equal(created.body.role, 'client-viewer');
    assert.ok(created.body.link.startsWith(`${process.env.PUBLIC_ORIGIN}/invitations/accept#token=`));
    const hours = (Date.parse(created.body.expiresAt) - Date.now()) / 3_600_000;
    assert.ok(hours > 47.9 && hours <= 48, `default lifetime 48 h (${hours})`);
    const token = tokenOf(created.body.link);
    // Only the hash is stored; the outbox event and the audit row carry no token material.
    const stored = await admin.query('SELECT token_sha256 FROM identity.invitation_token WHERE invitation_id = $1', [
      created.body.invitationId,
    ]);
    assert.deepEqual(stored.rows, [{ token_sha256: sha256(token) }]);
    const dump = JSON.stringify(
      (await admin.query(`SELECT payload FROM app.outbox_event WHERE topic = 'invitation.created'`)).rows,
    );
    assert.ok(dump.includes(created.body.invitationId) && !dump.includes(token) && !dump.includes(sha256(token)));
    // Nothing else returns it: listing memberships does not, and creating again gives a different link.
    assert.ok(!JSON.stringify((await call('GET', '/api/access/memberships', sid[S.alice])).body).includes(token));
    const again = await call('POST', '/api/invitations', sid[S.alice], body);
    assert.notEqual(tokenOf(again.body.link), token);
    // The first link was replaced by the second.
    assert.deepEqual((await call('POST', '/api/invitations/accept', sid[S.dave], { token })).body, {
      error: 'invitation_used',
    });
  });

  it('POST /api/invitations/accept: verified matching email only; replayed and expired links answer 410', async () => {
    const inv = await call('POST', '/api/invitations', sid[S.alice], { email: emailOf(S.dave), role: 'client-viewer' });
    const token = tokenOf(inv.body.link);
    assert.equal((await call('POST', '/api/invitations/accept', undefined, { token })).status, 401);
    assert.equal((await call('POST', '/api/invitations/accept', sid[S.dave], { token: 'short' })).status, 400);
    const mismatch = await call('POST', '/api/invitations/accept', sid[S.stranger], { token });
    assert.deepEqual([mismatch.status, mismatch.body], [403, { error: 'invitation_email_mismatch' }]);
    const unverified = await call('POST', '/api/invitations/accept', sid.unverified, { token });
    assert.deepEqual([unverified.status, unverified.body], [403, { error: 'email_not_verified' }]);
    const ok = await call('POST', '/api/invitations/accept', sid[S.dave], { token });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { tenantId: f.t.A, workspaceId: null, role: 'client-viewer' });
    assert.equal((await call('POST', '/api/session/tenant', sid[S.dave], { tenantId: f.t.A })).status, 200);
    const replay = await call('POST', '/api/invitations/accept', sid[S.dave], { token });
    assert.deepEqual([replay.status, replay.body], [410, { error: 'invitation_used' }]);
    const unknown = await call('POST', '/api/invitations/accept', sid[S.dave], { token: 'A'.repeat(43) });
    assert.deepEqual([unknown.status, unknown.body], [410, { error: 'invitation_invalid' }]);
    // Expired.
    const late = await call('POST', '/api/invitations', sid[S.alice], {
      email: 'late@example.test',
      role: 'client-viewer',
    });
    const lateToken = tokenOf(late.body.link);
    await admin.query(
      `UPDATE identity.invitation_token SET created_at = now() - interval '3 days', expires_at = now() - interval '1 day' WHERE token_sha256 = $1`,
      [sha256(lateToken)],
    );
    const lateSession = await seedSession(admin, 'fixture:late');
    const expired = await call('POST', '/api/invitations/accept', lateSession, { token: lateToken });
    assert.deepEqual([expired.status, expired.body], [410, { error: 'invitation_expired' }]);
  });

  it('POST /api/invitations/:id/token: agency owners only, for existing pending invitations', async () => {
    const legacy = randomUUID();
    await admin.query(
      `INSERT INTO app.invitation (tenant_id, id, email, role) VALUES ($1, $2, 'imported@example.test', 'client-viewer')`,
      [f.t.B, legacy],
    );
    assert.equal((await call('POST', `/api/invitations/${legacy}/token`, sid[S.bob])).status, 403, 'client admin');
    assert.equal((await call('POST', `/api/invitations/${randomUUID()}/token`, sid[S.owner])).status, 404);
    assert.equal((await call('POST', '/api/invitations/not-a-uuid/token', sid[S.owner])).status, 400);
    const issued = await call('POST', `/api/invitations/${legacy}/token`, sid[S.owner]);
    assert.equal(issued.status, 201);
    assert.equal(issued.headers.get('cache-control'), 'no-store');
    const token = tokenOf(issued.body.link);
    const s = await seedSession(admin, 'fixture:imported', { email: 'imported@example.test' });
    assert.equal((await call('POST', '/api/invitations/accept', s, { token })).status, 200);
    const done = await call('POST', `/api/invitations/${legacy}/token`, sid[S.owner]);
    assert.deepEqual([done.status, done.body], [409, { error: 'invitation_not_pending' }]);
  });

  it('PUT /api/tenants/:tenantId/members/:subject changes roles and publishes a membership revocation', async () => {
    const path = `/api/tenants/${f.t.A}/members/${encodeURIComponent(S.viewerA)}`;
    assert.equal((await call('PUT', path, sid.aliceNoStepUp, { role: 'client-admin' })).body.error, 'step_up_required');
    assert.equal((await call('PUT', path, sid[S.viewerA], { role: 'client-admin' })).status, 403);
    assert.equal((await call('PUT', path, sid[S.alice], { role: 'agency-owner' })).status, 403, 'escalation');
    assert.equal((await call('PUT', path, sid[S.alice], { role: 'boss' })).status, 400);
    assert.equal(
      (
        await call('PUT', `/api/tenants/${f.t.A}/members/${encodeURIComponent('fixture:nobody')}`, sid[S.alice], {
          role: 'client-viewer',
        })
      ).status,
      404,
    );
    const r = await call('PUT', path, sid[S.alice], { role: 'client-admin' });
    assert.equal(r.status, 200);
    assert.equal(r.body.previousRole, 'client-viewer');
    assert.ok(
      await waitForEvent(
        e => e.kind === 'membership' && e.subject === S.viewerA && e.tenantId === f.t.A && e.reason === 'role-changed',
      ),
      'revocation event on the bus',
    );
    // The person's session no longer points at the tenant; switching again shows the new role at once.
    assert.equal((await sessionTenant(sid[S.viewerA]!)).tenant_id, null);
    assert.equal(
      (await call('POST', '/api/session/tenant', sid[S.viewerA], { tenantId: f.t.A })).body.role,
      'client-admin',
    );
    assert.equal((await call('PUT', path, sid[S.alice], { role: 'client-viewer' })).status, 200);
    // The last tenant-wide client admin cannot be demoted.
    const self = await call('PUT', `/api/tenants/${f.t.A}/members/${encodeURIComponent(S.alice)}`, sid[S.alice], {
      role: 'client-viewer',
    });
    assert.deepEqual([self.status, self.body], [409, { error: 'last_admin' }]);
  });

  it('DELETE /api/tenants/:tenantId/members/:subject removes access, publishes a revocation; re-invitation restores', async () => {
    const path = `/api/tenants/${f.t.A}/members/${encodeURIComponent(S.viewerA)}`;
    await call('POST', '/api/session/tenant', sid[S.viewerA], { tenantId: f.t.A });
    assert.equal((await call('DELETE', path, sid.aliceNoStepUp)).body.error, 'step_up_required');
    assert.equal((await call('DELETE', path, sid[S.dave])).status, 403, 'viewer');
    assert.equal((await call('DELETE', path, sid[S.bob])).status, 403, 'other tenant’s admin');
    const r = await call('DELETE', path, sid[S.alice]);
    assert.deepEqual([r.status, r.body], [200, { tenantId: f.t.A, subject: S.viewerA, removedRole: 'client-viewer' }]);
    assert.ok(
      await waitForEvent(
        e =>
          e.kind === 'membership' && e.subject === S.viewerA && e.tenantId === f.t.A && e.reason === 'member-removed',
      ),
    );
    assert.equal((await sessionTenant(sid[S.viewerA]!)).tenant_id, null);
    assert.equal((await call('POST', '/api/session/tenant', sid[S.viewerA], { tenantId: f.t.A })).status, 403);
    assert.equal((await call('DELETE', path, sid[S.alice])).status, 404, 'already removed');
    assert.equal(
      (await call('DELETE', `/api/tenants/${f.t.A}/members/${encodeURIComponent(S.alice)}`, sid[S.owner])).status,
      409,
      'last admin',
    );
    const inv = await call('POST', '/api/invitations', sid[S.alice], {
      email: emailOf(S.viewerA),
      role: 'client-viewer',
    });
    assert.equal(
      (await call('POST', '/api/invitations/accept', sid[S.viewerA], { token: tokenOf(inv.body.link) })).status,
      200,
    );
    assert.equal((await call('POST', '/api/session/tenant', sid[S.viewerA], { tenantId: f.t.A })).status, 200);
  });

  it('PUT/DELETE /api/agency/assignments/:tenantId/:subject: owners assign staff; unassigning revokes', async () => {
    const path = `/api/agency/assignments/${f.t.B}/${encodeURIComponent(S.staffB)}`;
    assert.equal((await call('POST', '/api/session/tenant', sid[S.staffB], { tenantId: f.t.B })).status, 403);
    assert.equal((await call('PUT', path, sid[S.bob])).status, 403, 'client admin');
    assert.equal((await call('PUT', path, sid[S.staffB])).status, 403, 'staff');
    assert.equal(
      (await call('PUT', `/api/agency/assignments/${f.t.B}/${encodeURIComponent(S.bob)}`, sid[S.owner])).status,
      404,
    );
    const put = await call('PUT', path, sid[S.owner]);
    assert.deepEqual([put.status, put.body.changed], [200, true]);
    assert.equal((await call('PUT', path, sid[S.owner])).body.changed, false, 'idempotent');
    assert.equal(
      (await call('POST', '/api/session/tenant', sid[S.staffB], { tenantId: f.t.B })).body.role,
      'agency-staff',
    );
    const del = await call('DELETE', path, sid[S.owner]);
    assert.equal(del.status, 200);
    assert.ok(
      await waitForEvent(
        e =>
          e.kind === 'membership' && e.subject === S.staffB && e.tenantId === f.t.B && e.reason === 'staff-unassigned',
      ),
    );
    assert.equal((await sessionTenant(sid[S.staffB]!)).tenant_id, null);
    assert.equal((await call('POST', '/api/session/tenant', sid[S.staffB], { tenantId: f.t.B })).status, 403);
    assert.equal((await call('DELETE', path, sid[S.owner])).status, 404);
  });

  it('never wrote an invitation token to the logs or console', () => {
    assert.ok(issuedTokens.length >= 6);
    const everything = logger.lines.join('\n') + output.join('');
    for (const t of issuedTokens) {
      assert.ok(!everything.includes(t), 'token in output');
      assert.ok(!everything.includes(sha256(t)), 'token hash in output');
    }
  });
});
