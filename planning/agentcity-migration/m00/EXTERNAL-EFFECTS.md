# M00 external-effect inventory

Every way the current runtime can affect or contact something outside its own process and data folder,
traced in the checkout (`server/*`, `src/*`, `index.html`, `proposal.html`). Status is after M00 containment.

**Kill switch:** `server/outbound.ts`. A provider is called only when the server was started with
`OUTBOUND_ENABLED=true` **and** Settings → Delivery is "live". The default is off, and the demo ("simulate")
mode never calls a provider. Evidence: `test/containment.test.ts` (fake providers receive zero calls from
every path below while it is off, and while in demo mode; a positive control proves the paths are live).

## Server → providers

| Effect | Code path | Trigger | Before M00 | After M00 |
|---|---|---|---|---|
| Email via SMTP (nodemailer) | `delivery.ts` outbound hook ← `sim.resolve` | Reviewer approves an agent's message to a real lead | Sent when Delivery = live and SMTP set | Gate; refused → message `skipped` (live) or `simulated` (demo), reason recorded |
| Email via SMTP | outbound hook ← `sim.sendManual` (`leadSend` action) | A person presses Send on a real lead | Same, no approval queue (audit C09) | Gate as above; the person is told nothing was sent |
| Email via SMTP | `delivery.ts` report hook ← `sim.addReport` | Clock reaches morning/daily/weekly report time with recipients set | Sent when live | Gate; refused → report `skipped`/`simulated` |
| Email via SMTP | `delivery.sendTest` ← POST `/api/admin/test-email` | Owner presses "Send test email" | Sent regardless of delivery mode (audit F06) | Gate; refused with the reason |
| Text via Twilio REST (`fetch` to api.twilio.com) | outbound hook (approval or manual send, channel "text") | As for email | Sent when live and Twilio set | Gate as above |
| Phone "call" | outbound hook (approval, channel "phone") | Reviewer approves a call task | Marked `sent` with no provider at all (audit F07) | Never called a provider; now marked `skipped`: "No phone provider is connected" |
| Anthropic API (Claude drafts) | `brain.ts` `draftPost` / `draftMessage` hooks | Agents write posts (simulated content too) or messages to real leads, with AI drafts on and a key set | Called even in demo mode, on demo content | Gate checked before the request is queued; refused → template draft stays, no budget used |

No other server code makes network requests. Social "publishing", ad "launches", inbound comments and their
metrics are simulated in `src/core/sim.ts` and contact no platform (audit F09).

## Browser → third parties

| Effect | Where | Notes |
|---|---|---|
| Google Fonts stylesheet and font files | `index.html`, `proposal.html` | Reveals visitor IP/user agent to Google on every page load. Not contained in M00 (not a send to customers); self-host in M05. |
| "Open in CRM" link | Lead drawer, when Settings → External CRM contact link is set | A person-clicked link that puts the lead's id/email/phone/name into the URL of the configured https CRM page. Not automatic. |
| None other | — | Otherwise the app talks only to its own server. |

## Data written locally

| Effect | Code | Notes |
|---|---|---|
| `data/state.json` (city snapshot, real leads and messages included) | `saveSim` every 30 s and on SIGINT/SIGTERM, temp file + rename | M00: a corrupt or unsupported file now stops the server (exit 2) and is never overwritten |
| `data/auth.json` (users, TOTP secrets, sessions, devices, sign-in log), mode 0600 | `AuthStore.save` on changes | M00: an unreadable file stops the server before anything is written |
| Cookies `fs_sid`, `fs_dev` | auth routes | httpOnly, sameSite=strict, `secure` when COOKIE_SECURE=true |
| Browser localStorage `fs-theme`, `fs-last-user`, `fs-proposal-lang` | UI | Per-device preferences only |

## Unauthenticated exposure

| Endpoint | Before M00 | After M00 |
|---|---|---|
| GET `/api/public/pulse` | Fast Sales lead/booking/enrolment counts, pipeline stage counts, and the leadership team's names, roles, status and current work, read from the same office that holds real contacts (audit F15) | Fixed catalog only: `{"catalog":{"buildings":15,"floors":183,"aiDesks":281,"humanDesks":22},"live":false}` |
| `/proposal` | Polled the pulse every 4 s and showed it as a live dashboard | Shows an empty sample dashboard and the catalog desk count; makes no data requests |
