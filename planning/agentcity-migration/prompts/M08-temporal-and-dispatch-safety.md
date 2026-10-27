# M08 — Replace the simulator with durable workflows

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Extract business operations from Sim into Temporal workflows and activity services. Workflow code must be deterministic; clocks, randomness, providers and DB I/O belong in appropriate Temporal primitives/activities. Version templates/workflows safely for existing executions. Persist scheduling, retries, approval waits and durable lead/channel reservations.

Implement workflow sequence: read authorized CRM/context→retrieve knowledge→draft revision→policy→approval when required→dispatch ledger→connector→receipt reconciliation→facts/outbox. Use atomic dispatch claims, stable idempotency keys and bounded retry/backoff. A provider timeout after possible acceptance must reconcile before retry; do not promise exactly-once effects when a provider lacks idempotency.

Freeze approved payloads and recheck recipient, consent, DND, timezone quiet hours and caps immediately before dispatch. Cancel/invalidate on edits, role revocation, stale context or policy change. Manual human sends may use an explicit logged human authorization instead of a second queue, but must obey all sending policies. Failed sends cannot advance contacted stage or inflate outreach. Real opportunity money comes only from verified CRM/payment facts. Remove production Sim ticks/random outcomes; demo remains isolated.

## Required evidence

Turn C02–C15 into corrected regression tests: immutable in-flight bytes, no stale approval, no lost locks/restart duplicates, pending records never truncated, rental isolation, no random revenue/publication and honest failed-send states. Kill workers at dispatch boundaries and prove restart reconciliation. Test DST/quiet hours, STOP racing approval, caps under concurrency, delayed webhook and manual/report/test paths.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
