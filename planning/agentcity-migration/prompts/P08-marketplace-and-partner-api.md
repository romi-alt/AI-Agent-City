# P08 — Deliver the proposal marketplace and partner surface

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Create a versioned agent/integration marketplace with publisher metadata, capabilities, required scopes, pricing/entitlement metadata, tenant install/configure/upgrade/pin/uninstall and review provenance. Reuse agent/connector registries rather than creating a second runtime. Avoid unrestricted execution of uploaded code: define a capability-limited trusted publication model; if third-party code execution is added it requires a separately reviewed isolation design.

Implement partner API/SDK from Nest contracts with scoped client identities, rate limits, idempotency and tenant-limited webhooks with signing/rotation/replay protection. Provide a working sample integration and documented version/deprecation policy. Marketplace installations cannot obtain another tenant's secrets or broaden permissions automatically on update.

Support agencies sharing approved templates without exposing customer datasets, prompts containing secrets or conversation history. Commercial marketplace settlement details absent from sources must remain explicit business decisions, not invented financial rules.

## Required evidence

Test malicious capability escalation, upgrade rollback, stale versions, unauthorized publisher access, uninstall with running workflows and partner token revocation. Compile/run generated SDK sample against local API; verify signed webhook delivery/retry and OpenAPI/GraphQL parity. Record any external publisher/partner acceptance gate.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
