# Migration status

Stage plan and rules: `planning/agentcity-migration/README.md`. Evidence: `planning/agentcity-migration/m00/`,
`planning/agentcity-migration/m01/`, `planning/agentcity-migration/m02/`, `planning/agentcity-migration/m03/`,
`planning/agentcity-migration/x01-cinematic-city/`. Statuses: not started / in progress / local passed / external blocked /
failed / complete.

| Stage | Status | Commit/files | Evidence | Blockers | Next action |
|---|---|---|---|---|---|
| M00 | **Local passed** (code complete and verified locally). Merged into `main` at the owner's request; no separate code review | `main` @ a658918 (fast-forward from f96819d). Built on branch `migration/m00-baseline` (from `city-vibes` @ 7bad3b8). Checkpoint = 7bad3b8, the head of `city-vibes` on GitHub. Tag `pre-migration-baseline` is local only: pushing it from this environment did not reach GitHub. Files below | `planning/agentcity-migration/m00/evidence/` | Real data and pilot exports missing (below) | M01 |
| M01 | **Local passed** (code complete and verified locally, including a from-zero fresh-clone run). Merged into `main` at the owner's request; no separate code review | `main` @ b3c211c (fast-forward from d4c0159). Built on branch `migration/m01-workspace`, which can now be deleted on GitHub (deletion from this environment fails). Files: section M01.2 | `planning/agentcity-migration/m01/` (ARCHITECTURE.md, evidence/) | CI not yet run on GitHub (first run will be the next push or PR to `main`); Node 22 not 24; MinIO replaced by RustFS locally (ADR-004). See M01.5 | M02 |
| M02 | **Local passed** (schema, RLS, catalog and importer built and tested locally on synthetic fixtures). Merged into `main` at the owner's request; no separate code review | `main` @ 002406e (fast-forward from 7cb0642). Built on branch `migration/m02-tenancy`, which can now be deleted on GitHub (deletion from this environment fails). Files: section M02.2 | `planning/agentcity-migration/m02/` (DATA-MODEL.md, IMPORT-RUNBOOK.md, evidence/) | **Production-input gate open:** no real `state.json`/`auth.json`/mapping provided, so no real import has run. CI not yet run on GitHub (first run will be the next push or PR to `main`). See M02.5 | M03 |
| M03 | **Local passed** (identity, sessions, access and realtime built and tested locally against the real local Keycloak). **Not merged into `main`, not pushed** | Branch `migration/m03-identity` @ 689ca54 (from `main` @ ade42f4). Files: section M03.2 | `planning/agentcity-migration/m03/` (DESIGN.md, IDP.md, evidence/) | Back-channel logout cannot reach the API locally (refresh revalidation is the backstop). The parallel end-to-end suite was stopped by the owner and is not committed. CI not yet run on GitHub. See M03.5 | Owner review, then merge M03 into `main` |
| M04 | **In progress** (common plumbing and the route inventory done; module porting not started) | Inventory, conventions and `apps/api/src/common` are in `feature/cinematic-city-demo` (via `m04/inventory`). Branch `m04/revisions` (revision hash, approval invalidation) is **not merged anywhere** | `planning/agentcity-migration/m04/` (ROUTE-PARITY.md, API-CONVENTIONS.md) | Decision for the owner: typed-client tooling (no-dependency scripts, or approve openapi-typescript / graphql-codegen / dataloader) | Port the legacy modules after M03 is merged |
| X01 (owner-directed, out of order) | **Local passed** (cinematic city, landing page and automated demo, verified end to end on the local stack). **Not merged into `main`, not pushed** | Branch `feature/cinematic-city-demo` (built on M03 @ 689ca54), HEAD after this entry. Files: section X01.2 | `planning/agentcity-migration/x01-cinematic-city/` (PLAN.md, evidence/, evidence/e2e/) | No real-device frame-rate measurement (software GL only). Production email sender not approved, so nothing is sent outside Mailpit. Includes M03, so it cannot reach `main` before M03. See X01.5 | Owner review on a real browser and GPU; then merge after M03 |
| M05–M10, P01–P10 | Not started (parts of M05/M06 and the product demo pulled forward by X01) | — | — | — | In order, one at a time |

# X01 — cinematic 3D city, premium landing page and automated demo (owner-directed)

The owner directed this stage directly ("Claude Code master prompt: AgentCity cinematic 3D city, premium UI/UX and
automated demo"). It runs outside the M00–M10 order and pulls forward parts of M05/M06 (the React Three Fiber city)
and the product demo funnel. The contract is `planning/agentcity-migration/x01-cinematic-city/PLAN.md`. Six
workstreams were built in parallel in separate git worktrees and merged into `feature/cinematic-city-demo`, which
branched from M03 (689ca54) plus the M04 inventory.

The legacy app (`apps/legacy`) is unchanged and is still the running product. `OUTBOUND_ENABLED` stayed unset; demo
agents cannot send anything (enforced in the database since M02); all mail went to the local Mailpit sink. No
production deploy, no live messaging, no real customer data.

## X01.1 What was built

| Requirement | Done | Where |
|---|---|---|
| NYC-inspired 3D city | 15 lot buildings with individual designs (Fast Sales Training Center glass tower with crown and spire, branded dealership showrooms, brick mid-rises, rental towers), a varied background skyline (setbacks, dark glass, art-deco crowns, pyramids), streets with markings, lamps, trees, signals and a plaza | `packages/city-scene/src/{buildings,streets}` (A1) |
| Lighting, time of day, weather | Day, golden, evening, night; clear, partly cloudy, overcast, light rain; blended transitions, instant under reduced motion | `packages/city-scene/src/environment` (A1) |
| Living city | Rule-following traffic (signals, crosswalks, no gridlock), pedestrians, buses and cabs, airliners and helicopters, birds, rooftop details; all stop under reduced motion and when paused | `packages/city-scene/src/life` (A2) |
| Cinematic camera, city → building → floor → office | Arrival glide, free exploration with collisions, building framings, floor cut-away, furnished offices, desk close-ups; keyboard and touch; phone layout; 2D map without WebGL | `packages/city-scene/src/{camera,interior,ui}`, `apps/web/app/city` (A3) |
| Quality presets | `ultra`/`balanced`/`low` budgets, chosen automatically and overridable in settings | `packages/city-scene/src/quality` |
| Premium landing page | Exact headline and CTAs, framed live city preview with a poster fallback, how it works, product rows, who it is for, security, demo form, FAQ; Geist, restrained palette; Sample/Simulated/Roadmap labels; no invented customers, numbers or integrations | `apps/web/app/(marketing)`, `apps/web/components/marketing` (B) |
| Lead capture | Required name, business email, company; optional industry, phone, website; privacy notice; separate unchecked marketing consent (stored with time and notice version); honeypot, form-age token and rate limits; same answer for known and new addresses | `apps/web/components/demo`, `apps/api/src/demo` (C, D) |
| Secure lead storage | `marketing.*` tables classified private, no app-role access, SECURITY DEFINER functions; leads never in browser storage; no personal data in logs (tested) | `packages/db/migrations/1793318400000_demo.sql` (C) |
| Demo provisioning and email verification, no passwords | Per-lead `demo` tenant with synthetic data; Keycloak user without credentials; one-time verify link; sign-in by email code with the address prefilled; demo attached by accepting a server-side invitation | `apps/api/src/demo`, `infra/keycloak` (C) |
| Welcome, guided tour, demo office, conversion CTAs | "Welcome to AgentCity, [First name]." / "Your virtual AI office is ready to explore."; 7-step tour; 3D office with the 8 sample agents; agent panels with simulated tasks and conversations; CTA cards | `apps/web/app/demo`, `apps/web/app/(signed-in)/office` (D, A3) |
| Demo expiry and cleanup | 14 days; `app.expire_demos()` from a worker activity, a Temporal workflow and `pnpm demo:expire` | `apps/worker/src/demo-*` |
| Admin lead view | Platform owners only, step-up required, signed cursors, CSV export with formula-injection guard | `apps/web/app/(signed-in)/admin/leads`, `apps/api/src/demo` |
| Branded sign-in and emails | AgentCity Keycloak login and email theme; the verify flow continues straight to the site after the confirm click | `infra/keycloak/themes/agentcity` (C) |

## X01.2 Changed files

- **New package `packages/city-scene`:** the whole 3D city (sources above), `src/data/city-layout.json` (generated
  from the legacy seed, no real person names), tests `test/*.test.ts`, dev harnesses under `test/`, `ASSETS.md`
  (everything generated in code; no downloaded models).
- **apps/web:** landing page and design tokens (`app/page.tsx`, `app/(marketing)`, `app/theme.css`, `app/layout.tsx`,
  `components/marketing`, Geist font with its OFL licence in `public/fonts`), `/city`, demo pages and components,
  `/office`, `/admin/leads`, the signed-in header, smoke tests `test/b-landing.smoke.ts`, `test/d-demo*.ts`. The
  status page moved to `/status`.
- **apps/api:** `src/demo/**`, `loginHint` in `src/auth/{oidc,auth.controller}.ts`, error codes in
  `src/common/errors.ts`, demo settings in `src/env.ts`, tests `test/demo*.ts`, regenerated `generated/openapi.json`.
- **apps/worker:** `src/demo-expire.ts`, `src/demo-workflow.ts`, registration in `main.ts` and `workflows.ts`.
- **packages/db:** migration `1793318400000_demo.sql`, `test/demo.test.ts`.
- **infra:** `keycloak/agentcity-realm.json` (provisioner client, themes), `keycloak/themes/agentcity/**`,
  `compose.yaml` (theme mount), `local-dev.env` (provisioner client, local-dev-only secret).
- **Root:** `package.json` (`demo:expire`), `pnpm-lock.yaml` (three 0.186.1, @react-three/fiber 9.8.2, drei 10.7.9,
  postprocessing), `.gitignore` (`apps/web/AGENTS.md`, written by `next dev`), `scripts/smoke.mjs` (`/status`).

## X01.3 Commands actually run

Final run on the merged branch, from the repository root (outputs in `x01-cinematic-city/evidence/`):

| Command | Result | Evidence |
|---|---|---|
| `pnpm format:check` | exit 0 | `format-check.txt` |
| `pnpm typecheck` | exit 0 | `typecheck.txt` |
| `pnpm build` | exit 0 | `build.txt` |
| `pnpm test` (unit) | domain 7, legacy 33, worker 3, legacy-import 7, api 57, **city-scene 120**, web 13; 0 failures | `unit-tests.txt` |
| `pnpm db:test` | **db 49/49, legacy-import 9/9, api 102/102** (includes 9 demo database and 15 demo API tests) | `integration-tests.txt` |
| `pnpm smoke` (M01 regression) | PASSED 10/10 | `m01-smoke-regression.txt` |
| `apps/web`: `node --test test/b-landing.smoke.ts test/d-demo.smoke.ts` | 21/21 (mock API) | — |
| `apps/web`: `pnpm test:browser` (M03 browser checks) | 10/10 | — |
| Real end-to-end journey (`evidence/e2e/journey.cjs`) on web :3000, API :4000, real Keycloak and Mailpit | **12/12 steps, no console errors**: landing → form → "check your email" → verify mail → confirm → `/demo/verified` → email prefilled → code by mail → "Welcome to AgentCity, Ada." → tour → 3D office (8 agents) → city → phone welcome and landing | `evidence/e2e/*.png` |
| `pnpm keycloak:verify`, the email-code verifier, live provisioning | 34/34, 28/28, 12/12 (run by workstream C with the new theme) | `evidence/c-keycloak-theme.json`, `evidence/c-live-provisioning.json` |

Problems found by the real run and fixed: the verify flow stopped on Keycloak's "Account updated" page (now continues
to the site); the attribution field name differed between form and API (aligned); the building labels clashed with
the light HUD and floated over cut-away floors; the live hero camera looked straight down (now uses the poster's
framing).

## X01.4 Not run, or not claimed

- **No real-device performance numbers.** Every render here used SwiftShader (software GL, about 0.2–1 fps). Draw
  calls and triangle counts per preset are recorded in the workstream reports, but no frame-rate target is claimed
  as met. The demo office falls back to the 2D plan on software renderers.
- **No production email.** Mail went only to Mailpit. No production sender is approved.
- **Not tested on real phones or non-Chromium browsers.** Phone layouts were checked at 390×844 in Chromium.
- **CI has not run on GitHub** for M03 or X01.
- **The M00 characterization harness** was not run (as in M01/M02).

## X01.5 Unresolved risks and decisions

1. **Merge order.** The branch contains M03 and the M04 inventory. M03 must be reviewed and merged first.
2. **Local Keycloak keeps no data.** After any Keycloak restart, `pnpm keycloak:seed` must run again, or email-code
   sign-in fails ("Invalid username or password"). CI already does this; it bit this run after a container restart.
3. **Verification email subject** is "Confirm your email for AgentCity" (not "…for your AgentCity demo") because
   Keycloak uses one subject for that template, and agency SSO users receive it too. The body names the demo.
4. **Provisioning after the 202** runs in the background; if Keycloak fails then, the visitor must submit again
   (logged without personal data).
5. **Status side channel:** a request id whose demo later expired reports `expired`.
6. **Brand signage** (Honda, Fiat, Maserati and the other dealership names, and "Fast Sales Training Center") appears
   on the public city and landing page with the owner's approval.
7. **Ultra quality has postprocessing off:** fog was being tone-mapped twice. Restoring night bloom needs fog moved
   before tone mapping for every material.

## X01.6 Next safe step

Owner review of `feature/cinematic-city-demo` in a real browser with a GPU (`pnpm infra:up && pnpm keycloak:seed
&& pnpm infra:init && pnpm build`, then start the API, worker and web). Then merge M03 into `main`, then X01.

# M03 — OIDC access and session cutover

Prompt: `planning/agentcity-migration/prompts/M03-oidc-access-and-session-cutover.md`. Prerequisite checked: M02 is
"local passed" and merged into `main` (002406e, status ade42f4). Built in parallel workstreams and integrated on
`migration/m03-identity` (689ca54). The legacy app keeps its own sign-in until cutover.

## M03.1 What was built

- **The API is a confidential OIDC client** (`agentcity-bff`, PKCE, state and nonce). Tokens never reach the browser;
  the session cookie is a hashed random token, and the refresh token is encrypted (AES-GCM).
- **Device-bound sessions:** an ES256 proof on every request (`X-Device-Proof`, DPoP-style), with replay blocked in
  Redis.
- **Global session guard and step-up:** step-up needs `acr` 2, a passkey in `amr`, a fresh `auth_time` and the same
  subject. Normal sign-in sends `acr_values=1` and refuses other levels.
- **Revocation:** revocations go out on Redis; realtime sockets are disconnected on revocation.
- **Invitations:** single-use, 48-hour tokens.
- **Keycloak realm:** passwordless (passkey, plus email code from a first-party authenticator), agency SSO through a
  broker realm, LoA mapping, and SMTP to Mailpit.

The design and response shapes are in `m03/DESIGN.md`; Keycloak details are in `m03/IDP.md`.

## M03.2 Changed files

- **apps/api:** `src/{auth,access,realtime,platform}`.
- **packages/db:** migrations `1793145600000_identity.sql` and `1793145600001_access.sql`.
- **infra/keycloak:** the realm, the seed and verify scripts, and the `email-code-authenticator` (built by
  `pnpm keycloak:providers`).
- **apps/web:** sign-in, the account page, `invitations/accept`.
- **Workflow and docs:** `.github/workflows/ci.yml` (builds the provider, seeds Keycloak, runs the API integration
  suites), and `m03/` docs and evidence.

## M03.3 Commands actually run (on 689ca54)

| Command | Result | Evidence |
|---|---|---|
| `pnpm format:check`, `pnpm typecheck`, `pnpm build` | exit 0 | `m03/evidence/{format-check,typecheck,build}.txt` |
| `pnpm test` | all unit suites pass (API 91 at that commit, including the acr and passkey refusals) | `unit-tests.txt` |
| `pnpm db:test` | db 40/40, legacy-import 9/9, api 87/87 | `integration-tests.txt` |
| `pnpm keycloak:verify` | 34/34. The first run gave 33/34: `sso-user-adds-passkey` failed once, then passed on re-run; recorded as intermittent | `idp-verification.json` |
| Email-code authenticator verifier | passed | `email-code-verification.json` |

## M03.4 Not run, or not claimed

- **The parallel M03 end-to-end suite** (`/home/user/m03-e2e`, not committed) was stopped by the owner. Its last
  report was 19/21, with 2 product issues that were not re-checked after the later fixes. It is not counted as
  evidence.
- **CI has not run on GitHub.**

## M03.5 Unresolved blockers and risks

1. **Back-channel logout can't reach the API from the local Keycloak container.** The 5-minute refresh revalidation
   is the backstop until it is deployed where Keycloak can reach the API.
2. **The `sso-user-adds-passkey` check is intermittent** (one failure in several runs).
3. **Carried over:** Node 22, RustFS, and the production-input gate from M02.

## M03.6 Next safe stage

Owner review, then merge `migration/m03-identity` into `main`, then continue M04 (module porting).

# M02 — scoped PostgreSQL data, tenancy and legacy import

Prompt: `planning/agentcity-migration/prompts/M02-postgres-tenancy-and-import.md`. Prerequisite checked: M01 is
"local passed" and merged into `main` (b3c211c, status 7cb0642). M02 branched from 7cb0642. Same environment as
M01 (Node 22.22.0, pnpm 10.28.0, Docker engine started in the container). No provider credentials; the legacy kill
switch stayed off; nothing outbound.

The legacy app is still the running product. M02 adds the model and the importer; nothing writes to both JSON and
SQL, and no API route reads tenant tables yet (M03/M04).

## M02.1 What was built

| Prompt requirement | Done | Where |
|---|---|---|
| Agency, client tenant, workspace, district/building/floor/desk, assignments, agent installations | `catalog.*` (physical, shared) and `app.*` (tenant-owned): agency, tenant (`client`/`agency`/`demo`), workspace, placement, agency members and staff assignments, tenant members (optionally one workspace), invitations, agent installations | `packages/db/migrations/1793059200000_tenancy-core.sql`, DATA-MODEL.md |
| Separate rental placement from security ownership | `workspace_placement` is physical: one occupant per floor, and placement grants nothing. Agents can be installed only on occupied floors, and never on human desks | ADR-013 |
| Classify shared tables; scope every tenant table, join, unique key and reference | `platform.table_classification` covers all 42 tables (enforced by test). Every tenant table: `tenant_id`, forced RLS, composite foreign keys, tenant-scoped unique keys | ADR-015 |
| Transaction-local authenticated scope; non-bypass app role | `app.enter_scope` checks membership and signs a transaction-bound scope (HMAC); `withScope()` helper; viewers and support are read-only | ADR-014, `packages/db/src/scope.ts` |
| Durable audit/outbox; immutable money/usage/dispatch facts | `audit_event`, `outbox_event` (id = cursor), `dispatch_attempt`/`receipt`, `usage_fact`, `money_fact`, `draft_revision`, `consent_event`, stage events, `message_evidence`: insert-only for the app, and a trigger refuses change for everyone | ADR-016 |
| Demo fixture data in a marked isolated tenant | `tenant.kind = 'demo'`; a trigger refuses dispatches, receipts and money facts there; all simulated legacy data goes there | ADR-016 |
| Stable building IDs through alias mapping | `catalog.building_alias` holds all 15 legacy ids. The catalog seed is generated from the legacy `buildCity()` with deterministic UUIDs | ADR-019, `packages/domain` |
| Read-only v2 dry run/import: explicit mapping, validation, quarantine, duplicate/dangling report, provenance, deterministic IDs, idempotent re-run, reconciliation | `packages/legacy-import` (CLI `pnpm legacy:import dry-run|apply`) | IMPORT-RUNBOOK.md |
| Never derive payments, consent or receipts; expire approvals; schedules disabled | Enforced by the planner and tested on the imported database | DATA-MODEL.md "The legacy import" |
| Test with labelled fixtures; document the missing production-input gate | Synthetic fixtures generated by the legacy simulator, named `Fixture …`; gate recorded below | `packages/legacy-import/fixtures/README.md` |

Two problems were found and fixed during M02, not carried forward:
- **BM25 under RLS.** Ranked BM25 search does not work through RLS on pg_search 0.26.3: rows are correct but
  `paradedb.score` fails. Ranked search now goes through a scoped SECURITY DEFINER function (ADR-018).
- **Support audit.** The first support-access design audited inside the scoped transaction, so a rollback erased
  the audit. Support now needs a session committed beforehand (ADR-017).

## M02.2 Changed files

- **New migrations:**
  - `packages/db/migrations/1793059200000_tenancy-core.sql` (schema, RLS, scope, triggers, classification)
  - `1793059200001_catalog-legacy-city.sql` (generated catalog seed)
- **packages/db:**
  - new `src/scope.ts` (`withScope`); changed `src/index.ts` (export)
  - new `test/tenancy.test.ts`, `test/tenancy-fixture.ts`
  - changed `test/migrations.test.ts` (all migrations, full down/up)
- **New package `packages/domain`:** `src/ids.ts`, `src/catalog.ts`, `scripts/` (generator reading `apps/legacy`),
  `test/catalog.test.ts`.
- **New package `packages/legacy-import`:**
  - `src/` (schema, planner, apply/dry run, CLI)
  - `scripts/make-fixtures.ts`, `scripts/backup-restore-rehearsal.ts`
  - `fixtures/` (synthetic data + README)
  - `test/plan.test.ts`, `test/import.test.ts`
- **Root:** `package.json` (`db:test`, `legacy:import`, `legacy:rehearse-backup`), `pnpm-lock.yaml`,
  `.prettierignore` (fixtures), `.github/workflows/ci.yml` (isolation, import, rehearsal steps; m02 evidence
  upload), `README.md`, `CLAUDE.md` (tenant-data conventions).
- **Docs and evidence:** `planning/agentcity-migration/m02/DATA-MODEL.md`, `IMPORT-RUNBOOK.md`, `evidence/`.

## M02.3 Commands actually run

Last full run on the final code, from the repository root (outputs in `m02/evidence/`):

| Command | Result | Evidence |
|---|---|---|
| `pnpm format:check` | exit 0 | `format-check.txt` |
| `pnpm typecheck` | exit 0 (all 9 packages) | `typecheck.txt` |
| `pnpm build` | exit 0 | `build.txt` |
| `pnpm test` (unit) | domain 7/7, legacy 33/33, worker 3/3, api 3/3, legacy-import planner 7/7 | `unit-tests.txt` |
| `pnpm db:migrate` (development database) | tenancy + catalog applied | `migrate.txt` |
| `pnpm db:verify-search` | PASSED | `verify-search.txt` |
| `pnpm db:test` | **db 22/22, legacy-import 9/9** (each on a fresh, migrated database, using the real `agentcity_app` role) | `integration-tests.txt` |
| `pnpm legacy:import dry-run` on the fixtures | balanced: 2,454 planned rows; quarantine 4 leads, 5 messages, 4 approvals, 1 revenue, 1 rental occupant, 2 users, 1 client | `fixture-dry-run.json` |
| `pnpm legacy:rehearse-backup` | **PASSED 8/8**: file backup/restore byte-identical; damaged copy refused; pg_dump → restore → identical totals and hashes; RLS and ranked search on the restored copy; re-import adds nothing | `backup-restore.json` |
| `pnpm smoke` (M01 regression, on the M02 schema) | PASSED 10/10 | `m01-smoke-regression.txt/.json` |

Required evidence, against the tests that prove it:

- **Cross-tenant SELECT/INSERT/UPDATE/DELETE/join/search with the real app role** (`packages/db/test/tenancy.test.ts`):
  - a role check (not superuser, not BYPASSRLS, owns nothing);
  - no scope → zero rows in all 27 tenant/agency tables;
  - SELECT and joins scoped;
  - INSERT into another tenant refused;
  - UPDATE/DELETE reach 0 rows, and a row can't be moved out of its tenant;
  - BM25 search returns only the scoped tenant's rows, directly and ranked.
- **Rental L1 against L2, same building:** entering the other tenant, or the other tenant's workspace, is refused.
  Only the client's own placement is visible. Also repeated on imported data (`import.test.ts`). A member limited
  to one workspace can't see the tenant's other floor in the same building.
- **Pooled connection reuse:** one-connection pool, same backend PID. No scope after a commit, nor after an error.
  The next tenant sees only its own rows.
- **Forged scope:**
  - a hand-made value with a bad signature is ignored;
  - a valid value with the tenant swapped fails verification;
  - a valid value replayed in a later transaction is dead;
  - `app.tenant_id` is meaningless;
  - scope can't be switched mid-transaction;
  - the key, the private functions, the migration tables, `DISABLE ROW LEVEL SECURITY` and `row_security = off`
    are all refused to the app role.
- **Foreign keys reject cross-tenant associations:** tested as superuser (RLS bypassed) and as the app role.
- **Import twice, unchanged totals:** the second apply inserts 0 rows, 0 map entries and 0 quarantine entries, with
  identical per-table totals and content hashes. A changed record is refused, not overwritten.
- **Unknown schema rejected without writes:** version 3, version 1, invalid JSON, missing list, wrong type, bad
  auth file and an unknown mapping field are each refused. A building-wide rule on a shared building is refused,
  and so is one floor placed twice. Row counts in every app and migration table are unchanged (including no
  `import_run`), and the input files are byte-identical.
- **Backup restore:** `backup-restore.json` (above).

## M02.4 Not run, or not claimed

- **No real import.** No real `state.json`, `auth.json` or owner-approved mapping exists here, so all import
  evidence is synthetic. The production import is the open gate in M02.5.
- **CI has not run on GitHub** (same as M01).
- **The API and web do not use the new tables yet.** No HTTP or GraphQL path was tested against RLS. That is
  M03/M04.
- **Not done in M02:** cache keys, object-storage keys and socket rooms are not tenant-scoped yet (later stages,
  DATA-MODEL.md "Known limits"). No load or performance test of RLS was run.
- **Not run:** the M00 characterization harness (paths still point at the pre-M01 layout, as noted in M01.4).

## M02.5 Unresolved blockers and risks

1. **Production-input gate (open).** Before the real import can run, the owner must provide:
   - read-only copies of the real `state.json` and `auth.json`;
   - a reviewed ownership mapping, with tenants, floors, contact ownership with evidence, and user emails.

   The procedure is `m02/IMPORT-RUNBOOK.md`. Until then, nothing real is imported.
2. **Districts are an assumption** (Dealer Row, Fast Sales Campus, Rental Park); the legacy city had none.
   ADR-019.
3. **The scope trusts the API's subject.** The database checks that a subject may act for a tenant, not who the
   subject is. OIDC (M03) must supply verified subjects.
4. **Ranked search must use scoped functions** (ADR-018). Any new BM25 table needs the same pattern.
5. **Carried over from M01:** Node 22 not 24; RustFS instead of MinIO locally; CI not yet run on GitHub.

## M02.6 Next safe stage

**M03 — OIDC access and session cutover** (`planning/agentcity-migration/prompts/M03-oidc-access-and-session-cutover.md`),
now that M02 is merged: start from `main` (002406e or later), run `pnpm infra:up && pnpm infra:init`, keep
`OUTBOUND_ENABLED` unset. The production-input gate does not block M03 (it does not need real
data), but it blocks the real import and cutover.

# M01 — workspace and local infrastructure

Prompt: `planning/agentcity-migration/prompts/M01-workspace-and-infrastructure.md`. Prerequisite checked: M00 is
"local passed" and in `main` (a658918, status update d4c0159); M01 branched from d4c0159.

Test environment: this cloud container, Node v22.22.0, pnpm 10.28.0, Docker 29.9.2 (engine started in the
container with `dockerd`; M00's "no Docker" blocker was only a stopped daemon). No provider credentials; the legacy
kill switch stayed off; the new apps make no outbound requests (Next.js telemetry disabled).

## M01.1 What was built

| Prompt requirement | Done | Where |
|---|---|---|
| apps/web (Next/React), apps/api (Nest), apps/worker (Temporal), packages as appropriate | Next.js 16.4.3 App Router + React 19.3.1; NestJS 12.3.2 (Express adapter) with REST, GraphQL (Apollo 5) and OpenAPI; Temporal TS SDK 1.24.0 worker; `packages/contracts`, `packages/db`. Other packages deferred to the stage that first fills them (ADR-012) | `apps/*`, `packages/*` |
| Preserve the legacy app, runnable | Moved unchanged to `apps/legacy` (git renames); exact dependency versions from its old lockfile. 33/33 tests, build, and production start (`/`, `/proposal`, `/api/*` 200) verified | `apps/legacy` |
| One package manager, pinned toolchain, reproducible lock | pnpm 10.28.0 (`packageManager`), one `pnpm-lock.yaml`, Node 22.22.0 (`.nvmrc`, engine-strict) | ADR-001, ADR-002 |
| Compose: PostgreSQL/pgvector + verified BM25, Redis, S3-compatible storage, Temporal, Keycloak | ParadeDB 0.26.3 on PG 17.11 (pg_search BM25 + vector 0.8.6), Redis 7.4, **RustFS 1.0.4 instead of MinIO** (ADR-004), Temporal CLI 1.9.1 (Server 1.32.0), Keycloak 26.8.1. Real tags, pinned by digest | `infra/compose.yaml`, ADR-005 |
| Local-only credentials, env validation | `infra/local-dev.env` (every secret contains `local-dev-only`); zod validation in API and worker; production refuses those values and dev routes | ADR-010 |
| Health checks, readiness, startup/shutdown docs | Compose health checks on all five services (`up --wait`); API `/health/live`, `/health/ready` (503 when any dependency fails) and GraphQL `readiness`; README "Local development" | `apps/api/src/health/`, `README.md` |
| Migrations, test fixtures | node-pg-migrate SQL migration (extensions, `platform` schema, least-privilege grants); `createTestDatabase()` throwaway-database fixture | `packages/db` |
| Shared formatting/type checks | Prettier 3.9.10 (`pnpm format:check`), strict `tsconfig.base.json`, `pnpm typecheck` across all packages | root |
| Separate browser/server imports | `server-only` guard on the web app's API client; contracts package has no Node APIs; db package not a web dependency | ADR-011 |
| CI build jobs | `.github/workflows/ci.yml`: static job + infrastructure job (Compose, migrations, BM25, integration, smoke) | **not yet run on GitHub** |
| Real web→API health request | Web page renders the API's readiness on every request | smoke check 6 |
| Real worker activity round trip | Heartbeat workflow: API → Temporal → worker activities → PostgreSQL → result | smoke checks 7–8 |
| Architecture choices, port/secret boundaries | 12 ADRs | `planning/agentcity-migration/m01/ARCHITECTURE.md` |

No business feature moved. The new apps prove wiring only.

## M01.2 Changed files

- **Moved** (renames, content unchanged except `package.json`): `index.html`, `proposal.html`, `server/`, `src/`,
  `test/`, `tsconfig*.json`, `vite.config.ts`, `.env.example`, `SPEC.md`, `README.md` → `apps/legacy/`.
  `apps/legacy/package.json`: renamed `@agentcity/legacy`, exact versions. `apps/legacy/README.md`: a "moved" note.
- **Removed:** `package-lock.json` (replaced by `pnpm-lock.yaml`).
- **New, root:** `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.nvmrc`, `.npmrc`, `tsconfig.base.json`,
  `.prettierrc.json`, `.prettierignore`, `README.md`, `.github/workflows/ci.yml`, `scripts/smoke.mjs`.
- **Changed, root:** `.gitignore`, `CLAUDE.md` (conventions now name pnpm and `apps/legacy`; migration section
  unchanged).
- **New:** `infra/` (compose, env, Postgres init, Keycloak realm), `apps/api`, `apps/worker`, `apps/web`,
  `packages/contracts`, `packages/db` (including generated `apps/api/generated/{openapi.json,schema.graphql}`).
- **New docs/evidence:** `planning/agentcity-migration/m01/ARCHITECTURE.md`, `m01/evidence/`.

## M01.3 Commands actually run

Final results come from a fresh clone of commit 22dd3d1 with all service volumes deleted first
(`evidence/fresh-checkout-run.txt`), plus the follow-ups noted.

| Command | Result | Evidence |
|---|---|---|
| `git clone` → `pnpm install --frozen-lockfile` (warm store) | exit 0 | `fresh-checkout-run.txt` |
| Same in a second clone with an **empty** pnpm store | exit 0, 476 packages, 7 s | `fresh-checkout-followup.txt` |
| `pnpm format:check` | exit 0 | `fresh-checkout-run.txt` |
| `pnpm infra:reset` then `pnpm infra:up` | all 5 services healthy, 22 s | same |
| `pnpm infra:init` twice | migration applied, bucket created; second run: nothing to do / already exists | same |
| `pnpm db:verify-search` | PASSED: BM25 order 2,1,4, non-match excluded, plan uses ParadeDB scan on `docs_bm25`; vector nearest 1,2 | same, `verify-search.json` |
| `pnpm typecheck` **before** `pnpm build` on the fresh clone | **failed (exit 2)**: apps could not resolve `@agentcity/contracts` types before its `dist` existed | same |
| Fix (commit "Build shared packages before typecheck…"), then `pnpm typecheck` on a clean tree | exit 0 | `fresh-checkout-followup.txt` |
| `pnpm build` | exit 0: contracts, db, legacy (large-chunk warning, as before), worker, api, web | `fresh-checkout-run.txt` |
| `pnpm test` | legacy 33/33, worker 3/3, api 3/3 | same |
| `pnpm --filter @agentcity/db test:integration` | 4/4: clean apply; app role inserts each step once; app role cannot create, delete or drop and is not superuser/bypassrls; down/up reversible | same |
| `pnpm smoke` | **PASSED, 10/10** (below) | `smoke.json`, `smoke-logs/` |
| Legacy production start from the fresh clone (`NODE_ENV=production`, throwaway `DATA_DIR`) | `/`, `/proposal`, `/api/auth/me`, `/api/public/pulse` → 200; kill switch reported OFF | run by hand, not saved (log contained a one-time enrolment link) |

Smoke checks (`scripts/smoke.mjs`, against built apps it starts itself):

1. API liveness
2. API readiness, all four dependencies ok
3. GraphQL `liveness` + `readiness`
4. OpenAPI served; `/dev/*` routes absent from it
5. Keycloak realm OIDC discovery (issuer matches, PKCE S256 offered)
6. Web page renders the API's readiness (web → API)
7. Heartbeat round trip (API → Temporal → worker → PostgreSQL)
8. **Workflow survives a worker crash:** worker A records `started`, is SIGKILLed during the 15 s timer, worker B
   starts and finishes. Rows: `started:smoke-worker-a`, `finished:smoke-worker-b`, each exactly once
9. **Readiness fails without storage:** PostgreSQL stopped → 503, `postgres: unavailable (ECONNREFUSED)`, web shows
   "not ready"; restarted → ready again
10. Same with object storage stopped → 503 `objectStorage: unavailable (ECONNREFUSED)`; recovers

Defects found and fixed during M01 (not left in): the API hung on shutdown when Redis had never connected
(`quit()` on an unconnected client); the typecheck ordering above; a duplicate identifier in the GraphQL resolver.

## M01.4 Not run, or not claimed

- **CI has not run on GitHub.** The workflow is written; its steps were run locally in the same order, but not on
  GitHub's runners.
- **Not run:** `pnpm dev:*` (watch mode) for the new apps; the smoke uses built output. `pnpm dev:legacy`
  (concurrently + Vite) was not started in M01.
- **Not run:** M00's pack harness and M00 helper scripts after the move. They point at the old root paths (`server/`,
  `src/`, `test/`) and need `apps/legacy/` as their root.
- **Not tested:** Keycloak sign-in flows (no users, no app integration — M03); BM25 under RLS/tenant isolation (M02 /
  knowledge); managed-Postgres availability of pg_search (deployment stage).

## M01.5 Unresolved blockers and risks

1. **Node 24.** The pack targets Node 24; only 22.22 is available here (ADR-002).
2. **MinIO.** The prompt names MinIO; no pullable real MinIO image was found, so RustFS is used through the
   standard S3 API (ADR-004). Owner may want to confirm or name a MinIO image/registry.
3. **Docker Hub rate limit.** Images come from `mirror.gcr.io`/`quay.io`, pinned by digest (ADR-005). A CI runner
   with Docker Hub access works the same way.
4. **Extra extensions** pre-created by the ParadeDB image (PostGIS family, `fuzzystrmatch`, `pg_ivm`,
   `pg_stat_statements`) — decide in M02 (ADR-006).
5. Unchanged from M00: no real data/pilot material/provider credentials; kill switch process-level only.

## M01.6 Next safe stage

**M02 — PostgreSQL tenancy and import** (`planning/agentcity-migration/prompts/M02-postgres-tenancy-and-import.md`), now that M01 is merged. Start from `main`
(b3c211c or later), run `pnpm infra:up && pnpm infra:init`, keep `OUTBOUND_ENABLED` unset.

# M00 record

M00 test environment: this cloud container, Node v22.22.0, npm 10.9.4, Chromium via Playwright with software GL
(SwiftShader). No provider credentials were set, and the kill switch was off in every run.

Paths below are as they were in M00. Since M01, the legacy app's files are under `apps/legacy/` (e.g.
`server/outbound.ts` → `apps/legacy/server/outbound.ts`), and its commands run with pnpm (see CLAUDE.md).

## 1. The checkout that was baselined

- **Branch history.** When M00 started, `main` was f96819d and this work was on unmerged branches:
  - `multi-client-isolation` = 1dab901
  - `city-vibes` = 7bad3b8, which also contains 1dab901

  M00 branched from `city-vibes` so nothing was lost.
- **Merged.** All three branches are now in `main` (a658918). Because each was built on the one before, the merge
  was a fast-forward: no merge commits, no conflicts. Before pushing, `npm run typecheck` and `npm test` (33/33)
  passed on that exact commit. The merged branches can be deleted; deletion from this environment fails, so
  delete them on GitHub.
- **The ZIP the audit used is exactly commit f96819d.** All 36 files match `audit/source-manifest.json`
  byte-for-byte. The build review's reference to 8250c96 is an earlier commit; f96819d is the audited code.
- **Differences from the ZIP.** At 7bad3b8, 16 files differ and 3 are new: `server/scope.ts`, `src/scene/street.ts`
  and `test/scope.test.ts`. So the audit's F01 (no tenant checks) is partly addressed by building-level
  multi-client isolation, which the audit did not see. F02/C10 (rental floors sharing one lead pool) is not
  addressed. Evidence: `evidence/manifest-comparison.txt`.
- **No private data in the checkout.** There was no `data/` folder, no `.env` and no CLAUDE.md.

## 2. Commands actually run

| Command (repo root unless noted) | Result | Log |
|---|---|---|
| `git checkout -b migration/m00-baseline` from `city-vibes`; `git tag -a pre-migration-baseline` | ok | — |
| `git push -u origin migration/m00-baseline`; `git push origin pre-migration-baseline`; `git ls-remote origin` | Branch pushed; **tag not on GitHub** (push printed "Everything up-to-date"; ls-remote shows no tags) | — |
| `node planning/agentcity-migration/m00/compare-manifest.mjs …` for f96819d, 1dab901, 7bad3b8 | f96819d identical (36/36) | `evidence/manifest-comparison.txt` |
| `npm ci` (lockfile) | exit 0, 0 vulnerabilities | `evidence/baseline-npm-ci.txt` |
| `npm run typecheck` before / after M00 | exit 0 / exit 0 | `evidence/baseline-typecheck.txt`, `after-typecheck.txt` |
| `npm run build` before / after M00 | exit 0 / exit 0; both warn about one large JS chunk | `evidence/baseline-build.txt`, `after-build.txt` |
| `npm test` before M00 | 21/21 pass | `evidence/baseline-test.txt` |
| `npm test` after M00 | **33/33 pass** (21 existing + 12 new containment tests) | `evidence/after-test.txt` |
| Pack harness (`prepare-audit.mjs` + `verify-original.mjs`) on an isolated copy of f96819d | 16/16 legacy defects reproduced | `evidence/characterization-f96819d.txt` |
| Same on 7bad3b8 (adapted: `server/scope.ts` also stripped, as `auth.ts` now imports it) | 16/16 reproduced | `evidence/characterization-7bad3b8.txt` |
| Same on the M00 working tree | 16/16 still reproduced (expected: M00 does not fix the simulator) | `evidence/characterization-m00.txt` |
| `node planning/agentcity-migration/m00/capture-screens.cjs` against fresh servers | 14 screens + pulse, before and after; 0 page errors | `evidence/screens-baseline/`, `evidence/screens-contained/` |
| `node planning/agentcity-migration/m00/check-untrusted-names.cjs` on the checkpoint build, then the M00 build | Checkpoint: **unsafe** (exit 1); M00: **safe** (exit 0) | `evidence/untrusted-names-baseline.txt`, `untrusted-names-contained.txt` (+ screenshots) |
| Backup, fingerprint, restore and damaged-file rehearsal on a throwaway data folder | Backup verified, restored copy starts, damaged file refused and unchanged | `evidence/backup-restore-rehearsal.txt` |
| `docker --version`, `docker compose version`, check `/var/run/docker.sock` | CLI present; **no Docker engine** | — (M01 blocker) |

## 3. Containment implemented

| Requirement (M00 prompt) | Change | Evidence |
|---|---|---|
| Server-side outbound kill switch on every delivery path; default off | New `server/outbound.ts`. A provider is called only if `OUTBOUND_ENABLED=true` **and** Delivery = live. Every path checks it inside `delivery.ts`/`brain.ts`, at send time: agent approvals, manual sends, reports, test email, Claude drafts. A refused message or report is marked `skipped` (Live mode) or `simulated` (demo), with the reason. Settings, the Outbox and the Send/Approve buttons say when nothing will be sent. | `test/containment.test.ts`: fake providers get **0 calls** from every path with the switch off (also for values "1", "yes", "TRUE", " true", ""). A positive control proves the paths are live when the switch is on. |
| Prevent demo-mode provider calls | Demo ("simulate") mode is refused by the same gate, including Claude drafts of simulated posts (previously sent to Anthropic in demo mode). A phone "call" is never reported as sent. | Test "never calls a provider in demo mode, even with the switch on": 0 calls |
| Remove identifying work/contact data from the unauthenticated pulse | `/api/public/pulse` returns only `{catalog:{buildings,floors,aiDesks,humanDesks}, live:false}` from the fixed catalog. The proposal page no longer polls it and shows an empty sample dashboard. | Before: `evidence/screens-baseline/public-pulse.json` (team names, roles, status, work, counts). After: `screens-contained/public-pulse.json`; test asserts no names, status or counts |
| Render untrusted names as text, not innerHTML | `label()` in `src/scene/engine.ts` now takes text parts. City signs, vacant-floor signs and agent desk tags use it. The boot error message is set as text. | Browser check: a rental name containing an image tag that runs a script. Checkpoint: it executed (2 injected images, marker set). M00: shown as literal text, nothing executed. A person name with markup was already escaped and is unchanged. |
| Corrupt/unsupported state fails closed without overwriting originals | New `server/state.ts`. The server exits with code 2 and a clear message if `state.json` is invalid JSON, the wrong version or missing lists, or if `auth.json` can't be read. It never starts an empty city over the original. | Tests start the real server on 4 bad files: exit 2, file **byte-identical** (SHA-256), no files created or removed |
| Private data at rest (found while rehearsing) | `state.json` was saved world-readable (0644) while holding real leads. Now saved 0600 like `auth.json`. | Test "saves the city readable by its owner only" |

Other files changed for these: `server/index.ts` (wiring, pulse, loader, file mode), `server/delivery.ts`,
`server/brain.ts`, `src/core/types.ts` (report status `skipped`), `src/api.ts`, `src/ui/app.ts`, `src/ui/views.ts`,
`src/scene/{engine,cityView,officeView}.ts`, `src/main.ts`, `src/proposal/{main,content}.ts`, `package.json` (tests
run one file at a time), `.env.example`, `README.md` (corrected safety claims), `CLAUDE.md` (new),
`test/containment.test.ts` (new).

Also added under `planning/agentcity-migration/`:
- the full pack
- `m00/ROUTES-AND-SCREENS.md`, `m00/EXTERNAL-EFFECTS.md`, `m00/SOURCE-TO-TARGET.md`, `m00/BACKUP-AND-RECOVERY.md`
- three evidence scripts and the evidence folder

## 4. Passing safety tests versus reproduced legacy defects

These are different kinds of evidence; do not add them together.

**Safety tests (assert the corrected behaviour; all pass):** the 12 containment tests above and the 21
multi-client isolation tests in `test/scope.test.ts`. Plus two browser checks that are scripts, not part of
`npm test`: the untrusted-name check (exit 0) and the screen capture (0 page errors).

**Legacy defects reproduced (a "pass" means the defect exists):**

| Check | Defect | Still present after M00? |
|---|---|---|
| C01 | Seed is 15 buildings / 183 floors / 281 AI / 22 human desks (inventory, not a defect) | Unchanged |
| C02, C03 | Simulated revenue on real leads; Sold counted twice | Yes |
| C04 | Content editable after approval / after publishing | Yes |
| C05 | AI draft can change a message after it was approved | Yes. With the switch off, no provider receives either version. |
| C06, C07 | Contact reservation lost on restart; second draft for the same lead | Yes |
| C08 | Old pending messages trimmed while their approval remains | Yes (also observed in our own test) |
| C09 | Manual send skips the approval queue | Yes at the simulator level. The provider call is now held by the kill switch. |
| C10 | Rental-floor agent picks another floor's contact | Yes. Multi-client isolation is per building, not per floor. |
| C11 | Failed send still counts as contacted | Yes |
| C12 | Fake social publishing and metrics | Yes |
| C13 | Changed address does not invalidate a queued recipient | Yes |
| C14 | Rent counted as revenue without payment | Yes |
| C15 | Accelerated simulation clock | Yes |
| C16 | Password reset keeps remembered devices | Yes (README now says so) |
| F13 (browser) | Rental names rendered as HTML in 3D labels | **Reproduced on the checkpoint, fixed in M00** |
| F15 | Public pulse exposed team names, work and counts | **Reproduced on the checkpoint, fixed in M00** |

## 5. Missing evidence (recorded, not substituted)

- **No real data files:** no `data/state.json` or `data/auth.json` from a real installation. Nothing was imported;
  nothing was generated to stand in for them.
- **No `.env` or provider credentials.** No SMTP, Twilio, Anthropic or GoHighLevel check was run, so none is
  claimed.
- **No pilot material.** The pilot the proposal describes (PHP/JSON, n8n workflows, live GoHighLevel, 871-chunk
  knowledge base, Hostinger deploy) is not in this repository, and no n8n exports were attached.
- **No deployment.** There is no deployment configuration and no evidence of one.
- **No real-device measurements.** Real-browser frame rates on real devices were not measured; this container
  renders with software GL.

## 6. Unresolved blockers and risks

1. *(Resolved in M01: the engine only needed starting.)* **M01 cannot run its local services here.** The Docker CLI is installed but no engine is running. Either a
   Docker-capable environment or a decision on running the services natively is needed. `psql` and `redis-server`
   binaries exist; Temporal, Keycloak and MinIO do not.
2. **The kill switch is process-level only.** It is not persisted, and nothing audits who turned it on. The
   durable dispatch policy and ledger are M08.
3. **Not contained in M00, by design (later stages):**
   - the stream has no replay cursor or session-expiry re-check (F11, M07)
   - Google Fonts are loaded from Google on every page view (self-host in M05)
   - "Reply sent" toasts for simulated social replies (F07/F09)
   - the demo clock (F03)
   - all the C-defects listed above
4. **Version mismatch.** The pack targets Node 24; this environment has Node 22.22. The harness ran here
   (`stripTypeScriptTypes` is available but experimental).
5. **Evidence size.** The evidence folder is about 10 MB, mostly PNG screenshots, now part of `main`.

## 7. Next safe step

**M01 — Create the proposal workspace around the current build** (`planning/agentcity-migration/prompts/M01-workspace-and-infrastructure.md`).

Preconditions:
- Start from `main` (a658918 or later).
- Keep `OUTBOUND_ENABLED` unset.
- Run M01 where a Docker engine is available.

Do not start M02+ before M01's gate.

## 8. Compact diff summary (code, excluding planning/)

```
server/outbound.ts (new)   kill switch: OUTBOUND_ENABLED=true AND Delivery=live, else refuse; counts refusals
server/state.ts (new)      fail-closed loader for state.json; never writes
server/delivery.ts         injected transport; gate on approvals, manual sends, reports, test email; phone never "sent"
server/brain.ts            gate checked before a Claude request is queued; injectable call for tests
server/index.ts            wire gate; refuse to start on bad state/auth; catalog-only pulse; state.json saved 0600
src/scene/engine.ts        label() builds DOM from text parts (no innerHTML); city/office labels updated
src/main.ts                boot error shown as text
src/proposal/*             no live data; dial shows catalog desks; EN/ES copy updated
src/ui/*, src/api.ts       kill-switch status in Settings/Outbox; truthful Send/Approve labels and toasts
src/core/types.ts          report status 'skipped'
test/containment.test.ts   12 tests: zero provider calls, catalog-only pulse, fail-closed state, file mode
```
