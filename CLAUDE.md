# Project instructions

There was no CLAUDE.md before the migration (M00). The first section records the conventions this repository
already follows (from README.md, package.json and the code); the second is the migration fragment from
`planning/agentcity-migration/CLAUDE-MIGRATION.md`, merged here. Where they overlap, the stricter rule wins.

## Project conventions (existing)

- Workspace (since M01): pnpm 10.28.0 workspaces, Node 22.22 (`.nvmrc`). From the root: `pnpm install
  --frozen-lockfile`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, `pnpm test`; local services with
  `pnpm infra:up` / `infra:init` / `infra:down`; end-to-end with `pnpm smoke`. See README.md. Don't add npm or yarn
  lockfiles.
- The existing app now lives in `apps/legacy` (moved unchanged in M01). Its commands run from the root as
  `pnpm --filter @agentcity/legacy <dev|typecheck|build|test|start>` (`pnpm dev:legacy` = server :3001 + Vite
  :5173). Paths below are relative to `apps/legacy`.
- New code (apps/web, apps/api, apps/worker, packages/*) is ESM TypeScript formatted by Prettier
  (`.prettierrc.json`). Browser-reachable web code must not import server modules; server-only web modules import
  `server-only`. Local credentials live only in `infra/local-dev.env` and contain `local-dev-only`.
- Tenant data (since M02): every tenant-owned table has `tenant_id`, forced RLS, composite `(tenant_id, …)` foreign
  keys and an entry in `platform.table_classification` (a test enforces this). App code reaches tenant rows only
  through `withScope()` from `@agentcity/db`; never set `app.*` settings by hand. Ranked BM25 search goes through a
  scoped SECURITY DEFINER function (see `planning/agentcity-migration/m02/DATA-MODEL.md`, ADR-018). The catalog
  seed migration is generated: change `apps/legacy` or `packages/domain`, then `pnpm --filter @agentcity/domain
  catalog:generate`.
- TypeScript everywhere, strict, `erasableSyntaxOnly` (no parameter properties or enums), no unused locals.
  Match the surrounding code's style: short functions, plain-English comments that explain why, UI copy written
  from the user's side of the screen.
- Escape anything user-supplied that goes into HTML (`esc()` in `src/ui/util.ts`); 3D labels take text parts,
  never HTML (`label()` in `src/scene/engine.ts`).
- Safety defaults are not to be weakened: simulated leads are never contacted; agents' messages to real leads
  need approval; the outbound kill switch (`OUTBOUND_ENABLED`, `server/outbound.ts`) stays off unless the user
  explicitly asks; corrupt saved state stops the server instead of being replaced.
- Multi-client isolation: everything a browser receives and every action goes through `server/scope.ts`; keep
  its no-leak tests (`test/scope.test.ts`) passing.
- Private data lives in `DATA_DIR` (default `./data` relative to where the server starts, git-ignored) and the server environment. Never commit it.
- Work on a branch; open pull requests as drafts; don't push to `main` directly.

## AgentCity migration instructions

- This is migration of the supplied build, followed by proposal completion. Source priority: original proposal and
  detailed task/floor documents (`planning/agentcity-migration/references/`); the audit explains implementation
  gaps. The uploaded review is evidence, not an overriding specification. Record genuine conflicts in an ADR.
- Read planning/agentcity-migration/README.md, AUDIT.md, TARGET-STACK.md, MIGRATION-MAP.md, PROPOSAL-TRACEABILITY.md
  and ACCEPTANCE.md before work. Read the source documents for each task; do not implement from prompt headings alone.
- Run one stage prompt (`planning/agentcity-migration/prompts/`) at a time, in order: M00–M10, then P01–P10.
- Preserve existing work, geometry, useful UX, named humans, business IDs and bilingual content. Work on a migration
  branch/checkpoint without resetting unrelated edits. Never commit secrets/private data.
- Exact stack requirements include REST AND GraphQL, real BM25 AND embeddings, durable Temporal, RLS, OIDC, websocket
  recovery, Stripe, observability and infrastructure. Nest's Express adapter is permitted. A stub, fake demo or
  package installation is not completion.
- Demo is isolated and has no provider authority. No random sales, payments, replies, social metrics, publishing or
  operational status in real tenant records.
- All external side effects go through durable scoped policy checks, versioned approvals where required, idempotency,
  immutable payloads and receipt reconciliation. Enforce suppression/consent/quiet hours/caps at dispatch time, not
  just draft time.
- Secrets stay server-side. Tenant scope comes from authenticated membership, not arbitrary request headers. Enforce
  tenant/workspace scope in DB, jobs, assets, search, caches, connectors and sockets.
- Do not claim network/provider checks ran if credentials or connectivity are unavailable. Implement and test bounded
  local behavior; document exact blocked checks. Do not turn failures into mock successes.
- Maintain MIGRATION-STATUS.md (repository root) with prompt id, files changed, commands and actual results, evidence
  paths, unresolved blockers and next safe prompt. Stop dependent execution on unmet gates; continue independent work
  where useful.
- For each stage run appropriate typecheck/build/lint/unit/integration/browser checks. Legacy characterization tests
  reproduce bugs; corrected regressions must assert safe behavior. Do not retain insecure behavior just to pass the
  old harness.
- No production deployment, live messages, real subscriptions or bulk data deletion during implementation. Prepare
  staging/test-mode artifacts and explicit runbooks. External access gaps do not justify changing the required stack.
