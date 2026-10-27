# M01 — Create the proposal workspace around the current build

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

After M00, introduce apps/web (Next/React), apps/api (Nest), apps/worker (Temporal) and packages/domain, contracts, city-scene, connectors, llm, knowledge and demo as appropriate. Preserve the legacy app in an isolated location or runnable script while porting; do not delete working code prematurely. Choose one workspace/package manager and a pinned compatible toolchain, retaining reproducible locks.

Add local Docker Compose for PostgreSQL/pgvector and verified BM25 support, Redis, S3-compatible MinIO, Temporal and Keycloak; use local-only development credentials and environment validation. Add health checks, readiness and documented startup/shutdown commands. Choose actual compatible database extension images rather than nonexistent tags. Establish migrations, test fixtures, shared formatting/type checks, separate browser/server imports, and CI build jobs.

Do not claim business features complete because service folders exist. Add a real web→API health request and a real worker activity round trip; no production sends. Record architecture choices and port/secret boundaries.

## Required evidence

A fresh checkout installs from lockfile; documented local startup reaches healthy services; web/API/worker build; API readiness fails when required storage is unavailable. Prove one workflow survives worker restart. If Docker is unavailable, provide configurations and mark runtime smoke checks blocked.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
