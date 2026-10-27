# AgentCity

The existing Sales City app, mid-migration to the stack in the original proposal. Progress, evidence and blockers
are in [MIGRATION-STATUS.md](MIGRATION-STATUS.md). Decisions are in
[planning/agentcity-migration/m01/ARCHITECTURE.md](planning/agentcity-migration/m01/ARCHITECTURE.md).

| Path | What it is | State |
|---|---|---|
| `apps/legacy` | The working Sales City app (Express + Vite + Three.js). Its own README: [apps/legacy/README.md](apps/legacy/README.md) | In use; features move out of it stage by stage |
| `apps/web` | Next.js App Router web app | Platform status page only |
| `apps/api` | NestJS API: REST, GraphQL, OpenAPI | Health and readiness only |
| `apps/worker` | Temporal worker | Platform heartbeat workflow only |
| `packages/contracts` | Shared zod schemas | Health and heartbeat |
| `packages/db` | Migrations, pool, test-database fixture, BM25 check | Platform schema only |
| `infra/` | Docker Compose for local services | PostgreSQL + pg_search + pgvector, Redis, S3-compatible storage, Temporal, Keycloak |

## Requirements

- **Node 22.22** (`.nvmrc`). Node 22.12 or later 22.x is accepted.
- **pnpm 10.28.0.** `corepack enable` picks it up from `package.json`.
- **Docker with Compose v2**, for the local services.

## Local development

```bash
pnpm install --frozen-lockfile
pnpm infra:up       # start PostgreSQL, Redis, object storage, Temporal and Keycloak; returns once all are healthy
pnpm infra:init     # apply migrations and create the dev bucket (safe to repeat)
pnpm build

pnpm dev:api        # http://127.0.0.1:4000  (/health/live, /health/ready, /graphql, /docs)
pnpm dev:worker     # Temporal worker
pnpm dev:web        # http://127.0.0.1:3000  (shows the API's readiness)
pnpm dev:legacy     # the existing app: http://localhost:5173 (server on :3001)
```

Shutting down:

```bash
pnpm infra:down     # stop services, keep data
pnpm infra:reset    # stop services and delete their data volumes
```

Service consoles, all on 127.0.0.1 only:
- **Temporal UI:** http://127.0.0.1:58233
- **Object storage console:** http://127.0.0.1:59001
- **Keycloak:** http://localhost:58080. Its admin login is in `infra/local-dev.env`.

## Checks

```bash
pnpm format:check
pnpm typecheck
pnpm test                                       # unit tests, including the legacy app's 33
pnpm db:verify-search                           # BM25 + vector search really work in this PostgreSQL
pnpm --filter @agentcity/db test:integration    # migrations, app-role permissions, reversibility
pnpm smoke                                      # end-to-end; needs infra:up, infra:init and build first
```

`pnpm smoke` starts its own API, worker and web app, so stop the dev servers first. It also briefly stops
PostgreSQL and object storage to prove readiness fails without them. It writes evidence to
`planning/agentcity-migration/m01/evidence/`.

## Credentials and safety

- `infra/local-dev.env` holds **local-development-only** credentials and is committed on purpose.
  - Every secret in it contains `local-dev-only`.
  - The API and worker refuse to start with such values when `NODE_ENV=production`.
- Never put real credentials in it. Use an untracked `.env` or the deployment's secret store instead.
- The legacy app's outbound kill switch (`OUTBOUND_ENABLED`) stays off. The new apps send nothing outside the
  machine.
