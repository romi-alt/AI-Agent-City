# Detailed audit of the current Sales City build

Prepared 27 October 2026. Scope: the supplied ZIP, uploaded build review and original AgentCity proposal/task files. File and line references below refer to the uploaded ZIP, not a future branch. The review identifies commit 8250c96, but the archive has no .git history to verify that identity.

## Executive assessment

This is a substantial interactive prototype with useful city geometry, exact floor layouts, CRM screens, review queues, social calendars and reporting concepts. Its business engine is a stochastic simulator embedded in a single Express process. Real delivery hooks were attached to that simulator, so replacing frameworks alone would preserve important correctness problems.

The right migration is an incremental replacement inside the existing repository: preserve the visual and interaction design, extract reusable catalogs and pure geometry, replace the authoritative data/runtime/security layers, and explicitly separate demo behavior from live business operations. Do not keep standalone Express routes, Vite, JSON files and timers as the final architecture; Nest’s supported Express adapter remains permitted. Do not discard the existing UI and start an unrelated generic SaaS dashboard.

## What is actually present

- Vite entrypoints: index.html and proposal.html; imperative TypeScript/HTML UI, no React or Next.js.
- Plain Three.js renderer, OrbitControls, CSS2D labels and generated canvas textures. No React Three Fiber/drei, instancing, LOD or compressed asset pipeline.
- Express routes in server/index.ts; one global Sim instance, one global AuthStore and a shared SSE stream.
- Snapshot version 2 in data/state.json; auth/session/device records in data/auth.json. Saves every 30 seconds; ordinary business mutations return before a durable save.
- Custom password/TOTP/recovery/device authentication with admin/member roles.
- Optional Anthropic drafting via server/brain.ts; global in-memory queue, two concurrent calls and nominal hourly draft cap. No scoped knowledge retrieval or token-cost ledger.
- SMTP and Twilio submission hooks. No live provider receipts, durable outbox, CRM synchronization or provider account scoping.
- No PostgreSQL, pgvector, Redis, Temporal, OIDC provider, Stripe, tenant vault, container/deployment manifests, OpenTelemetry/Grafana/Sentry integration or saved automated tests in the source ZIP.

The current package manifest and lockfile root agree. Their versions and Anthropic model/beta strings must be checked against current provider documentation and the actual development environment; this audit did not verify that those remote packages or model IDs are available. A failed offline install is an environment limitation, not proof of invalid dependency versions.

## Exact generated inventory

The original buildCity function produces 15 buildings, 183 floors, 281 AI desks and 22 human desks, total 303 desks. Fast Sales has 32 AI plus Elvis (33 desks), of which its L12 leadership group has seven AI and one human. Each of nine dealership buildings has 23 AI desks. New-car associates have 30 AI plus 15 humans; used-car associates have 12 AI plus six humans. Rental buildings initially have no agents and add two per rented floor.

The original floor documents name 21 salespeople; Elvis is an additional leadership character from this implementation. The seven named leadership AI agents are Max, Vera, Nico, Luna, Teo, Iris and Dante. Seven core agent templates and many instantiated desks are compatible concepts. The proposal does not prescribe the current 281-instance staffing arrangement or authorize buying 281 subscriptions.

Existing stable building IDs must be preserved or explicitly mapped: fast-sales, audi, honda, hyundai, genesis, acura, volkswagen, alfa-romeo, maserati, fiat, rc-new, rc-used, rental-1, rental-2 and rental-3. The earlier starter used different IDs for several templates; do not import it over these records.

## Findings that affect migration order

### F01 Shared client data and authorization boundary — critical

server/index.ts:251 returns sim.snapshot() plus all people to every signed-in user. Lines 43–54 broadcast each patch to every eligible session. Lines 290–327 authorize actions only by signedIn; approve, approveAll, rent, vacate, lead edits, sends and content changes have no tenant/workspace permission checks. The Tenant interface at src/core/types.ts:45 is just a rental contact card without an ID or membership model.

Migration: introduce authenticated agency/client memberships, scoped workspaces, tenant-aware foreign keys and PostgreSQL RLS before permitting multiple real clients. Authorize REST, GraphQL, workers, storage, retrieval and sockets consistently. A floor is a visual placement, not a security boundary.

### F02 Rental and departmental ownership is not enforced — critical

src/core/sim.ts:325 filters leads by building. Its floor preference applies only to training and falls back to another floor if no own-floor lead exists. Rental agents use the entire rental building's lead pool. vacateFloor removes agents and their approvals but leaves leads/messages/content in the same building, with reused agent IDs on a subsequent rental.

Reproduced: an L1 rental agent selected an L2 contact (C10). New tenant occupancy must not inherit previous customer data. Separate Tenant, Workspace, SceneFloor and Lease/Placement; preserve historical ownership and create explicit migration mappings. Same-tenant departments also need grants rather than best-effort preference filters.

### F03 Simulation clock controls potentially real work — critical

server/index.ts:64–75 ticks the simulator; src/core/sim.ts:35 defines two business minutes per tick and defaults speed to 1. A 24-hour city day takes 12 real minutes at that default. The same clock drives prospect/customer cooldowns, approval release, reports and social scheduling. Turning deliveryMode to live does not disable acceleration or synthetic lead/metric generation.

C15 confirms 30 ticks advance 60 business minutes. Separate demo clock/randomness from wall-clock durable production schedules. Do not import simulated timestamps as verified real-world business timestamps.

### F04 Reservations do not reliably prevent duplicate outreach — critical

The busy Set at src/core/sim.ts:346 is absent from snapshot() and is not reconstructed in the constructor. Restored agents keep current tasks without reservations (C06). unblock at 650–663 releases a real-lead task after an hour while keeping its approval; touchedAt does not change, allowing another pending draft for that contact (C07). Manual send does not consult busy at all.

Migration: database-backed contact/intent concurrency control, unique business action keys, durable approval waits, cancellation and revalidation across all send paths. Temporal retry alone does not guarantee one external effect.

### F05 Approval is mutable and not a durable authorization record — high

resolve at src/core/sim.ts:757 removes the approval record immediately and has no decision-history table, revision hash or expiry. updateMessageDraft at 938 accepts any pending message, including an approved in-flight send; the recorded subject/body can diverge from what the sender submitted (C05). updateContent at 947 changes scheduled and even published content without invalidating approval (C04). The UI disables published editing, but the server method does not.

C13 also shows that changing a lead's address leaves an old queued recipient valid without renewed review. Bind approval to exact content revision, recipient/account, tool action and policy version. Recheck before dispatch. Failed or rejected drafts remain auditable; an edit produces a new revision.

### F06 No single reliable outbound boundary — critical

server/delivery.ts submits provider requests immediately from callbacks. Provider acceptance is called sent, Twilio response IDs are discarded, and there is no stable intent, delivery receipt, timeout reconciliation or idempotency ledger. SMTP/Twilio credentials are global environment settings. Consent, DND, STOP handling, quiet hours and daily caps are absent.

sendManual at sim.ts:916 invokes delivery without a separate queued approval (C09): a human pressing Send can be a legitimate approval action, but it contradicts a blanket claim that every send enters the OK queue and must still enforce role/channel policy. Reports send automatically when configured/live. The admin test-email route calls sendTestEmail independently of deliveryMode. Migration must cover manual sends, AI sends, test email, reports, social replies and connector callbacks—not only agent approval UI.

### F07 Counters and pipeline status overstate delivery — high

resolve at sim.ts:788–793 counts outreach, touches the contact and advances its first stage even when the sender fails (C11). UI submit handlers in src/ui/app.ts display Sent or Reply sent immediately after a local action response. Phone actions log user-declared calls; there is no phone provider or verified call event.

Use distinct reviewed, queued, attempted, accepted, delivered, failed, unknown and manually reported outcomes. Preserve a phone call note as a human-entered activity rather than an executed AI call. Do not advance pipeline status solely because an approval button was clicked.

### F08 Revenue and sales counts are not reliable business metrics — high

setStage at sim.ts:419–435 creates random $1,500–$4,000 dealership revenue and fixed $997 training revenue without checking real. C02/C03 reproduce this for manually entered real leads. Re-entering Sold counts a second closing/revenue event. kpis at 1039–1040 adds rental monthly asking prices to revenueMonth without a payment event (C14).

Keep observed stage transitions, actual confirmed revenue and projected rental recurring value separate. Imported generated revenue is demo/unverified data and must not become an invoice or recognized revenue. Store source IDs and deduplicate real conversions.

### F09 Social features are simulation, not provider execution — high

finishSocial at sim.ts:485 creates a text brief and marks it asset-ready; no graphic/video file is generated. publish at 563–573 marks content published and fabricates reach/impressions/engagement/clicks (C12). hourly grows those metrics randomly and invents inbound comments. Trends/competitor/optimization insights are selected from hard-coded strings. Ads approval logs Launched test without an advertising API call. Follower/conversion metrics are listed in tasks but absent from the Metrics interface.

Preserve the social UI and task catalog. Replace fake success with real assets, account connections, revision approvals, provider publication IDs, reconciled results and source-backed analysis. Until connected, label the capability unconfigured or demo. Do not claim a text creative brief fulfills video production.

### F10 Data loss and retention break review history — high

server/index.ts:26–34 starts a new city on an unrecognized snapshot version or read failure. The periodic saver can later replace the old file. Graceful signal saving exists, but does not protect against crashes or abrupt kills. sim.ts:999 trims messages to 300 including pending real messages; C08 reproduces an approval referencing a deleted message. Lead history is capped at 15, reports at 60 and sign-in log at 500.

Migration imports must reject unknown versions into a quarantine report, never silently reset. Back up original files and hash exports; keep unresolved pending activity for human reconciliation. Use explicit retention rules and audit history rather than arbitrary array trimming.

### F11 SSE reconnect and authorization freshness are incomplete — high

src/api.ts stream() reconnects but has no event ID/cursor or snapshot refresh after gaps. Server broadcasts carry no replay ID. Broadcast checks map membership and lock/stage, but does not call auth.session() to evaluate session expiry. An already-open stream can outlive expiry until a separate request removes its session. No per-client channel exists.

Replace with authorized Socket.IO channels, event IDs, aggregate versions, persisted replay/snapshot recovery, periodic expiry/revocation checks and bounded payloads. Realtime authorization must be enforced server-side, not by hiding buildings after receiving their data.

### F12 Custom identity is useful prototype work, not the target provider — high

The authentication implements scrypt password hashes, TOTP anti-replay, hashed recovery/session/device tokens and restrictive cookies. It is more substantial than a dummy login. However, only admin/member roles exist, TOTP secrets are stored in JSON, and password reset removes sessions but retains remembered-device tokens (C16). New recovery codes can be generated without a fresh step-up challenge. A remembered-device cookie is not proof of cryptographic device binding.

Migrate accounts using verified identity mapping and reenrollment. There is no user email field in User; do not invent email from username. Do not blindly import raw TOTP secrets, old sessions or device tokens into the OIDC provider. Identity provider capabilities for SSO, passkeys, email codes and device/session controls must be explicitly configured and tested.

### F13 HTML injection path in 3D labels — high, static finding

scene/engine.ts label() assigns innerHTML. officeView.ts desk() interpolates agent.name and role without escaping; rented agent names originate from an unrestricted business-name string in rentFloor. Most ordinary UI templates correctly use esc, but these label paths do not. The root boot error also interpolates an error message directly into innerHTML.

This is a source-traced unsafe rendering path, not a browser exploit demonstrated here. React text rendering should replace these paths; HTML content requires an explicit sanitizer and review. Include a harmless markup-string regression test on rent/workspace/agent names.

### F14 Scene lifecycle and WebGL fallback — medium

Engine.setView removes old roots and label DOM but does not dispose geometries/materials/textures. enterFloor creates a new OfficeView on navigation. Global glowMats and material caches retain references. Engine owns an observer and input handlers without a disposal method. App always constructs WebGLRenderer before showing dashboard views, so its 2D overlay is not an independent fallback. CSS reduced-motion rules exist, but the 3D animation loop does not honor that preference.

Use R3F-managed lifecycle, resource ownership rules and explicit cleanup for externally created primitives/canvas textures. Move the operational dashboard outside Canvas, add error/context-loss fallback and benchmark memory across repeated navigation. Do not label the existing app as having no reduced-motion CSS at all.

### F15 Misleading public pulse and marketing copy — high

/api/public/pulse at server/index.ts:236 is unauthenticated and reads the same Sim used for manually entered real contacts. It includes team names/roles/status and operational counts, contrary to its counts-only comment and the review's simplified description. Even without contact details, aggregate client activity is not automatically public. The proposal page labels the feed sample data, which becomes inaccurate once real records enter the shared Sim.

Keep the bilingual page as a useful asset, but feed it a dedicated synthetic dataset or disable the live feed. Do not expose private tenant counts. Its commercial copy includes $1,200 setup, approximately $800 monthly, commission and six-agent $399 plans not established by the original platform proposal. Separate legacy marketing material from the authoritative product/pricing specification.

## Corrections and qualifications to the uploaded review

1. Seven agents versus hundreds of desks is not automatically a contradiction. The current leadership group contains exactly seven AI agents. Hard-coded instances still need versioned templates and entitlements.
2. A decorative gold pulsing beacon already exists on the training landmark. The missing feature is a red per-building beacon driven by actual pending human intervention. Likewise current window glow follows decorative patterns, not active work.
3. Preventing double-texting is overstated. The in-memory busy Set can be lost or released while approval remains, and does not cover manual sends or multiple processes.
4. Approval-only delivery needs qualification for manual sends, automated reports and the independent test-email route.
5. The pricing page is implemented, but it does not match the full original platform pricing. Its broader private sales offer must not silently replace the original plan table.
6. The original roadmap graphic specifies a SOC 2 Type II audit in Phase 3; the review's Type I wording in that phase is inaccurate. The proposal narrative targets Type I readiness by Phase 2 end and Type II afterward.
7. The source proposal uses Elvis L4 as an example; the detailed Fast Sales floor plan explicitly assigns L4 to Amazon Books and L12 to Admin/CEO/Accounting. Preserve that detailed plan and use a configurable home workspace; do not move leadership into Books solely to match an illustrative label.
8. “Not deployed anywhere” is not provable from a ZIP. There is no deployment configuration or deployment evidence supplied. Likewise the reviewer’s commit reference is not independently verified.

## Preserve, port, replace

Preserve exact building/floor IDs and names, geometry/layout/style inspiration, named leadership personas, task category coverage, CRM drawer/kanban concepts, content calendar, review UX, reports and English/Spanish content structure. Port imperative UI to React and scene ownership to R3F/drei. Review all message templates before live use: existing templates assert gifts, service due dates, lease expiry, financing improvements and offers without the required supporting fields.

Replace production use of Sim, random outcomes, simulated time, global settings/credentials, JSON persistence, custom identity, unrestricted state dumps, global SSE, mutable approvals and fire-and-forget delivery. Retain the simulator only in an isolated demo package with no production outbound authority.

## Verification limits

Sixteen characterization checks ran against original core/auth behavior after type stripping and relative-import rewriting in an isolated directory. No business logic was changed by that preparation. Node type stripping is not TypeScript checking. The test harness does not prove browser rendering, HTTP middleware execution, live provider success or deployment readiness. Full npm installation/build was unavailable because offline dependencies were missing; exact error recorded in audit/VALIDATION.md.
