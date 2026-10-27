# Sales City — Fast Sales virtual office

A 3D city of car dealerships, the Fast Sales Training Center, Rick Case Honda's associate buildings and rental
buildings. Every floor is staffed by people and AI agents who work the task lists from the Fast Sales documents
(email / phone / text follow-up, social media) and report back through a daily email.

## Run it

```bash
npm install
npm run dev            # server on :3001 + web app on :5173
```

The first time, the server prints a **one-time setup link**. Open it to create the first agency owner: choose a password,
scan the QR code with an authenticator app (Google / Microsoft Authenticator, 1Password, Authy), and save the
recovery codes. Add everyone else from **⚙ Settings → People**; each person gets their own setup link.

Production:

```bash
npm run build
npm start              # serves the built app and the API on $PORT (default 3001)
npm test               # isolation and account rules
```

Put it behind HTTPS (nginx, Caddy, a load balancer…) and set `COOKIE_SECURE=true`. Configuration lives in
environment variables – see `.env.example`.

## What's in it

**City** – 15 buildings, 12–15 floors each, exactly as listed in the documents (see `SPEC.md`). Day / night,
tap a building for its floors, tap again or pick a floor to walk in.

**Office** – one floor: desks with labelled agents (warm = people, blue = AI), status rings
(working / needs you), the task board, a live TV screen and the content wall. "Your office" is the floor of the desk
you pick in Settings.

**Agents** – about 300, each with its department's slice of the task lists:
- Dealership and rental agents: new customers, unsold prospects, orphans, mastermind, sold customers, birthdays,
  ownership anniversaries, referrals, CSI follow, lease end, service visits, conquest, lost / out of the market.
- Fast Sales agents: new customers, unsold, sold customers, contract to expire, referrals, follow-up, new affiliates,
  affiliates follow-up, new leads, current customers.
- Social media agents: strategy, the 30-day content calendar, captions / hooks / CTAs / hashtags, creative briefs,
  scheduling, community replies with escalation, lead-gen campaigns, trends, competitors, analytics, optimization,
  weekly reports.
- Managers (Max, and each dealership's store manager): flag leads waiting over an hour, send the morning report,
  propose ad tests.

**Right panel** – LIVE (KPIs, pipeline, activity), CRM, CONTENT, TEAM, OK (everything waiting for you), FLOORS
(rent rental floors at $199/mo).

**Full-screen views** – My CRM (pipeline board + lead drawer with timeline, notes and messaging), Content wall
(calendar, posts, inbox, analytics, insights, weekly reports), Outbox & reports, Big screen (TV mode), Settings.

**Reports** – morning report (08:00), the daily email report (18:00, every task item by email / phone / text,
per building) and the weekly social media report (Mondays 09:00), emailed to the recipients in Settings.

## Clients and roles

The city can hold many client businesses. Each **client** owns one or more buildings (Rick Case Honda, for
example, owns both of its buildings), and a building belongs to at most one client. The owner sets clients up
under **⚙ Settings → Clients**.

| Role | Sees | Can |
|---|---|---|
| Agency owner | The whole city | Everything, including people, clients and settings |
| Agency staff | The whole city | Work every building and rent floors; no people, clients or settings |
| Client admin | Only their client's buildings | Work those buildings: leads, approvals, posts, replies |
| Client viewer | Only their client's buildings | Look, but change nothing |

How it is enforced (`server/scope.ts`):

- The server filters everything a browser receives: the opening data, every live update and the people list.
  Other clients' buildings arrive only as unnamed grey shapes for the skyline.
- Every action is checked. Anything aimed at another client's lead, approval, post, inbox item or desk answers
  "Not found", so a client can't even confirm it exists.
- City-wide morning, daily and weekly reports stay with the agency for now.
- Changing someone's role or client, or a client's buildings, signs those people out, so their browser can't keep
  data they may no longer see.
- Accounts created before clients existed are upgraded: admins become agency owners, members agency staff.

## Safety

- Sign-in is password **plus** a 6-digit authenticator code (or a one-time recovery code). Optional "remember this
  device for 30 days". Five wrong attempts lock the account for five minutes. Every attempt is in the sign-in log.
- Forgot your password? "Forgot password?" on the sign-in page resets it with your authenticator code **and** one
  recovery code (both are needed), then signs you out everywhere. No recovery codes left? The agency owner resets you from
  Settings → People, which sends a fresh setup link.
  🔒 locks the screen until the code is entered again.
- The city starts with **simulated** leads (example.com addresses, 555 numbers). They are never contacted.
- **Real** leads are the ones you add. Agents draft messages to them, but nothing is sent until someone approves it,
  and only when Settings → Delivery is **Live** and email (SMTP) / texting (Twilio) are configured.
- Posts are only scheduled after approval. Sensitive comments are escalated to a person.
- With `ANTHROPIC_API_KEY` set and **AI drafts** on, Claude writes posts and messages to real leads (capped per
  hour); the same approvals apply.

## Code map

| Path | What it holds |
| --- | --- |
| `src/core/data/` | Buildings and floors, task lists, message / post templates (from the documents) |
| `src/core/sim.ts` | The city: agents, tasks, leads, social workflow, approvals, routines, reports, KPIs |
| `server/index.ts` | HTTP API, live update stream (SSE), clock, persistence |
| `server/auth.ts`, `server/totp.ts` | Users, clients, passwords, authenticator codes, recovery codes, sessions, sign-in log |
| `server/scope.ts` | Multi-client isolation: roles, what each person may see, and which actions they may run |
| `test/` | Automated tests (`npm test`) |
| `server/delivery.ts` | Email (SMTP) and text (Twilio) delivery |
| `server/brain.ts` | Optional Claude drafting |
| `src/scene/` | three.js city and office |
| `src/ui/` | Sign-in screens, app shell, panels and full-screen views |

The simulation speed (pause / real time / 1× / 5×) is in the top bar for admins. At 1× a city day takes 12 minutes.

## Proposal page

A public, bilingual (EN/ES) sales proposal lives at **`/proposal`** (`?lang=es` forces Spanish). All wording, names and
prices are in `src/proposal/content.ts`; building and agent counts come from the city data. Its live dashboard reads
`/api/public/pulse`, which returns counts only (no names, contact details or revenue). It never shows a password.

