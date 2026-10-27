# Email sign-in code authenticator (`agentcity-email-code`)

A small first-party Keycloak extension for passwordless sign-in with a one-time code sent by email. Keycloak
26.8.1 has nothing built in for this: its "OTP" is TOTP from an authenticator app, and its email features are
verification and reset links, and codes that verify an email address. Those meet other requirements.

- Provider id: **`agentcity-email-code`** (fixed; the realm references it).
- Built for Keycloak **26.8.1**. Provider SPIs are not a stable API, so **rebuild and re-verify it for every
  Keycloak upgrade** (see "Maintenance").
- Code: `src/main/java/city/agent/keycloak/emailcode/`. Templates and messages: `src/main/resources/theme-resources/`.
- Tests: `src/test/java/...` (JUnit) and `verify/verify-email-code.mjs` (live Keycloak, Mailpit and a browser).

## What a person sees

1. They enter their username or email (Keycloak's Username Form, the step before this one).
2. The page says "We sent a 6-digit code to j\*\*\*@example.com. It works for 5 minutes." The address is masked.
3. They type the code from the email and select **Sign in**. **Send a new code** sends a fresh code after a short
   wait. Errors say what to do next: wrong code (with tries left), expired code, too many tries, wait before resending.

The email (text and HTML) contains the code, how long it works, and "If you did not try to sign in, you can ignore
this email". The code is never in the subject line.

## Security design

| Concern | What the authenticator does |
|---|---|
| Who can get a code | Only a user already identified earlier in the flow (`requiresUser()`), who is enabled, not locked by brute-force protection, and has an email address marked **verified**. |
| Code generation | `SecureRandom`, uniform over all values of the configured length (default 6 digits, minimum 6, leading zeros kept, no modulo bias). |
| Storage | Never stores the code. Stores, in the authentication session's server-side auth notes (never sent to the browser): an HMAC-SHA256 of the code, a random 16-byte salt, the HMAC key id, the expiry, the attempt counter, the time of the last send and the number of sends. The HMAC key is the realm's own active HS512 secret key (Keycloak key provider `hmac-generated-hs512`), which is not stored with the hash, so a copy of the auth notes alone does not allow offline guessing. The hash also covers the authentication session id and tab id, so it is only valid in the session that requested it. The key id is stored so a key rotation does not break a code already sent; an unknown key fails closed. |
| Comparison | Constant time (XOR over every byte; a unit test checks that a first-byte and a last-byte mismatch take about the same time; an early-exit implementation fails it). Malformed input and the decoy case do the same HMAC work as a real check. |
| Expiry | Default 5 minutes. An expired code is deleted from the session and cannot be used again. |
| Attempts | Default 5 wrong entries per code. Then the code is deleted; even the right code is refused until a new one is sent. |
| Resend | Default cooldown 30 seconds. A new code replaces the old one (the old one stops working) and resets the attempt counter. At most 5 codes per sign-in attempt (`maxSends`), so total guesses per sign-in attempt are bounded (5 × 5). Reloading the page does not send another code. |
| Brute-force protection | Every wrong code is recorded on the user with Keycloak's `BruteForceProtector` (when the realm has brute-force detection on). Keycloak only counts its own `password`/`otp`/recovery-code categories automatically, so the authenticator records the failure itself, as a primary-factor failure. While a user is locked, no code is sent or checked, and the page shows a generic message ("Sign-in with a code is not possible right now…"), like Keycloak's own lockout messages. A successful email-code sign-in does not reset the failure count (Keycloak resets only for its own categories); failures expire after the realm's "failure reset time". |
| Enumeration | The step reveals nothing beyond what the flow before it already reveals. For an account without a verified email (or without any email) it behaves exactly like a normal send: same page and wording, same cooldown, same attempt counting and failure recording, but no email is sent and no code can match (a "decoy"). `configuredFor()` is always true, so a "try another way" list looks the same for every account. Known residual differences: sending a real email takes longer than not sending one; an account with no email at all gets "…to the email address on this account" instead of a masked address. Keycloak's Username Form itself still reports unknown usernames, which is Keycloak's behaviour and out of scope here. |
| Email delivery | Keycloak's `EmailTemplateProvider` and the realm's SMTP settings. Locally that is Mailpit (`mail:1025`); nothing leaves the machine. If sending fails the code is withdrawn (the send still counts for cooldown and the cap) and the page says to try again. |
| Events | Wrong codes log `invalid_user_credentials`, expired codes `expired_code`, send failures `email_send_failed` on the login event. |

## Configuration

Per execution, through the execution's config (`AuthenticatorConfigModel`). Missing or out-of-range values use the
default, so a typo cannot weaken the limits below these bounds.

| Key | Default | Allowed | Meaning |
|---|---|---|---|
| `codeLength` | 6 | 6–10 | Digits per code |
| `codeTtlSeconds` | 300 | 60–3600 | How long a code works |
| `maxAttempts` | 5 | 1–10 | Wrong entries before the code stops working |
| `resendCooldownSeconds` | 30 | 0–3600 | Wait between codes |
| `maxSends` | 5 | 1–20 | Codes per sign-in attempt |
| `default.reference.value` | (none) | | Keycloak's common setting: the `amr` value. Set to `email-code` |
| `default.reference.maxAge` | 0 | seconds | Keycloak's common setting: how long that `amr` value stays in tokens. **Set it** (see below) |

The realm also needs SMTP settings (`smtpServer`) and should have brute-force detection on.

## How a realm enables it

1. Install the jar: `pnpm keycloak:providers` builds it into `infra/keycloak/providers/`, which the compose
   Keycloak mounts at `/opt/keycloak/providers`. Restart Keycloak to load a new jar.
2. Add it to the browser flow after a step that identifies the user. Minimal flow (as verified by the script):

   ```
   email-code-browser (basic-flow, top level)
     Username Form          auth-username-form     REQUIRED
     Email sign-in code     agentcity-email-code   REQUIRED   (config below)
   ```

   In a flow that also offers passkeys or SSO, put the Username Form and this step in a sub-flow that is one
   ALTERNATIVE of the browser flow. For levels of authentication, place that sub-flow under a
   `conditional-level-of-authentication` condition with `loa-condition-level` = `1` (the M03 design: email code
   and SSO are `acr` 1, passkey is `acr` 2).
3. Give the execution a config, for example in a realm import:

   ```json
   {
     "alias": "agentcity-email-code",
     "config": {
       "codeLength": "6",
       "codeTtlSeconds": "300",
       "maxAttempts": "5",
       "resendCooldownSeconds": "30",
       "maxSends": "5",
       "default.reference.value": "email-code",
       "default.reference.maxAge": "36000"
     }
   }
   ```

   with `"authenticatorConfig": "agentcity-email-code"` on the execution.
4. Add an `oidc-amr-mapper` protocol mapper ("Authentication Method Reference (AMR)") to the client or a client
   scope, with `id.token.claim` and `access.token.claim` set to `true`.

### How `amr` and `acr` appear in tokens (Keycloak 26.8)

- **`amr`**: Keycloak records each completed execution and its completion time in the user session note
  `authenticators-completed`. The `oidc-amr-mapper` reads, for each completed execution, the
  `default.reference.value` from **that execution's config** and adds it if `completion time +
  default.reference.maxAge >= now` (`AmrUtils.getAuthenticationExecutionReferences`). The authenticator does not
  set `amr` itself; the realm's execution config does. Two consequences:
  - with no execution config, or no `default.reference.value`, there is no `amr` entry;
  - `default.reference.maxAge` defaults to `0`, which drops the value as soon as the second after sign-in has
    passed (in practice, from almost every token). Set it to the session length or longer (`36000` above, like
    Keycloak's default LoA max age). After it passes, refreshed tokens no longer list `email-code`.
- **`acr`**: comes from the level of authentication, not from this authenticator. With no LoA conditions in the
  flow, a fresh sign-in is `acr` `"1"`. With conditions, it is the `loa-condition-level` of the sub-flow that
  completed; `acr.loa.map` (realm or client attribute) maps names to levels if names are wanted.
- `getReferenceCategory()` is `email-code`. That is not a Keycloak credential type, so it does not affect
  credential-type LoA maps or the account console's credential list.

Verified live: the ID and access tokens of a sign-in through the flow above carried `"amr": ["email-code"]` and
`"acr": "1"` (`planning/agentcity-migration/m03/evidence/email-code-verification.json`).

## Build and test

```
pnpm keycloak:providers           # mvn clean verify (JUnit) + copy jar; host Maven, else Docker
pnpm keycloak:providers --docker  # force the pinned Maven Docker image
```

The script exits non-zero on any compile or test failure and then copies nothing. In Docker mode it passes the
host's `HTTPS_PROXY` (with `--network host`) and imports the host's CA bundle (`MAVEN_EXTRA_CA_CERT`, else
`SSL_CERT_FILE` or `NODE_EXTRA_CA_CERTS`) into the throwaway container's JDK trust store; TLS verification stays on.

Live check (needs the compose `mail` service, Docker and Playwright with Chromium):

```
node infra/keycloak/email-code-authenticator/verify/verify-email-code.mjs
```

It starts its own Keycloak container (`m03-email-kc`, `127.0.0.1:58180`, on the `agentcity_default` network) with
the jar, creates realm `email-code-verify`, a public PKCE client with an AMR mapper and test users, and signs in with
Chromium. Codes are read from Mailpit's API (only messages to this run's addresses, deleted afterwards). Checks: code
page and email, sign-in and token claims, wrong code, attempt limit, failures recorded by brute-force protection,
lockout, resend cooldown, old code invalid after resend, reload sends nothing, unverified email refused with an
identical page, classic login theme, expiry (waits one minute). It writes the evidence JSON and a screenshot, and
removes the container (`--keep` leaves it running). It never touches the shared Keycloak.

## Review notes and maintenance

- Dependencies: `keycloak-server-spi`, `keycloak-server-spi-private`, `keycloak-services` 26.8.1, all `provided`
  (the jar contains only this project's classes and templates). Test-only: JUnit Jupiter 5.11.4. Plugin versions
  are pinned in `pom.xml`.
- Internal APIs used (check these first on upgrade): `Authenticator`/`AuthenticatorFactory`,
  `AuthenticationFlowContext` (`failureChallenge`, `getProtector`), `AuthenticatorUtils.getDisabledByBruteForceEventError`,
  `BruteForceProtector.failedLogin`, `KeyManager.getActiveKey/getKey` for HS512, `EmailTemplateProvider.send`,
  `LoginFormsProvider.createForm`, and the `theme-resources/` jar convention. The `amr` behaviour above depends on
  `AmrUtils` and `ConfigurableAuthenticatorFactory.COMMON_CONFIG_PROPERTIES`.
- **Upgrade procedure:** set `keycloak.version` in `pom.xml` to the new server version (it must equal the image in
  `infra/compose.yaml`), run `pnpm keycloak:providers`, run the live verification against the new image (update the
  image reference in `verify/verify-email-code.mjs`), and re-read the brute-force category handling in
  `DefaultBruteForceProtector` and `AmrUtils` for behaviour changes.
- The login page template is written for the default `keycloak.v2` theme and checked with the classic `keycloak`
  theme. A custom login theme can override `login-agentcity-email-code.ftl`.
- Only English messages ship (`messages_en.properties`). For another locale, add `messages_<locale>.properties`
  under `theme-resources/messages/`.
