# M05 — Port the existing interface to Next and React

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Rebuild existing screens as typed React components and Next routes backed by new API clients: city navigation, building/floor/desk inspectors, CRM list/kanban/contact drawer, approvals, content/calendar, reports, rentals, settings/admin and login. Preserve useful UX and English/Spanish presentation, exact names and stable IDs. Do not replace everything with a generic SaaS dashboard.

Create tenant/workspace selection and role-based navigation without exposing unauthorized records in HTML, caches or server rendering. Use secure client/server boundaries and accessible keyboard/focus behavior. Add loading, empty, error and reconnect states. Render user/LLM text safely. Keep the 2D dashboard independent of WebGL so it works when canvas initialization fails.

Port the public proposal presentation but mark roadmap claims accurately and reconcile pricing to original proposal defaults; do not present GHL/social/billing as connected before verified. Display real delivery/approval states and distinguish simulated fixtures unmistakably. Keep an explicit demo route with no access to production credentials.

## Required evidence

Run route/browser tests on mobile and desktop, role and tenant transitions, SSR/cache isolation, invalid user text, keyboard navigation and WebGL-disabled 2D operation. Compare captured baseline workflows and document deliberate changes. Production UI contains no random success/metrics and no provider secrets.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
