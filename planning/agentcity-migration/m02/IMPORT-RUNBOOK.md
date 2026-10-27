# Legacy import runbook

This is how to import a real legacy installation (`data/state.json` + `data/auth.json`) once the owner provides
it. It has been rehearsed only with the synthetic fixtures (`packages/legacy-import/fixtures/`). **No real data
has been imported. This gate stays open until it has been.**

## Before you start

- **Outbound:** keep the legacy app's outbound switch off (`OUTBOUND_ENABLED` unset) for the whole procedure.
- **Freeze the source:** stop the legacy server, or freeze its writes, so `state.json` stops changing.
- **Target database:** use a database migrated to the current schema (`pnpm db:migrate`). For a rehearsal, use a
  throwaway database, never the one people work in.

## 1. Back up and fingerprint (outside the repository)

```bash
mkdir -p /secure/agentcity-backup/$(date +%F)
cp data/state.json data/auth.json /secure/agentcity-backup/$(date +%F)/
chmod 0444 /secure/agentcity-backup/$(date +%F)/*
sha256sum /secure/agentcity-backup/$(date +%F)/* > /secure/agentcity-backup/$(date +%F)/SHA256SUMS
```

Then restore one copy into a scratch folder and verify it with `sha256sum -c` before going on. Never commit a
backup. `pnpm legacy:rehearse-backup` shows the same steps, plus a database dump and restore, on fixture data.

## 2. Write the ownership mapping

Start from `packages/legacy-import/fixtures/mapping.fixture.json`. The owner must review every line. Keep the
mapping with the backup, not in the repository: it names real clients and people.

- **`tenants`:** each client organisation, and the agency's own business. Give each one its workspaces and the
  buildings or floors they occupy. A floor can be placed only once.
- **`legacyClientIds`:** link each legacy client (`auth.json` → `clients`) to its tenant.
- **`contactOwnership`:** state who owns real leads.
  - Use `legacyBuilding` only when that tenant is the building's only occupant.
  - Leads on shared buildings (rental floors) must be listed by `legacyLeadIds`.
  - Every rule needs `evidence`: who confirmed it, and how.
- **`users`:** one entry per person to invite, with an email the person confirmed. Legacy users have no email
  field, so nothing is guessed. Credentials, sessions and devices are never imported. People re-enrol through OIDC
  (M03).

## 3. Dry run (cannot write)

```bash
pnpm legacy:import dry-run --state /scratch/state.json --auth /scratch/auth.json \
  --mapping /secure/mapping.json --out /secure/dry-run-report.json
```

Review the report:
- `counts`: for every collection, input = imported + quarantined + skipped.
- `quarantineReasons`
- `duplicates`
- `dangling`
- `rentalOccupants`
- `notImportedByDesign`
- `safety`

Fix the mapping and repeat until every quarantined record is either expected or resolved. A refusal ("not a
supported format", "the import mapping is not usable") writes nothing.

## 4. Apply, twice

```bash
pnpm legacy:import apply --state … --auth … --mapping … --out /secure/apply-1.json
pnpm legacy:import apply --state … --auth … --mapping … --out /secure/apply-2.json
```

The second run must insert nothing. Its `reconciliation` (row totals and content hashes per table) must equal the
first. If a record changed between runs, the import refuses it. Deltas belong to the cutover (MIGRATION-MAP
"Cutover"), with a final backup and explicit watermarks.

## 5. After the import

- **Approvals:** every legacy approval is `expired`. People create fresh drafts and review them; nothing resumes
  automatically.
- **Schedules:** imported schedules are disabled.
- **Quarantine:** export it for review as an admin with
  `SELECT legacy_kind, legacy_id, reason FROM migration.quarantine`. Records hold the original legacy data, so
  treat the export as private.
- **Rollback:** before any live send, rollback means restoring the pre-import database snapshot. After any
  external side effect, use forward repair instead (MIGRATION-MAP "Cutover").
