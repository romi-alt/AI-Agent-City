# P06 — Implement proposal pricing and auditable billing

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Configure versioned products/prices: Starter $79 (2 agents,1 CRM,1 user), Pro $199 (4 agents,KB,5 users), Full Building $399–799 (7+ agents,approvals,reports,15 users), Agency $999 platform plus wholesale buildings. Preserve range/wholesale terms as configurable validated commercial choices; do not invent final rates, overage allowances or unlimited agent counts. Distinguish billable AI installations, users, human desks and map decorations.

Implement Stripe test-mode subscriptions, seats, entitlements, upgrades/downgrades/proration, cancellation, trials if approved, invoicing and metered AI usage with allowance/overage units. Use signed deduplicated webhook processing and out-of-order reconciliation, durable usage event IDs and provider-cost versus billable-usage separation. Configure rental subscriptions explicitly through P05 mapping.

Enforce entitlements server-side and in workflows, prevent race-condition over-allocation, and define grace/read-only behavior. Never count asking rent or simulated outcomes as collected revenue. Reconcile invoices/payments/refunds and expose customer portal plus audited billing changes with step-up.

## Required evidence

Stripe test cases cover duplicate/out-of-order webhooks, payment failure/recovery, downgrade below current seats, late usage, refund, cancellation, multi-building wholesale and simultaneous hires. Usage totals reconcile to ledger without double charges. No live subscription or charge is created; unknown commercial values remain configuration blockers.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
