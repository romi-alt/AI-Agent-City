# P04 — Implement all twelve social-agent capabilities

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Build all twelve categories in TASKS FOR SOCIAL MEDIA AGENTS: strategy, 30-day calendar, platform-specific creation, real branded graphics/video production, multi-platform publishing, community monitoring/replies/escalation, lead campaigns, trend monitoring, public competitor analysis, performance analytics, optimization and weekly reports.

Integrate approved creative tools with durable generation jobs, object assets, brand presets, provenance and failed/retry states; a creative brief is not an image/video. Create capability-aware adapters for Facebook, Instagram, LinkedIn, TikTok and YouTube; verify supported account types/scopes and review restrictions through current official docs. Unsupported/unapproved capabilities remain disabled with specific requirements. Use actual authorized public/connected data for trends/competitors and actual platform measurements for metrics.

Tie approval to exact caption, asset hashes, account, audience, schedule and spend where applicable. Editing scheduled/published content creates a revision and reapproval workflow. Scheduling uses durable timezone-aware jobs; publish completion requires provider identifiers and reconciliation. Community replies and ad launches use risk and budget policies. Include campaign attribution and real conversion definitions.

## Required evidence

Tests cover generated asset availability, expired tokens, duplicate publish retry, uncertain provider acceptance, edit-after-approval, DST, sensitive comment escalation and metric provenance. No fake reach/likes/comments, canned trends presented as live, or log-only ad launch. Document each platform's locally tested and externally verified capabilities separately.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
