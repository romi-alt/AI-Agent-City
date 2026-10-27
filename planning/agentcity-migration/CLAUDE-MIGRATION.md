# AgentCity migration instructions
Merge this fragment into the existing repository CLAUDE.md after reading existing instructions. Do not overwrite unrelated conventions.

- This is migration of the supplied build, followed by proposal completion. Source priority: original proposal and detailed task/floor documents; this audit explains implementation gaps. The uploaded review is evidence, not an overriding specification. Record genuine conflicts in an ADR.
- Read planning/agentcity-migration/README.md, AUDIT.md, TARGET-STACK.md, MIGRATION-MAP.md, PROPOSAL-TRACEABILITY.md and ACCEPTANCE.md before work. Read the source documents for each task; do not implement from prompt headings alone.
- Preserve existing work, geometry, useful UX, named humans, business IDs and bilingual content. Work on a migration branch/checkpoint without resetting unrelated edits. Never commit secrets/private data.
- Exact stack requirements include REST AND GraphQL, real BM25 AND embeddings, durable Temporal, RLS, OIDC, websocket recovery, Stripe, observability and infrastructure. Nest's Express adapter is permitted. A stub, fake demo or package installation is not completion.
- Demo is isolated and has no provider authority. No random sales, payments, replies, social metrics, publishing or operational status in real tenant records.
- All external side effects go through durable scoped policy checks, versioned approvals where required, idempotency, immutable payloads and receipt reconciliation. Enforce suppression/consent/quiet hours/caps at dispatch time, not just draft time.
- Secrets stay server-side. Tenant scope comes from authenticated membership, not arbitrary request headers. Enforce tenant/workspace scope in DB, jobs, assets, search, caches, connectors and sockets.
- Do not claim network/provider checks ran if credentials or connectivity are unavailable. Implement and test bounded local behavior; document exact blocked checks. Do not turn failures into mock successes.
- Maintain MIGRATION-STATUS.md with prompt id, files changed, commands and actual results, evidence paths, unresolved blockers and next safe prompt. Stop dependent execution on unmet gates; continue independent work where useful.
- For each stage run appropriate typecheck/build/lint/unit/integration/browser checks. Legacy characterization tests reproduce bugs; corrected regressions must assert safe behavior. Do not retain insecure behavior just to pass the old harness.
- No production deployment, live messages, real subscriptions or bulk data deletion during implementation. Prepare staging/test-mode artifacts and explicit runbooks. External access gaps do not justify changing the required stack.
