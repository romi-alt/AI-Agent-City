# Acceptance gates
Passing means evidence exists against the implemented system. Static analysis, unit fakes, provider sandbox and production evidence are different levels; label them. Failure of a critical tenant/isolation/send/data-loss gate blocks rollout.

## Migration acceptance (M10)
1. Clean lockfile install, all target packages typecheck/build; Next/React UI and R3F scene are actual owners, not wrappers of the old global app.
2. Nest REST AND GraphQL operate through shared authorization/services; OpenAPI and GraphQL schemas compile consumers.
3. Actual PostgreSQL RLS denies cross-tenant reads/writes/joins and cross-workspace rental-floor access with the production-equivalent database role. Pool scope cannot bleed.
4. Keycloak/selected OIDC handles SSO, passkeys and real email sign-in codes; step-up and device/session revocation work. No legacy credential/session migration shortcut.
5. Socket.IO room admission, replay/snapshot convergence and revocation pass; no global SSE or unrestricted full snapshots.
6. Temporal executions recover after worker/API restarts; no production Sim clock, random revenue/outcomes or memory-only reservations.
7. Shared foundations execute scoped real local slices: BM25+pgvector retrieval, S3 authorization, vault abstraction, Redis limits, gateway caps, Stripe test ledger and correlated telemetry.
8. Legacy importer is read-only against input, idempotent and reconciled; corruption cannot reset/overwrite source. Unowned/unverifiable facts are quarantined. Pending approvals expire; outbound defaults off.
9. Existing screen/route and named city/floor/desk inventory is preserved or deliberate deviations are documented. 2D works without WebGL, city supports reduced motion and fallback.
10. Full migration report distinguishes implemented/local verified/external blocked; no stub can satisfy a required layer.

## Corrected regressions from original audit
| Original check | Required corrected behavior |
|---|---|
| C01 inventory | Preserve 15 buildings /183 floors/281 AI/22 humans in legacy fixture, not auto-create as real tenants |
| C02/C03 fake money | Stage changes carry verified source value and never synthesize/double-count revenue |
| C04 mutable content | Approval bound to revision/assets/account/schedule; edits invalidate it |
| C05 late draft mutation | Dispatch bytes and recorded approved revision remain immutable |
| C06 lost busy state | Durable reservation survives restart and expires/cancels under explicit policy |
| C07 duplicate approval | Pending dispatch/approval prevents uncontrolled second draft/send for the same policy window |
| C08 trimming pending data | Retention never breaks live references or silently deletes pending work |
| C09 manual outbound | Explicit human authorization plus same dispatch-time policy and ledger |
| C10 cross-floor rental | Correct tenant/workspace ownership enforced independent of shared building |
| C11 failed send | Failed delivery does not increment successful outreach or fabricate contact progress |
| C12 fake publish | Published requires provider identity; metrics have fetched source/time |
| C13 stale recipient | Recipient change invalidates old authorization or requires explicit reviewed old recipient; never silent mismatch |
| C14 rental revenue | Availability/asking price are separate from invoice/collected payment facts |
| C15 accelerated time | Production uses real durable wall-clock schedules; demo clock cannot affect it |
| C16 remembered devices | Credential/reset/recovery events revoke relevant active sessions and remembered device access |

## Production workflow scenarios
- Two agents contend for one lead; only one permitted action is dispatched. Restart at draft, approval, provider submission and receipt boundaries. Handle timeout-after-acceptance through reconciliation, not blind retry.
- Approval expires, recipient/body/attachment changes, consent revoked, STOP received, reviewer loses membership or timezone crosses quiet hours before dispatch: stale authorization cannot send.
- Per-lead daily caps and tenant/model budgets hold under parallel workers; reservation release and billed actual usage reconcile after failures.
- Callback signatures fail closed; duplicate/out-of-order callbacks converge. Provider accepted, delivered, failed and unknown are distinct.
- Demo does not call LLM/payment/message/social providers. Report/test/manual endpoints share kill switch and policies.
- Tenant A cannot retrieve tenant B data through search, caches, exports, object URLs, GraphQL aliases/batching, sockets, API identifiers, job payloads or provider credentials.
- Offboarding rental occupant cancels access/jobs and rotates/removes credentials; the next occupant sees none of the prior occupant's records.
- Immutable audit can explain every side effect: actor, tenant, run/template/policy/model versions, source citations, approval, exact payload hash, connector request/receipt and usage. Replay for inspection cannot resend.

## Product and operations evidence
All 39 dealership/rental and 30 Fast Sales channel-category mappings plus all twelve social families have explicit capability tests. Industry templates and agency white-label work. Stripe test mode reconciles tiers/seats/allowances/metered overage and rentals; commercial ranges remain configurable. Every named connector is implemented with supported capability scope, sandbox procedures and honest verification status. Marketplace installation and partner SDK run against real local contracts.

Provide laptop/mobile performance environment and frame measurements, realtime latency, new-lead response measurements, accessibility/browser fallback, real backup restore and rolling-release tests. Under-one-day onboarding, 60fps, subsecond events, under-one-minute replies and zero downtime are targets requiring measured conditions, not static copy.

Export/deletion covers database, hybrid indexes, objects, caches and workflow/history policy; retained backups/legal holds are documented. Channel go-live requires per-client registrations/consent and sender-domain readiness. SOC2 readiness evidence is separate from independent certification.

## Business release gate
Refer to PROPOSAL-TRACEABILITY.md: 3 paying clients; then 1 agency/10 buildings; then 50 buildings/SOC2. Phase2 targets Type I readiness; Phase3 includes Type II audit. No automated test can fabricate paying-client or auditor evidence. Record the actual owner/status of each external requirement. The three beta-client names, final pricing/allowances and missing pilot exports are unresolved inputs, not permission to redesign the stack.
