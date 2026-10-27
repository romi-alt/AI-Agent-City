# M09 — Complete functional foundations of the remaining stack

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Implement thin working infrastructure slices, not empty scaffolds: tenant credential vault/key references and rotation; S3 uploads/download authorization; LLM gateway adapter contracts with per-tenant spend reservation/cache keys; PostgreSQL pgvector plus actual BM25 retrieval and fusion; signed Stripe test webhook/usage ledger; OpenTelemetry traces to Grafana-compatible stack and redacted Sentry errors.

Each slice must execute a meaningful local/test-mode request through API/worker/data boundaries. Use deterministic fakes for external contracts when credentials are absent, clearly label them, and provide opt-in sandbox integration commands. Implement Redis distributed rate limits without treating it as authoritative billing or workflow history.

Trace a run through request, workflow, retrieval, model, approval and dispatch with model/version, cost and citation provenance. Separate secret storage, PII and operational logging. Record cost units and monetary precision, tenant cache scope and retention. Business completeness is delivered in P stages; foundations must already enforce tenancy.

## Required evidence

Test cross-tenant object/search/cache/secret denial, real DB hybrid retrieval ranking, gateway cap races, duplicate Stripe events and trace correlation/redaction. Show one end-to-end functional test per foundation. Missing external sandboxes are explicit blockers for provider certification, not reasons to simulate a successful live integration.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
