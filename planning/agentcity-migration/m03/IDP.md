# M03 identity provider: Keycloak capabilities, configuration and verification

Keycloak workstream report for M03. It covers what Keycloak 26.8.1 really provides for each M03 requirement, how
the local realms are configured, the exact claims the API must expect, what was verified (and how), and what is
still a release blocker.

Contract: `m03/DESIGN.md`. Evidence: `m03/evidence/idp-verification.json`, written by
`infra/keycloak/verify/verify-idp.mjs`.

## 1. Capability summary

| M03 requirement | What Keycloak 26.8.1 provides | How it is configured here | Verified |
|---|---|---|---|
| OIDC code flow, confidential BFF client, PKCE | Built in | `agentcity-bff`: confidential, standard flow only, PKCE S256 required | Yes |
| Agency SSO | Built in: OIDC identity brokering | Realm `agency-idp` (stand-in IdP) brokered as `agency-sso` | Yes, end to end |
| Passkeys | Built in: WebAuthn passwordless (`webauthn-authenticator-passwordless`), resident keys, user verification | Level-1 and level-2 steps of the browser flow | Yes, Chrome virtual authenticator (CTAP2, internal, resident key, UV) |
| Passwordless email sign-in codes | **Not built in.** Keycloak only has verification/action *links* (verify email, execute actions, reset credentials) and TOTP (`auth-otp-form`). None of them is an email sign-in code. | First-party authenticator `agentcity-email-code` (other workstream). Added to the flow by `infra/keycloak/seed/email-code-step.mjs` once installed | **No: provider not installed. Release blocker** (section 9) |
| Step-up | Built in: levels of authentication (`conditional-level-of-authentication`, feature STEP_UP_AUTHENTICATION), `acr` claim, `acr.loa.map` | acr `1` = email code or SSO (or a passkey used for basic sign-in), acr `2` = passkey | Yes |
| Re-authentication | Built in: `prompt=login`, `max_age` | Level 2 has max age 0, so a passkey is asked every time `acr_values=2` is requested | Yes |
| Session revocation | Built in: per-user and realm-wide session logout (admin API), refresh-token rotation, back-channel logout to clients | `backchannel.logout.url` → API; rotation with no reuse | Yes (token delivery to a stand-in listener; the API endpoint itself was not running) |
| Device revocation | Not a Keycloak concept beyond sessions and credentials | Device binding is the API's (DESIGN.md "Device binding"); Keycloak side: remove a passkey, end sessions | Passkey removal and session end: yes |
| Logout | Built in: RP-initiated logout (`id_token_hint`, `post_logout_redirect_uri`) and back-channel logout | Post-logout redirect `http://localhost:3000/signed-out` | Yes |
| Brute-force protection | Built in | On: 5 failures, 60 s increments, max 15 min, temporary | Yes |
| No passwords | Realm feature choice | No password step in any flow, password/OTP required actions disabled, direct grant/reset/registration bound to a deny flow | Yes (client misuse checks; flows inspected) |

## 2. Files and local topology

| File | Purpose |
|---|---|
| `infra/keycloak/agentcity-realm.json` | Realm `agentcity`: client, flows, claims, IdP `agency-sso`, SMTP, lifetimes |
| `infra/keycloak/agency-idp-realm.json` | Realm `agency-idp`: the stand-in agency IdP and its client `agentcity-broker` |
| `infra/compose.yaml` (`keycloak` service) | Mounts both realm files; `extra_hosts: host.docker.internal:host-gateway` for back-channel logout to the API |
| `infra/keycloak/seed/seed-dev-users.mjs` | `pnpm keycloak:seed`: development users (refuses production / non-local) |
| `infra/keycloak/seed/email-code-step.mjs` | Adds the `agentcity-email-code` step when its provider is installed (idempotent) |
| `infra/keycloak/seed/kc-admin.mjs` | Admin REST helper with the local-only guards |
| `infra/keycloak/verify/verify-idp.mjs`, `lib.mjs` | Browser verification (Playwright + Chromium) → evidence JSON |

- **Persistence:** Keycloak runs `start-dev` with its built-in database inside the container. Realms are imported
  at start only when they do not exist. Recreating the container (`docker compose … up -d --force-recreate --wait
  keycloak`) re-imports both realms and drops users, sessions and passkeys. Run `pnpm keycloak:seed` afterwards.
- **Hostnames (browser vs container):** browsers reach Keycloak at `http://localhost:58080`; inside the container it
  is `http://localhost:8080`. Both realms set the realm attribute `frontendUrl = http://localhost:58080`, so every
  token's `iss` is `http://localhost:58080/realms/<realm>` whichever address served the request. The broker uses
  the browser address for the agency authorization and logout URLs, and the container address for its own
  back-channel calls (token, JWKS, userinfo). Issuer validation still applies: the broker compares the agency ID
  token's `iss` with the configured `issuer` (`sso-issuer-validation`).

## 3. Realm `agentcity`

### Client `agentcity-bff`

- Confidential, `client-secret` (`local-dev-only-oidc-bff-secret`), standard flow only.
- PKCE: `code_challenge_method=S256` required (missing or `plain` is refused).
- Redirect: `http://localhost:3000/api/auth/callback` (exact, no wildcard).
- Post-logout redirect: `http://localhost:3000/signed-out`.
- Back-channel logout: `http://host.docker.internal:4000/api/auth/backchannel-logout`, session required.
- No web origins, no implicit flow, no direct grants, no service account, no consent, `fullScopeAllowed=false`
  (no role claims).
- Default client scopes: `basic`, `acr`, `email`, `profile`. `offline_access` is not assigned (configuration only;
  not separately tested).
- Mappers on the client: `amr` (AMR mapper), `idp` (user-session note `identity_provider`), and an audience mapper
  that puts `agentcity-bff` into the access token `aud`.
- The old public client `agentcity-web` is removed: nothing in the repository uses it any more (the BFF replaced
  it). `m01/ARCHITECTURE.md` still mentions it (not owned here; see section 10).

### Lifetimes

They match the API's session policy (`SESSION_IDLE_MINUTES` 720, `SESSION_ABSOLUTE_HOURS` 168), so periodic
revalidation with the refresh token keeps working for as long as an API session may live.

| Setting | Value | Note |
|---|---|---|
| Access token / ID token | 300 s | Observed `expires_in: 300` |
| Authorization code | 60 s | Single use; a replay also revokes the tokens issued for it |
| Login form | 900 s | Time to finish a sign-in page |
| User-initiated action links (verify email, link IdP) | 300 s | |
| Admin-issued action links (passkey enrolment) | 43200 s default | The procedures and scripts pass `lifespan=900` |
| SSO session idle / max | 43200 s / 604800 s | 12 h / 7 days |
| Refresh token | Bound to session idle (observed `refresh_expires_in: 43200`) | Rotated on every use; reuse refused |
| Level 1 max age | 43200 s | After that, silent SSO yields acr `0` (see 5.2) |
| Level 2 max age | 0 | A passkey every time acr 2 is requested |
| `amr` entry max age | 43200 s | Methods stay in `amr` for silent sign-ins within 12 h |

### Other realm settings

- **Email:** `verifyEmail` on, `registrationEmailAsUsername` (username = email), duplicate emails refused,
  `editUsernameAllowed` off.
- **No self-service:** registration, password reset and remember-me are off.
- **SMTP:** host `mail`, port 1025, from `noreply@agentcity.local`, no auth or TLS (Mailpit sink).
- **Events:** login and admin events are on, kept 7 days. The `email` event listener is on, so a person gets an
  "Update credential" email when a passkey is added or removed. Failed sign-ins do not send mail (checked).
- **Brute force:** on, `failureFactor` 5, wait increment 60 s, max wait 900 s, quick-login check 1 s, temporary
  lockout (not permanent).
- **Required actions:**
  - Enabled: verify email, update/verify profile, passkey registration (`webauthn-register-passwordless`, max
    auth age 300 s), delete credential (max auth age 300 s), IdP link, locale.
  - Disabled: update password, OTP, second-factor WebAuthn, recovery codes, terms, update email, delete account.
- **Passkey policy:** RP name AgentCity, RP id = host (`localhost`), ES256/RS256, attestation none, resident key
  required, user verification required, same authenticator cannot register twice. Passkey autofill on the
  username page is off, so the flow below is the only way a passkey signs in (this keeps acr/amr accounting
  exact).

## 4. Sign-in flows

```
agentcity-browser (browser flow)
├─ Cookie                                            ALTERNATIVE  existing Keycloak session
├─ Identity Provider Redirector                      ALTERNATIVE  only with kc_idp_hint=agency-sso
└─ agentcity-browser-forms                           ALTERNATIVE
   ├─ Username Form (email; shows "Sign in with Agency SSO")         REQUIRED
   ├─ agentcity-loa1                                 CONDITIONAL  Condition LoA 1, max age 43200
   │  ├─ WebAuthn Passwordless  amr=passkey          ALTERNATIVE
   │  └─ agentcity-email-code   amr=email-code       ALTERNATIVE  (added by email-code-step.mjs)
   └─ agentcity-loa2                                 CONDITIONAL  Condition LoA 2, max age 0
      ├─ agentcity-loa2-passkey      [has a passkey AND no passkey used yet] → WebAuthn Passwordless (amr=passkey)
      ├─ agentcity-loa2-passkey-used [a passkey was used in this authentication] → Allow
      └─ agentcity-loa2-no-passkey   [no passkey used] → Deny "A passkey is required for this action…"

agentcity-post-broker-login (runs after every agency-sso sign-in)
├─ Allow                                             REQUIRED     amr=sso
├─ agentcity-post-broker-loa1   [LoA 1, max age 43200] → Allow (records level 1)
└─ agentcity-post-broker-step-up [LoA 2] → Deny "Agency SSO cannot confirm this action. Sign in with your passkey instead."

agentcity-first-broker-login (first agency-sso sign-in of an identity)
├─ Review Profile (only if attributes are missing)
└─ create or link
   ├─ Create User If Unique                          ALTERNATIVE  new account; email unverified → verify-email mail
   └─ existing account                               ALTERNATIVE
      ├─ Confirm link existing account (page)        REQUIRED
      └─ Verify existing account by Email            REQUIRED     link sent to the existing account's address

agentcity-deny: bound to direct grant, reset credentials, registration and docker flows
```

Why the flow is shaped like this (each point found by testing on 26.8.1):

- **Identification alone never grants anything.** A person without a passkey (and, until the provider exists,
  without email codes) gets "Invalid username or password" after the username page. They are not offered passkey
  registration: the passkey is an ALTERNATIVE and registration is never "user setup" in a REQUIRED step
  (`passkeyless-no-enrolment`).
- **Level 2 never registers a passkey either.** Someone without one is denied, instead of being allowed to enrol a
  new passkey to reach acr 2.
- **A level must always execute something.** When every subflow of a level-of-authentication subflow is skipped,
  Keycloak fails the whole sign-in. Example: a fresh sign-in with `acr_values=2` where the passkey was already used
  at level 1. Hence the explicit `agentcity-loa2-passkey-used → Allow` branch, which gives one passkey ceremony
  for a fresh acr-2 sign-in (`fresh-acr2-single-passkey`).
- **Keycloak runs the lowest level present when no acr is requested.** That is why the post-broker flow also has
  a level-1 subflow. Without it, the level-2 deny ran on every plain SSO sign-in.
- **Brokered sign-ins never yield acr 2.** Without the post-broker deny, a brokered (re-)authentication requested
  with `acr_values=2`, or even with an essential `acr` claim, returned a code with **acr `1`**. `acr_values` is
  non-essential, and Keycloak does not enforce the level on the broker path. With the deny, the request fails
  (`sso-cannot-step-up`). The API must still check `acr` itself (5.2).

## 5. What the API should expect

### 5.1 ID token claims (verified from real code exchanges)

| Claim | Value | Notes |
|---|---|---|
| `iss` | `http://localhost:58080/realms/agentcity` | = `OIDC_ISSUER` |
| `aud` | `"agentcity-bff"` | A string (single audience); accept string or array |
| `azp` | `"agentcity-bff"` | |
| `sub` | Keycloak user id (UUID) | Person id `subject = "kc:" + sub` |
| `email`, `email_verified` | string, boolean | `email_verified` is `true` for every user who can finish sign-in (verify email is required) |
| `sid` | Keycloak session id | Same value as the logout token's `sid`; unchanged by step-up in the same browser |
| `auth_time` | seconds | Time of the last interactive authentication; updated by step-up |
| `acr` | `"1"` or `"2"` (strings); `"0"` possible, see below | From the levels of authentication (`acr.loa.map {"1":1,"2":2}`) |
| `amr` | JSON array of strings: `"passkey"`, `"email-code"`, `"sso"` | Claim name `amr`; values come from each execution's "authentication reference" config |
| `idp` | `"agency-sso"` | Only when the Keycloak session came through agency SSO; absent otherwise |
| `nonce` | as sent | |
| also | `exp`, `iat`, `jti`, `typ` (`"ID"`), `at_hash`, `preferred_username` (= email), `name`, `given_name`, `family_name` | |

Signature: RS256, key from the realm JWKS (`/protocol/openid-connect/certs`), `kid` in the header.

**`amr` mapping to `AuthMethod`:**

| `amr` value | `AuthMethod` |
|---|---|
| `passkey` | `'passkey'` |
| `email-code` | `'email-code'` |
| `sso` | `'sso'` |

- Ignore unknown values.
- **De-duplicate:** after step-up `amr` can be `["passkey","passkey"]` (two executions with the same reference).
- `amr` lists methods used in this Keycloak session within the last 12 h, not only in this request. A silent
  sign-in after a step-up still carries `passkey`. Use `acr` and `auth_time` for freshness, never `amr` alone.

### 5.2 Rules for the API (auth workstream)

1. **Normal sign-in:** send `acr_values=1`.
   - Without it, a silent SSO sign-in more than 12 h after the last interactive one returns `acr: "0"` with the old
     `auth_time` (`loa1-expiry`, measured with the max age shortened to 5 s).
   - With `acr_values=1`, Keycloak asks for a new sign-in instead.
   - Reject any ID token whose `acr` is not `"1"` or `"2"`.
2. **Step-up:** send `acr_values=2`, `prompt=login`, `max_age=0`. Accept the result only if all of these hold:
   - `acr === "2"`;
   - `amr` includes `"passkey"`;
   - `auth_time` ≥ the time the login attempt started (allow small skew);
   - `sub` equals the session's subject. On re-authentication the person can type another email; Keycloak then
     signs in that account.

   Keycloak treats `acr_values` as a preference. The flows here refuse level 2 on the broker path, but the API's
   check is the real guarantee.
3. **Refresh tokens:**
   - They rotate. Store the new refresh token after every refresh, and refresh at most once at a time per session.
     Reusing an old one fails with `invalid_grant` "Maximum allowed refresh token reuse exceeded".
   - Replaying an authorization code fails and revokes that client session: its refresh then fails with "Session
     doesn't have required client".
   - Refresh errors to treat as "revoke the API session": `invalid_grant` with "User disabled", "Session not
     active", or the two above.
4. **Back-channel logout:** `POST /api/auth/backchannel-logout`, `application/x-www-form-urlencoded`, field
   `logout_token`. It is a JWT with header `typ: "logout+jwt"`, RS256, signed with the realm key. Claims:
   - `iss`, `aud: "agentcity-bff"`, `sub`, `sid`, `iat`, `exp` (+120 s), `jti`, `typ: "Logout"`;
   - `events: { "http://schemas.openid.net/event/backchannel-logout": {}, "revoke_offline_access": true }`;
   - no `nonce`.

   Revoke by `sid` (and by `sub` when `sid` is absent). Delivery was verified for an admin "log out user"; the
   Keycloak log also shows delivery attempts on RP logout.
   - The configured URL is `http://host.docker.internal:4000/...`: in local development the API must listen on an
     address the container can reach (the docker bridge, i.e. not only 127.0.0.1).
   - Verified with a stand-in listener (`backchannel-logout-token`), not against the API.
5. **Logout:** RP-initiated logout at `end_session_endpoint` with `id_token_hint` and
   `post_logout_redirect_uri=http://localhost:3000/signed-out` (plus `state` if wanted). Verified: the session ends,
   its refresh token stops working, the next authorize shows the sign-in page.
6. **Disabled people:** disabling a user in Keycloak does not by itself end their Keycloak sessions. It makes
   refresh fail ("User disabled") and blocks silent and fresh sign-in. The break-glass procedure therefore always
   pairs "disable" with "log out user", which also triggers back-channel logout to the API.

## 6. Passkeys

- **Sign-in:**
  1. The person enters their email.
  2. "Sign in with Passkey" runs a WebAuthn assertion that requires user verification.
  3. The result is acr `1`, `amr ["passkey"]`, or acr `2` when acr 2 was requested.
- **Adding a passkey:**
  - **Operator-issued enrolment email (verified):**
    `PUT /admin/realms/agentcity/users/{id}/execute-actions-email?lifespan=900` with body
    `["webauthn-register-passwordless"]`. The link is mailed through Mailpit and lets the person register a passkey
    without signing in. This is how development users get a passkey, and how a person who lost their device
    regains access (BREAK-GLASS.md).
  - **Application-initiated action (verified for an SSO user):** after a fresh sign-in, send the person to the
    authorize endpoint with `kc_action=webauthn-register-passwordless`. The callback carries
    `kc_action_status=success`. The person can step up right away.
  - **A person who already has a passkey cannot add another from an acr-1 session (SSO or email code).**
    Keycloak 26.8 shows "Strong authentication required to continue" and asks for the existing passkey first
    (`second-passkey-needs-passkey`). Someone who controls only the mailbox or the agency account therefore cannot
    plant their own passkey and reach acr 2.
  - The first passkey is necessarily bootstrapped by the basic method (email code or SSO) or by an operator.
- **Removing a passkey:** the person, via `kc_action=delete_credential` (needs a sign-in within 300 s), or an
  operator, via the admin API (verified in `break-glass-lost-passkey-recovery`). Both send an "Update credential"
  email.

## 7. Agency SSO (`agency-sso` → realm `agency-idp`)

- **Broker settings:** OIDC, confidential (`agentcity-broker` / `local-dev-only-agency-broker-secret`,
  `client_secret_post`), PKCE S256, signature validated via JWKS, `issuer` checked, scopes `openid email profile`,
  sync mode IMPORT.
- **Entry points:** the "Sign in with Agency SSO" button on the username page, or `kc_idp_hint=agency-sso`
  (DESIGN's `idpHint`).
- **Result:** acr `1`, `amr ["sso"]`, `idp "agency-sso"`.
- **First sign-in of a new person:**
  - The account is created from the agency profile.
  - `trustEmail` is **off**: Keycloak does not take the agency's word that the address belongs to this person.
    The person must click the verification email before a code is issued (`sso-first-login-new-account`).
- **Same email as an existing account:** Keycloak never links silently. The person sees "Account already exists",
  must choose "Add to existing account", and then click a link sent to that existing account's address. Only then
  is the agency identity linked and a code issued. Before that there are no links and no code
  (`sso-no-silent-link`).
  - Keeping `trustEmail` off matters: with it on, Keycloak's email verification step treats a matching email as
    already verified and links automatically.
- **Pre-linked development user:** `sso.user@agency.example` is created in both realms by the seed, and an
  administrator links the two (explicit link by agency `sub`, not by email), so tests know its `kc:` subject in
  advance.
- **Logout propagation:** ending the agency session (admin logout in `agency-idp`) sends a back-channel logout to
  `agentcity`, which ends the brokered session and its refresh token (`agency-backchannel-logout`). The broker is also configured to send RP logout
  on to the agency's end-session endpoint (configured, not verified).
- **Step-up:** SSO never satisfies level 2.
  - People who sign in with SSO add a passkey (section 6) and step up with it (`sso-user-adds-passkey`).
  - Without a passkey, step-up is denied with an explanation.
- **Issuer validation:** with the configured issuer changed to a wrong value, the broker refuses the agency token
  ("Unexpected error when authenticating with identity provider"). Restored, it works again.

## 8. Verification

Command, with the stack up, after `pnpm keycloak:seed`, and with nothing listening on localhost:3000:

```
node --env-file=infra/local-dev.env infra/keycloak/verify/verify-idp.mjs
```

What the script does:

- It uses the real `agentcity-bff` client: PKCE, state and nonce, the code exchange with the client secret, and ID
  token signature, `iss`, `aud`, `azp`, `nonce` and `exp` checks against the JWKS.
- Callbacks to `localhost:3000` are captured from Keycloak's redirect responses (Playwright cannot intercept
  redirect targets), so no app needs to run.
- Passkeys use the Chrome DevTools virtual authenticator (`WebAuthn.addVirtualAuthenticator`: ctap2, internal,
  resident key, user verification).
- Emails are read from Mailpit's API.
- Temporary users are deleted afterwards. Temporary changes are restored in `finally`: issuer, client secret,
  IdP enabled flag, back-channel URL, level max ages.
- The last check ends every session in the realm.

**Last run** (fresh realm import, then seed, then verify): **32 of 34 checks passed.** The two failures are
`email-code-provider` and `email-code-sign-in`, because the provider is not installed. The full results are in
`evidence/idp-verification.json`.

| Area | Checks |
|---|---|
| Seed | `seed-present`, `seed-guards` (refuses `NODE_ENV=production` and a non-local host, exit 2) |
| Client | `discovery`, `client-config`, `client-rejects-misuse` (direct grant, implicit, no/plain PKCE, foreign redirect), `code-exchange-guards` (wrong secret, wrong verifier, replay), `refresh-rotation` |
| Passkeys | `passkeyless-no-enrolment`, `passkey-enrolment`, `passkey-sign-in`, `second-passkey-needs-passkey` |
| Step-up | `step-up-forces-passkey`, `step-up-acr-values-only`, `silent-sso-is-acr1`, `fresh-acr2-single-passkey`, `loa1-expiry`, `sso-cannot-step-up`, `sso-user-adds-passkey` |
| SSO | `sso-sign-in`, `sso-hint`, `sso-first-login-new-account`, `sso-no-silent-link`, `sso-issuer-validation`, `agency-backchannel-logout` |
| Logout and revocation | `rp-logout`, `backchannel-logout-token`, `break-glass-disable-user`, `break-glass-logout-all` |
| Operations | `brute-force`, `break-glass-rotate-client-secret`, `break-glass-lost-passkey-recovery`, `break-glass-disable-agency-sso` |
| Email codes | `email-code-provider`, `email-code-sign-in`: **failing (not installed)** |

The admin-API mechanics of `email-code-step.mjs` were also exercised with a stand-in provider (`auth-otp-form`): the
step was added as an ALTERNATIVE after the passkey with config `default.reference.value=email-code`, a second run
reported `present`, and the stand-in was then deleted. That is not a test of email codes.

## 9. Email sign-in codes: enabling the step (integrator)

Keycloak 26.8.1 has no passwordless email-code authenticator, so the realm JSON does not reference one. The realm
imports and passkey/SSO sign-in work without it. Once the email-code workstream's jar exists:

1. Build it into `infra/keycloak/providers/`: `pnpm keycloak:providers`.
2. Restart Keycloak so it loads the provider (start-dev rebuilds on start). This also re-imports the realms:
   ```
   docker compose -f infra/compose.yaml --env-file infra/local-dev.env up -d --force-recreate --wait keycloak
   ```
3. Run `pnpm keycloak:seed`. It calls `ensureEmailCodeStep` and prints `email-code: step added in agentcity-loa1
   (ALTERNATIVE after passkey, amr "email-code")`. To run only the step, and fail if the provider is missing:
   `node --env-file=infra/local-dev.env infra/keycloak/seed/email-code-step.mjs --require`.
4. Run the verification. `email-code-provider` and `email-code-sign-in` must pass.
   - The second check is best effort: it takes the first 6–8 digit number in the newest email to the person and
     types it into the first visible input on the page.
   - Adjust it if the authenticator's form or mail differ.

Status: the email-code workstream reports its provider is finished (provider id `agentcity-email-code`, on its own
branch). Its jar is not in this worktree, so nothing here has run against it. Its guidance matches this setup: the
execution sits after the username form in a subflow (`agentcity-loa1`), it needs the execution config
`default.reference.value=email-code` with a **non-zero** `default.reference.maxAge` (the default 0 drops the value
from tokens; the script sets 43200), and the client needs the `oidc-amr-mapper` for ID and access tokens (present on
`agentcity-bff`).

What the step script sets up:

- `agentcity-email-code` as an ALTERNATIVE in `agentcity-loa1`, after the passkey. People with a passkey get the
  passkey first and can choose "Try another way"; people without one get the email code.
- Execution config `default.reference.value=email-code`, `default.reference.maxAge=43200`. That is where `amr`
  comes from, so the authenticator does not set `amr` itself. If the authenticator has its own config keys, the
  script keeps them and only adds these two.

What the authenticator must do for this to be safe (for the email-code workstream):

- Use provider id `agentcity-email-code`.
- `requiresUser() = true`. `configuredFor` true only for a verified email. `isUserSetupAllowed() = false`.
- Report a wrong or expired code with `failureChallenge(INVALID_CREDENTIALS, …)` so brute-force detection counts
  it.
- Make codes single use and short lived. Send them through the realm SMTP (Mailpit locally).

Do not add the execution to the realm JSON while the jar can be absent. Importing a flow that names a missing
provider was not tested, and runtime errors are likely. Once the build always produces the jar before Keycloak
starts, the same execution can move into `agentcity-loa1` in the JSON:

- an execution with `authenticator: "agentcity-email-code"`, `requirement: "ALTERNATIVE"`, priority 30, and an
  `authenticatorConfig` alias carrying the two reference keys;
- that change must then be re-verified.

## 10. Release blockers, known behaviour, and requests

### Release blockers

1. **Email sign-in codes are not verified.** The provider is missing.
   - Plan: the email-code workstream delivers `agentcity-email-code` (with the contract in section 9). The
     integrator follows steps 1–4 in section 9, and `email-code-*` must pass.
   - Until then, people without a passkey or agency SSO cannot sign in at all.
2. **Back-channel logout into the API is not verified end to end.** Keycloak delivery is verified against a
   stand-in listener.
   - Plan: the integrator runs the API reachable from the container (or changes `backchannel.logout.url` to the
     API's address) and checks that an admin "log out user" revokes the API session and disconnects sockets.
3. **Production realm.** Everything here is local:
   - `frontendUrl`, http, secrets in JSON, Mailpit SMTP, the stand-in agency realm, and a temporary bootstrap admin.
   - Plan: produce the production realm from this file with secrets from the secret store, a real hostname over
     HTTPS, the real agency IdP's issuer and URLs, persistent storage, and the break-glass admin set-up in
     BREAK-GLASS.md.
   - Run the same verification (with a staging hostname) before go-live.

### Known behaviour (not blockers)

- **Denials count as brute-force failures.** A person without a passkey who retries step-up quickly can be locked
  for 60 s or more ("Account is disabled, contact your administrator" while locked). The web app should tell people
  to add a passkey rather than retry.
- **Error messages.** A person without any usable method and a removed passkey both show "Invalid username or
  password"; an unknown email shows "Invalid username or email." on the sign-in page (so the page does reveal
  whether an email has an account). A temporarily locked or disabled account shows "Account is disabled".
- **`acr_values_supported` in discovery lists duplicates** (`["1","2","0","1","2"]`). This is harmless.

### Requests for files this workstream does not own

| File | Change | Owner |
|---|---|---|
| `package.json` | Add `"keycloak:verify": "node --env-file=infra/local-dev.env infra/keycloak/verify/verify-idp.mjs"` | Integrator |
| `apps/api` (auth) | Apply 5.2: `acr_values=1` on sign-in; step-up acceptance rule; refresh rotation and single-flight; de-duplicate `amr`; back-channel logout by `sid` | Auth |
| `apps/api/src/main.ts` / env | In local development the API must be reachable from the Keycloak container for back-channel logout (listen beyond 127.0.0.1, or point `backchannel.logout.url` elsewhere) | Integrator |
| `planning/agentcity-migration/m01/ARCHITECTURE.md` | Its Keycloak decision still describes the public `agentcity-web` client: now the confidential `agentcity-bff`, plus realm `agency-idp` | Integrator |
| `infra/local-dev.env` | Nothing required. The scripts read `KEYCLOAK_PORT`, `KEYCLOAK_ADMIN_*`, `OIDC_*`, `MAIL_API_URL` | – |
