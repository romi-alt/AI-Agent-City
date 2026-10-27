# Proposal stack and completion rules
The proposal decides the stack. Do not reopen it as a product preference or substitute familiar tools. Choose Socket.IO, Keycloak and Kubernetes from the proposal's allowed options for this plan. These are implementation defaults, not claims that the proposal mandates those particular alternatives. An existing Clerk or Fly.io deployment can justify an ADR retaining that explicitly permitted alternative.

| Layer | Required implementation | What does not satisfy it |
|---|---|---|
| Front end | Next.js App Router, React, TypeScript | Vite screens embedded in an iframe |
| City | R3F, Three.js, drei, instancing, LOD, Draco/KTX2 asset pipeline | An imperative Engine mounted once in a React effect |
| Realtime | Socket.IO, authorized tenant/workspace subscriptions, event cursor and snapshot recovery | Global SSE or broadcast filtered only in the browser |
| API | NestJS REST and GraphQL; OpenAPI for REST, generated GraphQL schema | Renaming standalone Express files; Nest's own Express adapter is allowed |
| Workflows | Temporal TypeScript workflows and workers; versioned agent templates | setInterval, in-process queues, Redis alone as workflow durability |
| AI | Gateway with OpenAI, Anthropic and configurable open-model adapters; routing, cache, tenant caps | One global Anthropic call queue |
| Knowledge | PostgreSQL, pgvector, genuine BM25 + embedding fusion, source citations | Native ts_rank renamed BM25; synthetic citations |
| Data | PostgreSQL RLS, Redis queues/rate limits, S3-compatible objects | Tenant id added only to API filters; production JSON state |
| Connectors | Common SDK; GHL, HubSpot, Salesforce, Twilio, SendGrid, Google, Meta Ads; n8n custom flows | Interface stubs presented as connected accounts |
| Identity | OIDC, agency SSO, passkeys, email sign-in codes, device-aware sessions, step-up | Existing scrypt/TOTP renamed OIDC; email verification renamed email OTP |
| Billing | Stripe subscriptions/seats/plans/metered usage; signed idempotent webhooks | Asking rent counted as revenue; successful checkout treated as payment settlement |
| Platform | Docker, Kubernetes (Fly.io allowed initially), Terraform, GitHub Actions, staged flags | Dockerfile alone |
| Operations | OpenTelemetry, Grafana, Sentry, correlated LLM run traces | Console logs or traces containing raw credentials/PII |

## Decisions to prove during implementation
Pin compatible versions from official documentation and lockfiles at implementation time. Do not invent currently available package versions. React, Next and R3F must be compatible. Verify a real PostgreSQL BM25 extension such as pg_search against the target Postgres version, managed hosting and RLS security; extension access paths need tenant-isolation tests. If unavailable, record a blocked requirement or an explicitly reviewed alternative delivering actual BM25—not a silent downgrade.

Keycloak is the local default. Verify its chosen release's passwordless email-code capabilities; TOTP, email verification and email sign-in codes are different requirements. Use a reviewed extension or the proposal's Clerk alternative if needed, document maintenance/security tradeoffs, and keep this requirement blocked until a real flow is tested. Never import old TOTP secrets, password hashes, remembered devices or sessions into the new IdP.

Redis handles bounded queues, distributed rate limits and realtime fanout; Temporal owns durable business workflows. S3/MinIO stores objects, not authoritative relational state. A vault/KMS design supplies separate tenant encryption keys and credential rotation; the local development equivalent must be conspicuously nonproduction.

## Deployment topology
apps/web (Next) → apps/api (Nest REST/GraphQL/Socket.IO) → Postgres/Redis/object storage. apps/worker runs Temporal activities through packages/connectors and packages/llm. Keycloak issues identity; the API resolves server-side membership and permissions. PostgreSQL outbox events bridge committed changes to workflows and realtime. External callbacks enter authenticated/signed API routes, not workflow memory. Every hop carries tenant/workspace/run correlation without leaking sensitive content.

## Official implementation references
- https://nextjs.org/docs/app/getting-started/server-and-client-components
- https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide
- https://docs.nestjs.com/graphql/quick-start
- https://docs.nestjs.com/openapi/introduction
- https://docs.nestjs.com/faq/http-adapter
- https://docs.temporal.io/develop/typescript
- https://socket.io/docs/v4/connection-state-recovery
- https://www.keycloak.org/securing-apps/oidc-layers
- https://www.paradedb.com/learn/search-in-postgresql/bm25

These references clarify implementation, not permission to change proposal requirements. Socket.IO connection recovery is not guaranteed; durable event replay/snapshot fallback remains required. Select an adapter only after verifying its recovery behavior.
