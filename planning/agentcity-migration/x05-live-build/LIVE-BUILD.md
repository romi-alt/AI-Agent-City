# AgentCity live build: https://autosalescity.site

Status of this document: written on 2026-10-28 from the code on `main` (`1ec90a9`) and the build deployed from
`deploy/live` (`63ae3a3`, build `01a1845c-d2b0-73bd-b9e4-77874e952607`). It says what the live site does, how it is built
and run, and what has and has not been verified. It contains no secrets: only the names of settings.

## 1. At a glance

AgentCity's public site is a marketing landing page, a 3D city you can explore, and a working "get a demo office"
funnel. A visitor asks for a demo, confirms their email with a one-time link (no password), and lands in a simulated AI
office. Everything inside the demo is simulated and nothing is ever sent to customers.

| | |
|---|---|
| Public site | https://autosalescity.site (Hostinger Cloud, Node.js 22) |
| What runs | One Next.js 16 server (`apps/web`), built as a prebuilt "standalone" package |
| Database | Hostinger MySQL, tables `lite_*`, created on first use |
| Email | Resend over HTTPS, from `hello@autosalescity.site` (domain verified in Resend) |
| Passwords | None, anywhere. Access is a single-use email link |
| Not running | The full platform (Postgres, Keycloak, NestJS API, Temporal worker, Redis, object storage) |
| Source of truth | Branch `deploy/live` builds the live site; `main` contains the same code plus later merges |

The live site is a **public preview with a "lite" demo backend**. The full AgentCity platform exists in the repository
and passes its tests locally, but it needs servers Hostinger's Cloud plan does not provide, so it is not deployed.

## 2. What a visitor can do

| Page | What it does |
|---|---|
| `/` | Landing page: hero with a live 3D city preview, how it works, three product rows, audience cards, security section, **pricing**, demo form, FAQ, footer |
| `/city` | The public 3D city: explore, change time of day, switch camera presets, open buildings and floors (no offices can be entered here) |
| `/demo` | The demo request form (same form as on the landing page) |
| `/demo/check-email` | "Check your email": waits for the link to be used, offers a resend, shows when the email could not be sent |
| `/demo/welcome` | "Welcome to AgentCity, [First name]." and "Your virtual AI office is ready to explore." with company, building, office and expiry |
| `/demo/office` | The demo office: 3D city with the visitor's building enterable, a 4-step skippable tour, agent panel, simulated-demo banner, expiry countdown, sign out, "Talk to us" |
| `/demo/signin` | "Sign in with your email": sends a fresh one-time link to a returning visitor |
| `/demo/verified?error=...` | Shown when a link was used, expired or damaged |

Every other app route (`/signin`, `/office`, `/admin`, `/account`, `/status`, `/invitations`, `/signed-out`) redirects to
`/`, and any other `/api/*` path answers 404. Only `/demo/**` and `/api/lite/**` are open (see section 8).

### 2.1 Journeys

**New visitor**
1. Fills in the form: name, business email and company are required; industry, phone and website are optional; a
   separate, unticked box asks for marketing consent.
2. The server stores the request and emails a one-time link. The page moves to "Check your email".
3. Clicking the link marks the address verified, creates the demo workspace, sets a session cookie and opens the
   welcome page. The check-email tab notices and moves on by itself.
4. The welcome page offers the tour or going straight to the office.

**Returning visitor** (new device, cleared cookies, or the session ended): `/demo/signin`, enter the same email, receive
a new single-use link that opens the same demo. On the same browser the session cookie already lasts as long as the
demo, so no sign-in is needed.

**Expired demo**: the office and welcome pages say the demo has expired and offer a new request. A new request for the
same address creates a fresh demo and replaces the old details and consent choice.

## 3. Architecture

```
Browser ──HTTPS──> Hostinger CDN ──> Node.js (Next.js standalone server, apps/web/server.js)
                                       │
                                       ├─ pages: landing, /city, /demo/**  (React 19 + the @agentcity/city-scene 3D package)
                                       ├─ /api/lite/**  route handlers  ──> MySQL (lite_* tables)
                                       │                                ──> Resend (confirmation and sign-in emails)
                                       └─ proxy.ts: only /demo/** and /api/lite/** are reachable
```

- **One process.** The page server and the demo API are the same Next.js app. There is no separate backend to run.
- **Same-origin.** The browser only talks to `autosalescity.site`. The session cookie (`ac_demo`) is first-party.
- **Prebuilt package.** The host does not build the app. `scripts/package-preview.sh` builds locally, flattens the
  dependencies into a zip, and the host runs `npm install` (27 small packages) and `npm start` (`node apps/web/server.js`).
- **3D city.** `packages/city-scene` (React Three Fiber, three.js) ships as TypeScript source inside the web build and
  loads only when needed. Without WebGL the city falls back to a simpler 2D map.

### 3.1 Build flags (inlined at build time)

| Flag | Effect |
|---|---|
| `NEXT_PUBLIC_PUBLIC_PREVIEW=true` | Public preview: standalone output, backend-only routes redirect home, `/api` answers 404, sign-in and status links hidden |
| `NEXT_PUBLIC_LITE_DEMO=true` | Opens `/demo/**` and `/api/lite/**` and shows the real form. Needs the flag above |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Contact address (defaults to `hello@autosalescity.site`) |

Changing a flag needs a new build. `package-preview.sh` sets the first itself; the second is exported before running it.

## 4. The lite demo backend

Code: `apps/web/lib/lite/**` (service, stores, mailer, crypto) and `apps/web/app/api/lite/**` (route handlers).

### 4.1 API reference

All responses are `no-store`. Errors look like `{ "error": { "code", "message", "details?" } }`. Same-origin is enforced on
POSTs (a cross-site `Origin` is refused).

| Method and path | Purpose | Notes |
|---|---|---|
| `GET /api/lite/demo/form-token` | Signed form token | Must be at least 3 s old and at most 2 h old when used |
| `POST /api/lite/demo` | Submit the demo request | Body: `name` (or `fullName`), `email`, `company`, optional `industry`, `phone`, `website`, `marketingConsent`, `formToken`, `website2` (honeypot), `referrerHost`, `attribution`. Answers `{ requestId, status: "verification-sent" }` |
| `GET /api/lite/demo/status?request=<uuid>` | Poll a request | `verification-sent`, `ready` or `expired`; adds `delivery: "failed"` if the provider refused the email |
| `GET /api/lite/demo/verify?t=<token>` | Spend the email link | Always a 303: to `/demo/welcome` with the cookie set, or to `/demo/verified?error=expired` |
| `POST /api/lite/demo/signin` | Ask for a new link | Body: `email`, `formToken`, `website2`. Always answers `{ status: "sent" }` |
| `GET /api/lite/demo/me` | The signed-in visitor | `401` not signed in, `410` demo over |
| `GET /api/lite/demo/office` | The simulated office | 8 agents, tasks, day summary, all marked `simulated: true` |
| `POST /api/lite/demo/signout` | Clear the cookie | |
| `GET /api/lite/admin/leads?page=&pageSize=&full=1` | Owner's lead list | Bearer `ADMIN_TOKEN`; emails and phones masked unless `full=1`; `404` if the token is unset |
| `POST /api/lite/admin/expire` | Run the expiry sweep | Bearer `ADMIN_TOKEN` or the cron-only token |

Error codes: `validation_failed` (400, with per-field messages), `bad_request` (400), `unauthorized` (401), `not_found`
(404), `gone` (410), `rate_limited` (429 with `Retry-After`), `demo_unavailable` (503, when the database or mailer is not
configured).

### 4.2 Data (MySQL)

Tables are created by `CREATE TABLE IF NOT EXISTS` on first use (`lib/lite/schema.ts`; `schema.sql` is the same text, kept
equal by a test).

| Table | Holds |
|---|---|
| `lite_lead` | One row per email: name, email, company, optional industry/phone/website, marketing consent with the time and notice version, attribution, status, generation, expiry, verified time |
| `lite_request` | One row per submission (idempotency hash, whether it was a "shadow" request for an already-active address) |
| `lite_link` | One-time links: **only the SHA-256 hash** of the token, lead, generation, expiry. A new link voids older unused ones |
| `lite_workspace` | The demo workspace for a lead: building (one of `rental-1/2/3`, chosen by hash of the lead id) and an office counter |
| `lite_rate` | Fixed-window rate-limit counters, keyed by a hash |

Rules that the code enforces:
- A lead is "active" until `expiresAt` (default **7 days** after the request; `DEMO_TTL_DAYS`, 1–90).
- Resubmitting never changes an active lead's details (anyone can type any address into the form), and an already-verified
  address gets no email from the form (it uses sign-in instead). The answer is identical for new and known addresses.
- After expiry, a new request for the same address replaces the old demo and the consent choice.
- Expiry removes the workspace and links but **keeps the lead row** (so the owner keeps their lead list). There is no
  deletion endpoint.

### 4.3 Sessions and links

- Link tokens are 32 random bytes; only the hash is stored; each link works once and expires after **24 hours**.
- The session cookie `ac_demo` is HMAC-signed with a key derived from `LITE_SECRET`, `HttpOnly`, `SameSite=Lax`, `Secure`
  on HTTPS, and lives for the demo's remaining time plus 2 days (so a returning visitor is told "expired" rather than
  "signed out").
- Every read is keyed by the lead in the cookie. No endpoint accepts a lead id from the client, so one visitor cannot read
  another's demo.

### 4.4 Abuse limits (per process, stored in MySQL)

| Limit | Value |
|---|---|
| Form submissions per IP | 5 per 10 minutes, 30 per day |
| Submissions or sign-in requests per email | 3 per hour |
| Public reads per IP | 60 per minute |
| Honeypot field `website2` | Any value is refused |
| Form token age | 3 s to 2 h |

The client IP is the last `X-Forwarded-For` entry (`LITE_PROXY_HOPS`, default 1). Limits are only as good as that header
on the host.

### 4.5 Housekeeping

- **Automatic sweep:** whenever someone uses the form, the service sweeps expired demos and stale rows, at most once an
  hour per process. No scheduler is needed.
- **On demand:** `POST /api/lite/admin/expire`. A cron-only token (derived from `LITE_SECRET`, or `CRON_TOKEN` if set) can
  call it but cannot read leads.
- No scheduled task is configured on Hostinger for this.

## 5. Email

`lib/lite/mailer.ts`. Two messages exist, both sent to the address the visitor typed, from `hello@autosalescity.site`
(`MAIL_FROM`) through Resend:
1. **Confirmation**: "Confirm your email to open your AgentCity demo office".
2. **Sign-in**: "Your link back into your AgentCity demo office".

Both say the demo is simulated, that the link works once and expires in 24 hours, and that there is no password. Nothing
else is ever sent, and nothing is sent to anyone a demo "contacts". A console mailer exists for development only and is
ignored when `NODE_ENV=production`. If Resend refuses a send, the failure is logged by error name (never the address) and
the check-email page shows "We could not send the email" for that request (kept for an hour in memory).

The sending domain `autosalescity.site` is verified in Resend (DKIM verified). The mailbox `hello@autosalescity.site`
must exist on the hosting side for replies to arrive (see section 11).

## 6. Security and privacy

What is in place and tested:
- No passwords, no permanent credentials. Single-use, 24-hour, hash-stored links.
- Signed form tokens, honeypot, rate limits on IP and email, same-origin enforcement on POSTs.
- Same answer for known and unknown addresses on the form and on sign-in (no account enumeration).
- Leads are stored server-side only (never in browser storage). Logs carry request ids, lead ids and error names only;
  tests assert no email address reaches the logs.
- Marketing consent is optional, separate from demo access, and stored with a timestamp and a notice version
  (`2026-10-x01`).
- The demo office is synthetic: seeded from the lead id, labelled simulated, and cannot message anyone.
- Secrets live only in the host's environment variables (section 7). The repository contains none; the build script
  refuses to package if a local development secret is found.
- Admin routes answer 404 when no token is set and compare tokens in constant time.
- Response headers: `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.

What the site does **not** have, and the copy says so:
- No security certification. The page states that AgentCity holds none.
- No audit log and no role model in the lite demo (they are platform features, described as such).
- No privacy-policy page. The form carries a short inline notice about how details are used.

## 7. Configuration

Settings live in the Hostinger site's Node.js environment variables. Values are masked by the host and are not in the
repository. **Setting the environment through the API replaces the whole set, so any change must resend every value**,
including `RESEND_API_KEY`, which only the owner holds.

| Variable | Purpose |
|---|---|
| `MYSQL_URL` | Database connection (`mysql://user:password@127.0.0.1:3306/db`; use `127.0.0.1`, not `localhost`) |
| `LITE_SECRET` | 16+ characters; derives the cookie, form-token, rate-limit and cron keys. Without it every lite endpoint answers `demo_unavailable` |
| `RESEND_API_KEY` | Resend API key. Without it the funnel answers `demo_unavailable` |
| `MAIL_FROM` | Sender, `AgentCity <hello@autosalescity.site>` |
| `PUBLIC_ORIGIN` | `https://autosalescity.site`, used in email links and redirects |
| `ADMIN_TOKEN` | 16+ characters; owner's bearer token for the leads and expiry routes |
| `DEMO_TTL_DAYS` (optional) | Demo length, default 7 |
| `DEMO_FORM_MIN_SECONDS` (optional) | Minimum form age, default 3 |
| `LITE_PROXY_HOPS` (optional) | Proxies in front of the app, default 1 |
| `CRON_TOKEN` (optional) | Overrides the derived cron-only token |
| `LITE_STORE=memory`, `LITE_MAILER=console` | Development and test only; ignored in production |

Hosting facts: Hostinger account user `u943531942`; site `autosalescity.site` (type Node.js, Node 22, entry
`apps/web/server.js`); database `u943531942_agentcity`. These are also in `.hostinger/site.json`.

## 8. Build, deploy and verify (runbook)

1. **Prepare**: on the branch to ship, run `pnpm install --frozen-lockfile`, then build the shared packages
   (`pnpm --filter './packages/*' run build`), and check `pnpm -r typecheck`, `pnpm format:check` and the tests.
2. **Package**: `NEXT_PUBLIC_LITE_DEMO=true scripts/package-preview.sh https://autosalescity.site <out.zip>`. This runs
   `next build` with the preview flag, copies the standalone server, drops the unused image resizer, flattens the
   dependency tree, writes a tiny `package.json` for the host, and refuses to produce a zip if symlinks remain or a
   development secret is found. Expected size: about 10 MB.
3. **Upload**: Hostinger file API "generate upload URL", then a TUS `POST` and `PATCH` of the zip to `public_html`.
4. **Build**: Hostinger Node.js "start build" from the archive: Node 22, app type `other`, root `.`, build script `build`,
   entry `apps/web/server.js`, package manager `npm`. The host extracts, runs `npm install` and `echo prebuilt`, switches
   the `current` version and restarts. It takes about 30 s.
5. **Purge the cache**: Hostinger "clear cache" for the domain. (Pages are also served with a one-minute cache lifetime.)
6. **Verify**: `/`, `/city`, `/demo`, `/demo/signin` and `/api/lite/demo/form-token` return 200; the homepage contains the
   expected new text; `/api/lite/admin/leads` returns 401 without the token.
7. **Rollback**: upload and start a build of the previous zip. Each build is kept as a version on the host.

The restart takes a few seconds and can briefly return a 503 to visitors.

Warning: Hostinger's Git auto-deploy for this site is **enabled** and points at `romi-alt/AI-Agent-City.2`, branch
`main`. That repository is not the one development pushes to, but if its `main` ever changes the host may rebuild the
site from source and replace the prebuilt package. Turn it off in hPanel if that is not wanted.

## 9. Content and claims

The homepage was written to the proposal direction supplied by the owner and checked against these rules.

- **Positioning:** a visual AI workspace for sales teams, dealerships, training businesses and agencies. Headline:
  "Your business. Your AI team. One clear view."
- **Sample data:** every example (team panel, task list, approval draft, city activity) is labelled Sample or Simulated.
  The sample team panel is headed "Illustrative sample team" and lists Max, Vera, Nico, Luna, Teo, Iris and Dante with
  one-line role descriptions. A row is not a working agent.
- **Roadmap:** connected messaging, CRM workflows, social publishing and calendar booking are marked as planned
  integrations whose availability is confirmed during setup. The demo does not activate any of them.
- **Pricing (reference, from the service proposal):** Full Office Setup **$1,200 one-time**; Monthly Office & AI
  **approximately $800 per month** (a $399 full-team office service plus about $400 of estimated AI usage, automations and
  hosting; the page shows $799 rounded to about $800). The costs work together and are not a lifetime purchase;
  advertising spend, GoHighLevel call minutes and SMS are separate; any commission or revenue share is agreed in
  writing; final scope, currency and terms are confirmed in a quote. The two buttons open an email to
  `hello@autosalescity.site`. There is no checkout and no payment code.
- **Not claimed anywhere:** response times, revenue results, statistics, testimonials, customer logos, certifications,
  unlimited usage, or that buying a plan activates an integration.

## 10. The 3D city and office

Package: `packages/city-scene`. Highlights of the current version:
- **Dense district:** the 15 client buildings (brand dealerships, the Fast Sales training centre, rentals) rise out of
  pastel street-wall blocks with awnings and rooftop details; three generated rings (street walls, simplified blocks,
  a pale skyline) fade into fog, and there is no island edge. Day, golden hour, evening and night; clear, cloudy and rain.
- **Life:** instanced traffic on the extended road grid (cars, taxis, vans, buses stopping at signals), pedestrians, birds
  and aircraft. Everything stops under reduced motion and when paused.
- **Cameras:** Overview (about 32° down, looking along a street), Top, Orbit, building, floor and office views, with eased
  moves (about 1 s) and limits so the edge of the generated city is never visible.
- **Building tags:** white pills with the brand, a simulated "x/y working" count and a needs-you badge, laid out so they
  do not overlap (needs-you badges are never hidden).
- **Office:** light wood floor, zone rugs, glass walls, slatted feature wall with task board and clock, low-poly agents
  with status rings and name pills, front three-quarter camera, ease to a desk, cream-coloured panels.
- **Quality presets:** `ultra`, `balanced`, `low`, chosen automatically and overridable in settings. The landing page
  preview runs at `low`.
- **Reduced motion and phones:** respected; phone layouts use a bottom sheet and brand-only tags.

## 11. Verification evidence

| Check | Result |
|---|---|
| `pnpm install`, `pnpm build`, `pnpm -r typecheck`, `pnpm format:check` on the merged `main` tree | exit 0 |
| Unit tests | domain 7, legacy 33, worker 3, legacy-import 7, api 57, city-scene 157, web 45; 0 failures |
| Database integration tests (local Postgres) | db 49/49, legacy-import 9/9, api 102/102 |
| Lite backend tests (in the web 45) | 32 lite tests, including single-use links, expiry, no enumeration, refused-email status, sign-in, sweep, cron token. They also passed against a real MariaDB 11.8 earlier in the work |
| Live: form, database, email | A real submission stored a lead and a real confirmation email arrived in the owner's inbox; the link opened the welcome page and the demo office (owner's screenshots) |
| Live: pages and API | All pages and the form API return 200; admin routes are locked without a token; the cron-only token can run the expiry route and cannot read leads |
| Browser checks of the new homepage (1440, 1024, 390 wide) | no overflow or console errors; anchors, mailto links, FAQ and form validation work; prices consistent |

Evidence files and screenshots: `planning/agentcity-migration/` (`x01-cinematic-city`, `x03-floor-look`,
`x04-city-dense`, `x05-polish`, `lite-demo`). `MIGRATION-STATUS.md` lists every stage and what was not run.

## 12. Known limits and unverified items

- **No frame rates and no real devices.** The build container only has software rendering, so no performance target is
  claimed, and phone behaviour was only checked in emulated viewports.
- **Not exercised live by the builder:** the rest of the tour, the office floor, sign-in by email, the "email refused"
  message, and the pricing buttons. They are covered by tests or local runs.
- **The 2D map fallback** (no WebGL) is built but untested on a real device.
- **Hero still image:** the picture shown before the 3D loads is a flat low-quality render; a nicer one needs a GPU render.
- **Phone city view:** the city's settings buttons still overlap the "Fast Sales" tag in the phone Overview.
- **Pricing numbers and currency** come from the owner's brief; the currency is not stated, and the page says it is
  confirmed in the quote. The GoHighLevel and "Max plus six specialist agents" scope is proposal wording, not a feature of
  this build.
- **Rate limits** depend on the host passing the real client address in `X-Forwarded-For`.
- **A visitor who submits but never clicks the first link** gets no sign-in email; they must submit the form again.
- **The lead row is kept after expiry** and there is no deletion endpoint; deleting a lead needs direct database access.

## 13. Open decisions and risks

1. Create the mailbox behind `hello@autosalescity.site`, or replies to the contact and pricing buttons will bounce.
2. Decide about Hostinger's Git auto-deploy (section 8).
3. Write or approve a privacy page and retention period for leads.
4. Confirm the pricing, currency and scope wording.
5. `m04/revisions` (revision hashing and approval invalidation) is not merged: its rollback test fails once the demo
   migration exists. It needs a rework and review. See `MIGRATION-STATUS.md` (X05.6).
6. The full platform needs a VPS (Postgres, Redis, Keycloak, API, worker) and an approved email sender before any real
   customer messaging; none of that is switched on, and `OUTBOUND_ENABLED` stays unset.

## 14. Repository map

| Path | What |
|---|---|
| `apps/web` | The Next.js app: landing page (`app/(marketing)`, `components/marketing`), city page (`app/city`), demo pages (`app/demo`, `components/demo`), lite backend (`lib/lite`, `app/api/lite`), `proxy.ts`, `next.config.ts` |
| `packages/city-scene` | The 3D city and office (buildings, streets, environment, life, camera, interior, ui, quality) |
| `apps/api`, `apps/worker`, `packages/db`, `packages/domain`, `packages/contracts` | The full platform (not deployed) |
| `apps/legacy`, `packages/legacy-import` | The original app and its importer |
| `scripts/package-preview.sh` | Builds the deployable zip |
| `.hostinger/site.json` | Hosting target and build settings |
| `planning/agentcity-migration/` | Plans, decisions, evidence and `MIGRATION-STATUS.md` |

Branches: `main` (everything merged except `m04/revisions`), `deploy/live` (what is deployed), plus the workstream
branches (`design/*`, `lite/*`, `polish/city`, `migration/*`, `m04/*`) kept for history.
