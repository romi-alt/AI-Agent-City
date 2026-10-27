# P05 — Complete agency controls and client onboarding

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Implement agency owner/staff assignments, district/client management, brand logos/colors/custom domains, tenant-safe theme routing, industry templates (training, auto, real estate, home services, clinics), agent catalog and approval configuration. Clients see the agency brand; custom domains require verified ownership and safe host resolution.

Implement onboarding: industry→CRM connection→knowledge upload→agent/tone/hours/rules→48-hour shadow→reviewed activation. Shadow creates drafts and human reviews but no external sends, publishing or charges caused by agents. Use persisted wall-clock time; it is separate from sign-in link expiry. Go-live also requires channel readiness and explicit authorized activation, not simply elapsed time.

Implement 36 rental-floor occupancy/availability from the three supplied rental buildings, explicit client/workspace assignment, durable allocation and concurrency-safe vacancy. Reconcile rental $199 offering versus Pro $199 plan through configurable product mapping—same price is not proof of identical entitlements. Vacancy must archive/cancel scoped work and revoke access without deleting legal/audit history or leaking to the next occupant.

## Required evidence

Test agency A versus B and assigned/unassigned staff; custom host spoofing; all industry defaults; paused/restarted shadow clock; no provider calls during shadow; simultaneous floor booking; floor turnover with old content/jobs/credentials and clients on adjacent floors. Measure onboarding effort with real beta evidence rather than hardcoding an under-one-day success claim.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
