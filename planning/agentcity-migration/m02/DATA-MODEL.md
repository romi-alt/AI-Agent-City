# M02 data model, tenancy and import decisions

Stage M02 replaces the legacy app's global JSON authority with a scoped PostgreSQL model. It adds the schema, the
row-level security (RLS) design, the catalog seed and a read-only legacy importer.

The legacy app is still the running product. Nothing writes to both JSON and SQL, and no new route reads the new
tables yet: the API moves onto them in M03/M04. ADR numbers continue from `m01/ARCHITECTURE.md`.

Migrations, all in `packages/db/migrations/`:
- `1793059200000_tenancy-core.sql`: the schema
- `1793059200001_catalog-legacy-city.sql`: the catalog seed, generated

## The model

```
catalog (shared, public map, read-only to the app)
  district ─< building ─< floor ─< desk (seeded personas; human desks can never run an agent)
  building_alias (legacy ids: fast-sales, rental-1, …)   agent_template ─< agent_template_version

app (tenant-owned, forced RLS)
  agency ─< tenant (client | agency | demo) ─< workspace ─< workspace_placement >─ catalog.floor
  agency_member, agency_assignment (staff → tenant), tenant_member (optionally one workspace), invitation
  agent_installation (workspace × floor seat × template version; only on floors the workspace occupies)
  contact ─< contact_external_id, consent_event*, opportunity ─< opportunity_stage_event*, note (BM25)
  suppression, draft_revision* ─< approval ─< dispatch_attempt* ─< dispatch_receipt*
  message_evidence* (legacy history), content_item, schedule (off by default)
  usage_fact*, money_fact*, audit_event*, outbox_event*            (* = immutable)

app_private (scope key, support grants and sessions)   migration (import runs, record map, quarantine)
```

Every table is listed in `platform.table_classification` with one class: catalog, tenant, agency, platform,
private or migration. A test fails if any table is unclassified, or if a tenant table lacks any of:
- forced RLS
- a policy
- a `tenant_id` key
- its immutability trigger, if it is marked immutable

## ADR-013: physical placement is not security ownership

- **Placement is physical.** A building, floor or desk is a place on the public map. A
  `workspace_placement` says which workspace occupies a floor. A partial unique index allows one active occupant
  per floor, so two clients can share a building but never a floor.
- **Ownership is separate.** Access comes only from `tenant_id`/`workspace_id` on the data, plus a membership.
  Sitting in the same building grants nothing (tested: a client on rental L1 against one on L2).
- **Agents must sit on occupied floors.** An agent installation is refused unless its workspace occupies that
  floor (trigger).
- **Human desks stay human.** A human desk can never be installed as an agent: the composite foreign key
  `(desk_id, 'ai')` enforces it.

## ADR-014: scope is signed, transaction-local, and checked by the database

- **Entering scope:** the app role (`agentcity_app`: not superuser, not BYPASSRLS, owns nothing) enters scope only
  through `app.enter_scope(subject, tenant, workspace)`. In order, that function checks:
  1. client membership, including a single-workspace limit;
  2. agency owner;
  3. agency staff with an assignment to that tenant;
  4. an open support session.
- **The scope value:** it writes a transaction-local setting signed with HMAC-SHA256. The key is in
  `app_private.scope_key`, which only the `agentcity_scope` role can read. The value is bound to the transaction
  ID and the backend PID.
- **How policies use it:** they read scope through functions that verify the signature. So:
  - a hand-set or tampered value is ignored;
  - a value copied into a later transaction is dead;
  - other settings (e.g. `app.tenant_id`) mean nothing;
  - scope can't be switched mid-transaction;
  - scope ends at COMMIT/ROLLBACK, so a pooled connection never carries it into the next transaction.
  All of these are tested.
- **Read-only scopes:** viewers and support sessions get a read-only scope. Restrictive policies refuse their
  writes.
- **The scope role:** the functions that check membership are owned by `agentcity_scope`. It has NOLOGIN and
  BYPASSRLS, but only SELECT on the membership tables, so it can read membership before any scope exists. It is
  created by the migration if missing; roles are cluster-wide.
- **What is still trusted:** the subject. The database verifies that this subject may act for this tenant, not who
  the subject is. That comes from the OIDC token at the API (M03).
- **Application code** uses `withScope(pool, scope, fn)` from `@agentcity/db`.

## ADR-015: references and unique keys carry the tenant

- **Primary keys** are `(tenant_id, id)`.
- **Workspace-owned children** reference `(tenant_id, workspace_id, id)`. A row can't point into another tenant,
  or into another workspace of the same tenant. This holds even for a role that bypasses RLS: tested as superuser.
- **Unique keys** include the tenant (e.g. a CRM external id per tenant).
- **Two global unique indexes** are physical facts, not tenant data: one occupant per floor, one agent per seat.
  They can reveal that a floor or seat is taken, which the public city map shows anyway.

## ADR-016: facts are immutable, and approvals bind one revision

- **Immutable facts:** consent events, stage events, draft revisions, dispatch attempts and receipts, message
  evidence, usage, money, audit and outbox. Two layers protect them:
  - the app role has only SELECT/INSERT on them;
  - a trigger refuses UPDATE, DELETE and TRUNCATE for everyone, including the owner.
- **Draft hashes:** `draft_revision.body_sha256` is computed by the database from recipient, subject and body,
  whatever the caller supplies.
- **Approvals:**
  - Each approval points at one revision and can never be moved to another.
  - It can be decided once, and is never deleted.
  - A changed draft is a new revision, so it needs a new approval (audit C04/C05).
- **Money and receipts:**
  - A `money_fact` of kind `payment` must be verified (audit C14).
  - Receipts distinguish accepted, delivered, failed and unknown.
- **The demo tenant has no provider authority:** a trigger refuses dispatch attempts, receipts and money facts for
  it.

## ADR-017: support access is explicit, time-limited and audited before use

- **Grants:** a platform administrator creates a `support_grant`. It has a reason of at least 10 characters,
  `granted_by`, and expires within 24 hours.
- **Sessions:** the support person then calls `app.open_support_session`. That writes an audit event and must be
  committed. `enter_scope` accepts a support session only if it was opened by an earlier transaction.
- **Why:** support reads can never happen in a transaction whose rollback would also erase their audit trail. An
  earlier draft audited inside the scoped transaction, and a test caught exactly that gap.
- **Access level:** support scopes are read-only.

## ADR-018: BM25 under row-level security (finding)

- **What happens:** on pg_search 0.26.3, a `@@@` query through RLS returns the right rows, so isolation holds. But
  PostgreSQL keeps the non-leakproof operator above the security filter, so the ParadeDB scan isn't used.
  `paradedb.score()` fails with "must be evaluated by a ParadeDB scan".
- **The fix:**
  - Ranked search goes through `app.search_notes(query, limit)`. It is a SECURITY DEFINER function owned by the
    scope role, and it applies the caller's verified tenant and workspace scope explicitly.
  - The query text is inlined with `format('%L')`, because a parameterised query does not get scores either.
  - Without a scope it returns nothing.
  - Tests cover: correct tenant, workspace narrowing, scores present, and no scope returns no rows.
- **For M09:** knowledge retrieval (BM25 + vectors) uses the same pattern. Marking pg_search's operator LEAKPROOF
  was rejected: it would change an extension's security property without review.

## ADR-019: the catalog seed is generated from the legacy code

- **Generation:** `packages/domain` reads `buildCity()` from `apps/legacy` and writes the seed migration. A test
  fails if the committed SQL differs.
- **IDs:** deterministic UUIDv5 (`deterministicId`). A legacy building, floor or desk id always maps to the same
  UUID.
- **Inventory, tested:**
  - 15 buildings, 183 floors, 281 AI desks, 22 human desks, 303 desks;
  - Fast Sales = 32 AI agents + Elvis, with 7 AI leaders on L12;
  - 21 Rick Case associates + Elvis as human desks;
  - rental buildings start empty, with asking rent only.
- **Building ids** are kept as aliases.
- **Districts are new.** The legacy city has none: Dealer Row, Fast Sales Campus and Rental Park follow the
  existing layout. This is an assumption; the owner may rename them.
- **Not seeded into tenants:** the catalog is the map. Tenants get placements and agent installations only through
  an explicit mapping.

## ADR-020: unused extensions removed

- **Dropped:** PostGIS (+ topology, tiger geocoder), `fuzzystrmatch` and `pg_ivm`, which the ParadeDB image
  pre-creates. This closes the open item in ADR-006.
- **Kept:** `pg_stat_statements`.
- **Added:** `pgcrypto`, for the scope HMAC.
- **Restores** go into a `template0` database, because `template1` in this image carries the extensions
  (rehearsal).

## The legacy import

The procedure is in `IMPORT-RUNBOOK.md`; the code is in `packages/legacy-import`. The rules enforced, each covered
by a test:
- **Inputs:**
  - read with read-only opens and fingerprinted before and after;
  - the top level must be exactly version 2 with every list present, or the whole import is refused with no
    writes;
  - a dry run connects as the app role, so it cannot write.
- **Ownership comes only from the mapping file:**
  - Simulated records (`real: false`) go to the demo tenant (`kind = 'demo'`).
  - A real lead is imported only if the mapping assigns it, by lead id or by a building that tenant solely
    occupies.
  - A building rule on a shared rental building is refused.
  - Unassigned real leads are quarantined with the reason.
  - Rental contact fields never create a tenant.
- **Nothing proves sends, payments or consent:**
  - Messages become `message_evidence` with `legacy-unverified`, or `simulated` in the demo tenant.
  - Simulator activity on a real contact is quarantined.
  - Simulated revenue is quarantined, never turned into `money_fact`.
  - Opportunities carry no value.
  - No consent, dispatch, receipt or usage rows are created.
- **Approvals and schedules:** every legacy approval becomes `expired`. Schedules are imported disabled.
- **People:**
  - Users become invitations only when the mapping gives a verified email and a consistent tenant and role.
  - Password hashes, TOTP secrets, recovery codes, sessions, remembered devices and the sign-in log are counted in
    the report and never stored.
- **Idempotent and reversible:**
  - IDs are deterministic per tenant and legacy id.
  - Inserts are `ON CONFLICT DO NOTHING`.
  - `migration.record_map` maps every imported row back to its legacy record, with a hash.
  - A second run with unchanged input inserts nothing and gives identical totals and content hashes.
  - A record that changed since import is refused, not overwritten.
- **Reconciliation:** every collection reports input = imported + quarantined + skipped, with reasons. Duplicates
  and dangling references are listed.

## Known limits, carried forward

- No tenant data is read by the API yet. M03 (OIDC) supplies verified subjects, and M04 moves screens and commands
  onto `withScope`.
- Cache keys, object-storage keys and socket rooms are not scoped yet (M04/M07/M09). Rows are.
- Outbox consumers keep their own cursor (the event id); a cursor table arrives with the first consumer (M07/M08).
- No real legacy data was provided, so the production import is gated (see MIGRATION-STATUS.md).
