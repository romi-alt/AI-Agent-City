# Synthetic legacy fixtures — not real data

No real `state.json` or `auth.json` was provided for the migration. These files exist only to test the importer.

- **`state.v2.fixture.json`** is produced by the legacy app's own simulator (`apps/legacy`), so it has the exact
  version-2 shape. Simulated people get the simulator's random names and `@example.com` addresses. The
  hand-entered "real" leads are all named `Fixture Real …` at `@example.test`. Deliberate defects are included for
  the report: one duplicate lead, one message pointing at a missing lead, one scheduled post, and one simulated
  revenue entry.
- **`auth.fixture.json`** follows the legacy `auth.json` shape. Every credential field holds
  `FIXTURE-NOT-A-REAL-SECRET`; the tests prove that value never reaches the database.
- **`mapping.fixture.json`** is an example ownership mapping. A real mapping must be written and reviewed by the
  owner (see `planning/agentcity-migration/m02/IMPORT-RUNBOOK.md`).

Regenerate with `pnpm --filter @agentcity/legacy-import fixtures:generate`. The simulator is random, so this
produces a different file; the tests read whatever is committed.
