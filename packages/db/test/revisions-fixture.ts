// SYNTHETIC TEST FIXTURE — not real people, clients or data. Builds on the tenancy fixture.
import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { CanonicalJson } from '../src/revision-hash.ts';

export { SUBJECTS, seedTenancy } from './tenancy-fixture.ts';

type Db = pg.ClientBase;

export const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export interface AssetRow {
  tenant_id: string;
  workspace_id: string;
  id: string;
  content_sha256: string;
  media_type: string;
  size_bytes: string;
}

/** A stored file version under the tenant/workspace object prefix. */
export async function addAsset(
  c: Db,
  tenant: string,
  ws: string,
  opts: { content?: string; mediaType?: string; objectTenant?: string } = {},
): Promise<AssetRow> {
  const id = randomUUID();
  const content = opts.content ?? `Fixture file ${id}`;
  const key = `tenants/${opts.objectTenant ?? tenant}/workspaces/${ws}/assets/${id}`;
  const r = await c.query<AssetRow>(
    `INSERT INTO app.asset_version (tenant_id, workspace_id, id, asset_id, version, object_key, content_sha256, size_bytes, media_type, created_by)
     VALUES ($1, $2, $3, gen_random_uuid(), 1, $4, $5, $6, $7, 'fixture')
     RETURNING tenant_id, workspace_id, id, content_sha256, media_type, size_bytes`,
    [tenant, ws, id, key, sha(content), Buffer.byteLength(content), opts.mediaType ?? 'application/pdf'],
  );
  return r.rows[0]!;
}

export interface RevisionRow {
  tenant_id: string;
  workspace_id: string;
  id: string;
  draft_id: string;
  previous_revision_id: string | null;
  revision_number: number;
  contact_id: string | null;
  channel: string;
  recipient: string | null;
  subject: string | null;
  body: string;
  policy_context: { [key: string]: CanonicalJson };
  revision_sha256: string;
}

export interface RevisionInput {
  tenant: string;
  ws: string;
  contact?: string | null;
  previous?: string | null;
  draftId?: string | null;
  channel?: string;
  recipient?: string | null;
  subject?: string | null;
  body?: string;
  policy?: { [key: string]: CanonicalJson };
  /** Asset version ids, in order. Added in the same transaction as the revision. */
  attachments?: string[];
  /** Ignored by the database; sent to prove it. */
  revisionNumber?: number;
}

export const POLICY = {
  policy_version: 'fixture-policy-1',
  sender_identity: 'fixture-sender',
  quiet_hours_policy: 'qh-1',
};

/** Inserts a revision (and its attachments) on `c`, which must already be inside a transaction. */
export async function addRevision(c: Db, r: RevisionInput): Promise<RevisionRow> {
  const id = randomUUID();
  await c.query(
    `INSERT INTO app.draft_revision (tenant_id, workspace_id, id, draft_id, previous_revision_id, revision_number, contact_id,
       channel, recipient, subject, body, body_sha256, policy_context, revision_sha256, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'caller', $12, 'caller', 'fixture')`,
    [
      r.tenant,
      r.ws,
      id,
      r.draftId ?? null,
      r.previous ?? null,
      r.revisionNumber ?? 99,
      r.contact ?? null,
      r.channel ?? 'email',
      r.recipient === undefined ? 'fixture.contact@example.test' : r.recipient,
      r.subject === undefined ? 'Fixture subject' : r.subject,
      r.body ?? 'Fixture body',
      JSON.stringify(r.policy ?? POLICY),
    ],
  );
  for (const [position, asset] of (r.attachments ?? []).entries()) {
    await c.query(
      `INSERT INTO app.draft_revision_attachment (tenant_id, workspace_id, draft_revision_id, position, asset_version_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [r.tenant, r.ws, id, position, asset],
    );
  }
  return (
    await c.query<RevisionRow>('SELECT * FROM app.draft_revision WHERE tenant_id = $1 AND id = $2', [r.tenant, id])
  ).rows[0]!;
}

export async function requestApproval(
  c: Db,
  rev: { tenant_id: string; workspace_id: string; id: string },
  opts: { status?: 'pending' | 'approved'; expiresIn?: string; decidedBy?: string } = {},
) {
  const id = randomUUID();
  const status = opts.status ?? 'pending';
  await c.query(
    `INSERT INTO app.approval (tenant_id, workspace_id, id, draft_revision_id, status, expires_at, decided_by, decided_at, revision_sha256)
     VALUES ($1, $2, $3, $4, $5, now() + $6::interval, $7, $8, $9)`,
    [
      rev.tenant_id,
      rev.workspace_id,
      id,
      rev.id,
      status,
      opts.expiresIn ?? '1 day',
      opts.decidedBy ?? null,
      status === 'pending' ? null : new Date(),
      '0'.repeat(64),
    ],
  );
  return id;
}

export const approve = (c: Db, tenant: string, approval: string, decidedBy = 'fixture:someone-else') =>
  c.query(`UPDATE app.approval SET status = 'approved', decided_by = $3 WHERE tenant_id = $1 AND id = $2`, [
    tenant,
    approval,
    decidedBy,
  ]);

export async function dispatch(
  c: Db,
  rev: { tenant_id: string; workspace_id: string; id: string; recipient?: string | null },
  approval: string,
  recipient?: string,
) {
  const id = randomUUID();
  await c.query(
    `INSERT INTO app.dispatch_attempt (tenant_id, workspace_id, id, approval_id, draft_revision_id, connector, recipient, payload_sha256, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, 'fixture-connector', $6, $7, $8)`,
    [
      rev.tenant_id,
      rev.workspace_id,
      id,
      approval,
      rev.id,
      recipient ?? rev.recipient ?? 'fixture.contact@example.test',
      sha(id),
      `fixture-${id}`,
    ],
  );
  return id;
}
