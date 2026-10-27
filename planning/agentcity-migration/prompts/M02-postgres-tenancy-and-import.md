# M02 — Replace global JSON authority with scoped PostgreSQL data

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Implement the domain model and RLS requirements in MIGRATION-MAP.md. Explicitly model agency, client tenant, workspace, physical district/building/floor/desk, assignments and agent installations. Separate rental placement from security ownership. Classify shared catalog tables and apply tenant scope to every tenant-owned table, join, unique key and reference.

Use transaction-local authenticated scope and non-bypass application roles. Implement durable audit/outbox tables and immutable money/usage/dispatch facts. Keep demo fixture data in a marked isolated tenant. Preserve stable building IDs through alias mapping.

Build the read-only version-2 legacy dry-run/import pipeline: explicit ownership mapping, validation, quarantine, duplicate/dangling-reference report, imported provenance, deterministic IDs, idempotent re-run and reconciliation counts. Never derive verified payments, consent or receipts from simulated state. Expire old approvals and keep schedules disabled. Real state/auth were not uploaded; test with clearly labeled fixtures and document the missing production-input gate.

## Required evidence

Run DB-level cross-tenant SELECT/INSERT/UPDATE/DELETE/join/search tests using the real application role. Test a client on rental L1 against L2; same-building access must fail. Test pooled connection reuse and forged scope. Import twice with unchanged totals, reject unknown schema without writes, and demonstrate backup restore. Foreign keys must reject cross-tenant associations.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
