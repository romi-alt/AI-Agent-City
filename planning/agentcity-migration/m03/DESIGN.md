# M03 design: identity, sessions, access

This is the contract between the M03 workstreams. The code that implements it lives in `apps/api/src/{auth,access,
realtime}`, `apps/web`, `infra/keycloak` and the identity/access migrations. Shared types are in
`apps/api/src/auth/contracts.ts`, and the revocation bus is `apps/api/src/platform/revocation-bus.ts`.

## Topology

```
browser ──https──► web (Next, :3000) ──/api/* proxy──► API (Nest, :4000) ──► PostgreSQL / Redis
   │                                                    │  OIDC client (BFF), confidential, PKCE
   └──────── redirects ─────► Keycloak (:58080) ◄───────┘  back-channel: token, JWKS, end-session
   └──── Socket.IO ws://localhost:4000/socket.io (cookie + device proof)
```

- The API is the OIDC client: a backend-for-frontend, confidential client `agentcity-bff`. Access, ID and refresh
  tokens never reach the browser. The browser holds only an httpOnly session cookie.
- The web app proxies `/api/*` to the API (Next rewrites), so the cookie is first-party to `PUBLIC_ORIGIN`. Cookies
  ignore ports, so the same `localhost` cookie also reaches the API's Socket.IO endpoint. Socket.IO's CORS allows
  only `PUBLIC_ORIGIN`, with credentials.
- People are identified by `subject = "kc:" + <Keycloak sub>`. This is the subject used by `app.enter_scope` and
  every membership table from M02.

## Keycloak (realm `agentcity`)

- **Client `agentcity-bff`:** confidential (secret `OIDC_CLIENT_SECRET`), standard flow only, PKCE S256 required.
  - Redirect: `OIDC_REDIRECT_URI`.
  - Post-logout redirect: `OIDC_POST_LOGOUT_REDIRECT_URI`.
  - Audience: `agentcity-bff`. The ID token `aud` must contain it, and `azp` must equal it.
- **Sign-in methods, with the `amr` value the API records:**
  - passkey (WebAuthn passwordless): `passkey`
  - email sign-in code, from the first-party authenticator in `infra/keycloak/email-code-authenticator`: `email-code`
  - agency SSO through identity brokering, IdP alias `agency-sso`, a second local realm `agency-idp` standing in for
    an agency's corporate IdP: `sso`
- **Exposing `amr`:** Keycloak puts the methods in a claim the realm maps into the ID token. The claim name and
  values are documented by the Keycloak workstream in `m03/IDP.md`.
- **Levels of authentication (`acr`):**
  - `1` (basic): email code or SSO.
  - `2` (strong): passkey.
  - Step-up asks for `acr_values=2`, `prompt=login`, `max_age=0`.
- **Email:** SMTP points at the local Mailpit sink (`mail:1025`). Nothing leaves the machine.
- **Development users:** created by a seed script that refuses to run when `NODE_ENV=production` or when the
  issuer is not `localhost`.

## HTTP API (all JSON; paths are on the API, and the browser reaches them via `/api/*`)

### Auth (owner: auth module)

| Method and path | Guard | Purpose |
|---|---|---|
| POST `/api/auth/login/start` `{ deviceJwk, returnTo, purpose: 'login'\|'step-up', stepUpReason?, idpHint?: 'agency-sso' }` | origin; device proof signed by `deviceJwk`; step-up also needs a session | Creates a `login_attempt` (state, nonce, PKCE verifier, device). Sets the `ac_login` cookie (state, httpOnly, SameSite=Lax, 10 min). Returns `{ authorizeUrl }` |
| GET `/api/auth/callback?code&state` | `ac_login` must match `state` | Exchanges the code with PKCE and validates the ID token (signature via JWKS, `iss`, `aud`/`azp`, `exp`/`iat`, `nonce`, `auth_time`). Upserts the person and device, creates a session (or marks step-up on the existing one), sets `ac_session`, redirects to `returnTo` (a same-origin path only) |
| GET `/api/auth/me` | session | `{ subject, email, emailVerified, amr, acr, authTime, stepUpAt, device: { id, label }, tenantId, workspaceId }` |
| POST `/api/auth/logout` | session | Revokes the session, clears the cookie, returns `{ endSessionUrl }` (RP-initiated logout with `id_token_hint`) |
| GET `/api/auth/sessions` | session | The person's sessions and devices, the current one marked |
| DELETE `/api/auth/sessions/:id` | session | Revoke one session |
| DELETE `/api/auth/devices/:id` | session + step-up `credential` | Revoke a device and all its sessions |
| POST `/api/auth/backchannel-logout` | Keycloak logout token (signed JWT) | Revokes sessions by `sid`/`sub` |

- **Every authenticated request** passes `SessionGuard`:
  - a valid `ac_session` cookie whose session is not revoked or expired (idle and absolute), and whose person and
    device are not disabled or revoked;
  - a valid device proof;
  - for non-GET requests, `Origin` equal to `PUBLIC_ORIGIN`.

  The guard attaches `req.session: SessionContext`.
- **Revalidation:** the session's refresh token is encrypted with `SESSION_ENCRYPTION_KEY`. At most every few
  minutes it is used to check the person is still active at the IdP; a failure revokes the session.
- **Global guard:** `SessionGuard` is registered as a global guard by the auth module. Routes without a session
  are marked `@Public()` (`auth/decorators.ts`). Other modules read `req.session` (`AuthenticatedRequest`) and never
  import the guard. Socket handshakes use `SESSION_RESOLVER` (`contracts.ts`), which the auth module provides.
- **`@RequireStepUp(reason)`** (credential, billing, permission) needs `stepUpAt` within `STEP_UP_MAX_AGE_SECONDS`
  and `acr >= 2`. Otherwise the response is 403 `{ error: 'step_up_required', reason }`.

### Access (owner: access module)

| Method and path | Guard | Purpose |
|---|---|---|
| GET `/api/access/memberships` | session | Tenants and workspaces the person can enter, with role (client-admin/viewer, agency-owner/staff, support) |
| POST `/api/session/tenant` `{ tenantId, workspaceId? }` | session | Switch tenant: proven by `app.enter_scope` inside a transaction, then stored on the session |
| POST `/api/invitations` `{ email, role, workspaceId? }` | session; client-admin or agency-owner of the current tenant; step-up `permission` | Creates `app.invitation` and a single-use token (hash stored, `INVITATION_TTL_HOURS`, default 48 h). Returns the link once. No email is sent |
| POST `/api/invitations/:id/token` | agency-owner; step-up `permission` | Issues a token for an invitation that already exists (e.g. from the legacy import) |
| POST `/api/invitations/accept` `{ token }` | session; `emailVerified` and email equal to the invitation's | Creates the membership via a SECURITY DEFINER function. Replayed or expired tokens: 410 |
| PUT `/api/tenants/:tenantId/members/:subject` `{ role, workspaceId? }` | client-admin or agency-owner of that tenant; step-up `permission` | Role change. Publishes `membership` revocation |
| DELETE `/api/tenants/:tenantId/members/:subject` | same | Removal. Publishes `membership` revocation |
| PUT/DELETE `/api/agency/assignments/:tenantId/:subject` | agency-owner; step-up `permission` | Staff assignment |

- **Membership writes** go through SECURITY DEFINER functions that check the actor's own membership in the
  database. The app role has no direct INSERT/UPDATE on the membership tables.

## Response shapes and error codes (as implemented)

| Endpoint | Success body |
|---|---|
| POST `/api/auth/login/start` | `{ authorizeUrl }` |
| GET `/api/auth/me` | `{ subject, email, emailVerified, amr[], acr, authTime, stepUpAt, device: { id, label }, tenantId, workspaceId }` |
| POST `/api/auth/logout` | `{ endSessionUrl }` |
| GET `/api/auth/sessions` | `{ sessions: [{ id, deviceId, amr, acr, authTime, createdAt, lastSeenAt, current }], devices: [{ id, label, createdAt, lastSeenAt, current, … }] }` |
| GET `/api/access/memberships` | `{ current, memberships: [{ tenantId, tenantName, tenantKind, agencyId, role, workspaceId, workspaces }] }` |
| POST `/api/invitations` | `{ invitationId, tenantId, role, workspaceId, expiresAt, link }` (`link` = `PUBLIC_ORIGIN/invitations/accept#token=…`, shown once, `Cache-Control: no-store`) |
| POST `/api/invitations/accept` | `{ tenantId, workspaceId, role }` |

Error codes beyond `AUTH_ERRORS`:
- **Sign-in:** `login_failed` (400), `invalid_return_to`, `invalid_device_key`, `invalid_request`, `idp_unavailable`.
- **Invitations:**
  - 410: `invitation_invalid`, `invitation_expired`, `invitation_used`
  - 403: `invitation_email_mismatch`, `email_not_verified`
  - 409: `invitation_not_pending`
- **Members:** `last_admin` (409), `not_found` (404).

Token rules from `IDP.md`:
- **Normal sign-in:** sends `acr_values=1`, and refuses levels other than `"1"`/`"2"`.
- **Step-up:** needs `acr = "2"`, `passkey` in `amr`, a fresh `auth_time` and the same `sub`.
- **SSO:** recognised from the `idp` claim (`agency-sso`).

## Device binding

- **Key:** on first use the browser creates an ECDSA P-256 key pair with WebCrypto, `extractable: false`, and keeps
  it in IndexedDB. The public JWK is sent at `login/start`; the device id is its RFC 7638 thumbprint (`jkt`).
- **Proof on every API request:** header `X-Device-Proof`, a compact JWS in the style of RFC 9449 (DPoP):
  - header `{ "typ": "device-proof+jwt", "alg": "ES256", "jwk": <public JWK> }`
  - payload `{ "htm": <METHOD>, "htu": <PUBLIC_ORIGIN + path, no query>, "iat": <seconds>, "jti": <random> }`
- **The API checks:**
  - the signature;
  - `jwk` thumbprint = the session's device `jkt`;
  - `htm`/`htu` match the request;
  - `|now − iat| ≤ DEVICE_PROOF_MAX_SKEW_SECONDS`;
  - `jti` not seen before (Redis `SET NX` with TTL).
- **Socket.IO handshakes** send the same proof in `auth.proof`, with `htm = "GET"` and
  `htu = PUBLIC_ORIGIN + "/socket.io"`.
- **Why:** a stolen cookie alone is useless, and revoking a device ends every session bound to it. This is a key
  binding, not a user-agent check.

## Revocation and realtime

- **Events:** revocations are published on the `RevocationBus`:
  - `{ kind: 'session' | 'device' | 'person' | 'membership', … }`
- **Realtime reaction:**
  - Disconnects affected sockets within a second, with reason `revoked`.
  - Re-checks every socket's session at least every 60 s as a backstop.
  - A socket joins only the room of its session's current tenant (`tenant:<id>`); a tenant switch or a lost
    membership moves or ends it.
- **Workers:** Temporal activities acting for a person enter scope as that person (`withScope`) when they run, so
  a removed member's queued work fails its membership check instead of running on stale permission.

## What M03 does not do

- **Legacy sign-in:** the legacy app keeps its own sign-in until cutover (M10). Its endpoints are retired only
  after the new access, invitations and break-glass procedure are tested (MIGRATION-STATUS records the state).
- **Development shortcuts:** there is no development login shortcut. Test users exist only in the local realm,
  created by a seed script that refuses production.

## File ownership during parallel work

| Area | Owner |
|---|---|
| `infra/keycloak/**` except the authenticator, `infra/keycloak/seed/**`, `m03/IDP.md` | Keycloak |
| `infra/keycloak/email-code-authenticator/**`, `scripts/build-keycloak-providers.mjs` | Email-code authenticator |
| `apps/api/src/auth/**` (except `contracts.ts`), `packages/db/migrations/1793145600000_identity.sql`, `packages/db/test/identity.test.ts`, `apps/api/test/auth*` | Auth |
| `apps/api/src/access/**`, `packages/db/migrations/1793145600001_access.sql`, `packages/db/test/access.test.ts`, `apps/api/test/access*` | Access |
| `apps/api/src/realtime/**`, `apps/api/test/realtime*` | Realtime |
| `apps/web/**` | Web |
| `contracts.ts`, `platform/*`, `app.module.ts`, `main.ts`, `env.ts`, compose, env file, package manifests, lockfile | Integrator (ask; do not edit) |
