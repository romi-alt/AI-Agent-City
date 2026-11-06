# AgentCity / AutoSalesCity: session handoff

Written 2026-11-06. Repo: `romi-alt/AI-Agent-City`. Live site: https://autosalescity.site (Hostinger, Node.js 22).
This file says where the project stands and how to carry on. It contains no secrets, only the names of settings.

## 1. State in one paragraph

`main` is at `4e15d41` (merge of PR #19). It contains everything built so far. The live site still runs **live27**
(Hostinger build `01a199cf-4188-70ac-a47c-f36606fd7697`, from `main` code `f00b18e`). **live28 is merged and packaged
but NOT deployed**: the Hostinger connector was disconnected and needed re-authorising, so no upload was possible.
The working tree is clean and nothing is uncommitted.

## 2. What the product is

A marketing site, a 3D New York city you can explore (`/city`), and a "get a demo office" funnel. A visitor asks for a
demo, confirms their email with a single-use link (no passwords), and lands in a simulated AI sales office
(`/demo/office`) with agents at desks. Everything in the demo is simulated; nothing is sent to real customers. The
demo lasts 14 days. The stack is a pnpm 10.28 monorepo, Node 22, Next.js 16 (`apps/web`), plain Three.js for the 3D
engine, and a small MySQL-backed "lite" backend. Rules for the repo are in `CLAUDE.md` (work on branches, PRs, no
direct pushes to `main`, safety defaults not to be weakened).

## 3. What is in `main` (newest first)

| PR | What |
|---|---|
| #19 | **Dusk hero**: home hero uses evening lighting and a skyline view; a floor tag ("Floor 24 / Fast Sales / Simulated sample floor") follows the HQ; evening sky gradient meets the haze (no horizon seam); camera turns 6 s then holds; new dusk posters `apps/web/public/city/hero-real-1728.webp` and `-864.webp`; phones keep the close aerial and hide the tag |
| #18 | **Floor realism**: pale stone floor tiles, walnut timber, dark slim glass mullions, warm cove light strips under the beams plus a cool window fill, calmer rugs/upholstery, muted accent colours, glass-walled meeting room, lounge armchair, floor plant, stone reception floor |
| #17 | `LIVE-BUILD.md` updated to live27 (docs only) |
| #16 | **live27**: realistic building facades, rooftop equipment, richer desks, monitors facing the agent, dealership exteriors, city life (birds, helicopter, smoke), much better night view, live agent status on the floor, animated chat screens, bold daytime building colours |

Earlier work (live22 to live26): the New York city in the demo, the signed-in office using the new engine
(`components/demo/AscCityView.tsx`), email fix (an address with an active demo now gets a sign-in link), 14-day demo
default, `/pitch` claims reworded as targets, seated skirts and name-tag fixes, sample wall screens, CSP and HSTS.

## 4. Where things are

- 3D engine: `apps/web/components/asc/engine/` (`office.ts` the floor and scene host, `florida.ts` the big city,
  `city.ts` street level, `dealers.ts` dealerships, `people.ts` agents, `nyc.ts` building looks and the window shader).
  It is untyped design code (`// @ts-nocheck`), so typecheck cannot catch mistakes there; always look at it running.
- Hero: `components/asc/HeroCity.tsx` (poster then live scene), `HeroWorldCanvas.tsx` (camera, time of day, floor tag),
  styles in `components/asc/asc.css`.
- Signed-in office: `app/demo/office/LiteOffice.tsx`, `components/demo/AscCityView.tsx`.
- Demo backend: `lib/lite/` (`service.ts`, `mailer.ts` Resend, `store-mysql.ts`, `config.ts`).
- Live-build record: `planning/agentcity-migration/x05-live-build/LIVE-BUILD.md` (currently written up to live27).
- Packaging: `scripts/package-preview.sh`.

## 5. Checks that must pass before any push

```bash
pnpm format:check
pnpm --filter @agentcity/web typecheck
pnpm --filter @agentcity/web test        # 62 tests
```

Run the app locally for screenshots with `next dev` and: `NEXT_PUBLIC_PUBLIC_PREVIEW=true NEXT_PUBLIC_LITE_DEMO=true
LITE_STORE=memory LITE_MAILER=console PUBLIC_ORIGIN=http://localhost:<port>` (the console mailer prints the sign-in
link in the dev log). Software rendering is very slow: wait 60 to 170 s after a camera move before taking a screenshot,
and note that frame rate cannot be measured this way.

## 6. Deploying (blocked until the connector is authorised)

1. Build: `NEXT_PUBLIC_LITE_DEMO=true scripts/package-preview.sh https://autosalescity.site agentcity-live28.zip`
   from `main`. (The earlier zip lived in a session scratchpad that will not survive, so rebuild it.)
2. Hostinger connector, username `u943531942`, domain `autosalescity.site`:
   `hosting_files_generate-upload-url`, then TUS POST and PATCH of the zip with the `X-Auth` and `X-Auth-Rest` headers
   (copy the tokens exactly), then `hosting_nodejs_start-build` (node 22, app_type other, root and output `.`,
   build_script `build`, entry_file `apps/web/server.js`, package_manager npm, source_type archive,
   `source_options.archive_path` = the zip name), then `hosting_cache_clear` (scope all), then poll
   `hosting_get-deployment` and curl `/`, `/city`, `/demo`, `/pitch`.
3. Never replace the host's environment variables (email key, database URL, secrets, admin token, mail-from, origin).
4. Manual alternative: upload the zip in hPanel with the same settings.
5. Only deploy when the user explicitly asks; production uploads were once blocked as unrequested.

## 7. Open items

1. **Deploy live28** (needs the Hostinger connector authorised in claude.ai connector settings).
2. After deploying: verify the live pages and take screenshots; check the signed-in office on the live site (needs a
   sign-in link by email), and the evening and night views.
3. Update `LIVE-BUILD.md` to live28 (status paragraph and a verification row) and add a `MIGRATION-STATUS.md` entry;
   neither records anything after live27.
4. Floor realism, remaining prompts from the references (`planning/agentcity-migration/x08-floor-realism/FLOOR-REALISM-REFS.md`): P5 camera shots (establishing,
   entry through the glass, doorway interior, hotspots), P6 UI layer (glass picker panel, hairline top bar, headline
   and hotspot pills), P7 verify against the references. P1 to P4 are done except moving desks (left as they were).
5. Not yet verified: real-device frame rate (only software rendering), phone view of the new hero, the glass meeting
   room against walking people, evening/night shots after the last floor change, Vanta/Summit/Volta dealership views.
6. Known leftovers: some saturated items remain on the floor (orange plant pot, yellow desk lamps, agents' pastel
   chairs, dashboard screens); `/pitch` still has "Florida" strings and simulated counters; the hero counters are
   simulated by design (the owner chose to keep them).
7. A night-hero patch from another session (`night-hero.diff`) was never available here and was not applied; the new
   dusk hero replaces that idea.

## 8. Working rules learned in this session

- Work on a branch, open a PR, merge only when the user says so; use the PR head commit's full 40-character SHA for
  `expectedHeadSha`.
- Do not claim something was checked if it was not; say what was only seen locally.
- Keep the hero's random-draw order stable when changing the city (changes shift the layout).
- Do not remove the simulated hero counters (the owner said to keep them).

## 9. Prompt to continue in a new Claude Code session

Paste everything below into a fresh session opened on this repo.

```
You are continuing work on the AgentCity / AutoSalesCity repo (romi-alt/AI-Agent-City). Read CLAUDE.md and
HANDOFF.md first (HANDOFF.md is the state of the project; if it is not in the repo, I will paste it).

State: `main` is at 4e15d41 and holds everything built so far (live27 plus the floor realism and the dusk hero).
The live site https://autosalescity.site still runs live27. live28 (= main 4e15d41) is merged but NOT deployed because
the Hostinger connector needed re-authorising.

Do this, in order, on a branch, with a PR for anything that changes the repo, and never merge or deploy unless I say so:
1. Check the Hostinger connector tools are available. If they are, and only after I say "deploy live28", rebuild the
   package with `NEXT_PUBLIC_LITE_DEMO=true scripts/package-preview.sh https://autosalescity.site agentcity-live28.zip`
   from main, upload it, start the build (node 22, entry apps/web/server.js, build script build), clear the cache and
   verify /, /city, /demo and /pitch. Never replace the host's environment variables. If the tools are missing, tell me
   and stop.
2. Update planning/agentcity-migration/x05-live-build/LIVE-BUILD.md to live28 and add an entry to
   MIGRATION-STATUS.md (docs only, own PR).
3. Take screenshots of the live home hero (desktop and phone), /city, and the signed-in office floor in day, evening
   and night, and list what looks wrong.
4. Then ask me which of these to do next: floor camera shots (flying through the glass into the floor with named shots),
   the glass picker UI layer, the remaining saturated accents on the floor, a phone check of the dusk hero.

Rules: run `pnpm format:check`, `pnpm --filter @agentcity/web typecheck` and `pnpm --filter @agentcity/web test`
(62 tests) before every push; the 3D engine is untyped design code, so look at it running; software rendering is slow
and cannot measure frame rate, so say so; do not weaken the safety defaults in CLAUDE.md; do not remove the simulated
hero counters; report only what you actually checked.
```
