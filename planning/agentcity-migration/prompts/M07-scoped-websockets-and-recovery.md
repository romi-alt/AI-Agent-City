# M07 — Replace global SSE with recoverable tenant realtime

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Implement a Nest Socket.IO gateway with authenticated subscriptions and server-resolved tenant/workspace authorization. Design rooms for authorized scopes, never auto-join arbitrary room IDs supplied by clients. Revalidate revocation, expiry and membership changes; avoid stale permission recovery.

Publish committed outbox events with monotonic scoped cursors/versions, tenant-safe payloads, event schema versions and correlation IDs. On reconnect reconcile snapshot+cursor, replay available events and refetch on gap/retention expiry. Handle duplicate/out-of-order messages and races between snapshot and subscription. Verify chosen Redis adapter capabilities; socket recovery alone is not a durable event log.

Replace SSE consumers in React/R3F. Coalesce visual updates without losing authoritative state. Apply backpressure and redact sensitive activity from city summaries. Instrument commit-to-client latency with a target under one second under documented load.

## Required evidence

Two tenants and two rental-floor clients receive only authorized events. Test disconnect during updates, server restart, duplicate/out-of-order delivery, missing cursor history, revoked/expired sessions and horizontal API instances. Snapshot convergence is required after every recovery path. Remove global SSE from production routing.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
