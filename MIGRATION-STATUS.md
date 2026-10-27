# Migration status

Stage plan and rules: `planning/agentcity-migration/README.md`. Evidence for M00:
`planning/agentcity-migration/m00/`. Statuses: not started / in progress / local passed / external blocked /
failed / complete.

| Stage | Status | Commit/files | Evidence | Blockers | Next action |
|---|---|---|---|---|---|
| M00 | **Local passed** (code complete and verified locally). Merged into `main` at the owner's request; no separate code review | `main` @ a658918 (fast-forward from f96819d). Built on branch `migration/m00-baseline` (from `city-vibes` @ 7bad3b8). Checkpoint = 7bad3b8, the head of `city-vibes` on GitHub. Tag `pre-migration-baseline` is local only: pushing it from this environment did not reach GitHub. Files below | `planning/agentcity-migration/m00/evidence/` | Real data and pilot exports missing (below) | M01 |
| M01 | Not started | — | — | No Docker engine in this cloud environment (CLI present, no daemon socket) | Workspace and local infrastructure |
| M02–M10, P01–P10 | Not started | — | — | — | In order, one at a time |

Test environment for everything below: this cloud container, Node v22.22.0, npm 10.9.4, Chromium via Playwright
with software GL (SwiftShader). No provider credentials were set, and the kill switch was off in every run.

## 1. The checkout that was baselined

- **Branch history.** When M00 started, `main` was f96819d and this work was on unmerged branches:
  - `multi-client-isolation` = 1dab901
  - `city-vibes` = 7bad3b8, which also contains 1dab901

  M00 branched from `city-vibes` so nothing was lost.
- **Merged.** All three branches are now in `main` (a658918). Because each was built on the one before, the merge
  was a fast-forward: no merge commits, no conflicts. Before pushing, `npm run typecheck` and `npm test` (33/33)
  passed on that exact commit. The merged branches can be deleted; deletion from this environment fails, so
  delete them on GitHub.
- **The ZIP the audit used is exactly commit f96819d.** All 36 files match `audit/source-manifest.json`
  byte-for-byte. The build review's reference to 8250c96 is an earlier commit; f96819d is the audited code.
- **Differences from the ZIP.** At 7bad3b8, 16 files differ and 3 are new: `server/scope.ts`, `src/scene/street.ts`
  and `test/scope.test.ts`. So the audit's F01 (no tenant checks) is partly addressed by building-level
  multi-client isolation, which the audit did not see. F02/C10 (rental floors sharing one lead pool) is not
  addressed. Evidence: `evidence/manifest-comparison.txt`.
- **No private data in the checkout.** There was no `data/` folder, no `.env` and no CLAUDE.md.

## 2. Commands actually run

| Command (repo root unless noted) | Result | Log |
|---|---|---|
| `git checkout -b migration/m00-baseline` from `city-vibes`; `git tag -a pre-migration-baseline` | ok | — |
| `git push -u origin migration/m00-baseline`; `git push origin pre-migration-baseline`; `git ls-remote origin` | Branch pushed; **tag not on GitHub** (push printed "Everything up-to-date"; ls-remote shows no tags) | — |
| `node planning/agentcity-migration/m00/compare-manifest.mjs …` for f96819d, 1dab901, 7bad3b8 | f96819d identical (36/36) | `evidence/manifest-comparison.txt` |
| `npm ci` (lockfile) | exit 0, 0 vulnerabilities | `evidence/baseline-npm-ci.txt` |
| `npm run typecheck` before / after M00 | exit 0 / exit 0 | `evidence/baseline-typecheck.txt`, `after-typecheck.txt` |
| `npm run build` before / after M00 | exit 0 / exit 0; both warn about one large JS chunk | `evidence/baseline-build.txt`, `after-build.txt` |
| `npm test` before M00 | 21/21 pass | `evidence/baseline-test.txt` |
| `npm test` after M00 | **33/33 pass** (21 existing + 12 new containment tests) | `evidence/after-test.txt` |
| Pack harness (`prepare-audit.mjs` + `verify-original.mjs`) on an isolated copy of f96819d | 16/16 legacy defects reproduced | `evidence/characterization-f96819d.txt` |
| Same on 7bad3b8 (adapted: `server/scope.ts` also stripped, as `auth.ts` now imports it) | 16/16 reproduced | `evidence/characterization-7bad3b8.txt` |
| Same on the M00 working tree | 16/16 still reproduced (expected: M00 does not fix the simulator) | `evidence/characterization-m00.txt` |
| `node planning/agentcity-migration/m00/capture-screens.cjs` against fresh servers | 14 screens + pulse, before and after; 0 page errors | `evidence/screens-baseline/`, `evidence/screens-contained/` |
| `node planning/agentcity-migration/m00/check-untrusted-names.cjs` on the checkpoint build, then the M00 build | Checkpoint: **unsafe** (exit 1); M00: **safe** (exit 0) | `evidence/untrusted-names-baseline.txt`, `untrusted-names-contained.txt` (+ screenshots) |
| Backup, fingerprint, restore and damaged-file rehearsal on a throwaway data folder | Backup verified, restored copy starts, damaged file refused and unchanged | `evidence/backup-restore-rehearsal.txt` |
| `docker --version`, `docker compose version`, check `/var/run/docker.sock` | CLI present; **no Docker engine** | — (M01 blocker) |

## 3. Containment implemented

| Requirement (M00 prompt) | Change | Evidence |
|---|---|---|
| Server-side outbound kill switch on every delivery path; default off | New `server/outbound.ts`. A provider is called only if `OUTBOUND_ENABLED=true` **and** Delivery = live. Every path checks it inside `delivery.ts`/`brain.ts`, at send time: agent approvals, manual sends, reports, test email, Claude drafts. A refused message or report is marked `skipped` (Live mode) or `simulated` (demo), with the reason. Settings, the Outbox and the Send/Approve buttons say when nothing will be sent. | `test/containment.test.ts`: fake providers get **0 calls** from every path with the switch off (also for values "1", "yes", "TRUE", " true", ""). A positive control proves the paths are live when the switch is on. |
| Prevent demo-mode provider calls | Demo ("simulate") mode is refused by the same gate, including Claude drafts of simulated posts (previously sent to Anthropic in demo mode). A phone "call" is never reported as sent. | Test "never calls a provider in demo mode, even with the switch on": 0 calls |
| Remove identifying work/contact data from the unauthenticated pulse | `/api/public/pulse` returns only `{catalog:{buildings,floors,aiDesks,humanDesks}, live:false}` from the fixed catalog. The proposal page no longer polls it and shows an empty sample dashboard. | Before: `evidence/screens-baseline/public-pulse.json` (team names, roles, status, work, counts). After: `screens-contained/public-pulse.json`; test asserts no names, status or counts |
| Render untrusted names as text, not innerHTML | `label()` in `src/scene/engine.ts` now takes text parts. City signs, vacant-floor signs and agent desk tags use it. The boot error message is set as text. | Browser check: a rental name containing an image tag that runs a script. Checkpoint: it executed (2 injected images, marker set). M00: shown as literal text, nothing executed. A person name with markup was already escaped and is unchanged. |
| Corrupt/unsupported state fails closed without overwriting originals | New `server/state.ts`. The server exits with code 2 and a clear message if `state.json` is invalid JSON, the wrong version or missing lists, or if `auth.json` can't be read. It never starts an empty city over the original. | Tests start the real server on 4 bad files: exit 2, file **byte-identical** (SHA-256), no files created or removed |
| Private data at rest (found while rehearsing) | `state.json` was saved world-readable (0644) while holding real leads. Now saved 0600 like `auth.json`. | Test "saves the city readable by its owner only" |

Other files changed for these: `server/index.ts` (wiring, pulse, loader, file mode), `server/delivery.ts`,
`server/brain.ts`, `src/core/types.ts` (report status `skipped`), `src/api.ts`, `src/ui/app.ts`, `src/ui/views.ts`,
`src/scene/{engine,cityView,officeView}.ts`, `src/main.ts`, `src/proposal/{main,content}.ts`, `package.json` (tests
run one file at a time), `.env.example`, `README.md` (corrected safety claims), `CLAUDE.md` (new),
`test/containment.test.ts` (new).

Also added under `planning/agentcity-migration/`:
- the full pack
- `m00/ROUTES-AND-SCREENS.md`, `m00/EXTERNAL-EFFECTS.md`, `m00/SOURCE-TO-TARGET.md`, `m00/BACKUP-AND-RECOVERY.md`
- three evidence scripts and the evidence folder

## 4. Passing safety tests versus reproduced legacy defects

These are different kinds of evidence; do not add them together.

**Safety tests (assert the corrected behaviour; all pass):** the 12 containment tests above and the 21
multi-client isolation tests in `test/scope.test.ts`. Plus two browser checks that are scripts, not part of
`npm test`: the untrusted-name check (exit 0) and the screen capture (0 page errors).

**Legacy defects reproduced (a "pass" means the defect exists):**

| Check | Defect | Still present after M00? |
|---|---|---|
| C01 | Seed is 15 buildings / 183 floors / 281 AI / 22 human desks (inventory, not a defect) | Unchanged |
| C02, C03 | Simulated revenue on real leads; Sold counted twice | Yes |
| C04 | Content editable after approval / after publishing | Yes |
| C05 | AI draft can change a message after it was approved | Yes. With the switch off, no provider receives either version. |
| C06, C07 | Contact reservation lost on restart; second draft for the same lead | Yes |
| C08 | Old pending messages trimmed while their approval remains | Yes (also observed in our own test) |
| C09 | Manual send skips the approval queue | Yes at the simulator level. The provider call is now held by the kill switch. |
| C10 | Rental-floor agent picks another floor's contact | Yes. Multi-client isolation is per building, not per floor. |
| C11 | Failed send still counts as contacted | Yes |
| C12 | Fake social publishing and metrics | Yes |
| C13 | Changed address does not invalidate a queued recipient | Yes |
| C14 | Rent counted as revenue without payment | Yes |
| C15 | Accelerated simulation clock | Yes |
| C16 | Password reset keeps remembered devices | Yes (README now says so) |
| F13 (browser) | Rental names rendered as HTML in 3D labels | **Reproduced on the checkpoint, fixed in M00** |
| F15 | Public pulse exposed team names, work and counts | **Reproduced on the checkpoint, fixed in M00** |

## 5. Missing evidence (recorded, not substituted)

- **No real data files:** no `data/state.json` or `data/auth.json` from a real installation. Nothing was imported;
  nothing was generated to stand in for them.
- **No `.env` or provider credentials.** No SMTP, Twilio, Anthropic or GoHighLevel check was run, so none is
  claimed.
- **No pilot material.** The pilot the proposal describes (PHP/JSON, n8n workflows, live GoHighLevel, 871-chunk
  knowledge base, Hostinger deploy) is not in this repository, and no n8n exports were attached.
- **No deployment.** There is no deployment configuration and no evidence of one.
- **No real-device measurements.** Real-browser frame rates on real devices were not measured; this container
  renders with software GL.

## 6. Unresolved blockers and risks

1. **M01 cannot run its local services here.** The Docker CLI is installed but no engine is running. Either a
   Docker-capable environment or a decision on running the services natively is needed. `psql` and `redis-server`
   binaries exist; Temporal, Keycloak and MinIO do not.
2. **The kill switch is process-level only.** It is not persisted, and nothing audits who turned it on. The
   durable dispatch policy and ledger are M08.
3. **Not contained in M00, by design (later stages):**
   - the stream has no replay cursor or session-expiry re-check (F11, M07)
   - Google Fonts are loaded from Google on every page view (self-host in M05)
   - "Reply sent" toasts for simulated social replies (F07/F09)
   - the demo clock (F03)
   - all the C-defects listed above
4. **Version mismatch.** The pack targets Node 24; this environment has Node 22.22. The harness ran here
   (`stripTypeScriptTypes` is available but experimental).
5. **Evidence size.** The evidence folder is about 10 MB, mostly PNG screenshots, now part of `main`.

## 7. Next safe step

**M01 — Create the proposal workspace around the current build** (`planning/agentcity-migration/prompts/M01-workspace-and-infrastructure.md`).

Preconditions:
- Start from `main` (a658918 or later).
- Keep `OUTBOUND_ENABLED` unset.
- Run M01 where a Docker engine is available.

Do not start M02+ before M01's gate.

## 8. Compact diff summary (code, excluding planning/)

```
server/outbound.ts (new)   kill switch: OUTBOUND_ENABLED=true AND Delivery=live, else refuse; counts refusals
server/state.ts (new)      fail-closed loader for state.json; never writes
server/delivery.ts         injected transport; gate on approvals, manual sends, reports, test email; phone never "sent"
server/brain.ts            gate checked before a Claude request is queued; injectable call for tests
server/index.ts            wire gate; refuse to start on bad state/auth; catalog-only pulse; state.json saved 0600
src/scene/engine.ts        label() builds DOM from text parts (no innerHTML); city/office labels updated
src/main.ts                boot error shown as text
src/proposal/*             no live data; dial shows catalog desks; EN/ES copy updated
src/ui/*, src/api.ts       kill-switch status in Settings/Outbox; truthful Send/Approve labels and toasts
src/core/types.ts          report status 'skipped'
test/containment.test.ts   12 tests: zero provider calls, catalog-only pulse, fail-closed state, file mode
```
