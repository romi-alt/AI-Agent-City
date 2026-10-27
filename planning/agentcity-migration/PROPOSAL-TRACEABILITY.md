# Requirement-to-prompt traceability
This is the audit baseline, not a completion claim. Implementation must add code paths, tests and actual evidence. Original documents in references are authoritative. The proposal describes a different live PHP/JSON/n8n pilot; its stated 871 chunks, live GHL and workflows were not in this ZIP and cannot be credited to this build.

| ID | Source requirement | Current evidence/gap | Stages | Required proof |
|---|---|---|---|---|
| R01 | Five levels: city/district/building/floor/desk | Existing city/building/floor/desk; district/security model missing | M02,M05,M06,P05 | Authorized navigation and separate physical/security identities |
| R02 | Living windows, traffic, red intervention beacon | Mostly decorative scene; gold beacon | M06,M07,M08 | Real domain-event driven activity and intervention lifecycle |
| R03 | Next/React/R3F/drei/instancing/LOD/Draco/KTX2 | Vite/plain TS/imperative Three | M01,M05,M06 | Real component ownership, asset loader fixture, measured performance |
| R04 | Smooth phones, optional city, automatic 2D | WebGL initializes before fallback | M05,M06 | WebGL failure/disabled, mobile and reduced-motion browser tests |
| R05 | Subsecond tenant WebSocket updates | Global SSE, no replay | M07 | Scope denial, restart/gap recovery and latency measurements |
| R06 | Nest REST + GraphQL + OpenAPI | Standalone Express command dispatcher | M04 | Generated contracts, shared domain behavior and security tests |
| R07 | Temporal, retries, schedules, restart-safe approval | Sim timer/memory, lost reservations | M08 | Worker-kill tests, durable approval/reservation and dispatch reconciliation |
| R08 | Versioned prompt/tool/guardrail templates | Hardcoded seed agents/templates | M08,P03,P08 | Version lifecycle and deterministic old-run compatibility |
| R09 | Model routing/cache/tenant cost caps | Global Anthropic queue | M09,P02 | Three adapter types, cost races and cache isolation |
| R10 | Tenant KB, BM25 + vector, citations | No retrieval; global prompt context | M09,P02 | Actual extension ranking, grounding evaluations and deletion |
| R11 | PostgreSQL RLS / Redis / S3 | Global JSON/maps | M01,M02,M09 | Actual non-bypass RLS tests, queues/rate limits and scoped objects |
| R12 | GHL / HubSpot / Salesforce | Manual CRM-like local board | P01,P07 | Scoped sync, backfill/webhooks and verified sandbox contracts |
| R13 | Twilio / SendGrid / Google / Meta Ads | Global Twilio/SMTP only; log-only ads | M08,P04,P07 | Capability-specific IDs, receipts and authenticated callbacks |
| R14 | n8n custom flows | No workflow exports attached | P07 | Versioned importable flow, authenticated scoped bridge, no policy bypass |
| R15 | OIDC, agency SSO, passkeys, email codes | Custom scrypt/TOTP auth | M03 | Real sign-in journeys and old-device revocation |
| R16 | Agency owner/staff, client admin/viewer, step-up/device sessions | Admin/member global access | M02,M03,M04 | Role/assignment matrix, expiry, revocation, step-up |
| R17 | Tenant credentials/key vault | Global environment credentials | M09,P01,P07 | Scope denial, rotation and audited key references |
| R18 | Context first, no double text, approved channels/templates | Busy locks volatile; manual bypass and canned factual offers | M08,P02,P03 | Durable lead/channel locks and factual field/policy tests |
| R19 | DND/quiet hours/caps/consent/risky approval | No complete policy engine | M08,P09 | Dispatch-time rechecks, suppression race and cap concurrency |
| R20 | Audit each decision/prompt/model/message/approval/replay | Approvals deleted, bounded history, mutable payload | M02,M04,M08,M09 | Immutable revisions and replay that cannot resend |
| R21 | A2P10DLC/TCPA, email domain readiness | Absent verified readiness model | P05,P07,P09 | Account-specific evidence and channel activation gates |
| R22 | GDPR/CCPA export/deletion | Missing | P09 | Scoped export and deletion across retrieval/storage/retention |
| R23 | White-label logo/domain/colors, agency console | Missing | M05,P05 | Verified custom host, tenant-safe branding, staff assignment |
| R24 | Five industry templates and <one-day onboarding target | No self-serve tenant flow | P05 | Working wizard and measured beta effort |
| R25 | 48-hour shadow then activation | Simulation switch, accelerated clock | M08,P05 | Persisted real-time window, no effects, explicit activation |
| R26 | Stripe seats/plans/metered overage | Pricing copy and asking-rent KPI only | M09,P06 | Signed webhooks, entitlements and money/usage reconciliation |
| R27 | Docker/Kubernetes or Fly/Terraform/GitHub Actions | No complete platform configuration supplied | M01,P09 | Fresh environment, stage rollout, restore and rollback evidence |
| R28 | OTel/Grafana/Sentry/per-run LLM traces | Console/local logs | M09,P09 | Correlated spans, redaction, alerts and debugging a failed run |
| R29 | Agent/integration marketplace + partner API/SDK | Missing | P08 | Versioned installation, scope controls and working SDK sample |
| R30 | Three-phase paying-client gates / SOC2 readiness and audit | No business or certification evidence | P09,P10 | External business/auditor evidence, never fabricated |
| R31 | Full named buildings/floors/personas | Strong seed implementation | M02,M06,P03,P05 | Inventory/floor regression and preserved stable IDs |
| R32 | Dealership/rental email/phone/text tasks | Categories/canned simulated flows | P03,P07 | Every task-channel pair mapped to actual capability and policy |
| R33 | Fast Sales tasks and daily email report additions | Canned categories/report generation | P03 | Every category in report and grounded workflow evidence |
| R34 | Twelve social task families | Calendar/drafts, fake asset-ready/publish/metrics | P04 | Asset/provider IDs, real metrics, all twelve tests |

## Detailed task coverage
Source Agents tasks.docx specifies these categories for EACH of email, phone and text: new customers; unsold prospects; orphans; mastermind; sold customers; customer birthday; ownership anniversary; referrals; CSI follow; lease end; service visits; Conquest; lost out of the market. Preserve these thirteen exact entries and confirm business meaning of ambiguous labels (especially mastermind/orphans/Conquest) without inventing it. This yields 39 channel-category combinations. Phone capability must distinguish a scheduled human task from an actual approved dialer/voice integration. The documents alone do not authorize impersonating named humans.

FAST SALES AGENTS.docx specifies ten categories for EACH email/phone/text: new customers; unsold; sold customers; contract to expire; referrals; follow-up; new affiliates; affiliates follow-up; new leads; current customers. This yields 30 combinations, with the instruction to add their results to the daily emailed report. Required data, eligibility, template, approval, channel readiness and output evidence must exist for each combination. Do not infer missing lease/contract dates or financial offers.

Social task coverage must include: (1) weekly/monthly strategy, (2) 30-day calendar, (3) hooks/captions/CTA/hashtags/platform formatting, (4) actual images/carousels/video/reels/stories, (5) authorized multi-platform publishing, (6) comments/mentions/DMs with escalation, (7) course/dealer lead campaigns, (8) grounded trends, (9) public competitor analysis, (10) reach/impressions/engagement/clicks/leads/conversions/follower growth, (11) measured optimization/testing, (12) weekly summaries/completed work/upcoming schedules/recommendations. Retain per-platform capability and approval constraints.

## Physical source mappings
Fast Sales L12 Admin/CEO/Accounting; L11 Auto Sales Associate; L10 Auto F&I Manager; L9 Auto Broker; L8 Auto Sales Phone Skills; L7 Objections; L6 Essential Dealership Guide; L5 Dealership Packages; L4 Amazon Books; L3 Affiliates; L2/L1 empty. Illustrative proposal desk diagram does not override this detailed floor list.

Nine dealership brands: Audi, Honda, Hyundai, Genesis, Acura, Volkswagen, Alfa Romeo, Maserati (source spelling Maseratti), Fiat. Each L12 Sales, L11 Internet Sales, L10 Finance, L9 Social Media, L8 Service, L7 Parts, L6 Body Shop, L5 Administration, L4 HR, L3–L1 empty.

Rick Case new: L1 Javier, L2 Andre, L3 Josiah, L4 Luiz, L5 Abdul, L6 Bilal, L7 Claudia, L8 Frank, L9 Seyling, L10 Shaher, L11 Jolson, L12 Rafael, L13 Soco, L14 Will, L15 Anarkis. Used: L1 Federico, L2 Jeffrey, L3 John, L4 Reymer, L5 Wayne, L6 Clarissa, L7–L12 empty. Three rental buildings each have twelve $199/month advertised floors. Exact original runtime seed is also in audit/seed-inventory.json.

## Actual proposal phase gates
The page-7 diagram says:

| Proposal phase | Estimate | Scope emphasis | Gate |
|---|---|---|---|
| 1: Harden pilot | Months 1–3 | Multi-tenant data/identity, Temporal, 3 beta clients live | 3 paying clients |
| 2: City and console | Months 4–8 | Shared city/live events, agency/white-label, Stripe/HubSpot | 1 agency, 10 buildings |
| 3: Marketplace | Months 9–14 | Agent/connector catalog, partner API/SDK, SOC2 Type II audit | 50 buildings, SOC2 |

Narrative separately targets SOC2 Type I readiness by end Phase2 and Type II afterward. The uploaded review's Phase3 Type I language is inaccurate. Timeline is an estimate, not a code-generation deadline. M/P prompt numbers are technical work packages, not new business phases: release the Phase1 slice after its relevant acceptance checks, and do not claim or fund progression through later business phases without their preceding gate. P10 can be reused at each gate with the appropriate scope; all requirements remain in the full completion matrix.
