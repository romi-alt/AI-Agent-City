import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { MIGRATIONS_DIR, migrate, withScope, type Scope } from '../src/index.ts';
import { canonicalJson, revisionHash, type CanonicalJson, type RevisionContent } from '../src/revision-hash.ts';
import { createTestDatabase } from '../src/testing.ts';
import {
  POLICY,
  SUBJECTS,
  addAsset,
  addRevision,
  approve,
  dispatch,
  requestApproval,
  seedTenancy,
  type AssetRow,
  type RevisionRow,
} from './revisions-fixture.ts';

/**
 * Immutable draft revisions, the canonical revision hash, approvals bound to (revision, hash) and the dispatch
 * gate (audit C04, C05, C07, C09, C13). Real app role through withScope, on a freshly migrated database.
 */
const adminUrl = process.env.DATABASE_ADMIN_URL;
const appUrl = process.env.DATABASE_URL;

/** Matches a pg error by SQLSTATE (see REVISIONS.md for the RV codes). */
const code = (expected: string, message?: RegExp) => (e: unknown) => {
  const err = e as { code?: string; message?: string };
  assert.equal(err.code, expected, `expected ${expected}, got ${err.code}: ${err.message}`);
  if (message) assert.match(err.message ?? '', message);
  return true;
};

const asContent = (r: RevisionRow, attachments: AssetRow[] = []): RevisionContent => ({
  channel: r.channel,
  recipient: r.recipient,
  subject: r.subject,
  body: r.body,
  policyContext: r.policy_context,
  attachments: attachments.map(a => ({
    assetVersionId: a.id,
    contentSha256: a.content_sha256,
    mediaType: a.media_type,
    sizeBytes: a.size_bytes,
  })),
});

describe('draft revisions, approvals and the dispatch gate', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let f: Awaited<ReturnType<typeof seedTenancy>>;
  let pool: pg.Pool;
  let admin: pg.Client;

  const A = (): Scope => ({ subject: SUBJECTS.alice, tenantId: f.t.A });
  const asA = <T>(fn: (c: pg.PoolClient) => Promise<T>) => withScope(pool, A(), fn);
  const inA = (extra: Partial<Parameters<typeof addRevision>[1]> = {}) => ({
    tenant: f.t.A,
    ws: f.ws.A,
    contact: f.contacts.A,
    ...extra,
  });
  const approvalRow = async (id: string) =>
    (await admin.query('SELECT * FROM app.approval WHERE id = $1', [id])).rows[0];
  /** SQL hash of loose content, through the function the triggers use (callable by the app role, no scope needed). */
  const sqlHash = async (c: RevisionContent) =>
    (
      await pool.query(`SELECT app.revision_sha256($1, $2, $3, $4, $5, $6) AS h`, [
        c.channel,
        c.recipient,
        c.subject,
        c.body,
        JSON.stringify(
          c.attachments.map(a => ({
            asset_version_id: a.assetVersionId,
            content_sha256: a.contentSha256,
            media_type: a.mediaType,
            size_bytes: Number(a.sizeBytes),
          })),
        ),
        JSON.stringify(c.policyContext),
      ])
    ).rows[0].h as string;

  before(async () => {
    assert.ok(adminUrl && appUrl, 'DATABASE_ADMIN_URL and DATABASE_URL must be set (see infra/local-dev.env)');
    db = await createTestDatabase({ adminUrl, appUrl });
    f = await seedTenancy(db.adminUrl);
    pool = new pg.Pool({ connectionString: db.appUrl, max: 2 });
    admin = new pg.Client({ connectionString: db.adminUrl });
    await admin.connect();
  });
  after(async () => {
    await pool?.end();
    await admin?.end();
    await db?.drop();
  });

  it('hash covers every field and attachment order; identical inputs give identical hashes (TS = SQL)', async () => {
    const att = (n: number) => ({
      assetVersionId: `00000000-0000-4000-8000-00000000000${n}`,
      contentSha256: String(n).repeat(64),
      mediaType: 'application/pdf',
      sizeBytes: 1000 + n,
    });
    const base: RevisionContent = {
      channel: 'email',
      recipient: 'lead@example.test',
      subject: 'Hello',
      body: 'Body',
      attachments: [att(1), att(2)],
      policyContext: { policy_version: 'p1', sender_identity: 's1', consent_policy: 'c1' },
    };
    const variants: Record<string, RevisionContent> = {
      channel: { ...base, channel: 'text' },
      recipient: { ...base, recipient: 'other@example.test' },
      'recipient null': { ...base, recipient: null },
      'recipient empty': { ...base, recipient: '' },
      subject: { ...base, subject: 'Hello!' },
      'subject null': { ...base, subject: null },
      body: { ...base, body: 'Body ' },
      'attachment order': { ...base, attachments: [att(2), att(1)] },
      'attachment removed': { ...base, attachments: [att(1)] },
      'attachment version': { ...base, attachments: [{ ...att(1), assetVersionId: att(3).assetVersionId }, att(2)] },
      'attachment content': { ...base, attachments: [{ ...att(1), contentSha256: 'f'.repeat(64) }, att(2)] },
      'attachment media type': { ...base, attachments: [{ ...att(1), mediaType: 'image/png' }, att(2)] },
      'attachment size': { ...base, attachments: [{ ...att(1), sizeBytes: 1 }, att(2)] },
      'policy value': { ...base, policyContext: { ...base.policyContext, policy_version: 'p2' } },
      'policy key added': { ...base, policyContext: { ...base.policyContext, quiet_hours_policy: 'q1' } },
      'policy empty': { ...base, policyContext: {} },
    };
    const baseHash = revisionHash(base);
    assert.match(baseHash, /^[0-9a-f]{64}$/);
    assert.equal(await sqlHash(base), baseHash, 'TS and SQL agree on the base content');
    // Same content built separately (different key order in the policy object) hashes the same.
    const again = { ...base, policyContext: { consent_policy: 'c1', sender_identity: 's1', policy_version: 'p1' } };
    assert.equal(revisionHash(again), baseHash);
    assert.equal(await sqlHash(again), baseHash);
    const seen = new Map<string, string>([[baseHash, 'base']]);
    for (const [name, content] of Object.entries(variants)) {
      const h = revisionHash(content);
      assert.equal(await sqlHash(content), h, `TS and SQL agree: ${name}`);
      assert.ok(!seen.has(h), `${name} changes the hash (collides with ${seen.get(h)})`);
      seen.set(h, name);
    }
  });

  it('serializes awkward content identically in TS and SQL', async () => {
    const policy: { [key: string]: CanonicalJson } = {
      z: 1,
      Z: -9007199254740991,
      é: 'accent',
      '😀': ['emoji', true, false, null, { b: 2, a: [] }],
      a: { nested: { 'quote"': 'back\\slash', '\n': 'newline key' } },
      '': 'empty key',
      big: 9007199254740991,
    };
    const content: RevisionContent = {
      channel: 'email',
      recipient: 'Ünïcode <lead@example.test>',
      subject: 'Tabs\tand\r\nlines \u0001\u001f\u007f   / </script>',
      body: 'Emoji 😀, CJK 漢字, combining é vs é, quote " and backslash \\',
      attachments: [],
      policyContext: policy,
    };
    assert.equal(await sqlHash(content), revisionHash(content));
    const sqlCanonical = (
      await pool.query(`SELECT app.canonical_json($1::jsonb) AS t`, [JSON.stringify({ policy, s: content.subject })])
    ).rows[0].t;
    assert.equal(sqlCanonical, canonicalJson({ policy, s: content.subject }));
    // Numbers: 1.0 and 1e2 in jsonb are the integers 1 and 100; fractions and unsafe integers are refused by both.
    assert.equal(
      (await pool.query(`SELECT app.canonical_json('{"n": 1.0, "e": 1e2}') AS t`)).rows[0].t,
      '{"e":100,"n":1}',
    );
    assert.equal(canonicalJson({ n: 1.0, e: 1e2 }), '{"e":100,"n":1}');
    await assert.rejects(pool.query(`SELECT app.canonical_json('{"n": 1.5}')`), code('22023'));
    await assert.rejects(pool.query(`SELECT app.canonical_json('9007199254740992')`), code('22023'));
    assert.throws(() => canonicalJson({ n: 1.5 }), RangeError);
    assert.throws(() => canonicalJson(9007199254740992), RangeError);
  });

  it('stores the canonical hash of a revision with attachments, and chains revisions of a draft', async () => {
    const { r1, r2, assets } = await asA(async c => {
      const assets = [await addAsset(c, f.t.A, f.ws.A), await addAsset(c, f.t.A, f.ws.A, { mediaType: 'image/png' })];
      const r1 = await addRevision(c, inA({ attachments: assets.map(a => a.id) }));
      const r2 = await addRevision(c, inA({ previous: r1.id, body: 'Edited body', attachments: [assets[1]!.id] }));
      return { r1, r2, assets };
    });
    assert.equal(r1.revision_sha256, revisionHash(asContent(r1, assets)), 'TS recomputes the stored hash');
    assert.equal(r2.revision_sha256, revisionHash(asContent(r2, [assets[1]!])));
    assert.notEqual(r1.revision_sha256, revisionHash(asContent(r1)), 'the stored hash includes the attachments');
    // The database numbers revisions and groups them, whatever the caller sent (revision_number 99).
    assert.deepEqual([r1.draft_id, r1.revision_number, r1.previous_revision_id], [r1.id, 1, null]);
    assert.deepEqual([r2.draft_id, r2.revision_number, r2.previous_revision_id], [r1.id, 2, r1.id]);
    // Identical content in another draft gives the identical hash.
    const twin = await asA(c => addRevision(c, inA({ attachments: assets.map(a => a.id) })));
    assert.equal(twin.revision_sha256, r1.revision_sha256);
    assert.notEqual(twin.draft_id, r1.draft_id);
    // A caller-chosen draft id is kept for a first revision.
    const draftId = randomUUID();
    assert.equal((await asA(c => addRevision(c, inA({ draftId })))).draft_id, draftId);
  });

  it('an edit creates a new revision and supersedes earlier pending and approved approvals', async () => {
    const r1 = await asA(c => addRevision(c, inA()));
    const approved = await asA(async c => {
      const id = await requestApproval(c, r1);
      await approve(c, f.t.A, id);
      return id;
    });
    const before = await approvalRow(approved);
    assert.equal(before.status, 'approved');
    assert.equal(before.decided_by, SUBJECTS.alice, 'the database records who approved, not what the caller claims');
    assert.equal(before.revision_sha256, r1.revision_sha256);

    // C13: the contact's address changed, so the agent edits the recipient.
    const r2 = await asA(c => addRevision(c, inA({ previous: r1.id, recipient: 'new.address@example.test' })));
    const pending = await asA(c => requestApproval(c, r2));
    const r3 = await asA(c =>
      addRevision(c, inA({ previous: r2.id, recipient: 'new.address@example.test', body: 'v3' })),
    );

    const a1 = await approvalRow(approved);
    assert.equal(a1.status, 'superseded');
    assert.equal(a1.superseded_by_revision_id, r2.id);
    assert.equal(a1.decided_by, SUBJECTS.alice, 'history keeps who approved');
    assert.ok(a1.invalidated_at);
    const a2 = await approvalRow(pending);
    assert.equal(a2.status, 'superseded');
    assert.equal(a2.superseded_by_revision_id, r3.id);
    assert.ok(a2.decided_at);
    // A superseded approval can never be decided again.
    await assert.rejects(
      asA(c => approve(c, f.t.A, pending)),
      /approval already superseded/,
    );
    await assert.rejects(
      asA(c => c.query(`UPDATE app.approval SET status = 'approved' WHERE id = $1`, [approved])),
      /approval already superseded/,
    );
    // Nothing was deleted.
    assert.equal(
      (await admin.query('SELECT count(*)::int AS n FROM app.approval WHERE draft_id = $1', [r1.id])).rows[0].n,
      2,
    );
  });

  it('refuses to approve or edit a revision that is not the latest (stale_revision)', async () => {
    const r1 = await asA(c => addRevision(c, inA()));
    await asA(c => addRevision(c, inA({ previous: r1.id, body: 'v2' })));
    await assert.rejects(
      asA(c => requestApproval(c, r1)),
      code('RV001', /stale_revision/),
    );
    await assert.rejects(
      asA(c => requestApproval(c, r1, { status: 'approved' })),
      code('RV001'),
    );
    // Editing from the stale revision forks the chain: refused.
    await assert.rejects(
      asA(c => addRevision(c, inA({ previous: r1.id, body: 'fork' }))),
      code('RV001'),
    );
    // A new revision must keep the draft's contact and draft id.
    const r = await asA(c => addRevision(c, inA()));
    await assert.rejects(
      asA(c => addRevision(c, inA({ previous: r.id, contact: null }))),
      code('RV006', /contact/),
    );
    await assert.rejects(
      asA(c => addRevision(c, inA({ previous: r.id, draftId: randomUUID() }))),
      code('RV006'),
    );
  });

  it('serializes a concurrent edit and approval: the approval of the old revision is refused', async () => {
    const r1 = await asA(c => addRevision(c, inA()));
    const editor = await pool.connect();
    try {
      await editor.query('BEGIN');
      await editor.query('SELECT app.enter_scope($1, $2)', [SUBJECTS.alice, f.t.A]);
      await addRevision(editor, inA({ previous: r1.id, body: 'concurrent edit' }));
      // The approver blocks on the draft lock until the edit commits, then sees the newer revision.
      const approving = asA(c => requestApproval(c, r1, { status: 'approved' }));
      await new Promise(resolve => setTimeout(resolve, 200));
      await editor.query('COMMIT');
      await assert.rejects(approving, code('RV001'));
    } finally {
      await editor.query('ROLLBACK').catch(() => {});
      editor.release();
    }
  });

  it('allows one pending approval per draft (C07)', async () => {
    const r1 = await asA(c => addRevision(c, inA()));
    const first = await asA(c => requestApproval(c, r1));
    await assert.rejects(
      asA(c => requestApproval(c, r1)),
      code('RV002', /approval_pending_exists/),
    );
    // Even as superuser, the partial unique index holds.
    await admin.query('BEGIN');
    try {
      await admin.query(`ALTER TABLE app.approval DISABLE TRIGGER prepare`);
      await assert.rejects(
        admin.query(
          `INSERT INTO app.approval (tenant_id, workspace_id, id, draft_revision_id, draft_id, revision_sha256, expires_at)
           VALUES ($1, $2, gen_random_uuid(), $3, $4, $5, now() + interval '1 day')`,
          [f.t.A, f.ws.A, r1.id, r1.draft_id, r1.revision_sha256],
        ),
        /approval_one_pending_per_draft/,
      );
    } finally {
      await admin.query('ROLLBACK');
    }
    // Once decided, a new request is possible.
    await asA(c =>
      c.query(`UPDATE app.approval SET status = 'rejected', reason = 'Fixture: tone' WHERE id = $1`, [first]),
    );
    assert.equal((await approvalRow(first)).status, 'rejected');
    await asA(c => requestApproval(c, r1));
  });

  it('lets only a current, approved, untampered approval authorize a dispatch (C05, C13)', async () => {
    const asset = await asA(c => addAsset(c, f.t.A, f.ws.A));
    const r1 = await asA(c => addRevision(c, inA({ attachments: [asset.id] })));
    const a1 = await asA(async c => {
      const id = await requestApproval(c, r1);
      return id;
    });
    // Pending: not yet.
    await assert.rejects(
      asA(c => dispatch(c, r1, a1)),
      code('RV004', /pending/),
    );
    await asA(c => approve(c, f.t.A, a1));
    // Wrong recipient: refused, never silently mismatched.
    await assert.rejects(
      asA(c => dispatch(c, r1, a1, 'someone.else@example.test')),
      code('RV007'),
    );

    // Edit: the old approval is superseded and cannot send either revision.
    const r2 = await asA(c => addRevision(c, inA({ previous: r1.id, body: 'Edited after approval' })));
    await assert.rejects(
      asA(c => dispatch(c, r1, a1)),
      code('RV004', /superseded/),
    );
    await assert.rejects(
      asA(c => dispatch(c, r2, a1)),
      code('RV004', /another revision/),
    );

    // The current revision with its own approval sends, and the dispatch records the approved hash.
    const a2 = await asA(c => requestApproval(c, r2, { status: 'approved' }));
    const d = await asA(c => dispatch(c, r2, a2));
    const row = (await admin.query('SELECT revision_sha256 FROM app.dispatch_attempt WHERE id = $1', [d])).rows[0];
    assert.equal(row.revision_sha256, r2.revision_sha256);

    // Expired approvals do not send.
    const r3 = await asA(c => addRevision(c, inA()));
    const a3 = await asA(c => requestApproval(c, r3, { status: 'approved', expiresIn: '50 milliseconds' }));
    await new Promise(resolve => setTimeout(resolve, 100));
    await assert.rejects(
      asA(c => dispatch(c, r3, a3)),
      code('RV004', /expired/),
    );
  });

  it('refuses a dispatch when the revision or the approval was tampered with, even by a superuser', async () => {
    const tamper = async (sql: string, params: unknown[], table: string, trigger: string) => {
      await admin.query('BEGIN');
      await admin.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
      await admin.query(sql, params);
      await admin.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
      await admin.query('COMMIT');
    };
    const approvedRevision = async () =>
      asA(async c => {
        const r = await addRevision(c, inA());
        return { r, a: await requestApproval(c, r, { status: 'approved' }) };
      });

    const body = await approvedRevision();
    await tamper(
      `UPDATE app.draft_revision SET body = 'Sneaky new body' WHERE id = $1`,
      [body.r.id],
      'app.draft_revision',
      'immutable',
    );
    await assert.rejects(
      asA(c => dispatch(c, body.r, body.a)),
      code('RV003', /revision_hash_mismatch/),
    );

    const policy = await approvedRevision();
    await tamper(
      `UPDATE app.draft_revision SET policy_context = '{"policy_version": "relaxed"}' WHERE id = $1`,
      [policy.r.id],
      'app.draft_revision',
      'immutable',
    );
    await assert.rejects(
      asA(c => dispatch(c, policy.r, policy.a)),
      code('RV003'),
    );

    const hash = await approvedRevision();
    await tamper(
      `UPDATE app.approval SET revision_sha256 = $2 WHERE id = $1`,
      [hash.a, 'a'.repeat(64)],
      'app.approval',
      'guard',
    );
    await assert.rejects(
      asA(c => dispatch(c, hash.r, hash.a)),
      code('RV003'),
    );

    // Swapping an attachment's bytes behind the revision's back.
    const att = await asA(async c => {
      const asset = await addAsset(c, f.t.A, f.ws.A);
      const r = await addRevision(c, inA({ attachments: [asset.id] }));
      return { r, asset, a: await requestApproval(c, r, { status: 'approved' }) };
    });
    await tamper(
      `UPDATE app.asset_version SET content_sha256 = $2 WHERE id = $1`,
      [att.asset.id, 'b'.repeat(64)],
      'app.asset_version',
      'immutable',
    );
    await assert.rejects(
      asA(c => dispatch(c, att.r, att.a)),
      code('RV003'),
    );

    // A pending approval whose revision was tampered cannot be approved.
    const pending = await asA(async c => {
      const r = await addRevision(c, inA());
      return { r, a: await requestApproval(c, r) };
    });
    await tamper(
      `UPDATE app.draft_revision SET recipient = 'x@example.test' WHERE id = $1`,
      [pending.r.id],
      'app.draft_revision',
      'immutable',
    );
    await assert.rejects(
      asA(c => approve(c, f.t.A, pending.a)),
      code('RV003'),
    );
  });

  it('freezes the attachment list once the revision is committed, approved or edited', async () => {
    const asset = await asA(c => addAsset(c, f.t.A, f.ws.A));
    const attach = (c: pg.ClientBase, rev: string, position: number) =>
      c.query(
        `INSERT INTO app.draft_revision_attachment (tenant_id, workspace_id, draft_revision_id, position, asset_version_id) VALUES ($1, $2, $3, $4, $5)`,
        [f.t.A, f.ws.A, rev, position, asset.id],
      );
    // A later transaction.
    const r1 = await asA(c => addRevision(c, inA()));
    await assert.rejects(
      asA(c => attach(c, r1.id, 0)),
      code('RV005', /creates the revision/),
    );
    // Same transaction, after an approval request.
    await assert.rejects(
      asA(async c => {
        const r = await addRevision(c, inA());
        await requestApproval(c, r);
        await attach(c, r.id, 0);
      }),
      code('RV005', /approval/),
    );
    // Same transaction, after a newer revision.
    await assert.rejects(
      asA(async c => {
        const r = await addRevision(c, inA());
        await addRevision(c, inA({ previous: r.id }));
        await attach(c, r.id, 0);
      }),
      code('RV005', /newer revision/),
    );
    // As superuser too, and the stored hash can only ever hold the true value.
    const r2 = await asA(c => addRevision(c, inA({ attachments: [asset.id] })));
    await assert.rejects(attach(admin, r2.id, 1), code('RV005'));
    await assert.rejects(
      admin.query(`UPDATE app.draft_revision SET revision_sha256 = $2 WHERE id = $1`, [r2.id, 'c'.repeat(64)]),
      /immutable record/,
    );
    await assert.rejects(
      admin.query(`UPDATE app.draft_revision SET revision_sha256 = revision_sha256 WHERE id = $1`, [r2.id]),
      /immutable record/,
    );
    await assert.rejects(
      admin.query(`DELETE FROM app.draft_revision_attachment WHERE draft_revision_id = $1`, [r2.id]),
      /immutable record/,
    );
  });

  it('rejects cross-tenant attachment, revision, approval and dispatch references by foreign key, even as superuser', async () => {
    const assetB = await withScope(pool, { subject: SUBJECTS.bob, tenantId: f.t.B }, c => addAsset(c, f.t.B, f.ws.B));
    const revB = await withScope(pool, { subject: SUBJECTS.bob, tenantId: f.t.B }, async c => {
      const r = await addRevision(c, { tenant: f.t.B, ws: f.ws.B, contact: f.contacts.B });
      return { r, a: await requestApproval(c, r, { status: 'approved' }) };
    });
    await assert.rejects(
      admin.query('BEGIN').then(async () => {
        try {
          await addRevision(admin, inA({ attachments: [assetB.id] }));
        } finally {
          await admin.query('ROLLBACK');
        }
      }),
      /violates foreign key constraint/,
    );
    await assert.rejects(addRevision(admin, inA({ previous: revB.r.id })), /violates foreign key constraint/);
    await assert.rejects(
      requestApproval(admin, { ...revB.r, tenant_id: f.t.A, workspace_id: f.ws.A }),
      /violates foreign key constraint/,
    );
    const revA = await asA(c => addRevision(c, inA()));
    await assert.rejects(dispatch(admin, revA, revB.a), /violates foreign key constraint/);
    await assert.rejects(addAsset(admin, f.t.A, f.ws.B), /violates foreign key constraint/);
    // An object key under another tenant's prefix is refused.
    await assert.rejects(addAsset(admin, f.t.A, f.ws.A, { objectTenant: f.t.B }), /asset_version_object_key_prefix/);
    // Another workspace of the same tenant (C1 vs C2) is refused as well.
    const assetC2 = await withScope(pool, { subject: SUBJECTS.carol, tenantId: f.t.C }, c =>
      addAsset(c, f.t.C, f.ws.C2),
    );
    await assert.rejects(
      withScope(pool, { subject: SUBJECTS.carol, tenantId: f.t.C }, c =>
        addRevision(c, { tenant: f.t.C, ws: f.ws.C1, contact: f.contacts.C1, attachments: [assetC2.id] }),
      ),
      /violates foreign key constraint/,
    );
    // And in scope, A sees none of B's assets or attachments.
    await asA(async c => {
      assert.equal(
        (await c.query('SELECT count(*)::int AS n FROM app.asset_version WHERE tenant_id = $1', [f.t.B])).rows[0].n,
        0,
      );
      assert.equal(
        (await c.query('SELECT count(*)::int AS n FROM app.draft_revision_attachment WHERE tenant_id = $1', [f.t.B]))
          .rows[0].n,
        0,
      );
    });
  });

  it('gives the app role no way to update, delete or bypass any of it', async () => {
    const { r, asset, a } = await asA(async c => {
      const asset = await addAsset(c, f.t.A, f.ws.A);
      const r = await addRevision(c, inA({ attachments: [asset.id] }));
      return { r, asset, a: await requestApproval(c, r, { status: 'approved' }) };
    });
    const d = await asA(c => dispatch(c, r, a));
    const denied = [
      [`UPDATE app.draft_revision SET body = 'x' WHERE id = $1`, r.id],
      [`UPDATE app.draft_revision SET revision_sha256 = revision_sha256 WHERE id = $1`, r.id],
      [`DELETE FROM app.draft_revision WHERE id = $1`, r.id],
      [`UPDATE app.asset_version SET content_sha256 = content_sha256 WHERE id = $1`, asset.id],
      [`DELETE FROM app.asset_version WHERE id = $1`, asset.id],
      [`UPDATE app.draft_revision_attachment SET position = 5 WHERE draft_revision_id = $1`, r.id],
      [`DELETE FROM app.draft_revision_attachment WHERE draft_revision_id = $1`, r.id],
      [`DELETE FROM app.approval WHERE id = $1`, a],
      [`UPDATE app.dispatch_attempt SET recipient = 'x' WHERE id = $1`, d],
      [`DELETE FROM app.dispatch_attempt WHERE id = $1`, d],
    ] as const;
    for (const [sql, id] of denied)
      await assert.rejects(
        asA(c => c.query(sql, [id])),
        /permission denied/,
        sql,
      );
    for (const t of ['app.asset_version', 'app.draft_revision_attachment', 'app.draft_revision', 'app.approval'])
      await assert.rejects(
        asA(c => c.query(`TRUNCATE ${t}`)),
        /permission denied/,
        t,
      );
    // The approval's binding and decision cannot be rewritten, and only the database supersedes.
    await assert.rejects(
      asA(c => c.query(`UPDATE app.approval SET revision_sha256 = $2 WHERE id = $1`, [a, 'd'.repeat(64)])),
      /cannot be moved/,
    );
    await assert.rejects(
      asA(c => c.query(`UPDATE app.approval SET status = 'rejected' WHERE id = $1`, [a])),
      /approval already approved/,
    );
    await assert.rejects(
      asA(c =>
        c.query(`UPDATE app.approval SET status = 'superseded', superseded_by_revision_id = $2 WHERE id = $1`, [
          a,
          r.id,
        ]),
      ),
      /superseded only by a newer revision/,
    );
    // Private trigger functions are out of reach; the role still cannot bypass RLS.
    await assert.rejects(
      asA(c => c.query('SELECT app_private.refresh_revision_hash()')),
      /permission denied/,
    );
    const role = await pool.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
    assert.deepEqual(role.rows[0], { rolsuper: false, rolbypassrls: false });
    // A read-only scope (viewer) can neither request nor approve.
    const viewer = { subject: SUBJECTS.viewerA, tenantId: f.t.A };
    await assert.rejects(
      withScope(pool, viewer, c => requestApproval(c, r)),
      /row-level security/,
    );
    const r2 = await asA(c => addRevision(c, inA()));
    const pending = await asA(c => requestApproval(c, r2));
    assert.equal((await withScope(pool, viewer, c => approve(c, f.t.A, pending))).rowCount, 0);
    assert.equal((await approvalRow(pending)).status, 'pending');
  });

  it('gives the demo tenant no dispatch authority, even with a valid approval', async () => {
    const r = await (async () => {
      await admin.query('BEGIN');
      try {
        const rev = await addRevision(admin, { tenant: f.t.demo, ws: f.ws.demo, recipient: null, channel: 'social' });
        await admin.query('COMMIT');
        return rev;
      } catch (e) {
        await admin.query('ROLLBACK');
        throw e;
      }
    })();
    const a = await requestApproval(admin, r, { status: 'approved', decidedBy: 'fixture:admin' });
    await assert.rejects(dispatch(admin, r, a, 'fixture-social-account'), /no provider authority/);
  });

  it('keeps every new table classified, RLS-forced and immutable', async () => {
    const rows = await admin.query(
      `SELECT k.table_name, k.class, k.immutable, c.relrowsecurity, c.relforcerowsecurity
       FROM platform.table_classification k JOIN pg_class c ON c.relname = k.table_name
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = k.table_schema
       WHERE k.table_schema = 'app' AND k.table_name IN ('asset_version', 'draft_revision_attachment') ORDER BY 1`,
    );
    assert.deepEqual(
      rows.rows.map(r => [r.table_name, r.class, r.immutable, r.relrowsecurity, r.relforcerowsecurity]),
      [
        ['asset_version', 'tenant', true, true, true],
        ['draft_revision_attachment', 'tenant', true, true, true],
      ],
    );
  });
});

describe('revisions migration rollback', () => {
  const ALL = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => f.replace(/\.sql$/, ''))
    .sort();
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let admin: pg.Client;
  before(async () => {
    assert.ok(adminUrl && appUrl);
    db = await createTestDatabase({ adminUrl, appUrl });
    admin = new pg.Client({ connectionString: db.adminUrl });
    await admin.connect();
  });
  after(async () => {
    await admin?.end();
    await db?.drop();
  });

  /** Everything the migration touches: columns, constraints, indexes, triggers, functions, grants, policies, classification. */
  const fingerprint = async () =>
    (
      await admin.query(`
        SELECT 'col ' || table_schema || '.' || table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '') AS x
          FROM information_schema.columns WHERE table_schema IN ('app', 'app_private', 'platform', 'catalog', 'migration', 'identity')
        UNION ALL SELECT 'con ' || conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace::regnamespace::text IN ('app', 'app_private', 'platform')
        UNION ALL SELECT 'idx ' || schemaname || ' ' || indexdef FROM pg_indexes WHERE schemaname IN ('app', 'app_private', 'platform')
        UNION ALL SELECT 'trg ' || pg_get_triggerdef(t.oid) || ' ' || t.tgenabled::text FROM pg_trigger t WHERE NOT t.tgisinternal
        UNION ALL SELECT 'fn ' || p.oid::regprocedure || ' ' || md5(p.prosrc) || ' ' || p.proowner::regrole || ' ' || p.prosecdef || ' ' || coalesce(p.proacl::text, '')
          FROM pg_proc p WHERE p.pronamespace::regnamespace::text IN ('app', 'app_private', 'platform')
        UNION ALL SELECT 'rel ' || c.oid::regclass || ' ' || coalesce(c.relacl::text, '') || ' ' || c.relrowsecurity || c.relforcerowsecurity
          FROM pg_class c WHERE c.relnamespace::regnamespace::text IN ('app', 'app_private', 'platform') AND c.relkind IN ('r', 'p')
        UNION ALL SELECT 'colacl ' || grantee || ' ' || table_schema || '.' || table_name || '.' || column_name || ' ' || privilege_type
          FROM information_schema.column_privileges WHERE grantee IN ('agentcity_app', 'agentcity_scope')
        UNION ALL SELECT 'pol ' || schemaname || '.' || tablename || ' ' || policyname || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, '') FROM pg_policies
        UNION ALL SELECT 'cls ' || table_schema || '.' || table_name || ' ' || class || ' ' || immutable || ' ' || note FROM platform.table_classification
        UNION ALL SELECT 'cmt ' || c.oid::regclass || '.' || a.attname || ' ' || col_description(c.oid, a.attnum)
          FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid WHERE c.relnamespace::regnamespace::text = 'app' AND col_description(c.oid, a.attnum) IS NOT NULL
        ORDER BY 1`)
    ).rows.map(r => r.x as string);

  it('down restores the exact pre-revisions schema, with data in place', async () => {
    assert.equal(ALL.at(-1), '1793232000000_revisions', 'this test assumes the revisions migration is the latest');
    // Reference: a database that never had the revisions migration.
    await migrate(db.adminUrl, 'down', Infinity);
    await migrate(db.adminUrl, 'up', ALL.length - 1);
    const reference = await fingerprint();
    assert.ok(reference.length > 500, 'the fingerprint covers the schema');
    // Existing M02 data (as the legacy import writes it) survives the upgrade.
    const f = await seedTenancy(db.adminUrl);
    const legacy = randomUUID();
    await admin.query(
      `INSERT INTO app.draft_revision (tenant_id, workspace_id, id, contact_id, channel, recipient, body, body_sha256, created_by)
       VALUES ($1, $2, $3, $4, 'email', 'a@example.test', 'Fixture legacy body', '', 'legacy-import')`,
      [f.t.A, f.ws.A, legacy, f.contacts.A],
    );
    await admin.query(
      `INSERT INTO app.approval (tenant_id, workspace_id, id, draft_revision_id, status, expires_at, decided_by, decided_at)
       VALUES ($1, $2, gen_random_uuid(), $3, 'expired', now(), 'legacy-import', now())`,
      [f.t.A, f.ws.A, legacy],
    );
    assert.deepEqual(await migrate(db.adminUrl, 'up'), ['1793232000000_revisions']);
    const up = (
      await admin.query('SELECT draft_id, revision_number, revision_sha256 FROM app.draft_revision WHERE id = $1', [
        legacy,
      ])
    ).rows[0];
    assert.deepEqual([up.draft_id, up.revision_number], [legacy, 1]);
    assert.equal(
      up.revision_sha256,
      revisionHash({
        channel: 'email',
        recipient: 'a@example.test',
        subject: null,
        body: 'Fixture legacy body',
        attachments: [],
        policyContext: {},
      }),
    );
    // Use the new features, including a superseded approval, then roll back.
    await admin.query('BEGIN');
    const asset = await addAsset(admin, f.t.A, f.ws.A);
    const r1 = await addRevision(admin, {
      tenant: f.t.A,
      ws: f.ws.A,
      contact: f.contacts.A,
      attachments: [asset.id],
      policy: POLICY,
    });
    await admin.query('COMMIT');
    await requestApproval(admin, r1, { status: 'approved', decidedBy: 'fixture:admin' });
    await admin.query('BEGIN');
    await addRevision(admin, { tenant: f.t.A, ws: f.ws.A, contact: f.contacts.A, previous: r1.id });
    await admin.query('COMMIT');
    assert.deepEqual(await migrate(db.adminUrl, 'down', 1), ['1793232000000_revisions']);
    assert.deepEqual(await fingerprint(), reference);
    assert.equal(
      (await admin.query(`SELECT count(*)::int AS n FROM app.approval WHERE status = 'expired'`)).rows[0].n,
      2,
      'the superseded approval is kept as expired',
    );
    assert.deepEqual(await migrate(db.adminUrl, 'up'), ['1793232000000_revisions']);
  });
});
