# Existing code to target architecture
Suggested workspace layout; adapt paths to repository conventions without changing responsibilities.

| Existing source | Destination and treatment |
|---|---|
| src/main.ts, src/ui/* | apps/web App Router pages/components; preserve workflows and bilingual presentation, replace DOM mutation |
| src/scene/* | packages/city-scene R3F/drei components; preserve layouts/geometry/personas; fix lifecycle, labels and low-detail behavior |
| src/core/data/buildings.ts and related seed modules | packages/domain catalog + versioned seed migrations, stable legacy ids |
| src/core/types.ts | Domain DTOs plus explicit agency/tenant/workspace identities; schema migrations own storage |
| src/core/sim.ts | packages/demo only; extract pure useful business policies into domain; production operations become workflows and DB transactions |
| server/index.ts | Nest modules/controllers/resolvers/gateway; replace generic action switch with typed commands |
| server/auth.ts, server/totp.ts | Retirement after identity cutover; temporary local containment only |
| server/brain.ts | packages/llm and agent activities; scoped retrieval, cost reservation, immutable draft revisions |
| server/delivery.ts | packages/connectors + transactional dispatch ledger + signed receipts |
| JSON state/auth files | Read-only offline import with explicit mapping and quarantine; no production writer |
| .env globals | Validated deployment configuration plus tenant-scoped encrypted secrets; never put secrets in web bundles |
| README/SPEC/proposal page | Update against original source documents; distinguish current capability from roadmap |

## Data model before UI migration
Separate agency_id, tenant_id (client organization), workspace_id (team/rented floor), physical building_id/floor_id, memberships and scoped agent installations. A building is a map location, not a reliable security identity. A rented floor can belong to an independent client; sharing a building cannot grant access. Agency staff see only assigned tenants. Platform administration uses explicit audited support authorization, never implicit tenant bypass.

Model contacts/consent/suppression, CRM connections/external IDs, opportunities/stages, agent templates/versions/installations, runs, immutable draft revisions, approvals, dispatch attempts/receipts, scheduled content/assets, usage ledgers, subscriptions, audit events, durable outbox and cursors. All tenant-owned tables need RLS; platform catalog tables require explicit classification. Unique constraints and foreign keys must prevent cross-tenant references, including joins and imported external IDs. Application connections cannot be superuser/BYPASSRLS/table-owner bypass. Test pooled transaction context cleanup. Scope cache and object keys as well as rows.

## Identity and legacy-state import
No real state/auth data was attached. Do not invent it, contact owners or assume the ZIP's generated demos are real customers. Produce a dry-run importer accepting an explicit migration mapping file and read-only original copies.

1. Back up state/auth and uploaded objects outside the repository, fingerprint them and verify restore in isolation. Never commit private backups.
2. Validate exact schema version 2; reject corrupt/unknown formats without creating empty state or overwriting originals.
3. Preserve old IDs through legacy_id mapping, generate new globally unique keys with tenant/workspace ownership. Review duplicates and dangling references.
4. Import simulated data only into a demo tenant. Legacy real=true is insufficient evidence of consent, ownership, payment, delivery, CRM truth or factual revenue. Uncertain records go to quarantine with reasons. Import historical message evidence as legacy/unverified, not provider-delivered.
5. Map real contacts to verified client/workspace ownership. Rental contact fields do not constitute a tenancy model. Do not infer ownership just from building proximity or an agent name.
6. Expire every pending legacy approval and disable all outbound schedules during migration; create fresh immutable drafts and human review after reconciliation. Do not resume stale sends automatically.
7. Invite users through verified ownership/email mapping. Legacy users lack a reliable email field. Revoke sessions and remembered devices, re-enroll passkeys, and remove legacy auth endpoints after verified cutover.
8. Run an idempotent import twice, compare row totals and hashes, and generate a reviewed reconciliation report. Preserve a reversible mapping and quarantine export.

## Cutover
Keep old runtime isolated with outbound effects disabled while migration proceeds. Feature-flag the new routes and tenant rollout. Run import rehearsal, restore, RLS negative tests and acceptance. Freeze legacy writes, take final backup, import delta with explicit watermarks, reconcile, switch reads and then bounded writes. Only then authorize new live tenant workflows. Never run two production senders. Do not dual-write JSON and SQL as independent authorities.

Rollback before live sends can restore the snapshot and routing. After any external side effect, rollback must retain dispatch/receipt/usage history and reconcile with providers; restoring an old DB and replaying jobs risks duplicate messages/charges. Prefer forward repair and a send kill switch. Record the irreversible boundary explicitly.

## Preserve exact source inventory
15 buildings, 183 floors, 281 AI agents, 22 humans, 303 desks. Fast Sales has 32 AI agents and Elvis, not seven total. Its leadership floor has seven AI leaders; seven reusable proposal templates are a separate concept. Preserve existing building IDs: fast-sales, audi, honda, hyundai, genesis, acura, volkswagen, alfa-romeo, maserati, fiat, rc-new, rc-used, rental-1, rental-2, rental-3. Rental buildings begin empty. Do not seed all these demo entities into every paying tenant.

Use the detailed floor documents as the floor source; the proposal's illustrative desk diagram is not a directive to move Elvis/admin to the Amazon/books floor. Preserve the 21 named Rick Case associates plus Elvis as human desks, never impersonate them as autonomous AI senders.
