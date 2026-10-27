Build review

# AgentCity proposal vs. what's built

Proposal: “AI Agent City — Multi-Client Platform Proposal”, Abdul, Oct 27, 2026 Code: romi-alt/ai-agent-city @ 8250c96 Reviewed Oct 27, 2026

The repository is a working single-company prototype of Sales City. It is strongest on the 3D city and the approval workflow. It has not started on what the proposal's Phase 1 needs: multi-client data, a real CRM connection, a durable agent runtime, billing and white-label.

## Status at a glance

**1**Done **10**Partly done **12**Not started of 23 areas in the proposal

## This repository is not the pilot the proposal describes

The proposal's “What the pilot already proves” section describes a different system from the code in this repository. Either that pilot lives in another codebase, or the proposal overstates what exists today. The pilot's code should be added to this comparison if it exists.

| The proposal says the pilot has | This repository has |
| --- | --- |
| PHP and JSON, 7 agents as n8n workflows | TypeScript and Node. Agents are a built-in simulation (`src/core/sim.ts`), with no n8n. |
| Live GoHighLevel account, pipelines matched by name | No GoHighLevel connection. Only an optional link from each lead to its contact page in the CRM. |
| 871-chunk course knowledge base | No knowledge base. |
| Email codes, 48-hour sign-in links | Authenticator-app codes, 72-hour setup links. |
| GitHub to Hostinger auto-deploy | Pushed to GitHub. Not deployed anywhere. |

## Area by area

Every row was checked against the code, not from memory.

| Proposal area | State | What exists today |
| --- | --- | --- |
| 3D city view | Partly | 15 buildings, every floor and desk, day/night, live statuses, zoom from city to floor to desk. Plain three.js rather than React Three Fiber, with no instancing or low-detail mode: fine for 15 buildings, not for the hundreds the proposal targets. |
| 5-level hierarchy (City, District, Building, Floor, Desk) | Partly | Building, Floor and Desk exist. There is no District (agency) level, and the whole city belongs to one company. |
| Red beacon on buildings that need a human | Partly | Agents and the “Needs you” count show it. There is no beacon on buildings. |
| Live updates | Partly | One live stream (server-sent events) shared by everyone. No per-client channels. |
| AI agents | Partly | About 280 simulated agents working every task list from the documents: dealership, Fast Sales, social media, and the morning, daily and weekly reports. Their rules are hard-coded, not versioned templates a client can hire. |
| Agent runtime (durable workflows) | Not started | Agents run inside one server process on a timer. A restart reloads the last save, taken every 30 seconds, so up to 30 seconds of work can be lost. |
| AI layer | Partly | Claude writes drafts of posts and messages, capped at 60 drafts an hour for the whole system. One AI provider, no per-client spending caps, no model routing or caching. |
| CRM connectors | Not started | Leads live only in the app's own data file. No GoHighLevel, HubSpot or Salesforce sync. |
| Knowledge base | Not started | None. Drafts use the lead's details and the task, not the client's own material. |
| Real sending | Partly | Email (any mail server) and texting (Twilio) are wired up. They only send to leads a person entered by hand, only after approval, and only once Live mode is switched on in Settings. Never tested with real accounts. |
| Multi-client isolation | Not started | **The biggest gap.** Every signed-in user receives the entire city's data, and any user can approve messages, rent floors or edit leads in any building. Fine for one company, unsafe for several clients. |
| Sign-in | Partly | Strong for one company: password plus authenticator code, recovery codes, remember-device for 30 days, lockout, sign-in log, password reset. The proposal wants single sign-on, passkeys, email codes and four roles (agency owner, agency staff, client admin, client viewer). This repo has two: admin and member. |
| Agent guardrails | Partly | Every message to a real person needs approval. A lead isn't contacted again for 6 hours (prospects) or 3 days (customers). Two agents can't work the same lead at once, which prevents double-texting. Upset customers go to a person. **Missing:** quiet hours, Do Not Disturb, “STOP” opt-outs, a per-lead daily cap, consent records. |
| Audit trail | Partly | Sign-in log, who made each lead change and approval, and the activity feed. Prompts, models and full agent decisions are not logged, and nothing can be replayed. |
| Compliance (text-message carrier registration, TCPA consent, CAN-SPAM, privacy export and deletion, SOC 2) | Not started | None of it. |
| Billing | Not started | Renting a floor records $199 a month, but no payments are taken. |
| White-label | Not started | A company-name setting only. Logo, colours and domain are fixed. |
| Client onboarding | Not started | Buildings are written into the code (`src/core/data/buildings.ts`). The only self-serve step is renting a floor in a rental tower. No templates, no CRM connection, no shadow mode. |
| Data storage | Not started | One JSON file, saved every 30 seconds by a single server. No database. |
| Hosting and deployment | Not started | No Docker, no automated build checks, no deployment. |
| Monitoring | Not started | Error logging only. |
| Automated tests | Not started | None in the repository. Features were checked with hand-run browser and server scripts that were not saved. |
| Sales proposal page | Done | A bilingual (English and Spanish) page at `/proposal`, with pricing matching the proposal's tiers ($79, $199, $399). |

The codebase is about 6,500 lines of TypeScript, CSS and HTML across 22 files.

## Against the roadmap

### Phase 1 · Harden the pilot

Months 1 to 3

- NoMulti-client data and sign-in
- NoAgent runtime on Temporal
- No3 beta clients live

**Gate:** 3 paying clients. Not reachable yet: with no CRM sync and no isolation, a real client can't safely go live.

### Phase 2 · City and console

Months 4 to 8

- PartlyShared 3D city, live events
- NoAgency console, white-label
- NoStripe billing, HubSpot link

**Gate:** 1 agency, 10 buildings. This is where the repo is furthest ahead: the city, the approval queue and the client screens exist as a prototype.

### Phase 3 · Marketplace

Months 9 to 14

- NoAgent and connector catalogue
- NoPartner API and SDK
- NoSOC 2 Type I audit

**Gate:** 50 buildings, SOC 2. Not started, as expected at this stage.

## The technology stack doesn't match

This decides whether the current code is kept or rebuilt, so it needs a decision early.

| Area | Proposal | This repository |
| --- | --- | --- |
| Screens and 3D | Next.js and React Three Fiber | Plain TypeScript and three.js |
| Server | NestJS | Express |
| Agent runtime | Temporal | A timer loop inside the server |
| Database | PostgreSQL with row-level security | One JSON file |
| Sign-in | A sign-in service such as Keycloak or Clerk | Built in |

### Keep and grow this code

Add PostgreSQL with row-level security, a client ID on every record, a GoHighLevel connector and a job queue. Cheaper, but the proposal's stack section changes.

### Use it as the clickable prototype

Start Phase 1 in the proposal's stack, reusing the 3D scenes, the task logic from the documents, the data model and the approval flows as the design spec.

## Inconsistencies to fix

- **Elvis's floor.** The proposal says L4. The app puts the leadership team on L12. The `/proposal` page says both: L12 in the team section, L4 in the partnership section.
- **Sign-in.** The proposal describes email codes and 48-hour links. The app uses authenticator codes and 72-hour links.
- **Number of agents.** The proposal says 7 agents in the pilot. The app's Fast Sales building alone has 33 desks, and the city has about 280 AI agents.

## Recommended next steps

1. **Decide the stack:** keep this code or rebuild it.
2. **Build multi-client isolation:** per-client data and roles, and send each user only their own client's data.
3. **Connect GoHighLevel:** a real lead and conversation sync, replacing the simulated leads for that client.
4. **Add the missing guardrails before any texts go out:** quiet hours, STOP handling, per-lead caps, consent records. Text-message carrier registration should start early too, as the proposal notes.
5. **Move storage to PostgreSQL** and agents to a durable job runner.
6. **Add automated tests and a deployment pipeline,** then onboard the first beta client in shadow mode.

How this was checked: the proposal (Word and PDF versions, which match) was compared with the source code of romi-alt/ai-agent-city at commit 8250c96. Statements about the code come from reading it, not from the proposal's descriptions. Nothing here verifies the separate pilot system the proposal describes.