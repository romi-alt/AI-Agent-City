# M04 — Immutable draft revisions and approval primitives

Database-level primitives for the M04 approvals/draft-revisions work (prompt M04: "revision hash includes body,
subject, recipient, channel, attachment versions and policy context. Editing creates a new revision and invalidates
approval"). Audit items: C04, C05, C07, C09, C13 (ACCEPTANCE.md). Migration:
`packages/db/migrations/1793232000000_revisions.sql`. TypeScript twin of the hash: `packages/db/src/revision-hash.ts`.
Tests: `packages/db/test/revisions.test.ts` (fixture `revisions-fixture.ts`).

## Model

| Table | What it holds | Mutability |
| --- | --- | --- |
| `app.asset_version` (new) | One stored file version: `asset_id` + `version`, `object_key`, `content_sha256`, `size_bytes`, `media_type` | Immutable (app: SELECT, INSERT; trigger refuses UPDATE/DELETE/TRUNCATE for everyone) |
| `app.draft_revision_attachment` (new) | Revision ↔ asset version, ordered by `position` | Immutable; insert only while the revision is unfrozen (below) |
| `app.draft_revision` | + `draft_id`, `previous_revision_id`, `revision_number`, `policy_context`, `revision_sha256`, `created_xact` | Immutable (one narrow exception: the database refreshing `revision_sha256`) |
| `app.approval` | + `draft_id`, `revision_sha256`, `superseded_by_revision_id`, `invalidated_at`; status adds `superseded` | Status changes only as below; never deleted |
| `app.dispatch_attempt` | + `revision_sha256` (the hash the dispatch was authorized with) | Immutable |

All keys are composite with `tenant_id` (and `workspace_id` for workspace-owned rows) as in ADR-015, so a revision,
attachment, approval or dispatch can never reference another tenant or another workspace — tested as superuser.
Both new tables have forced RLS with the M02 `protect()` policies, grants and `immutable` triggers, and rows in
`platform.table_classification` (class `tenant`, immutable). The app role gets no new bypass: no UPDATE/DELETE on
any of these tables beyond the existing `UPDATE` on `approval`, which the guard trigger constrains.

Asset object keys must start with `tenants/<tenant_id>/workspaces/<workspace_id>/` (CHECK
`asset_version_object_key_prefix`), so a stored key can never name another tenant's object. M09 (storage) may refine
the layout under that prefix.

### Revision chain

- The first revision of a draft has `previous_revision_id = NULL`, `revision_number = 1`, and `draft_id` = the
  caller's `draft_id` or, if none, its own `id`.
- An edit inserts a new revision with `previous_revision_id` = the latest revision. The database sets `draft_id` and
  `revision_number = previous + 1` (caller values for `revision_number`, `revision_sha256`, `body_sha256`,
  `created_xact` are ignored). It must keep the contact and draft (`RV006`), and its predecessor must not already
  have a successor (`RV001`; also `UNIQUE (tenant_id, previous_revision_id)`), so the chain never forks.
  `FOREIGN KEY (tenant_id, workspace_id, draft_id, previous_revision_id)` keeps the chain inside one draft,
  workspace and tenant.
- "Latest revision" = the revision with no successor.
- `body_sha256` (M02) is unchanged and kept for compatibility; nothing authorizes on it.

### Attachments

Attachments are inserted in the same transaction that created the revision (`created_xact = pg_current_xact_id()`),
before any approval of it exists and before a newer revision exists. Otherwise: `RV005 attachments_frozen` — for
the superuser too. After each insert a SECURITY DEFINER trigger (owned by `agentcity_scope`) stores the new
canonical hash; the revision's `immutable` trigger permits exactly that update, and only to the true value, while
the revision is unfrozen.

### Approvals

- Insert: `draft_id` and `revision_sha256` are set by the database from the revision's *current* canonical hash
  (caller values ignored). Status `pending` (a request) or `approved` (a person approving as they send — the C09
  manual-send path; it is still an approval row with `decided_by`) requires the latest revision (`RV001`); `approved`
  requires `expires_at > now()` (`RV004`). Inserting `superseded` is refused. `expired`/`rejected` inserts stay
  allowed (the legacy import writes expired approvals).
- One pending approval per draft (C07): checked by the trigger (`RV002`) and enforced under any race by the partial
  unique index `approval_one_pending_per_draft`.
- Decisions: `pending → approved | rejected | expired | superseded`; `approved → superseded | expired` (stops counting;
  `decided_by`/`decided_at` keep who approved, `invalidated_at` records when it stopped). Anything else:
  `approval already <status>`. `pending → approved` rechecks latest (`RV001`), hash (`RV003`) and expiry (`RV004`).
  In a scope, `decided_by` is set to the scope's subject (the caller cannot claim someone else approved).
  `decided_at` is set by the database. Binding columns (`draft_revision_id`, `draft_id`, `revision_sha256`,
  `expires_at`, …) never change. `superseded` needs a newer revision of the same draft.
- Edit invalidation: inserting a revision marks every `pending` or `approved` approval of earlier revisions of the
  draft `superseded` (with `superseded_by_revision_id`), in the same transaction (AFTER INSERT trigger, SECURITY
  DEFINER as `agentcity_scope` so no RLS narrowing can hide one). History is kept.

### Dispatch gate (C05, C13)

A `dispatch_attempt` insert is refused unless, re-read under the draft lock:

1. the approval is of exactly this `draft_revision_id` (`RV004`);
2. its status is `approved` and `expires_at > now()` (`RV004`);
3. the revision is the latest of its draft (`RV001`);
4. the approval's stored `revision_sha256` equals the revision's hash recomputed now from its row, attachments and
   asset versions (`RV003`) — so content changed behind the database's back (triggers disabled, restored backup,
   swapped attachment bytes) or a rewritten approval hash never authorizes a send;
5. the dispatch `recipient` equals the revision's recipient when the revision has one (`RV007`).

The dispatch records the approved hash in `dispatch_attempt.revision_sha256`. The M02 `no_demo` trigger still runs
after it (`authorize` sorts before `no_demo`): the demo tenant has no dispatch authority even with a valid approval.
Not covered here (M08): one dispatch per approval / retry policy, consent, suppression, quiet hours and caps at send
time — the `policy_context` records which policy versions were reviewed, it does not enforce them.

### Concurrency

Revision insert (edit), approval insert, `pending → approved` and dispatch take
`pg_advisory_xact_lock(hashtextextended('agentcity.draft:' || draft_id, 0))` and then check with fresh READ
COMMITTED snapshots, so an approval or dispatch racing an edit is either ordered before it (and then superseded) or
refused. Under REPEATABLE READ a transaction's snapshot predates the lock, so these checks refuse to run (`RV008`);
SERIALIZABLE is allowed. Tested: an approval blocked behind an uncommitted edit fails with `RV001` once the edit
commits.

## Canonical serialization (`agentcity.revision.v1`)

`revision_sha256` = lowercase hex SHA-256 of the UTF-8 bytes of the canonical JSON of:

```json
{
  "attachments": [
    { "asset_version_id": "<uuid, lowercase>", "content_sha256": "<64 hex>", "media_type": "<type/subtype>", "size_bytes": 1234 }
  ],
  "body": "<text>",
  "channel": "email | phone | text | social",
  "format": "agentcity.revision.v1",
  "policy_context": { "...": "the revision's policy_context object" },
  "recipient": "<text> | null",
  "subject": "<text> | null"
}
```

- `attachments` are in `position` order (reordering changes the hash); `[]` when none.
- `recipient`/`subject` NULL serialize as `null` (distinct from `""`).
- Revision ids, draft ids, numbers, contact, author and timestamps are **not** hashed: identical content gives an
  identical hash; the approval binds the revision id separately.

Canonical JSON rules (both `app.canonical_json(jsonb)` and `canonicalJson()` in TS):

- No whitespace. Object keys sorted by Unicode code point (= UTF-8 byte order; SQL `COLLATE "C"`, TS
  `Buffer.compare` of UTF-8). This is *not* RFC 8785's UTF-16 order; the two differ only for keys mixing astral and
  high-BMP characters.
- Strings (and keys) escaped exactly as `JSON.stringify` / PostgreSQL `to_json(text)`: `\"`, `\\`, `\b \f \n \r \t`,
  other U+0000–U+001F as lowercase `\u00xx`, everything else (including `/`, U+007F, U+2028, non-ASCII) literal.
- Numbers must be integers with |n| ≤ 2^53 − 1 and are written as plain decimal integers (`1.0` and `1e2` in jsonb
  become `1` and `100`); anything else is refused (SQL `22023`, TS `RangeError`). Use strings for decimals.
- `true`, `false`, `null` as usual; arrays keep order.

`policy_context` must be a JSON object (CHECK). Suggested keys (not enforced): `policy_version`, `sender_identity`,
`consent_policy`, `quiet_hours_policy`, `suppression_list_version`.

TS: `revisionHash({ channel, recipient, subject, body, attachments: [{ assetVersionId, contentSha256, mediaType,
sizeBytes }], policyContext })`; `revisionCanonicalDocument()` returns the hashed text. SQL:
`app.revision_sha256(channel, recipient, subject, body, attachments jsonb, policy_context jsonb)` and
`app.draft_revision_sha256(tenant_id, revision_id)` (runs with the caller's rights; under RLS a hidden row changes
the result, so checks fail closed). Tests assert TS = SQL for every field variant and for awkward Unicode/control
characters.

## Error codes

| SQLSTATE | Name (message prefix) | Raised when |
| --- | --- | --- |
| `RV001` | `stale_revision` | requesting/approving/dispatching a revision that has a newer revision; editing from a non-latest revision |
| `RV002` | `approval_pending_exists` | a second pending approval for the draft (the unique index raises `23505` if the trigger is bypassed) |
| `RV003` | `revision_hash_mismatch` | approval hash ≠ revision's current canonical hash (approve or dispatch) |
| `RV004` | `approval_not_valid` | dispatch with an approval that is not approved, expired, or for another revision; approving an expired request |
| `RV005` | `attachments_frozen` | attachment added outside the creating transaction, or after an approval or newer revision exists |
| `RV006` | `revision_chain_invalid` | new revision changes the contact or names another draft |
| `RV007` | `recipient_mismatch` | dispatch recipient ≠ approved revision's recipient |
| `RV008` | `isolation_unsupported` | approval/edit/dispatch checks under REPEATABLE READ |
| `42501` | — | immutable-record changes, approval moved/re-decided (`approval already …`), superseding without a newer revision |
| `23503` | FK violation | cross-tenant/cross-workspace references (triggers leave unknown references to the foreign keys) |

The API should map `RV001` to HTTP 409 (stale revision conflict), `RV002` to 409, `RV003`/`RV004`/`RV007` to 409/422
and log them as security-relevant, `RV005`/`RV006` to 422.

## Down migration

Restores the M02 schema exactly (tested by comparing a catalog fingerprint against a database that never had this
migration). It is lossy by design: attachments, asset versions, the revision chain columns and approval bindings are
dropped, and `superseded` approvals are kept as `expired`.
