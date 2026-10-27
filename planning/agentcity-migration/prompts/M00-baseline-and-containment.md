# M00 — Baseline the existing project and contain unsafe effects

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Read the supplied source, audit and all project instructions before editing. Confirm current branch and git status; preserve uncommitted work. Create a safe migration branch/checkpoint without committing secrets or unrelated changes. Inspect actual package scripts, config, routes and source; do not assume the ZIP and this checkout are identical. Record differences against audit/source-manifest.json and record the real commit if available.

Install using the repository lockfile, run existing build/type checks and record actual output. If installation is blocked, retain the error and do not claim compilation passed. Run the supplied original-source characterization harness against an isolated copy where compatible. Capture current city/building/floor/desk, CRM, approval, content, reporting, settings and bilingual public-page behavior with screenshots where the app runs.

Implement a minimal containment patch in this existing runtime before structural migration: a server-side outbound kill switch enforced by every delivery path, including manual sends, reports and test email; safe default off. Prevent demo-mode provider calls. Remove identifying work/contact data from unauthenticated pulse responses. Render untrusted names as text rather than innerHTML. Make corrupt/unsupported state fail closed without overwriting originals. Do not attempt the whole migration here.

Create MIGRATION-STATUS.md, a route/screen inventory, external-effect inventory, source-to-target migration table and private-data backup/recovery runbook. Merge CLAUDE-MIGRATION.md carefully into existing instructions. Record the absent real snapshots/workflow exports as missing evidence; do not generate substitutes and call them imported.

## Required evidence

Verify outbound fake adapters receive zero calls from every disabled path; a malformed snapshot remains byte-identical after startup failure; malicious rental/person names render as literal text. Record baseline build results and any blockers. Finish with the exact next stage and a compact diff summary. Do not scaffold a replacement application in this stage.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
