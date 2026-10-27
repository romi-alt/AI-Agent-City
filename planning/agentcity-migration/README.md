# AgentCity migration and completion pack

This pack replaces the earlier greenfield prompts. It was prepared from the uploaded sales-city.zip, its build review and the original nine requirement files. It does not modify the uploaded application.

## Use with the existing Claude Code project

1. Keep your existing repository. Copy this folder to `planning/agentcity-migration/` inside it. Do not replace your package.json, source folders or root CLAUDE.md with the earlier starter.
2. Read `AUDIT.md` and `TARGET-STACK.md`. The stack decision is already made: migrate to the proposal's stack.
3. Paste `prompts/M00-baseline-and-containment.md` into Claude Code. It creates the repository checkpoint, captures a baseline and isolates outbound effects before migration.
4. Continue M01 through M10 in order. These migrate the existing product, not a new unrelated demo. M10 is the stack migration acceptance gate.
5. Then run P01 through P10 in order to complete the proposal's product and operational requirements. Do not skip the external verification gates or claim certification from code.
6. Each prompt is complete but scoped. Claude must update migration status and run the stated tests before advancing. Paste one prompt at a time.

`CLAUDE-MIGRATION.md` is an instruction fragment for Claude to merge into the existing root CLAUDE.md after inspecting existing instructions. It is not a replacement for your project's other conventions.

## What was verified here

Source and control-flow review of the supplied application; an exact generated seed inventory; sixteen isolated characterization tests against the original core/auth logic; package manifest/lockfile consistency; archive/source fingerprints. See audit/characterization-results.txt and audit/VALIDATION.md.

No full UI or server build is claimed: an offline npm ci attempt failed because dependencies were unavailable in cache. No original data/state.json, data/auth.json, .env credentials, n8n exports or .git history were attached. The build review's commit 8250c96 cannot be independently verified from the ZIP. No messages, AI requests, billing operations or deployment were performed.

The tests reproduce legacy flaws. A passing characterization test means the behavior exists; it does not mean the behavior is acceptable. During migration, write new regression tests for the corrected behavior. Do not copy the legacy bug assertions into production acceptance tests.

## Files

- AUDIT.md: detailed findings and corrections to the uploaded review.
- TARGET-STACK.md: proposal technologies and migration completion rules.
- MIGRATION-MAP.md: old-file-to-new-module plan, data/identity import and cutover.
- PROPOSAL-TRACEABILITY.md: proposal and task requirements mapped to prompts and evidence.
- ACCEPTANCE.md: concrete regression and release gates.
- CLAUDE-MIGRATION.md: persistent implementation instructions.
- prompts/: 21 staged prompts, M00–M10 then P01–P10.
- CLAUDE-CODE-PROMPTS.md: all prompts in one readable document.
- audit/: source manifest, exact seed inventory, tests and validation evidence.
- scripts/: reproducible dependency-free core/auth audit harness for Node 24.
- references/: original requirement documents and uploaded build review.
