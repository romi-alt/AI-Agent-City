# P10 — Audit proposal completeness and prepare beta release

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Read every original source and PROPOSAL-TRACEABILITY.md; update the matrix with exact code paths, test results, screenshots/provider IDs, limitations and owners. Evaluate all ACCEPTANCE.md gates and prior stage blockers. Do not equate installed packages, UI cards, fixtures or mock adapters with finished functionality.

Run complete three-tenant beta journeys using isolated authorized test data: agency setup, client onboarding, shadow review, role/tenant access, grounded new-lead response, approval, receipt, CRM update, report, content asset/publishing, rental turnover and test billing. Include accessibility, mobile fallback, performance measurements, backup restore and incident drills. Check all detailed agent/social tasks and exact named building/floor mappings.

Produce a staged launch runbook, operations guide, tenant activation checklist, known limitations and evidence-based go/no-go. Re-read source roadmap diagrams for business/revenue gates and record measured evidence, not invented targets. Three beta clients, validated pricing, channel registrations, phase-gate paying-client outcomes and SOC2 audit outcomes require real external evidence. A completed codebase cannot declare those gates passed by itself.

Keep outbound off for any tenant lacking prerequisites. Prepare deployment and activation steps but do not execute live sends, charges or production rollout. Finish with an honest full-proposal status and only genuinely unresolved decisions.

## Required evidence

All local tests/builds pass and every requirement has evidence or an explicit blocker. Exercise tenant isolation across API/GraphQL/DB/search/cache/socket/workflow/object/connector boundaries. No open critical safety/data-loss issue, random business facts, mutable approved payloads or unverifiable success claims. Phase progression is blocked if its actual business gate is unmet.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
