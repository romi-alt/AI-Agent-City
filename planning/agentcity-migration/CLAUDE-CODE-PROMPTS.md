# Claude Code prompts for the existing AgentCity build

Copy this pack to planning/agentcity-migration/ in the existing repository. Paste one complete prompt at a time. Execute M00–M10 before P01–P10. M is stack migration; P is product completion. External blockers must be stated honestly.


---

# M00 — Baseline the existing project and contain unsafe effects

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Read the supplied source, audit and all project instructions before editing. Confirm current branch and git status; preserve uncommitted work. Create a safe migration branch/checkpoint without committing secrets or unrelated changes. Inspect actual package scripts, config, routes and source; do not assume the ZIP and this checkout are identical. Record differences against audit/source-manifest.json and record the real commit if available.

Install using the repository lockfile, run existing build/type checks and record actual output. If installation is blocked, retain the error and do not claim compilation passed. Run the supplied original-source characterization harness against an isolated copy where compatible. Capture current city/building/floor/desk, CRM, approval, content, reporting, settings and bilingual public-page behavior with screenshots where the app runs.

Implement a minimal containment patch in this existing runtime before structural migration: a server-side outbound kill switch enforced by every delivery path, including manual sends, reports and test email; safe default off. Prevent demo-mode provider calls. Remove identifying work/contact data from unauthenticated pulse responses. Render untrusted names as text rather than innerHTML. Make corrupt/unsupported state fail closed without overwriting originals. Do not attempt the whole migration here.

Create MIGRATION-STATUS.md, a route/screen inventory, external-effect inventory, source-to-target migration table and private-data backup/recovery runbook. Merge CLAUDE-MIGRATION.md carefully into existing instructions. Record the absent real snapshots/workflow exports as missing evidence; do not generate substitutes and call them imported.

## Required evidence

Verify outbound fake adapters receive zero calls from every disabled path; a malformed snapshot remains byte-identical after startup failure; malicious rental/person names render as literal text. Record baseline build results and any blockers. Finish with the exact next stage and a compact diff summary. Do not scaffold a replacement application in this stage.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# M01 — Create the proposal workspace around the current build

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

After M00, introduce apps/web (Next/React), apps/api (Nest), apps/worker (Temporal) and packages/domain, contracts, city-scene, connectors, llm, knowledge and demo as appropriate. Preserve the legacy app in an isolated location or runnable script while porting; do not delete working code prematurely. Choose one workspace/package manager and a pinned compatible toolchain, retaining reproducible locks.

Add local Docker Compose for PostgreSQL/pgvector and verified BM25 support, Redis, S3-compatible MinIO, Temporal and Keycloak; use local-only development credentials and environment validation. Add health checks, readiness and documented startup/shutdown commands. Choose actual compatible database extension images rather than nonexistent tags. Establish migrations, test fixtures, shared formatting/type checks, separate browser/server imports, and CI build jobs.

Do not claim business features complete because service folders exist. Add a real web→API health request and a real worker activity round trip; no production sends. Record architecture choices and port/secret boundaries.

## Required evidence

A fresh checkout installs from lockfile; documented local startup reaches healthy services; web/API/worker build; API readiness fails when required storage is unavailable. Prove one workflow survives worker restart. If Docker is unavailable, provide configurations and mark runtime smoke checks blocked.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# M02 — Replace global JSON authority with scoped PostgreSQL data

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Implement the domain model and RLS requirements in MIGRATION-MAP.md. Explicitly model agency, client tenant, workspace, physical district/building/floor/desk, assignments and agent installations. Separate rental placement from security ownership. Classify shared catalog tables and apply tenant scope to every tenant-owned table, join, unique key and reference.

Use transaction-local authenticated scope and non-bypass application roles. Implement durable audit/outbox tables and immutable money/usage/dispatch facts. Keep demo fixture data in a marked isolated tenant. Preserve stable building IDs through alias mapping.

Build the read-only version-2 legacy dry-run/import pipeline: explicit ownership mapping, validation, quarantine, duplicate/dangling-reference report, imported provenance, deterministic IDs, idempotent re-run and reconciliation counts. Never derive verified payments, consent or receipts from simulated state. Expire old approvals and keep schedules disabled. Real state/auth were not uploaded; test with clearly labeled fixtures and document the missing production-input gate.

## Required evidence

Run DB-level cross-tenant SELECT/INSERT/UPDATE/DELETE/join/search tests using the real application role. Test a client on rental L1 against L2; same-building access must fail. Test pooled connection reuse and forged scope. Import twice with unchanged totals, reject unknown schema without writes, and demonstrate backup restore. Foreign keys must reject cross-tenant associations.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# M03 — Replace custom authentication with proposal identity

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Configure OIDC with the selected Keycloak default, using authorization code + PKCE where appropriate and secure server sessions. Validate issuer/audience/signature/expiry, CSRF and logout. Implement agency owner/staff/client admin/viewer authorization and explicit client/workspace assignments. Add agency SSO, passkeys, passwordless email sign-in codes and step-up for credential/billing/permission changes; verify actual IdP capabilities rather than equating TOTP or verification email with email codes.

Implement device/session visibility, revocation and reauthentication policy, including socket disconnection and worker permissions where relevant. Device binding must be a concrete security design, not a user-agent string check. Treat 48-hour sign-in links and the separate 48-hour shadow mode as different requirements where carrying over pilot behavior.

Provide verified-email invitation/migration mapping because legacy users have no reliable email field. Never import password hashes, TOTP secrets, old sessions or remembered-device tokens. Retire old endpoints only after new access and break-glass procedures are tested. Keep development login shortcuts impossible in production.

## Required evidence

Test wrong issuer/audience, expired tokens, login/logout, replay/expired invitation, passkey and email-code flows, step-up denial, revoked device, member role changes and tenant switching. A revoked user loses HTTP and socket access. Any unavailable IdP capability remains an explicit release blocker with a concrete resolution plan.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# M04 — Port all API behavior to Nest REST and GraphQL

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Replace the standalone Express action switch with Nest domain modules, typed controllers, services and GraphQL resolvers. Nest may use its supported Express adapter internally. Both REST and GraphQL are required. Generate OpenAPI and a versioned GraphQL schema; generate typed clients and validate inputs/outputs.

Port contacts/CRM views, agent installations/runs, approvals/draft revisions, content/calendar, reports, rentals/occupancy, tenancy/memberships, settings and integration status through shared authorization/domain services. Public aggregate routes must contain no private contact/work data. Eliminate entire-global-state endpoints. Use scoped pagination, rate limits, optimistic concurrency, structured error codes and request IDs. Return honest queued/accepted/delivered states.

Add immutable draft/approval primitives now: revision hash includes body, subject, recipient, channel, attachment versions and policy context. Editing creates a new revision and invalidates approval. Do not authorize by caller-provided tenant IDs alone. No provider SDK may be invoked directly by a controller.

## Required evidence

Contract tests cover REST and GraphQL for the same permission decisions, invalid inputs, cross-tenant object IDs and stale revision conflicts. Verify GraphQL resolver/batching paths cannot bypass RLS or authorization. OpenAPI/schema generation and client compilation succeed. Inventory parity identifies every original route as migrated, intentionally retired or blocked.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# M05 — Port the existing interface to Next and React

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Rebuild existing screens as typed React components and Next routes backed by new API clients: city navigation, building/floor/desk inspectors, CRM list/kanban/contact drawer, approvals, content/calendar, reports, rentals, settings/admin and login. Preserve useful UX and English/Spanish presentation, exact names and stable IDs. Do not replace everything with a generic SaaS dashboard.

Create tenant/workspace selection and role-based navigation without exposing unauthorized records in HTML, caches or server rendering. Use secure client/server boundaries and accessible keyboard/focus behavior. Add loading, empty, error and reconnect states. Render user/LLM text safely. Keep the 2D dashboard independent of WebGL so it works when canvas initialization fails.

Port the public proposal presentation but mark roadmap claims accurately and reconcile pricing to original proposal defaults; do not present GHL/social/billing as connected before verified. Display real delivery/approval states and distinguish simulated fixtures unmistakably. Keep an explicit demo route with no access to production credentials.

## Required evidence

Run route/browser tests on mobile and desktop, role and tenant transitions, SSR/cache isolation, invalid user text, keyboard navigation and WebGL-disabled 2D operation. Compare captured baseline workflows and document deliberate changes. Production UI contains no random success/metrics and no provider secrets.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# M06 — Migrate the actual city to R3F and drei

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Port scene/city/building/office/avatar ownership to declarative R3F components with drei, preserving source layouts, palette, recognizable human/AI desks and map IDs. Extract reusable pure geometry helpers where valuable; do not wrap the existing imperative Engine in a useEffect and call migration complete.

Implement city→district→building→floor→desk navigation with permission-scoped entities, activity-driven windows, red intervention beacons per building, and lead/message/booking traffic driven by authorized domain events. The existing gold decorative beacon is not the required intervention signal. Animation reflects actual run status and stops or reduces under reduced-motion settings.

Use instancing and LOD for repeated geometry and test Draco/KTX2 loader pipeline with a small licensed fixture if current geometry is procedural. Dispose geometry/materials/textures and event subscriptions; bound caches. Provide quality tiers, optional city view, automatic degradation and independent 2D fallback. Avoid DOM HTML interpolation of agent/client names.

## Required evidence

Measure representative hundreds-of-buildings fixture performance with hardware, viewport, entity count and frame percentiles recorded; target 60fps laptop without claiming universality. Test mobile/low detail, repeated navigation memory, no-WebGL, context loss, reduced motion, authorized drilldown and beacon acknowledgment. Decorative activity must never be reported as real work.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# M07 — Replace global SSE with recoverable tenant realtime

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Implement a Nest Socket.IO gateway with authenticated subscriptions and server-resolved tenant/workspace authorization. Design rooms for authorized scopes, never auto-join arbitrary room IDs supplied by clients. Revalidate revocation, expiry and membership changes; avoid stale permission recovery.

Publish committed outbox events with monotonic scoped cursors/versions, tenant-safe payloads, event schema versions and correlation IDs. On reconnect reconcile snapshot+cursor, replay available events and refetch on gap/retention expiry. Handle duplicate/out-of-order messages and races between snapshot and subscription. Verify chosen Redis adapter capabilities; socket recovery alone is not a durable event log.

Replace SSE consumers in React/R3F. Coalesce visual updates without losing authoritative state. Apply backpressure and redact sensitive activity from city summaries. Instrument commit-to-client latency with a target under one second under documented load.

## Required evidence

Two tenants and two rental-floor clients receive only authorized events. Test disconnect during updates, server restart, duplicate/out-of-order delivery, missing cursor history, revoked/expired sessions and horizontal API instances. Snapshot convergence is required after every recovery path. Remove global SSE from production routing.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# M08 — Replace the simulator with durable workflows

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Extract business operations from Sim into Temporal workflows and activity services. Workflow code must be deterministic; clocks, randomness, providers and DB I/O belong in appropriate Temporal primitives/activities. Version templates/workflows safely for existing executions. Persist scheduling, retries, approval waits and durable lead/channel reservations.

Implement workflow sequence: read authorized CRM/context→retrieve knowledge→draft revision→policy→approval when required→dispatch ledger→connector→receipt reconciliation→facts/outbox. Use atomic dispatch claims, stable idempotency keys and bounded retry/backoff. A provider timeout after possible acceptance must reconcile before retry; do not promise exactly-once effects when a provider lacks idempotency.

Freeze approved payloads and recheck recipient, consent, DND, timezone quiet hours and caps immediately before dispatch. Cancel/invalidate on edits, role revocation, stale context or policy change. Manual human sends may use an explicit logged human authorization instead of a second queue, but must obey all sending policies. Failed sends cannot advance contacted stage or inflate outreach. Real opportunity money comes only from verified CRM/payment facts. Remove production Sim ticks/random outcomes; demo remains isolated.

## Required evidence

Turn C02–C15 into corrected regression tests: immutable in-flight bytes, no stale approval, no lost locks/restart duplicates, pending records never truncated, rental isolation, no random revenue/publication and honest failed-send states. Kill workers at dispatch boundaries and prove restart reconciliation. Test DST/quiet hours, STOP racing approval, caps under concurrency, delayed webhook and manual/report/test paths.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# M09 — Complete functional foundations of the remaining stack

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Implement thin working infrastructure slices, not empty scaffolds: tenant credential vault/key references and rotation; S3 uploads/download authorization; LLM gateway adapter contracts with per-tenant spend reservation/cache keys; PostgreSQL pgvector plus actual BM25 retrieval and fusion; signed Stripe test webhook/usage ledger; OpenTelemetry traces to Grafana-compatible stack and redacted Sentry errors.

Each slice must execute a meaningful local/test-mode request through API/worker/data boundaries. Use deterministic fakes for external contracts when credentials are absent, clearly label them, and provide opt-in sandbox integration commands. Implement Redis distributed rate limits without treating it as authoritative billing or workflow history.

Trace a run through request, workflow, retrieval, model, approval and dispatch with model/version, cost and citation provenance. Separate secret storage, PII and operational logging. Record cost units and monetary precision, tenant cache scope and retention. Business completeness is delivered in P stages; foundations must already enforce tenancy.

## Required evidence

Test cross-tenant object/search/cache/secret denial, real DB hybrid retrieval ranking, gateway cap races, duplicate Stripe events and trace correlation/redaction. Show one end-to-end functional test per foundation. Missing external sandboxes are explicit blockers for provider certification, not reasons to simulate a successful live integration.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# M10 — Prove the existing product has migrated

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Audit TARGET-STACK row by row and original screen/route inventory. Ensure active production paths use Next/React/R3F, Nest REST+GraphQL, Socket.IO, Temporal, OIDC and PostgreSQL RLS. Shared platform slices from M09 must work. No production authority remains in JSON, custom auth, global SSE, Sim ticks, in-memory approval queues or global provider credentials. An isolated legacy demo is acceptable and visibly labeled.

Run fresh setup, migration/import rehearsal, rollback/restore, CI builds, tenant/role matrix and browser journeys from city to real DB-backed contact, draft, approval and fake/sandbox receipt. Compare seed inventory and preserve deliberate business mappings. Confirm package boundaries prevent browser imports of server SDKs/secrets.

Produce a migration acceptance report with evidence for each requirement and classify complete/local-only/external-blocked/failed. Do not label the whole proposal finished: external integrations and product breadth continue in P01–P10. Update documentation and remove obsolete production routes only after parity evidence. Do not enable outbound production traffic.

## Required evidence

All local stack and isolation gates pass; blocked provider/account verification is explicitly listed. Fail migration acceptance on wrong stack, unsafe data migration, mutable approvals or demo facts in real accounts. Keep unfinished dependent work blocked and give the exact repair list before proceeding to feature rollout.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# P01 — Build the real GoHighLevel connector and synchronization

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Implement GHL through the connector SDK using tenant-scoped OAuth/private tokens as supported by current official documentation. Import actual contacts, conversations, pipelines/stages, appointments and opportunity values with explicit external IDs and scoped cursors. Legacy name-matched stages need reviewed mappings; names alone are not stable identity.

Support initial backfill, pagination, incremental sync, webhook signature/auth verification as available, deduplication, token rotation, rate-limit backoff, missing-scope alerts and conflict reconciliation. Route outbound through the dispatch ledger. Ground drafts in latest conversation and suppression state, and block double-texting across agents. Clearly separate CRM stage/value from recognized revenue and provider acceptance from delivery.

Expose connection health, last successful sync and actionable errors. If the proposal's existing n8n workflows/871 chunks are not provided, create import tools and list them as missing artifacts; do not claim the supplied simulator contains them.

## Required evidence

Use fixtures plus opt-in sandbox contract tests for create/update/reply/suppression, repeated webhook, pagination interruption, renamed stages, token revocation and rate limiting. Prove two tenants cannot reuse credentials or external identifiers. Measure new-lead response target under one minute in a consented sandbox without guaranteeing external latency.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# P02 — Complete grounded tenant knowledge and model routing

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Implement website/PDF/FAQ ingestion with fetch limits, SSRF protection, file validation, source versioning, tenant ownership, chunking, embedding, reindex and deletion. Preserve source/page/span references; ingest the real 871-chunk pilot only if actually supplied. Build genuine BM25+vector hybrid retrieval with tested tenant filters and score fusion, not an invented BM25 label.

Finish OpenAI, Anthropic and configurable open-model adapters behind the gateway, task routing, model availability validation, cache isolation, token/cost accounting, reservation/reconciliation, budget caps and bounded retries. Use actual documented model identifiers available to the configured account. Retrieved content is untrusted input and cannot override tool or tenant policies.

Answers include supported citations or an explicit insufficient-evidence response. Build evaluations from source documents, contradictions, stale versions and adversarial cross-tenant content; allow reproducible replay with redacted data and pinned versions. Do not send private corpus to an unapproved provider.

## Required evidence

Evaluate citation correctness, retrieval recall, abstention, stale-document deletion, prompt injection, tenant leakage and concurrent cap enforcement. Verify one configured provider in sandbox when credentials exist; report others separately as adapter-tested or externally blocked. Logs omit secrets and raw sensitive prompts by default.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# P03 — Implement the complete agent catalog and business task matrix

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Read every detailed task/floor/people document in references, not just the proposal's seven-role summary. Create a task-by-task coverage matrix with owner, trigger, required CRM/knowledge fields, tools, policy, approval, output, source location and acceptance test. Cover CEO reporting, closer, follow-up, content, ads, students and dealers as versioned reusable templates, plus detailed Fast Sales floors, dealership operations and named Rick Case desks.

Implement catalog hire/configure/version/upgrade/pause/retire, tone/hours, run inspection and durable schedules. Map template versions to installations without replacing all old running workflow behavior. Humans remain human assignments. Templates must not invent offers, due dates, financing, gifts or lease facts from the original canned strings.

Build daily/weekly CEO, sales, student and dealership reporting from verified events with timezones, period boundaries, attribution and drilldown. Distinguish booked value, collected money, recurring subscriptions and forecast. Include report delivery in the same approval/policy/receipt infrastructure. Expose run-level audit/replay without resending side effects.

## Required evidence

Every source task has a passing test or a specific external prerequisite; no silent omissions. Validate conversation context before drafting, no double text, sensitive escalation, lifecycle cancellation, factual offer fields and report reconciliation. Seven reusable leaders must coexist with the preserved larger desk inventory without confusing seats with humans or templates.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# P04 — Implement all twelve social-agent capabilities

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Build all twelve categories in TASKS FOR SOCIAL MEDIA AGENTS: strategy, 30-day calendar, platform-specific creation, real branded graphics/video production, multi-platform publishing, community monitoring/replies/escalation, lead campaigns, trend monitoring, public competitor analysis, performance analytics, optimization and weekly reports.

Integrate approved creative tools with durable generation jobs, object assets, brand presets, provenance and failed/retry states; a creative brief is not an image/video. Create capability-aware adapters for Facebook, Instagram, LinkedIn, TikTok and YouTube; verify supported account types/scopes and review restrictions through current official docs. Unsupported/unapproved capabilities remain disabled with specific requirements. Use actual authorized public/connected data for trends/competitors and actual platform measurements for metrics.

Tie approval to exact caption, asset hashes, account, audience, schedule and spend where applicable. Editing scheduled/published content creates a revision and reapproval workflow. Scheduling uses durable timezone-aware jobs; publish completion requires provider identifiers and reconciliation. Community replies and ad launches use risk and budget policies. Include campaign attribution and real conversion definitions.

## Required evidence

Tests cover generated asset availability, expired tokens, duplicate publish retry, uncertain provider acceptance, edit-after-approval, DST, sensitive comment escalation and metric provenance. No fake reach/likes/comments, canned trends presented as live, or log-only ad launch. Document each platform's locally tested and externally verified capabilities separately.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# P05 — Complete agency controls and client onboarding

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Implement agency owner/staff assignments, district/client management, brand logos/colors/custom domains, tenant-safe theme routing, industry templates (training, auto, real estate, home services, clinics), agent catalog and approval configuration. Clients see the agency brand; custom domains require verified ownership and safe host resolution.

Implement onboarding: industry→CRM connection→knowledge upload→agent/tone/hours/rules→48-hour shadow→reviewed activation. Shadow creates drafts and human reviews but no external sends, publishing or charges caused by agents. Use persisted wall-clock time; it is separate from sign-in link expiry. Go-live also requires channel readiness and explicit authorized activation, not simply elapsed time.

Implement 36 rental-floor occupancy/availability from the three supplied rental buildings, explicit client/workspace assignment, durable allocation and concurrency-safe vacancy. Reconcile rental $199 offering versus Pro $199 plan through configurable product mapping—same price is not proof of identical entitlements. Vacancy must archive/cancel scoped work and revoke access without deleting legal/audit history or leaking to the next occupant.

## Required evidence

Test agency A versus B and assigned/unassigned staff; custom host spoofing; all industry defaults; paused/restarted shadow clock; no provider calls during shadow; simultaneous floor booking; floor turnover with old content/jobs/credentials and clients on adjacent floors. Measure onboarding effort with real beta evidence rather than hardcoding an under-one-day success claim.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# P06 — Implement proposal pricing and auditable billing

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Configure versioned products/prices: Starter $79 (2 agents,1 CRM,1 user), Pro $199 (4 agents,KB,5 users), Full Building $399–799 (7+ agents,approvals,reports,15 users), Agency $999 platform plus wholesale buildings. Preserve range/wholesale terms as configurable validated commercial choices; do not invent final rates, overage allowances or unlimited agent counts. Distinguish billable AI installations, users, human desks and map decorations.

Implement Stripe test-mode subscriptions, seats, entitlements, upgrades/downgrades/proration, cancellation, trials if approved, invoicing and metered AI usage with allowance/overage units. Use signed deduplicated webhook processing and out-of-order reconciliation, durable usage event IDs and provider-cost versus billable-usage separation. Configure rental subscriptions explicitly through P05 mapping.

Enforce entitlements server-side and in workflows, prevent race-condition over-allocation, and define grace/read-only behavior. Never count asking rent or simulated outcomes as collected revenue. Reconcile invoices/payments/refunds and expose customer portal plus audited billing changes with step-up.

## Required evidence

Stripe test cases cover duplicate/out-of-order webhooks, payment failure/recovery, downgrade below current seats, late usage, refund, cancellation, multi-building wholesale and simultaneous hires. Usage totals reconcile to ledger without double charges. No live subscription or charge is created; unknown commercial values remain configuration blockers.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# P07 — Complete the promised integration catalog

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Implement and document connector SDK contracts for authorization, capabilities, secret references, pagination, schema mapping, webhooks, rate limits, retries, idempotency and external-reference reconciliation. Finish HubSpot and Salesforce CRM adapters, Twilio communications, SendGrid email, Google relevant services and Meta Ads, while maintaining GHL. Specify exact Google capabilities required by source tasks rather than claiming all Google products work.

Keep n8n for custom client flows through scoped authenticated triggers/callbacks and service identities. Provide versioned example exports, import documentation, secret references and a registry. n8n must not bypass consent/approvals, tenant boundaries, spend caps or audit ledger; generic webhook success does not mean a task completed.

Build the integration settings/health UI with required scopes, consent/account readiness, retry/reconnect and per-capability status. Finish real ad budget/launch/measurement and email domain verification readiness. Route telephony capability honestly; a human call log is not actual calling. Inspect existing SDK contracts before adding provider-specific shortcuts.

## Required evidence

For every provider, deliver fixture contract tests, signed webhook negative tests and opt-in sandbox smoke procedures with exact expected provider IDs. Exercise revocation, missing scope, rate limit, duplicate callback and cross-tenant credential denial. Distinguish implementation complete from provider-app approval/sandbox/live verification; never show connected based only on a saved token.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# P08 — Deliver the proposal marketplace and partner surface

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Create a versioned agent/integration marketplace with publisher metadata, capabilities, required scopes, pricing/entitlement metadata, tenant install/configure/upgrade/pin/uninstall and review provenance. Reuse agent/connector registries rather than creating a second runtime. Avoid unrestricted execution of uploaded code: define a capability-limited trusted publication model; if third-party code execution is added it requires a separately reviewed isolation design.

Implement partner API/SDK from Nest contracts with scoped client identities, rate limits, idempotency and tenant-limited webhooks with signing/rotation/replay protection. Provide a working sample integration and documented version/deprecation policy. Marketplace installations cannot obtain another tenant's secrets or broaden permissions automatically on update.

Support agencies sharing approved templates without exposing customer datasets, prompts containing secrets or conversation history. Commercial marketplace settlement details absent from sources must remain explicit business decisions, not invented financial rules.

## Required evidence

Test malicious capability escalation, upgrade rollback, stale versions, unauthorized publisher access, uninstall with running workflows and partner token revocation. Compile/run generated SDK sample against local API; verify signed webhook delivery/retry and OpenAPI/GraphQL parity. Record any external publisher/partner acceptance gate.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# P09 — Prepare repeatable deployment and operational controls

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Finish production Docker images, Kubernetes manifests (or documented proposal-permitted Fly initial target), Terraform modules and GitHub Actions for staged environments. Include secret injection, private services, least privilege, health/readiness, resource limits, autoscaling, durable backups/restore, migrations compatible with rolling app versions, per-tenant feature flags and rollback. Never commit credentials or deploy to production during this task.

Complete OpenTelemetry dashboards/alerts in Grafana and Sentry redaction, correlated per-run model traces, cost/queue/send/receipt/latency alerts, audit access controls and retention. Implement per-contact export/deletion across Postgres, vectors/BM25, objects, caches, workflow payload handling and configured connector obligations; explain retention/legal holds and backup expiry. Deletion cannot leave retrievable embeddings or silently promise erasure from immutable backups.

Add channel readiness controls for consent, opt-out, A2P10DLC, sender domains SPF/DKIM/DMARC, DND and quiet hours. Produce SOC2 Type I readiness evidence organization by end Phase2 and Type II operational evidence plan afterward; do not claim certification from code.

## Required evidence

Run local/staging deployment smoke, rolling compatibility, restore drill, failover/restart and scoped feature rollout. Verify secret/PII redaction, export completeness, deletion search disappearance and audit access. Demonstrate zero-downtime behavior under an actual rolling test before claiming it. External DNS, registrations, auditors and infrastructure provisioning remain clearly assigned gates.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.


---

# P10 — Audit proposal completeness and prepare beta release

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Read every original source and PROPOSAL-TRACEABILITY.md; update the matrix with exact code paths, test results, screenshots/provider IDs, limitations and owners. Evaluate all ACCEPTANCE.md gates and prior stage blockers. Do not equate installed packages, UI cards, fixtures or mock adapters with finished functionality.

Run complete three-tenant beta journeys using isolated authorized test data: agency setup, client onboarding, shadow review, role/tenant access, grounded new-lead response, approval, receipt, CRM update, report, content asset/publishing, rental turnover and test billing. Include accessibility, mobile fallback, performance measurements, backup restore and incident drills. Check all detailed agent/social tasks and exact named building/floor mappings.

Produce a staged launch runbook, operations guide, tenant activation checklist, known limitations and evidence-based go/no-go. Re-read source roadmap diagrams for business/revenue gates and record measured evidence, not invented targets. Three beta clients, validated pricing, channel registrations, phase-gate paying-client outcomes and SOC2 audit outcomes require real external evidence. A completed codebase cannot declare those gates passed by itself.

Keep outbound off for any tenant lacking prerequisites. Prepare deployment and activation steps but do not execute live sends, charges or production rollout. Finish with an honest full-proposal status and only genuinely unresolved decisions.

## Required evidence

All local tests/builds pass and every requirement has evidence or an explicit blocker. Exercise tenant isolation across API/GraphQL/DB/search/cache/socket/workflow/object/connector boundaries. No open critical safety/data-loss issue, random business facts, mutable approved payloads or unverifiable success claims. Phase progression is blocked if its actual business gate is unmet.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
