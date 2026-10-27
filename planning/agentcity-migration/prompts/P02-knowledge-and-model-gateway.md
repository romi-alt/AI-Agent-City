# P02 — Complete grounded tenant knowledge and model routing

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Implement website/PDF/FAQ ingestion with fetch limits, SSRF protection, file validation, source versioning, tenant ownership, chunking, embedding, reindex and deletion. Preserve source/page/span references; ingest the real 871-chunk pilot only if actually supplied. Build genuine BM25+vector hybrid retrieval with tested tenant filters and score fusion, not an invented BM25 label.

Finish OpenAI, Anthropic and configurable open-model adapters behind the gateway, task routing, model availability validation, cache isolation, token/cost accounting, reservation/reconciliation, budget caps and bounded retries. Use actual documented model identifiers available to the configured account. Retrieved content is untrusted input and cannot override tool or tenant policies.

Answers include supported citations or an explicit insufficient-evidence response. Build evaluations from source documents, contradictions, stale versions and adversarial cross-tenant content; allow reproducible replay with redacted data and pinned versions. Do not send private corpus to an unapproved provider.

## Required evidence

Evaluate citation correctness, retrieval recall, abstention, stale-document deletion, prompt injection, tenant leakage and concurrent cap enforcement. Verify one configured provider in sandbox when credentials exist; report others separately as adapter-tested or externally blocked. Logs omit secrets and raw sensitive prompts by default.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
