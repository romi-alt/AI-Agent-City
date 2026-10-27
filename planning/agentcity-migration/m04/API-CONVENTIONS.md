# M04 API conventions

The rules every M04 module (crm, approvals, outreach, content, rentals, tenancy, presence, integrations, activity,
catalog) follows, so REST and GraphQL behave the same and the web app handles one set of errors.

- **Shared code:** `apps/api/src/common/` (tests: `apps/api/test/common-*.test.ts`).
- **Consistent with M03:** `apps/api/src/auth/contracts.ts` (error codes, `AuthenticatedRequest`,
  `SessionContext`) and `m03/DESIGN.md`.
- **Route inventory:** `ROUTE-PARITY.md`.

## 1. Layering

```
controller (REST) ─┐
                   ├─► service (authorization + domain rules) ─► withScope(APP_POOL, {subject, tenantId, workspaceId}, …)
resolver (GraphQL) ┘                                                │ RLS decides which rows exist
                                                                    └─► audit_event + outbox_event in the same transaction
```

**Controllers and resolvers are thin.** Each one:
1. parses input with the zod schema from `@agentcity/contracts`;
2. builds the scope from `req.session` (`subject`, `tenantId`, `workspaceId`);
3. calls one service method;
4. maps the result to the DTO.

Each operation exists once, in the service. REST and GraphQL call the same method, so they make the same
permission decision. The contract tests run each case through both.

**Scope comes from the session, never from the request.**
- `tenantId` is `session.tenantId`, which M03 set after `app.enter_scope` proved membership.
- A request without one gets 409 `no_tenant_selected`.
- Agency-level routes that name a tenant (`/api/agency/tenants/:id`) still enter that tenant's scope through
  `withScope`, so the database re-checks the membership.
- A caller-supplied tenant or workspace id is only ever a narrowing filter inside an already-proven scope.

**Role checks happen in the service, before the database.** A viewer trying to write gets 403 `forbidden`. RLS
remains the backstop: restrictive write policies, and invisible rows. Anything the scope can't see is 404
`not_found`, never 403, so existence is not revealed.

**Provider calls never happen in a controller or resolver.** A command that leads to an external effect writes
an authorized intent (draft revision + approval + outbox event) and returns `queued`. Dispatch is M08 (Temporal
activities through `packages/connectors`).

## 2. Errors

Every non-2xx REST response, and every GraphQL error's `extensions`, has this shape:

```json
{ "error": "stale_revision", "message": "Someone changed this since you opened it. Reload to see the latest version.",
  "requestId": "web-7f3a", "details": { "currentVersion": "4", "expectedVersion": "3" } }
```

- `error` is a stable machine code from the list below. The web app switches on it, never on `message`.
- `message` is for people, written from their side of the screen. It never contains SQL, stack traces, driver
  messages, secrets, constraint names or another tenant's data.
- `requestId` is always present (section 3).
- `details` is optional and structured: `issues` for validation, `currentVersion` for conflicts,
  `retryAfterSeconds` for rate limits, `retryable` for transient database conflicts.
- **M03 compatibility:** `step_up_required` keeps `reason` at the top level (as `contracts.ts` documents), and the
  same value is also in `details`.

### Codes

The list is `API_ERRORS` in `common/errors.ts`; it includes `AUTH_ERRORS`.

| Code | HTTP | When |
|---|---|---|
| `not_signed_in` | 401 | no or invalid session (M03) |
| `device_proof_required` | 401 | missing or invalid `X-Device-Proof` (M03) |
| `session_revoked` | 401 | session ended elsewhere (M03) |
| `bad_origin` | 403 | write without the app's Origin (M03) |
| `step_up_required` | 403 | needs a fresh strong sign-in; `reason`: `credential` / `billing` / `permission` (M03) |
| `forbidden` | 403 | signed in and in scope, but the role may not do this (e.g. viewer writes) |
| `no_tenant_selected` | 409 | no current tenant on the session (M03) |
| `bad_request` | 400 | malformed request: not JSON, malformed `If-Match`, conflicting headers |
| `validation_failed` | 400 | input failed its zod schema; `details.issues[]` = `{ path, code, message }`, never the received values; also GraphQL query depth/field limits |
| `invalid_cursor` | 400 | cursor forged, expired, or issued for another tenant, workspace, list or filter |
| `not_found` | 404 | absent **or outside your scope** (indistinguishable on purpose) |
| `conflict` | 409 | clashes with current state: duplicate, already decided, floor already occupied; `details.retryable` for serialization failures |
| `stale_revision` | 412 / 409 | version precondition failed; 412 when it came from `If-Match`, 409 from a body field or GraphQL argument (section 5) |
| `gone` | 410 | used or expired single-use link |
| `payload_too_large` | 413 | body over the limit |
| `unsupported_media_type` | 415 | not JSON |
| `precondition_required` | 428 | an update without `If-Match`/`expectedVersion`, or with `If-Match: *` |
| `rate_limited` | 429 | over a limit; `Retry-After` header and `details.retryAfterSeconds` |
| `outbound_disabled` | 409 | kill switch off, demo tenant, or delivery not enabled: **nothing was sent** |
| `policy_blocked` | 409 | suppression, missing consent, quiet hours or a cap refused it; `details.policy` names which |
| `internal_error` | 500 | our fault; the body says only "quote the request id" |
| `service_unavailable` | 503 | a dependency is down or timed out; `details.retryable: true` |

### Mapping, done by `StructuredErrorFilter`

The filter renders the result as JSON for REST, or as a `GraphQLError` with the same `extensions` for GraphQL.

| Thrown | Becomes |
|---|---|
| `ApiError(code, message, { status?, details? })` | as given. **Services throw these.** |
| `ZodError` | `validation_failed`, at most 20 issues |
| Nest `HttpException` | its body's `error` if that is a known code (M03 guards), otherwise by status. 4xx messages are kept; 5xx messages are replaced |
| body-parser errors | `bad_request` ("not valid JSON"), `payload_too_large` |
| node-postgres errors (the safety net; services should translate known cases themselves) | `23505` → `conflict`; `23503` → `not_found`; `42501` → `forbidden`; `23514`/`23502`/`22xxx` → `validation_failed`; `40001`/`40P01` → `conflict` (retryable); `57014`/`08xxx`/`53300`/`57P03` → `service_unavailable`; anything else → `internal_error` |
| anything else | `internal_error` |

**What gets logged.** 5xx are logged at error level with the request id, the error name and the stack. For pg
errors the log keeps the SQLSTATE and constraint name and drops the message's first line, which can quote values.
Driver `detail`/`where` fields are never logged. 4xx are not logged as errors.

All error responses get `Cache-Control: no-store` and `X-Request-Id`.

## 3. Request IDs

- **Header:** `X-Request-Id`.
- **Accepted** from the caller (the web app's proxy, a load balancer) if it matches
  `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. One value only.
- **Generated otherwise** (UUID v4). A malformed value is replaced, never echoed.
- **Where it appears:**
  - echoed on every response, success or error;
  - in every error body and GraphQL error extension;
  - in every log line, via `currentRequestId()` (AsyncLocalStorage);
  - in audit/outbox rows' `detail` as `requestId`;
  - in Temporal workflow memo/search attributes (M08), so one id follows a request into workflows and traces.
- **It is a correlation id, not a security token.** Callers can choose it, so it never grants or scopes anything.
  It is never a substitute for an idempotency key.
- **M05:** the web app's `/api/*` proxy should forward the browser's id, or create one, so the browser, Next and
  Nest logs share it.

## 4. Cursor pagination

Every list is cursor-paginated. There are no offset pages and no unbounded lists.

- **Request:** `?first=<n>&after=<cursor>` (REST); `(first: Int, after: String)` (GraphQL).
- **Page size:** default **25**, maximum **100**. Larger, zero, negative or non-integer values are refused with
  `validation_failed`, not clamped.
- **Response:** `{ items: [...], pageInfo: { hasNextPage, endCursor } }`. GraphQL uses the same field names on a
  `<Type>Page` object; full Relay connections are not used.
- **Keyset ordering:** stable, ending with a unique column (`ORDER BY created_at DESC, id DESC`). Queries fetch
  `first + 1` rows; the extra row only sets `hasNextPage` (`buildPage()`).
- **Opaque, signed and tenant-bound:**
  - The cursor is `base64url(JSON {p: position, iat}) . HMAC-SHA256`.
  - The HMAC also covers the binding `[resource, tenantId, workspaceId, filterKey]`, which is not written into the
    cursor. Reusing a cursor in another tenant, workspace, list or filter (`stableFilterKey(filters + sort)`) fails
    with `invalid_cursor`, as does editing it.
  - Cursors expire after 24 h.
  - RLS still decides which rows exist; the cursor is only a bookmark.
- **Keys:** `createCursorCodec({ keys: [current, ...previous] })` signs with the first key and verifies with any of
  them, which allows rotation. With no new environment variable, the key is
  `deriveKey(env.SESSION_ENCRYPTION_KEY, 'cursor')`: HKDF-SHA256 with its own purpose label, so it is unrelated
  to the session encryption key. A dedicated `CURSOR_SIGNING_KEY` (32+ bytes, from the secret store) is
  recommended before production. That is an integrator decision, because `env.ts` is integrator-owned.
- **No total counts** on large lists. A count is a separate, explicitly requested aggregate.

## 5. Optimistic concurrency

- **Version tokens:**
  - Mutable rows have `version int NOT NULL DEFAULT 1`, incremented on every update. Schema additions are listed
    in ROUTE-PARITY.md.
  - Draft revisions and approvals use the **draft revision id** as the token. A revision never changes; an edit is
    a new revision.
- **Reads:**
  - single resources return `ETag: "<version>"` (`formatETag`);
  - every representation includes `version`;
  - list items include `version` too.
- **Writes (PATCH/PUT/state changes on an existing resource):**
  - REST: `If-Match: "<version>"`. A proxy-weakened `W/"…"` is accepted.
  - GraphQL and command bodies: `expectedVersion` (for approvals: `draftRevisionId`). Both may be sent; they must
    agree.
- **Semantics** (`readPrecondition` / `assertCurrent` / `explainMissedUpdate`):

| Situation | Result |
|---|---|
| no precondition, or `If-Match: *` | 428 `precondition_required` (blind overwrites are what lost edits in the legacy app) |
| malformed `If-Match`, several versions, header and body disagree | 400 `bad_request` |
| row absent or outside scope | 404 `not_found` |
| version differs, precondition from `If-Match` | **412** `stale_revision`, `details.currentVersion` |
| version differs, precondition from body or GraphQL | **409** `stale_revision`, `details.currentVersion` |
| matches | the update runs; the response carries the new `version` and `ETag` |

- **SQL:** use either
  - `UPDATE … SET …, version = version + 1 WHERE tenant_id = … AND id = $1 AND version = $2 RETURNING version`,
    followed by `explainMissedUpdate()` when no row comes back; or
  - `SELECT … FOR UPDATE` + `assertCurrent()`.

  Either way, inside the same `withScope` transaction.
- **Approvals:** deciding needs the `draftRevisionId` the reviewer saw. If the draft was revised since, the old
  approval is superseded: 409 `stale_revision`, with the current revision in `details`. Editing a recipient
  expires pending approvals for the old recipient (C13).
- **Creates** take an `Idempotency-Key` header (REST) or `idempotencyKey` argument (GraphQL): 1–128 characters,
  stored per tenant and route for 24 h. A replay with the same key and body returns the first response; with a
  different body it is 409 `conflict`. Sends and other external effects additionally carry their own durable key
  in `dispatch_attempt.idempotency_key` (M08).

## 6. Rate limits

Rate limits live in Redis (the `REDIS` provider from `platform.module.ts`), never in process memory, so they hold
across API replicas.

- **Key:** `rl:<class>:<tenantId|->:<subject|ip>:<window>`. The subject comes from the session; the IP is used
  only for public and pre-session routes.
- **Algorithm:** a sliding-window counter in one Lua script (`EVAL` on ioredis; no new dependency). It is atomic,
  and sets a TTL equal to the window.
- **Classes** (defaults; configurable per deployment):

| Class | Applies to | Default |
|---|---|---|
| `public` | `@Public()` routes (catalog), per IP | 60 / min |
| `read` | GET and GraphQL queries, per subject+tenant | 600 / min |
| `write` | other mutations, per subject+tenant | 120 / min |
| `send` | commands that lead to an external effect (outreach, test email, approvals that release sends), per subject+tenant | 30 / min, plus a per-tenant hourly cap. Per-contact daily caps, quiet hours and consent are enforced again at dispatch (M08) |
| `auth` | M03 sign-in/step-up routes | owned by M03 |

- **GraphQL cost:** each operation costs `1 + ⌈fields/50⌉` units in the `read` or `write` class, using the
  field count computed by `queryLimitsRule`.
- **Headers on every limited response:**
  - `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds);
  - on 429, also `Retry-After` and `details.retryAfterSeconds` (the filter sets `Retry-After`).
- **When Redis is unavailable:**
  - `send` and `write` fail closed: 503 `service_unavailable`;
  - `read` and `public` fail open, with an error log line;
  - nothing silently stops limiting sends.

## 7. Honest delivery states

Every API field about an outbound message, post or report is called `deliveryState`, with exactly these values.
It is derived from the facts, never stored as a free-form status:

| `deliveryState` | Meaning | Derived from |
|---|---|---|
| `queued` | Authorized and waiting; **nothing has been submitted to a provider** | approved `approval`, no `dispatch_attempt` |
| `accepted` | The provider accepted it (we hold its message id); not yet delivered | latest `dispatch_receipt.outcome = 'accepted'` |
| `delivered` | A signature-verified receipt says delivered | receipt `delivered` with `signature_verified` |
| `failed` | The provider or our dispatcher reports failure | receipt `failed`, or a terminal dispatch error |
| `unknown` | Submitted, but the outcome is not known (timeout after submission, no receipt by the deadline). Reconcile; **do not blindly retry** | `dispatch_attempt` without a conclusive receipt; legacy history |

- **Never "sent":** that word is not an API state.
- **HTTP status:** commands that create an intent return **202 Accepted** with `deliveryState: 'queued'`. The UI
  says "Queued", never "Sent" (F07).
- **Refusals are errors, not states:** `outbound_disabled`, or `policy_blocked` with the reason. Nothing is
  recorded as sent.
- **Phone calls** are human-reported activities (`activity.kind = 'call-logged'`), not deliveries.
- **Legacy message history** (`message_evidence`) is shown as `unknown` with `verification: 'legacy-unverified'`,
  or as `simulated` in the demo tenant. It is never `delivered`.
- **Precedence** when several receipts exist: delivered > failed > accepted > unknown. Out-of-order callbacks
  converge.
- **Pipeline stages and outreach counters** move only on facts (a delivered receipt or a human-entered stage),
  never because an approval button was clicked (C11).

## 8. GraphQL rules

- **Same services and authorization as REST.** Resolvers call the same service methods. The M03 global
  `SessionGuard`/`StepUpGuard` must see the request, so the GraphQL module needs
  `context: ({ req, res }) => ({ req, res })` (the guards read `getArgs()[2].req`). `@RequireStepUp` works on
  resolvers the same way.
- **Per-request DataLoaders, scoped to the session's tenant:**
  - created in the GraphQL `context` factory from `req.session` (subject, tenantId, workspaceId);
  - never module singletons;
  - their cache keys include the tenant;
  - each batch runs one `withScope` transaction, so a batched `WHERE id = ANY($1)` is still filtered by RLS, and
    ids from another tenant come back as `null`/`not_found`;
  - a loader must not be reused after the session's tenant changes.

  The loader is a ~40-line in-repo helper (`common/` in a follow-up) instead of the `dataloader` package, so no
  new dependency is needed.
- **Limits:** `validationRules: [queryLimitsRule({ maxDepth: 8, maxFields: 250 })]` (`common/graphql.ts`). It
  counts aliases and every fragment spread, and runs before any resolver. List fields take `first` with the same
  maximum of 100.
- **No batching bypass:**
  - HTTP batching stays off (Apollo's default `allowBatchedHttpRequests: false`; a batched request is a 400, tested);
  - aliases count toward the field limit;
  - every resolver path goes through the same guard and service;
  - Apollo's `csrfPrevention` stays on (default).
- **Production:** `introspection: false` (already in `app.module.ts`), no playground, and Apollo's
  `ApolloServerPluginDisableSuggestions` plugin, so "Did you mean …" hints do not reveal the schema.
- **Errors:** `includeStacktraceInErrorResponses: false` and `formatError: formatGraphqlError`. Our codes pass
  through; Apollo's parse/validation codes are translated; everything else becomes `internal_error`.
- **Mutations:** input objects validated by the same zod schema as REST. Updates take `expectedVersion`; creates
  take `idempotencyKey`. Mutations return the updated object, including `version`.
- **Schema versioning:** one evolving schema, changed only additively:
  - removals and type changes go through `@deprecated(reason:)` for at least one release;
  - the generated `apps/api/generated/schema.graphql` is committed;
  - a check compares it with the previous committed schema using graphql-js `findBreakingChanges` /
    `findDangerousChanges` (built in, verified present), and fails on unreviewed breaking changes.
- **Subscriptions** are not used. Realtime is Socket.IO (M07).

## 9. REST, OpenAPI and typed clients

**REST shape:**
- JSON only;
- plural nouns (`/api/contacts/:id`), with sub-resources for owned children;
- verbs only for state transitions that are not field edits (`/decision`, `/end`, `/archive`);
- dates in ISO 8601 UTC;
- money as integer cents plus a currency;
- ids are UUIDs (legacy ids appear only as `legacyId` where the import kept them).
- No version prefix in paths, matching M03's `/api/auth/*`. The contract version is OpenAPI `info.version`, and it
  changes additively under the same deprecation rule as GraphQL.

**Contracts are zod-first, with no new dependency:**
- Request and response schemas live in `@agentcity/contracts` (zod 4, browser-safe). Services and controllers
  parse with them.
- DTO classes carry `@ApiProperty`/`@Field` only to describe the same shapes to the two generators, as
  `health.dto.ts` already does.

**OpenAPI:** generated by `@nestjs/swagger` (already a dependency) into `apps/api/generated/openapi.json` via
`pnpm --filter @agentcity/api contracts`.
- Every route documents its error responses with a shared `ErrorBody` schema, `ETag`/`If-Match`/`Idempotency-Key`
  headers, and pagination parameters.
- zod 4's built-in `z.toJSONSchema()` (verified present) can generate component schemas from the contract schemas,
  so the document cannot drift from validation.

**GraphQL schema:** code-first, written to `apps/api/generated/schema.graphql` (already configured).

**Typed clients** can be done without a new dependency:
- **REST:**
  - `@agentcity/contracts` exports a route table, `{ method, path, input, output }` per operation, typed by
    `z.infer`;
  - a ~60-line `createApiClient(fetch)` builds typed calls from it (adding `X-Request-Id`, `If-Match`,
    `Idempotency-Key` and the M03 device proof);
  - a contract test fails if a route in the table is missing from `openapi.json`, or vice versa.

  This compiles in apps/web and apps/worker with the existing toolchain.
- **GraphQL:**
  - operations live in `.graphql` files in apps/web;
  - a small in-repo script (`scripts/graphql-types.mjs`) uses graphql-js (`buildSchema`, `TypeInfo`,
    `visitWithTypeInfo`, already installed) to emit result and variable types per operation;
  - CI runs it and `tsc`.

**If the integrator prefers off-the-shelf generators,** these are the exact packages to approve (dev
dependencies only; pin versions at approval time from the registry, since this workstream adds none):
- `openapi-typescript`, for REST types from `openapi.json`;
- `@graphql-codegen/cli` with `@graphql-codegen/client-preset`, for typed GraphQL documents;
- `dataloader`, if the in-repo loader is not wanted.

## 10. Wiring (integrator)

Not wired by this workstream; `main.ts` and `app.module.ts` are integrator-owned. The exact changes:

```ts
// main.ts, right after NestFactory.create(...), before cookieParser:
import { expressErrorHandler, requestIdMiddleware, StructuredErrorFilter } from './common/index.js';
app.use(requestIdMiddleware());
app.useGlobalFilters(new StructuredErrorFilter());
// … existing setup (cookieParser, trust proxy, Swagger) …
// after the app is initialised (app.init() / before listen), for errors raised outside Nest's pipeline:
app.use(expressErrorHandler());
```

```ts
// app.module.ts, GraphQLModule.forRoot options (add to the existing ones):
import { ApolloServerPluginDisableSuggestions } from '@apollo/server/plugin/disableSuggestions';
import { formatGraphqlError, queryLimitsRule } from './common/index.js';
context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }), // M03 guards read req
validationRules: [queryLimitsRule()],
formatError: formatGraphqlError,
includeStacktraceInErrorResponses: false,
plugins: env.NODE_ENV === 'production' ? [ApolloServerPluginDisableSuggestions()] : [],
```

```ts
// A provider for the cursor codec (e.g. in PlatformModule or a CommonModule):
{ provide: CURSOR_CODEC, inject: [API_ENV],
  useFactory: (env: ApiEnv) => createCursorCodec({ keys: [deriveKey(env.SESSION_ENCRYPTION_KEY, 'cursor')] }) }
```

**Environment:** no new variable is required; the key is derived from `SESSION_ENCRYPTION_KEY`. Optional and
recommended before production: `CURSOR_SIGNING_KEY` (≥ 32 bytes), with `CURSOR_SIGNING_KEY_PREVIOUS` for rotation.

**Express:** keep the legacy security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`,
`X-Frame-Options: DENY`) as a small middleware in `main.ts`, and keep a JSON body limit (legacy: 200 kB) through
`app.useBodyParser('json', { limit: '200kb' })`.
