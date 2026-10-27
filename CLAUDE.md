# Project instructions

There was no CLAUDE.md before the migration (M00). The first section records the conventions this repository
already follows (from README.md, package.json and the code); the second is the migration fragment from
`planning/agentcity-migration/CLAUDE-MIGRATION.md`, merged here. Where they overlap, the stricter rule wins.

## Project conventions (existing)

- Commands: `npm install` (or `npm ci` from the lockfile), `npm run dev` (server :3001 + Vite :5173),
  `npm run typecheck`, `npm run build`, `npm test`, `npm start` (production build). Node 22+.
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
- Private data lives in `DATA_DIR` (default `./data`, git-ignored) and the server environment. Never commit it.
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
