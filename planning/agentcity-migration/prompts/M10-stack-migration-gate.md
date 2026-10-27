# M10 — Prove the existing product has migrated

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Audit TARGET-STACK row by row and original screen/route inventory. Ensure active production paths use Next/React/R3F, Nest REST+GraphQL, Socket.IO, Temporal, OIDC and PostgreSQL RLS. Shared platform slices from M09 must work. No production authority remains in JSON, custom auth, global SSE, Sim ticks, in-memory approval queues or global provider credentials. An isolated legacy demo is acceptable and visibly labeled.

Run fresh setup, migration/import rehearsal, rollback/restore, CI builds, tenant/role matrix and browser journeys from city to real DB-backed contact, draft, approval and fake/sandbox receipt. Compare seed inventory and preserve deliberate business mappings. Confirm package boundaries prevent browser imports of server SDKs/secrets.

Produce a migration acceptance report with evidence for each requirement and classify complete/local-only/external-blocked/failed. Do not label the whole proposal finished: external integrations and product breadth continue in P01–P10. Update documentation and remove obsolete production routes only after parity evidence. Do not enable outbound production traffic.

## Required evidence

All local stack and isolation gates pass; blocked provider/account verification is explicitly listed. Fail migration acceptance on wrong stack, unsafe data migration, mutable approvals or demo facts in real accounts. Keep unfinished dependent work blocked and give the exact repair list before proceeding to feature rollout.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
