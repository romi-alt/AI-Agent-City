# M04 route and screen parity

Every legacy HTTP route, every `/api/action` command and every screen, mapped to its target. This file is the
inventory that M04's "Inventory parity identifies every original route as migrated, intentionally retired or
blocked" evidence refers to, and the input for ACCEPTANCE.md M10 item 9.

**Source of truth.** The route list was taken from the code, not only from `m00/ROUTES-AND-SCREENS.md`:
- `apps/legacy/server/index.ts` (every `app.get/post/put/delete/use`);
- `apps/legacy/server/scope.ts` (the legacy authorization rules);
- every caller in `apps/legacy/src/api.ts`, `src/ui/app.ts`, `src/ui/login.ts`, `src/main.ts` and `src/proposal/*`.

Checked at `m04/inventory`, based on afba3dd. Differences from the M00 document are listed in
[What the M00 inventory missed](#what-the-m00-inventory-missed).

**Conventions used below** are in `API-CONVENTIONS.md`: errors, request ids, pagination, `If-Match`, rate-limit
classes and delivery states. The REST paths are on the API; the browser reaches them via the web app's `/api/*`
proxy (M03 DESIGN).

## Summary

| Inventory | Items | Migrate in M04 | Retired | Replaced by M03 identity | Blocked / later stage |
|---|---:|---:|---:|---:|---:|
| HTTP routes (incl. static) | 30 | 8 | 5 | 12 | 5 |
| `/api/action` commands | 12 | 11 | 0 | 0 | 1 |
| **API total** | **42** | **19** | **5** | **12** | **6** |
| Screens (M00 list) | 17 | 15 need M04 data APIs (UI is M05/M06) | 0 | 1 (sign-in) | 1 (error/empty states: M05 only) |

**Entire-global-state endpoints.** Two endpoints send whole-city state, and both are retired:
- `GET /api/state`: the whole simulator snapshot (all buildings, leads, approvals, messages, content, inbox,
  reports, stats, revenue, settings), filtered by building in `scope.ts`.
- `GET /api/stream`: every patch, broadcast and then filtered.

The legacy `POST /api/action` is a generic command switch; it is retired in favour of typed commands. See
[Replacing `/api/state`](#replacing-apistate-and-apistream).

## Authorization vocabulary

Roles come from M02 memberships, entered with `app.enter_scope(subject, tenant, workspace)`. The tenant is
`session.tenantId`, set by M03's `POST /api/session/tenant`. It is never a client-supplied id used alone.

| Code | Who | Database scope |
|---|---|---|
| **R** | Any member of the current tenant: client-admin, client-viewer, agency-owner, assigned agency-staff, open support session | read; workspace-limited members see their workspace only |
| **W** | client-admin, agency-owner, assigned agency-staff | writable scope. Viewers and support are refused by the restrictive policies (`app.current_can_write()`) and by the service first (403 `forbidden`) |
| **AO** | Agency owner of the agency that owns the tenant | agency-level operations |
| **Self** | The signed-in person, about themself | no tenant data beyond their own presence |
| **Public** | No session (`@Public()`) | catalog only. Never `app.*` rows |
| **+SU(reason)** | Also needs a fresh strong sign-in (M03 `@RequireStepUp`: `credential`, `billing` or `permission`) | — |

The legacy rules from `scope.ts` carry over:
- **Hidden means not found.** Anything outside the caller's scope answers 404 `not_found`, so a client can't
  learn that it exists (enforced here by RLS, plus `not_found` from the services).
- **Viewers are read-only.**
- **Rent and vacate are agency-only.**

The legacy `x-fs: 1` header guard is replaced by M03's Origin check plus device proof on every non-GET request.

## HTTP routes

Status values:
- `migrate in M04`;
- `retired (reason)`;
- `replaced by M03 identity`;
- `blocked/later stage (which)`.

### Sign-in and account (legacy `server/auth.ts`, `server/totp.ts`)

| # | Legacy route | Legacy behaviour | Target REST | GraphQL | Module | Tables | Authorization | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | GET `/api/auth/me` | Sign-in state, user, recovery codes left | GET `/api/auth/me` (M03), plus GET `/api/access/memberships` | `me` (M04 resolver over the same session) | auth (M03) | identity.session, identity.person | Session | replaced by M03 identity |
| 2 | POST `/api/auth/login` | Password step; a remembered device skips the code | POST `/api/auth/login/start` → Keycloak → GET `/api/auth/callback` | none: browser redirect flow | auth (M03) | identity.login_attempt, identity.session, identity.device | Public + Origin + device proof | replaced by M03 identity |
| 3 | POST `/api/auth/verify` | TOTP or recovery code; also unlocks; `remember` sets a device cookie | Keycloak passkey / email code inside the same OIDC flow; step-up via `login/start` `purpose: 'step-up'` | none | auth (M03) | identity.session (`acr`, `amr`, `step_up_at`) | Public | replaced by M03 identity |
| 4 | POST `/api/auth/reset-password` | Username + TOTP + recovery code + new password | none | none | — | — | — | retired: there are no passwords or TOTP in the target. Lost access is handled by Keycloak's credential reset, plus M03 `DELETE /api/auth/devices/:id` (+SU credential) and an agency-owner re-invite. Audit C16 (reset kept remembered devices) cannot recur |
| 5 | POST `/api/auth/lock` | Lock the screen (423 until code) | none | none | — | — | — | retired: there is no lock state. Idle and absolute session expiry, revocation and step-up (M03) replace it. The UI may still blank itself, client-side only |
| 6 | POST `/api/auth/logout` | End session | POST `/api/auth/logout` → `{ endSessionUrl }` | none | auth (M03) | identity.session | Session | replaced by M03 identity |
| 7 | GET `/api/auth/enroll/:token` | Who a setup link is for | Invitation landing in apps/web; POST `/api/invitations/accept` | none | access (M03) | app.invitation | Public link; then session with verified email | replaced by M03 identity |
| 8 | POST `/api/auth/enroll/start` | Set password, issue TOTP secret and QR | Keycloak registration and passkey enrolment | none | Keycloak (M03) | — | — | replaced by M03 identity |
| 9 | POST `/api/auth/enroll/finish` | Confirm TOTP, issue recovery codes, sign in | POST `/api/invitations/accept` after OIDC sign-in | none | access (M03) | app.invitation, membership tables | Session; `emailVerified` and email must match the invitation | replaced by M03 identity |
| 14 | POST `/api/me/recovery-codes` | New recovery codes, no step-up (audit F12) | none | none | — | — | — | retired: no TOTP recovery codes. Passkeys and email codes in Keycloak; device revocation in M03 needs +SU(credential) |

### Public, state and live updates

| # | Legacy route | Legacy behaviour | Target REST | GraphQL | Module | Tables | Authorization | Status |
|---|---|---|---|---|---|---|---|---|
| 10 | GET `/api/public/pulse` | Unauthenticated. **Contained in M00:** fixed catalog counts `{catalog, live:false}` | GET `/api/public/catalog` → `{ buildings, floors, aiDesks, humanDesks }`, computed from `catalog.*`, `Cache-Control: public, max-age=300` | `publicCatalog` (`@Public()`) | catalog | catalog.building, catalog.floor, catalog.desk | Public; rate class `public` (per IP) | migrate in M04. Never reads `app.*`, so no tenant activity, names or counts (F15). **No caller:** the proposal page does not fetch it (see the M00 differences below) |
| 11 | GET `/api/state` | **ENTIRE GLOBAL STATE.** The whole simulator snapshot plus me, integrations and people, building-filtered in `scope.ts`, gzipped | none; replaced by the scoped, paginated queries in [Replacing `/api/state`](#replacing-apistate-and-apistream) | none (no `state` query) | — | — | — | retired: whole-state endpoint (F01). Each screen loads only the page it shows, through RLS |
| 12 | GET `/api/stream` | **GLOBAL SSE** (events `patch`, `people`), no event id or replay (F11), filtered after the fact | Socket.IO `/socket.io` with tenant/workspace rooms, outbox-event cursor and snapshot fallback | Subscriptions are not used. Realtime is Socket.IO (TARGET-STACK) | realtime (M03 admission; M07 events) | app.outbox_event (cursor = id) | Handshake session + device proof; room = current tenant | blocked/later stage (M07: scoped events, replay cursor, snapshot recovery). M03 provides room admission and revocation only |
| 13 | POST `/api/action` | Generic discriminated-union switch over 12 commands | none; each command becomes a typed route (next table) | none | — | — | — | retired: a generic command switch with no per-command contract, OpenAPI entry or authorization rule. Replaced by typed commands |

### Agency administration (legacy: agency owner only)

| # | Legacy route | Legacy behaviour | Target REST | GraphQL | Module | Tables | Authorization | Status |
|---|---|---|---|---|---|---|---|---|
| 15 | PUT `/api/admin/settings` | Company name, report recipients, delivery mode, CRM link template, report times, AI drafts, **sim speed** | GET/PATCH `/api/settings` (tenant settings, `If-Match`). `deliveryMode` and `speed` are dropped, and report times become `app.schedule` rows (disabled by default) | `settings`, `updateSettings(input, expectedVersion)` | tenancy | **new** `app.tenant_settings` (version); app.schedule | R to read; W to change. Changing `reportRecipients` needs +SU(permission) (it decides where data is mailed) | migrate in M04. `speed` is retired (demo clock only, packages/demo; F03). `deliveryMode` is retired as a tenant toggle, replaced by the server kill switch + per-tenant outbound policy (M08). It never makes a provider call possible by itself |
| 16 | GET `/api/admin/users` | List all people (agency-wide) | GET `/api/tenants/:tenantId/members?first&after` (paginated), and GET `/api/agency/staff` for AO | `members(first, after)` | access (M03 owns writes); M04 adds the read view | app.tenant_member, app.agency_member, app.agency_assignment, app.invitation | AO, or client-admin of that tenant (enter_scope proves it) | migrate in M04: the M03 DESIGN has membership writes but no list endpoint |
| 17 | POST `/api/admin/users` | Create user + setup link | POST `/api/invitations` `{ email, role, workspaceId? }` | `createInvitation` (M04 resolver over the access service) | access (M03) | app.invitation | client-admin/AO of the tenant +SU(permission) | replaced by M03 identity |
| 18 | PUT `/api/admin/users/:id/access` | Change role/client; signs them out | PUT `/api/tenants/:tenantId/members/:subject`; PUT/DELETE `/api/agency/assignments/:tenantId/:subject` | `setMemberRole` | access (M03) | membership tables | as M03 +SU(permission); publishes a `membership` revocation | replaced by M03 identity |
| 19 | POST `/api/admin/users/:id/reset` | New setup link (keeps old devices; C16) | POST `/api/invitations/:id/token`; credential reset in Keycloak; DELETE `/api/auth/devices/:id` | none | access/auth (M03) | app.invitation, identity.device | AO +SU(permission) | replaced by M03 identity |
| 20 | DELETE `/api/admin/users/:id` | Remove a person | DELETE `/api/tenants/:tenantId/members/:subject` | `removeMember` | access (M03) | membership tables | client-admin/AO +SU(permission) | replaced by M03 identity |
| 21 | GET `/api/admin/clients` | List clients and their building ids | GET `/api/agency/tenants?first&after` | `tenants(first, after)` | tenancy | app.tenant, app.workspace, app.workspace_placement | AO (and assigned staff: only their tenants) | migrate in M04 |
| 22 | POST `/api/admin/clients` | Create client `{name, buildingIds}` | POST `/api/agency/tenants` `{ name }` (Idempotency-Key). Buildings are not ownership: floors are given with POST `/api/rentals/placements` | `createTenant` | tenancy | app.tenant, app.workspace (default team), app.audit_event | AO +SU(permission) | migrate in M04. Needs a SECURITY DEFINER `app.create_tenant(...)`: the app role has no INSERT on `app.tenant` outside a scope |
| 23 | PUT `/api/admin/clients/:id` | Rename / change buildings; signs out affected people | PATCH `/api/agency/tenants/:id` `{ name }` (`If-Match`). Building changes become placement start/end (A3/A4 below) | `renameTenant` | tenancy | app.tenant (**new** `version`) | AO +SU(permission) | migrate in M04. Placement changes publish `membership` revocations so sockets re-check (M03 bus) |
| 24 | DELETE `/api/admin/clients/:id` | Delete client (refused while users exist) | POST `/api/agency/tenants/:id/archive` | `archiveTenant` | tenancy | app.tenant (**new** `archived_at`) | AO +SU(permission) | migrate in M04 as archive. Hard deletion and export are P09 (privacy deletion across DB, indexes, objects and caches). Facts are immutable, so a tenant can't simply be deleted |
| 25 | GET `/api/admin/signins` | Sign-in log, last 200 | GET `/api/identity/security-events?first&after` (proposed; not in M03 DESIGN) | none | auth (M03) | identity.security_event, identity.login_attempt | AO for their agency's people; Self for own | replaced by M03 identity (the data). The list endpoint is a **gap** for the auth owner |
| 26 | GET `/api/admin/integrations` | Email/SMS configured, Claude status, outbound kill switch | GET `/api/integrations/status`: per connector `unconfigured`/`demo`/`configured`/`verified`, plus `outbound: { killSwitchOn, blockedSinceStart }` | `integrationStatus` | integrations | none yet (env + server state); connector accounts in P07 | R (the switch state is not secret); details for W | migrate in M04. Never reports "connected" without a verified connector (P07) |
| 27 | POST `/api/admin/test-email` | Send test email (contained: gate-checked) | POST `/api/integrations/email/test` → 202 `{ deliveryState: 'queued' }`, or 409 `outbound_disabled` | `sendTestEmail` | integrations → outreach dispatch | app.draft_revision, app.dispatch_attempt, app.dispatch_receipt | AO +SU(permission); rate class `send` | blocked/later stage (M08 dispatch ledger and kill switch in Temporal; P07 email connector). Until then the route must answer `outbound_disabled`, never a fake success |

### The app itself (production build)

| # | Legacy route | Legacy behaviour | Target | Module | Status |
|---|---|---|---|---|---|
| 28 | `express.static(dist)` (`/assets/*`, icons, any built file) | Built Vite assets, `maxAge 1h`, no index | Next.js static assets (`/_next/static/*`, `public/`) | apps/web | blocked/later stage (M05) |
| 29 | GET `/proposal` (regex `^/proposal/?$`) | Built bilingual proposal page; `?lang=es` | apps/web route `/proposal` (EN/ES) | apps/web | blocked/later stage (M05). Data, if any, from `GET /api/public/catalog` |
| 30 | GET `/*` (any non-`/api/` path) | App shell `index.html` | Next App Router pages | apps/web | blocked/later stage (M05) |

## `/api/action` commands

The legacy body is `{ type, ... }` (zod discriminated union in `server/index.ts`), checked by
`authorize(action, scope, sim)` in `scope.ts`. Each command becomes a typed route with its own zod contract, the
same service behind REST and GraphQL, and an audit event plus an outbox event in the same transaction.

| # | Command (legacy payload) | Legacy effect | Target REST | GraphQL | Module | Tables | Authorization | Status |
|---|---|---|---|---|---|---|---|---|
| A1 | `approve {id, ok, edit?}` | Removes the approval. `edit` silently rewrites the draft (F05). Counts outreach even if the send fails (F07, C11) | POST `/api/approvals/:id/decision` `{ decision: 'approve'\|'reject', draftRevisionId, reason? }`. Editing first is POST `/api/drafts/:draftId/revisions` (a new revision with its own pending approval, which supersedes the old one); then decide the new approval. Approve → 202 `{ approval, deliveryState: 'queued' }` | `decideApproval`, `reviseDraft` | approvals (drafts/revisions workstream) | app.draft_revision, app.approval, app.audit_event, app.outbox_event | W; out-of-scope id → 404. `draftRevisionId` must be the approval's revision, else 409 `stale_revision`; already decided → 409 `conflict` | migrate in M04 (decision + immutable revisions). Dispatch of the approved revision is M08 |
| A2 | `approveAll {buildingId?}` | Approves every pending item in scope (or a building) unseen | POST `/api/approvals/decisions` `{ items: [{ approvalId, draftRevisionId }], decision }`, max 50; per-item results | `decideApprovals` | approvals | as A1 | W; each item checked like A1; the response lists per-item `ok`/`stale_revision`/`not_found` | migrate in M04 as a **revision-bound batch**. "Approve everything in a building" without naming revisions is retired: an approval must bind the exact revision the reviewer saw (C04/C05) |
| A3 | `rent {buildingId, level, tenant:{name,contact,email,phone}}` | Creates a "tenant" contact card on a floor and adds 2 agents | POST `/api/rentals/placements` `{ workspaceId, floorId }` (Idempotency-Key) → 201 placement. The client organisation is an existing tenant (#22). Rental contact fields are not a tenancy (MIGRATION-MAP) | `startPlacement` | rentals | app.workspace_placement (one active occupant per floor), catalog.floor, app.audit_event | AO +SU(permission). A floor already taken → 409 `conflict` | migrate in M04. Agent installation on the floor is P05 / P03 |
| A4 | `vacate {buildingId, level}` | Removes agents and approvals; leaves leads, messages and content behind (F02, C10) | POST `/api/rentals/placements/:id/end` (`If-Match`) | `endPlacement` | rentals | app.workspace_placement (`ended_at`), app.agent_installation (retire), app.approval (expire pending), app.schedule (disable) | AO +SU(permission) | migrate in M04 (end placement, retire installations, expire approvals, disable schedules in one transaction). Credential rotation and job cancellation are blocked/later (P05 offboarding, M08 Temporal) |
| A5 | `leadCreate {lead:{buildingId,name,email?,phone?,source?,interest?,floor?,kind?}}` | New lead in a building | POST `/api/contacts` `{ workspaceId?, displayName, email?, phone?, kind, source?, interest? }` (Idempotency-Key) → 201 with `version`, ETag | `createContact` | crm | app.contact, app.opportunity (initial stage), app.opportunity_stage_event, app.audit_event, app.outbox_event | W in that workspace (a workspace-limited member: only their own) | migrate in M04. `buildingId`/`floor` are replaced by `workspaceId`: a building is not ownership |
| A6 | `leadUpdate {id, fields:{stage?,name?,email?,phone?,interest?}}` | Edits a lead. A stage change can **create random revenue** (F08, C02/C03); an address change leaves queued sends valid (C13) | PATCH `/api/contacts/:id` (`If-Match`) for fields; POST `/api/opportunities/:id/stage` `{ stage, expectedVersion }` for stage | `updateContact`, `moveOpportunityStage` | crm | app.contact (**new** `version`), app.opportunity, app.opportunity_stage_event, app.approval (pending ones for a changed recipient are expired) | W; viewers 403 | migrate in M04. A stage change never creates money (`money_fact` only from verified provider facts). Changing email/phone expires pending approvals whose revision used the old recipient (C13) |
| A7 | `leadNote {id, text}` | Appends a note to lead history (capped at 15, F10) | POST `/api/contacts/:id/notes` `{ body }` → 201 | `addNote` | crm | app.note (BM25 via `app.search_notes`), app.audit_event | W | migrate in M04 |
| A8 | `leadSend {id, channel, subject?, body}` | Manual send straight to the provider, without approval or ledger (F06, C09); UI says "Sent" (F07) | POST `/api/contacts/:id/outreach` `{ channel, subject?, body, recipient }` (Idempotency-Key). Creates a draft revision + an approval decided by the sender (explicit human authorization) → 202 `{ draftRevisionId, approvalId, deliveryState: 'queued' }`. `channel: 'phone'` records a human call activity (no dispatch, no "sent") | `requestOutreach` | outreach | app.draft_revision, app.approval, app.audit_event, app.outbox_event; later app.dispatch_attempt / app.dispatch_receipt | W; rate class `send`. Refused with 409 `outbound_disabled` (kill switch / demo tenant) or 409 `policy_blocked` (suppression; consent and quiet hours are re-checked at dispatch) | migrate in M04 (authorization record + honest queued intent). The provider call is blocked/later (M08 dispatch, P07 connectors) |
| A9 | `contentUpdate {id, fields:{hook?,caption?,cta?,hashtags?,day?,time?,platform?,topic?}}` | Edits any post, even published/approved, without invalidating approval (F05, C04) | PATCH `/api/content/:id` (`If-Match`). An edit of approved or `needs-approval` content creates a new revision and expires the approval. Schedule via PUT `/api/content/:id/schedule` | `updateContentItem`, `scheduleContentItem` | content | app.content_item (**new** `version`, `hook`, `cta`, `hashtags`), app.schedule, app.draft_revision (channel `social`), app.approval | W | migrate in M04, with the schema additions noted below. Publishing is P04 |
| A10 | `inboxReply {id, text}` | Marks a (simulated) social inbox item answered (F09) | POST `/api/inbox/:id/replies` → draft revision + approval, 202 `queued` | `replyToInboxItem` | social (P04) | **no M02 table for inbox items** | W | blocked/later stage (P04: social inbox model and provider accounts). Legacy inbox items are simulated (F09) |
| A11 | `duty {onDuty}` | Sets the person on/off duty; broadcasts `people` | PUT `/api/me/presence` `{ onDuty }` | `setOnDuty` | presence | **new** `app.desk_assignment` (tenant, workspace, subject, desk_id, on_duty, version) | Self, in the current tenant (viewers may set their own presence) | migrate in M04 (needs the new table) |
| A12 | `desk {agentId \| null}` | Links the person to a human desk (must be visible to them) | PUT `/api/me/desk` `{ deskId \| null }` | `claimDesk` | presence | **new** `app.desk_assignment`; catalog.desk (`kind = 'human'` only); app.workspace_placement (the desk's floor must be placed for a workspace of the current tenant) | Self; a desk outside the tenant's placed floors → 404 | migrate in M04 (needs the new table). Human desks are never agents (ADR-013) |

## Replacing `/api/state` and `/api/stream`

What the snapshot carried, and what replaces each part. Every list is a cursor-paginated, RLS-scoped query with a
default page size of 25 and a maximum of 100. Lists are in the current tenant, optionally narrowed to one
workspace.

| Snapshot part (legacy) | Replacement REST | GraphQL | Module | Tables |
|---|---|---|---|---|
| `buildings`, `floors`, `agents` (map geometry, desks) | GET `/api/catalog/city` (public map: buildings, floors, desks, no occupancy names); GET `/api/catalog/buildings/:id/floors` | `city`, `building(id)` | catalog | catalog.* |
| Occupancy (which floor is rented, by whom) | GET `/api/rentals/placements?first&after` (own tenant). A public "occupied: yes/no" per floor comes from a SECURITY DEFINER function returning floor ids only | `placements`, `floorOccupancy` | rentals | app.workspace_placement; **new** function `app.occupied_floors()` |
| `neighbours` (other clients' buildings as shapes) | Part of `/api/catalog/city` (the map is public; ADR-013) | `city` | catalog | catalog.* |
| `leads` | GET `/api/contacts?stage&workspaceId&q&first&after`; GET `/api/contacts/:id` | `contacts`, `contact(id)` | crm | app.contact, app.opportunity |
| Lead `history`/timeline | GET `/api/contacts/:id/timeline?first&after` (stage events, notes, drafts, dispatch outcomes, legacy evidence) | `contact { timeline }` (DataLoader) | crm | app.opportunity_stage_event, app.note, app.draft_revision, app.dispatch_attempt/receipt, app.message_evidence |
| `approvals` | GET `/api/approvals?status=pending&first&after` | `approvals` | approvals | app.approval, app.draft_revision |
| `messages` (outbox) | GET `/api/deliveries?state&first&after` | `deliveries` | outreach | app.draft_revision, app.dispatch_attempt, app.dispatch_receipt, app.message_evidence (shown as `legacy-unverified`) |
| `content` | GET `/api/content?from&to&status&first&after` | `contentItems` | content | app.content_item, app.schedule |
| `inbox` | GET `/api/inbox` | `inboxItems` | social | blocked/later (P04) |
| `insights` | none | none | agents | blocked/later (P03/P04): legacy insights are hard-coded strings (F09) |
| `reports` | GET `/api/reports` | `reports` | reports | blocked/later (P03: real reports). Legacy reports were agency-wide and not scoped |
| `feed` (activity) | GET `/api/activity?first&after` | `activity` | activity | app.audit_event, app.outbox_event (no payload secrets) |
| `stats`, `statsToday`, `stageLog` | GET `/api/dashboard/summary?from&to` (counts per workspace/stage from facts) | `dashboardSummary` | activity | app.opportunity_stage_event, app.approval, app.dispatch_receipt |
| `revenue` | GET `/api/dashboard/money?from&to` (verified `money_fact` only; asking rent is not revenue, C14) | `moneySummary` | activity | app.money_fact |
| `settings` | GET `/api/settings` | `settings` | tenancy | **new** app.tenant_settings |
| `me` | GET `/api/auth/me` + GET `/api/access/memberships` | `me` | auth/access (M03) | identity.*, membership tables |
| `integrations` | GET `/api/integrations/status` | `integrationStatus` | integrations | — |
| `people` (name, onDuty, desk) | GET `/api/presence?first&after` (members of the current tenant with their desk/duty) | `presence` | presence | **new** app.desk_assignment, membership tables |
| SSE `patch` / `people` events | Socket.IO events from `app.outbox_event`, per tenant room, with an id cursor; clients refetch the affected queries | — | realtime (M07) | app.outbox_event |

## Screens

UI stages: M05 (Next/React) and M06 (R3F city). The "data" column is what M04 must serve.

| # | Screen (M00) | Target web route (M05/M06) | Data (REST · GraphQL) | Status |
|---|---|---|---|---|
| S1 | Sign-in (password, code, lock, forgot password, setup with QR and recovery codes) | `/sign-in`, invitation landing, Keycloak hosted pages | M03 auth/access routes | replaced by M03 identity. Password, TOTP, lock and recovery-code screens are retired (#4, #5, #14) |
| S2 | Office floor (3D desks, task board, live TV, content wall) | `/office/[building]/[floor]` (M06 R3F) | `city`, `building(id)`, `presence`, `contentItems`; task board and runs are P03 | UI later (M05/M06); data migrate in M04 except tasks/runs (P03) |
| S3 | Desk / agent card | drawer on the office route | catalog desk + `presence` + agent installation (P03 runs) | UI later; data M04 (desk, presence), P03 (runs) |
| S4 | City (15 buildings, traffic, people) | `/city` (M06) | `city`, `floorOccupancy` | UI later (M06); data M04 |
| S5 | Building and floor list | `/city/[building]` | `building(id)`, `placements` | UI later; data M04 |
| S6 | City dashboard (per-building tiles) | `/dashboard` | `dashboardSummary`, `moneySummary` | UI later; data M04. No random revenue (F08) |
| S7 | My CRM (kanban per building) | `/crm` (kanban per workspace and stage) | `contacts(stage, workspaceId)` paginated per column | UI later; data M04 |
| S8 | Lead drawer (stage, edit, reach out, notes, timeline, messages) | `/crm/[contactId]` | `contact`, `timeline`, A6–A8 | UI later; data M04 |
| S9 | Approvals ("Needs your OK") | `/approvals` | `approvals`, A1, A2 | UI later; data M04 |
| S10 | Content wall (calendar, posts, inbox, analytics, insights, reports) | `/content/{calendar,posts,inbox,analytics,insights,reports}` | calendar and posts: `contentItems` (M04). Inbox P04; analytics P04 (provider metrics with source and time, C12); insights P03/P04; reports P03 | UI later; data partly M04, partly blocked (P03/P04) |
| S11 | Outbox and reports | `/outbox` | `deliveries` (honest states), reports P03 | UI later; data M04 (deliveries), P03 (reports) |
| S12 | Settings (agency settings, integrations, account, desk, clients, people, sign-in log) | `/settings/*` | agency: `settings` (M04); integrations: `integrationStatus` (M04); account: M03 sessions/devices; desk: `claimDesk` (M04); clients: `tenants` (M04); people: `members` (M04 read) + M03 writes; sign-in log: M03 (gap #25) | UI later; data M04 + M03 |
| S13 | Big screen | `/screen` | same queries as S6/S9/S11, read-only | UI later; data M04 |
| S14 | Right panel tabs: Live, CRM, Content, Team, OK, Floors | panel component | Live: `activity` + realtime (M07); CRM: `contacts`; Content: `contentItems`; Team: `presence`; OK: `approvals`; Floors: `building`, `placements` | UI later; data M04 (+M07 live) |
| S15 | Rent a floor / vacate | Floors tab action | A3, A4 | UI later; data M04 |
| S16 | Proposal page, English and Spanish | `/proposal`, `?lang=es` (M05) | static content; optional `publicCatalog` | UI later (M05); data M04 (#10) |
| S17 | "Can't reach the office" and "Nothing to show yet" | M05 error/empty states | structured errors (`service_unavailable`, `no_tenant_selected`), empty `memberships` | blocked/later stage (M05 only; no M04 route) |

## What the M00 inventory missed

Found by reading the code against `m00/ROUTES-AND-SCREENS.md`:

1. **Static asset serving.** `express.static(dist, { index: false, maxAge: '1h' })` serves every built file (JS,
   CSS, images) and is not listed. It is row #28 here.
2. **`/api/public/pulse` has no caller.** The M00 table says "Proposal page data". In fact `src/proposal/*` never
   fetches it (no `fetch`, no `api.*`), and nothing else in `src/` calls it. It is an orphan public endpoint.
   M04 keeps a catalog-only replacement (#10) for M05 to use or drop.
3. **`/api/auth/verify` is rate-limited** (`limit(20, 5 min)`), as are the enroll routes. M00 lists the limit
   only on login/reset/enroll. It also **unlocks** a locked session and sets the remembered-device cookie (`remember`).
4. **The sim speed control is a settings write.** The UI speed buttons call `PUT /api/admin/settings { speed }`,
   so changing the business clock is an owner-only settings change. M00 lists "speed" without saying it moves the
   production-relevant clock (F03). Retired here (#15).
5. **Middleware behaviour that is not a route:**
   - the `x-fs: 1` header guard on non-GET `/api` (→ M03 Origin + device proof);
   - security headers on every response (`nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`):
     the integrator must keep them, in Nest or M05's Next config;
   - the per-IP in-memory limiter (→ Redis rate limits, API-CONVENTIONS);
   - gzip of `/api/state` when accepted.
6. **Unknown `/api/*` paths in production** fall through to Express's default HTML 404, because the SPA
   catch-all excludes `/api/`. The target answers JSON `not_found` (verified in `common-nest.test.ts`).
7. **The SSE `people` event** is sent after `duty`, `desk`, user access changes and user deletion, not only for
   presence. In the target, presence and membership changes become outbox events (M07).

## Schema and contract gaps for the integrator

These are needed by the "migrate in M04" rows. None of them is in this workstream's files.

- **Optimistic concurrency.** `version int NOT NULL DEFAULT 1` is needed on:
  - `app.contact`, `app.content_item`, `app.tenant` (or `tenant_settings`), `app.workspace_placement`;
  - `app.opportunity`, which has only `updated_at`.

  Draft revisions use the revision id as their version token.
- **New tables:**
  - `app.tenant_settings` (company display name, report recipients, CRM link template, AI drafts on/off,
    version);
  - `app.desk_assignment` (presence and desk).
- **Content fields:** `hook`, `cta`, `hashtags` on `app.content_item`. Content approval goes through a
  `draft_revision` with channel `social` (coordinate with the revisions workstream: `m04/revisions`).
- **Tenants:** `archived_at` on `app.tenant`, and a SECURITY DEFINER `app.create_tenant(...)` for agency owners.
- **Public map:** a SECURITY DEFINER `app.occupied_floors()` that returns floor ids only.
- **M03 additions:**
  - a members list endpoint (#16);
  - a security-event list endpoint (#25);
  - GraphQL context must pass `{ req, res }` so `SessionGuard`/`StepUpGuard` (which read `getArgs()[2].req`) also
    guard resolvers.
