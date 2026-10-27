# M00 source-to-target migration table

`planning/agentcity-migration/MIGRATION-MAP.md` maps the audited ZIP (commit f96819d). This table maps the
**actual checkout** (`migration/m00-baseline`), which also contains the unmerged multi-client isolation and city
animation work, plus M00 containment. Destinations follow TARGET-STACK.md (`apps/web`, `apps/api`,
`apps/worker`, `packages/*`); final paths are fixed in M01.

| Current file | What it holds | Target | Treatment |
|---|---|---|---|
| `index.html`, `src/main.ts` | App shell and boot | `apps/web` App Router layout | Replace; keep boot states (signing in, can't reach, nothing to show) |
| `src/ui/app.ts`, `src/ui/views.ts`, `src/ui/util.ts`, `src/style.css` | Imperative screens: panels, CRM, lead drawer, approvals, content wall, outbox, settings, clients/people | `apps/web` React components | Port screen by screen against ROUTES-AND-SCREENS.md; React text rendering replaces template strings |
| `src/ui/login.ts` | Password + TOTP sign-in, setup, reset | Keycloak (OIDC) login and account flows | Retire after M03 identity cutover; keep the visual style as the custom theme reference |
| `src/api.ts` | REST/SSE client | Generated OpenAPI/GraphQL clients, Socket.IO client | Replace (M04, M07) |
| `src/scene/engine.ts`, `cityView.ts`, `officeView.ts`, `meshes.ts`, `textures.ts`, `street.ts` | Plain Three.js city, offices, traffic, pedestrians, labels | `packages/city-scene` (R3F + drei) | Port geometry, layouts, personas, traffic/pedestrian behaviour and instancing; fix lifecycle/disposal, 2D fallback, reduced motion (audit F14). M00 already made labels text-only |
| `src/core/data/buildings.ts`, `tasks.ts`, `templates.ts` | Building/floor/desk catalog, task lists, message and social copy | `packages/domain` catalog + versioned seed migrations | Keep stable building ids; templates need factual-field review before any live use (audit) |
| `src/core/types.ts` | Domain types | `packages/domain` DTOs + DB schema | Add agency/tenant/workspace identities (M02) |
| `src/core/sim.ts` | Simulator: clock, random outcomes, reports, social, approvals | `packages/demo` (no provider authority) + Temporal workflows + DB transactions | Extract pure policies; never production (audit F03–F10) |
| `server/index.ts` | Express routes, SSE, clock, persistence | `apps/api` (Nest REST + GraphQL + Socket.IO gateway) | Replace action switch with typed commands (M04) |
| `server/scope.ts` | Multi-client roles, snapshot/patch filters, action authorization | `apps/api` guards + PostgreSQL RLS | Port the role matrix and the no-leak tests; database becomes the enforcement point (M02) |
| `server/auth.ts`, `server/totp.ts` | Custom accounts, TOTP, sessions, devices | Keycloak | Retire after verified cutover; never import secrets, sessions or devices (MIGRATION-MAP) |
| `server/outbound.ts` (M00) | Outbound kill switch | Dispatch policy service + feature flag in `apps/worker` / `packages/connectors` | Keep the default-off switch semantics through cutover |
| `server/delivery.ts` | SMTP and Twilio transport | `packages/connectors` + dispatch ledger + signed receipts | Replace (M08, P07) |
| `server/brain.ts` | Anthropic drafting queue | `packages/llm` gateway | Replace (M09, P02) |
| `server/state.ts` (M00) | Fail-closed snapshot loader | Read-only legacy importer (M02) | Its validation rules seed the importer's quarantine checks |
| `data/state.json`, `data/auth.json` (not in the repository) | Runtime state | Offline import with mapping and quarantine | No real copies were provided; see MIGRATION-STATUS.md missing evidence |
| `src/proposal/*`, `proposal.html` | Bilingual public proposal page | `apps/web` public route | Keep; its pricing is legacy marketing, not the platform plan table (audit F15) |
| `test/scope.test.ts`, `test/containment.test.ts` | Isolation and containment regressions | Ported to the new API/DB test suites | Keep asserting safe behaviour; do not port the legacy characterization assertions |
| `vite.config.ts`, `tsconfig*.json`, `package.json` | Build | Workspace/monorepo config (M01) | Replace |
| `README.md`, `SPEC.md` | Docs | Updated against the original documents | Distinguish current capability from roadmap |
