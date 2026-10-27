# M00 route and screen inventory

Taken from the checkout at `migration/m00-baseline` (based on `city-vibes` @ 7bad3b8 plus M00 containment), by
reading `server/index.ts`, `src/ui/*` and `src/proposal/*`. Screenshots of every screen listed below are in
`evidence/screens-baseline/` (before containment) and `evidence/screens-contained/` (after).

Every route below must be preserved, replaced by a named target route, or deliberately retired with a note
(ACCEPTANCE.md, M10 item 9).

## HTTP routes (Express, `server/index.ts`)

All non-GET `/api` requests require the header `x-fs: 1` (cross-site request guard).

| Method and path | Who | What it does | M00 change |
|---|---|---|---|
| GET `/api/auth/me` | anyone | Sign-in state and current user | — |
| POST `/api/auth/login` | anyone, rate-limited | Password step; remembered device skips the code | — |
| POST `/api/auth/verify` | password-stage session | Authenticator or recovery code | — |
| POST `/api/auth/reset-password` | anyone, rate-limited | Forgotten password: code + recovery code | — (audit C16 still reproduces) |
| POST `/api/auth/lock` | signed in | Lock the screen | — |
| POST `/api/auth/logout` | anyone | End session | — |
| GET `/api/auth/enroll/:token` | link holder | Who a setup link belongs to | — |
| POST `/api/auth/enroll/start` | link holder, rate-limited | Set password, issue TOTP secret and QR | — |
| POST `/api/auth/enroll/finish` | link holder, rate-limited | Confirm TOTP, issue recovery codes, sign in | — |
| GET `/api/public/pulse` | **anyone (unauthenticated)** | Proposal page data | **Contained:** fixed catalog counts only (`{catalog, live:false}`); no names, roles, status, work or activity counts |
| GET `/api/state` | signed in | Opening snapshot, scoped per user (multi-client branch) | — |
| GET `/api/stream` | signed in | Server-sent events: `patch`, `people` | — (no replay cursor; audit F11) |
| POST `/api/action` | signed in, scope-checked | Commands: approve, approveAll, rent, vacate, leadCreate, leadUpdate, leadNote, leadSend, contentUpdate, inboxReply, duty, desk | leadSend/approve now pass the outbound gate |
| POST `/api/me/recovery-codes` | signed in | New recovery codes (no step-up) | — |
| PUT `/api/admin/settings` | agency owner | Agency settings, delivery mode, speed | — |
| GET/POST `/api/admin/users` | agency owner | List / add people | — |
| PUT `/api/admin/users/:id/access` | agency owner | Change role/client; signs them out | — |
| POST `/api/admin/users/:id/reset` | agency owner | New setup link | — |
| DELETE `/api/admin/users/:id` | agency owner | Remove a person | — |
| GET/POST `/api/admin/clients`, PUT/DELETE `/api/admin/clients/:id` | agency owner | Clients and their buildings | — |
| GET `/api/admin/signins` | agency owner | Sign-in log (last 200) | — |
| GET `/api/admin/integrations` | agency owner | Provider configuration | Adds `outbound: {switchOn, blocked}` |
| POST `/api/admin/test-email` | agency owner | Send a test email | **Contained:** refused unless the gate allows it |
| GET `/proposal` | anyone | Built bilingual proposal page (production) | — |
| GET `/*` (not `/api`) | anyone | Built app shell (production) | — |

Development: Vite serves the app on :5173 and rewrites `/proposal` to `proposal.html`; `/api` is proxied to :3001.

## Screens

| Screen | How you reach it | Baseline screenshot |
|---|---|---|
| Sign-in (password, code, lock, forgot password, first-time setup with QR and recovery codes) | Signed out, `?enroll=` link | 01-sign-in |
| Office floor (3D desks, task board, live TV, content wall) | View office / floor picker | 02-office-floor-L12 |
| Desk / agent card | Click an agent, "Max", "Elvis's desk" | 03-desk-max |
| City (15 buildings, traffic, people) | City | 04-city |
| Building and floor list | Select a building, Floors tab | 05-building-floors |
| City dashboard (per-building tiles) | Dashboard | 06-dashboard |
| My CRM (kanban per building) | My CRM | 07-crm |
| Lead drawer (stage, edit, reach out, notes, timeline, messages) | Click a lead | 08-lead-drawer |
| Approvals ("Needs your OK") | OK tab | 09-approvals |
| Content wall (calendar, posts, inbox, analytics, insights, reports) | Content wall | 10-content-wall |
| Outbox and reports | Outbox & reports | 11-outbox-reports |
| Settings (agency settings, integrations, account, desk, clients, people, sign-in log) | ⚙ | 12-settings |
| Big screen | Big screen | not captured |
| Right panel tabs: Live, CRM, Content, Team, OK, Floors | Side panel | in 02–12 |
| Rent a floor / vacate | Floors tab of a rental building | `evidence/untrusted-names-*` |
| Proposal page, English and Spanish | `/proposal`, `?lang=es` | 13-proposal-en, 14-proposal-es |
| "Can't reach the office" and "Nothing to show yet" (client with no buildings) | Boot failures | not captured |
