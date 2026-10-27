# Private-data backup and recovery runbook (legacy runtime)

For whoever operates a real copy of the current server. No real data was available while writing this (see
MIGRATION-STATUS.md, missing evidence), so these steps were exercised only on a throwaway test folder:
`evidence/backup-restore-rehearsal.txt`.

## What is private

Everything in the server's data folder (`DATA_DIR`, default `./data`, ignored by git):

- `state.json`: the city, including any real leads, their contact details, notes, messages and approvals.
- `auth.json` (mode 0600): people, password hashes, authenticator secrets, recovery-code hashes, sessions,
  remembered devices and the sign-in log.
- `*.tmp` files: an interrupted save. Treat as private too.

Also private: the server environment (`.env` or the host's secret store): SMTP URL, Twilio keys, Anthropic key.

**Never** commit any of these, paste them into issues or chat, or copy them into the repository, including
`planning/`. Never send them to the migration importer except as read-only copies.

## Take a backup

1. Stop the server (Ctrl-C or SIGTERM). It saves the city on a clean stop. A crash or `kill -9` loses up to
   30 seconds of changes; that is a known legacy limit (audit F10). The signal must reach the server's own
   `node` process: in the M00 rehearsal, SIGTERM sent to an `npx` wrapper did not save. Check that
   `state.json`'s modification time changed before you copy it.
2. Copy the whole data folder somewhere outside the repository, readable only by you:
   ```bash
   STAMP=$(date -u +%Y%m%dT%H%M%SZ)
   install -d -m 700 ~/agentcity-backups/$STAMP
   cp -p data/state.json data/auth.json ~/agentcity-backups/$STAMP/
   (cd ~/agentcity-backups/$STAMP && sha256sum state.json auth.json > SHA256SUMS && chmod 600 *)
   ```
3. Store the fingerprint file (`SHA256SUMS`) separately from the backup.
4. Keep live outbound off while migrating: start the server **without** `OUTBOUND_ENABLED=true`.

## Verify a backup can be restored (do this before relying on it)

Restore into a separate folder and a separate port, never over the live data:

```bash
mkdir -m 700 /tmp/agentcity-restore && cp -p ~/agentcity-backups/$STAMP/{state.json,auth.json} /tmp/agentcity-restore/
(cd ~/agentcity-backups/$STAMP && sha256sum -c SHA256SUMS)
DATA_DIR=/tmp/agentcity-restore PORT=3099 npm start
```

The server must start and print `Sales City server on http://localhost:3099`. If it prints
`[state] Refusing to start: …`, the backup is corrupt or from another version (see below). Sign in on port 3099,
check a few known leads, then stop it and delete `/tmp/agentcity-restore`.

## If the server refuses to start

Since M00 the server stops (exit code 2) instead of starting an empty city when `state.json` or `auth.json`
can't be read or is from an unsupported version. It never modifies the file. The message names the file and
the reason.

1. Do **not** delete or edit the file in place. Copy it to the backup folder first.
2. Restore the most recent verified backup as above, then copy it into `DATA_DIR`.
3. If no good backup exists, keep the damaged file for the migration importer's quarantine report (M02). Starting
   a new city means moving the damaged file aside (not deleting it): `mv data/state.json data/state.json.damaged`.

## Recovery after anything was sent

Once a real message or report has gone out, restoring an older backup does not undo it, and replaying work can
send it twice. Prefer forward repair with outbound kept off, and reconcile with the provider's own records
(MIGRATION-MAP.md, Cutover).
