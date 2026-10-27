# P01 — Build the real GoHighLevel connector and synchronization

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Implement GHL through the connector SDK using tenant-scoped OAuth/private tokens as supported by current official documentation. Import actual contacts, conversations, pipelines/stages, appointments and opportunity values with explicit external IDs and scoped cursors. Legacy name-matched stages need reviewed mappings; names alone are not stable identity.

Support initial backfill, pagination, incremental sync, webhook signature/auth verification as available, deduplication, token rotation, rate-limit backoff, missing-scope alerts and conflict reconciliation. Route outbound through the dispatch ledger. Ground drafts in latest conversation and suppression state, and block double-texting across agents. Clearly separate CRM stage/value from recognized revenue and provider acceptance from delivery.

Expose connection health, last successful sync and actionable errors. If the proposal's existing n8n workflows/871 chunks are not provided, create import tools and list them as missing artifacts; do not claim the supplied simulator contains them.

## Required evidence

Use fixtures plus opt-in sandbox contract tests for create/update/reply/suppression, repeated webhook, pagination interruption, renamed stages, token revocation and rate limiting. Prove two tenants cannot reuse credentials or external identifiers. Measure new-lead response target under one minute in a consented sandbox without guaranteeing external latency.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
