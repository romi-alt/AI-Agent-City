# M01 architecture decisions

Stage M01 creates the workspace and local infrastructure around the existing build. These records explain each
choice that a later stage would otherwise have to rediscover. Each one gives the decision, why, and what would
change it.

## Layout

```
apps/legacy     the existing Sales City app (Express + Vite + Three.js), moved unchanged; still runnable
apps/web        Next.js App Router + React: M01 shows the platform status page only
apps/api        NestJS (Express adapter): REST + GraphQL + OpenAPI; M01 serves health and readiness only
apps/worker     Temporal worker: M01 runs the platform heartbeat workflow only
packages/contracts  zod schemas and constants shared by web, API and worker (no Node or browser APIs)
packages/db     SQL migrations (node-pg-migrate), pool factory, test-database fixture, BM25 verification
infra/          Docker Compose, local-only credentials, Postgres init, Keycloak realm
scripts/smoke.mjs   end-to-end check of the running stack
```

No business feature was ported. The new apps prove the wiring (web → API → dependencies; API → Temporal → worker
→ PostgreSQL) and nothing more.

## ADR-001: one package manager, pinned toolchain

- **Decision:**
  - pnpm 10.28.0 workspaces, pinned through `packageManager`, with one `pnpm-lock.yaml`.
  - The legacy `package-lock.json` is removed. The legacy dependencies were pinned to the exact versions that lock
    held (e.g. three 0.180.0, vite 8.3.5, typescript 7.0.2), so the legacy build is unchanged.
  - `pnpm-workspace.yaml` allows dependency build scripts only for esbuild and @swc/core. It refuses them for
    `@scarf/scarf` (install telemetry) and the protobufjs postinstall scripts, which are not needed at runtime.
- **Why pnpm:**
  - Strict dependency isolation stops one app from importing another's dependencies by accident.
  - It is fast to install in CI.
  - It is the package manager the Next.js and NestJS documentation already cover.
- **Evidence:** a fresh clone installs with `pnpm install --frozen-lockfile` (see MIGRATION-STATUS.md).

## ADR-002: Node 22 LTS now, Node 24 when available

- **Decision:**
  - `.nvmrc` pins 22.22.0.
  - `engines` is `>=22.12.0 <23`, and `engine-strict=true` in `.npmrc` enforces it.
- **Conflict:** the pack targets Node 24. This environment and its image only have Node 22.22.0.
- **Why it is safe:**
  - Every chosen package supports Node 22.
  - Nothing relies on Node 24-only APIs.
- **To change it:** raising the pin to 24 is a one-line change plus a CI run. Do it in the first stage that runs
  where Node 24 is installed.

## ADR-003: TypeScript and module format

- **New apps and packages:** TypeScript 6.0.3, ES modules throughout, and `tsconfig.base.json` (strict,
  `noUncheckedIndexedAccess`, NodeNext).
  - They use 6.0.3 because @nestjs/graphql 14 and @nestjs/swagger 12 declare `typescript ^5.5 || ^6` as a peer, and
    the API needs legacy decorators plus `emitDecoratorMetadata`.
- **The legacy app** keeps its TypeScript 7.0.2 and its own `tsconfig`, unchanged.

## ADR-004: object storage is RustFS locally, not MinIO

- **Conflict:** the M01 prompt names "S3-compatible MinIO". TARGET-STACK.md requires "S3-compatible objects".
- **Decision:** the local stack uses RustFS 1.0.4, an Apache-2.0, S3-compatible server. The application code only
  uses the standard S3 API (`@aws-sdk/client-s3`, path-style addressing), so it stays compatible with MinIO,
  Amazon S3 or any S3-compatible store.
- **Why not MinIO:**
  - The `minio/minio` image could not be pulled here: "object not found" from the Docker Hub mirror.
  - The quay.io tags tried also failed.
  - These failures are consistent with MinIO no longer publishing community release images. That was not
    confirmed against MinIO's own announcements from here. Either way, pinning a current, real image was not
    possible.
  - The pack says not to use nonexistent tags.
- **What is verified:**
  - The bucket is created by `pnpm infra:init`.
  - Anonymous access to it is refused (HTTP 403).
  - The API's readiness probe is a `HeadBucket` call, and readiness fails when the service is stopped (smoke check).
- **To change it:** swap the `object-storage` image and its two credential variables in `infra/compose.yaml`. No
  code changes. Production object storage is chosen in the deployment stage.

## ADR-005: images and where they come from

- **Pinning:** every image is pinned by tag **and** digest in `infra/compose.yaml`.
- **Registries:** images are pulled from `mirror.gcr.io` (Google's Docker Hub mirror) and `quay.io`, because Docker
  Hub returned HTTP 429 (rate limit) in this environment. The digests are those of the upstream images.

| Service | Image | Notes |
|---|---|---|
| PostgreSQL | `paradedb/paradedb:0.26.3-pg17` | PostgreSQL 17.11, pg_search 0.26.3 (BM25, Tantivy), vector 0.8.6 |
| Redis | `redis:7.4-alpine` | password required, append-only file |
| Object storage | `rustfs/rustfs:1.0.4` | see ADR-004 |
| Temporal | `temporalio/temporal:1.9.1` | CLI dev server: Server 1.32.0, UI 2.54.1; SQLite file on a volume |
| Keycloak | `keycloak/keycloak:26.8.1` | `start-dev`, realm imported from `infra/keycloak/agentcity-realm.json` |

## ADR-006: BM25 and vectors in PostgreSQL

- **Decision:** use ParadeDB's `pg_search` for BM25 and `pgvector` for embeddings, in the same PostgreSQL. The
  first migration creates both extensions.
- **What `pnpm db:verify-search` proves:**
  - ranking follows BM25: more occurrences score higher, longer documents are penalised, and non-matching
    documents are excluded;
  - the query plan uses the ParadeDB custom scan on the `bm25` index, not `ts_rank`;
  - a vector nearest-neighbour query works.

  It runs in a transaction that is rolled back.
- **Syntax note (pg_search 0.26):** `CREATE INDEX … USING bm25 (id, body)`, `@@@` and `paradedb.score(id)`.
  `key_field` is deprecated.
- **Not yet proven:**
  - behaviour under row-level security and tenant isolation (M02 / knowledge stage);
  - availability on a managed PostgreSQL host (the deployment stage).

  Both remain open requirements, as TARGET-STACK.md asks.
- **To review in M02:** the image also pre-creates `postgis` (+ tiger geocoder, topology), `fuzzystrmatch`,
  `pg_ivm` and `pg_stat_statements` in the database. They are unused. M02 should decide whether to drop them.

## ADR-007: Temporal locally

- **Decision:** use the Temporal CLI dev server, backed by a SQLite file on a named volume. Workflow history
  therefore survives container restarts. It is a single process and suitable only for development.
- **What the heartbeat workflow proves:**
  - **Wiring:** it records a `started` step, sleeps on a durable timer, records `finished`, and returns the rows.
  - **Exactly once:** activities write with `ON CONFLICT DO NOTHING` on `(run_id, step)`, so a retried activity
    cannot record a step twice.
- **Crash test:** the smoke check SIGKILLs the worker during the timer and starts a different worker, which
  finishes the run. The rows show each step once, and the two steps carry different worker ids.
- **Not in scope here:** business workflows, versioning and agent templates (M08), and the production Temporal
  deployment (the deployment stage).

## ADR-008: identity placeholder

- **Superseded in M03:** the public `agentcity-web` client was removed; the API is now a confidential OIDC client
  (`agentcity-bff`). See `m03/DESIGN.md` and `m03/IDP.md`.
- **Decision:** Keycloak 26.8.1 runs locally with realm `agentcity` and one public client, `agentcity-web`
  (authorization code + PKCE S256, redirect `http://localhost:3000/*`).
  - The realm has no users.
  - No application code uses it yet.
- **Verified:** the smoke check confirms the OIDC discovery document is served and offers S256.
- **Still open:** passwordless email codes, passkeys, step-up and session handling are M03 requirements. They stay
  open until a real flow is tested there.
- **Unchanged:** the legacy app keeps its own sign-in until then.

## ADR-009: ports and network boundary

Every published port binds to `127.0.0.1` only. No service is reachable from other machines. The ports are offset
from defaults so they don't collide with services already on a developer machine.

| Port | Service |
|---|---|
| 55432 | PostgreSQL |
| 56379 | Redis |
| 59000 / 59001 | object storage API / console |
| 57233 / 58233 | Temporal gRPC / UI |
| 58080 / 59900 | Keycloak / its management (health) port |
| 4000 | API (`apps/api`) |
| 3000 | web (`apps/web`) |
| 3001 / 5173 | legacy server / legacy Vite dev server (unchanged) |

## ADR-010: secret boundary

- **Committed values:**
  - `infra/local-dev.env` is committed on purpose. Every secret in it contains `local-dev-only` (the S3 access key
    is the only non-secret identifier without it).
  - It is read by Compose and, through `--env-file-if-exists`, by the apps.
- **Production refusals:** the API and worker validate their environment with zod at start, and list problems
  without printing values. When `NODE_ENV=production` they refuse to start if:
  - any environment value contains `local-dev-only`, or
  - `ENABLE_DEV_ROUTES=true`.
- **Database roles:**
  - The app connects as `agentcity_app`: `NOSUPERUSER`, `NOBYPASSRLS`, no `CREATE` on `public`, and only
    `SELECT, INSERT` on `platform.heartbeat`.
  - Migrations run as `agentcity_admin`.
  - Integration tests prove the app role cannot create, delete or drop.
- **Readiness output:** readiness details are short reasons such as `unavailable (ECONNREFUSED)`. They never
  include connection strings or credentials.
- **Telemetry:** Next.js telemetry is disabled in every web script (`NEXT_TELEMETRY_DISABLED=1`), because it is an
  outbound effect.
- **Production secrets** (vault/KMS, per-tenant keys, rotation) are a later stage. Nothing here is a production
  credential.

## ADR-011: browser and server imports

- **Server-only code:** `apps/web/lib/api.ts` imports `server-only`. Next.js fails the build if a client component
  imports it, so the API URL and the readiness request never reach the browser bundle.
- **Shared code:** `packages/contracts` contains only zod schemas and constants, so both sides can import it.
- **Database code:** `packages/db` is server-only and is not a dependency of `apps/web`.

## ADR-012: packages not created yet

The prompt lists `domain`, `city-scene`, `connectors`, `llm`, `knowledge` and `demo` "as appropriate". Each would
be an empty folder today, and empty folders are not completion. They are created by the stage that first puts real
code in them:

| Package | Stage |
|---|---|
| `domain` | M02 (data model) |
| `city-scene` | M05/M06 (R3F city) |
| `connectors` | M08 (dispatch) |
| `llm` | M09 (AI gateway) |
| `knowledge` | M09 (BM25 + embeddings) |
| `demo` | M10 |

## Startup and shutdown

See the root README ("Local development"). In short:

```
pnpm install --frozen-lockfile
pnpm infra:up      # starts all five services; waits for health checks
pnpm infra:init    # migrations + dev bucket (idempotent)
pnpm build
pnpm dev:api | dev:worker | dev:web | dev:legacy
pnpm smoke         # end-to-end check (starts its own API, worker and web)
pnpm infra:down    # stop; data kept in volumes
pnpm infra:reset   # stop and delete volumes
```
