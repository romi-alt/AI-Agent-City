# M04 — Port all API behavior to Nest REST and GraphQL

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Replace the standalone Express action switch with Nest domain modules, typed controllers, services and GraphQL resolvers. Nest may use its supported Express adapter internally. Both REST and GraphQL are required. Generate OpenAPI and a versioned GraphQL schema; generate typed clients and validate inputs/outputs.

Port contacts/CRM views, agent installations/runs, approvals/draft revisions, content/calendar, reports, rentals/occupancy, tenancy/memberships, settings and integration status through shared authorization/domain services. Public aggregate routes must contain no private contact/work data. Eliminate entire-global-state endpoints. Use scoped pagination, rate limits, optimistic concurrency, structured error codes and request IDs. Return honest queued/accepted/delivered states.

Add immutable draft/approval primitives now: revision hash includes body, subject, recipient, channel, attachment versions and policy context. Editing creates a new revision and invalidates approval. Do not authorize by caller-provided tenant IDs alone. No provider SDK may be invoked directly by a controller.

## Required evidence

Contract tests cover REST and GraphQL for the same permission decisions, invalid inputs, cross-tenant object IDs and stale revision conflicts. Verify GraphQL resolver/batching paths cannot bypass RLS or authorization. OpenAPI/schema generation and client compilation succeed. Inventory parity identifies every original route as migrated, intentionally retired or blocked.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
