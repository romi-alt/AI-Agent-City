# Break-glass access for AgentCity identity (M03)

How an operator regains access, or removes someone's access, when normal sign-in fails or must be stopped at once.
Normal sign-in is passkey, email code or agency SSO through Keycloak realm `agentcity` (see `IDP.md`).

The steps marked **(tested)** were run against the local Keycloak 26.8.1 by
`infra/keycloak/verify/verify-idp.mjs`. Results are in `evidence/idp-verification.json` under the check id in
brackets. Every other step is procedure only.

## 1. The break-glass account

- **Who:** one Keycloak **master-realm** administrator, used only for break-glass. It is not an AgentCity user,
  not in realm `agentcity`, and never used for routine admin work.
- **Credentials:** a long random password **and** a hardware security key (WebAuthn second factor on the master
  realm).
- **Two-person rule:** the password and the key are held by two different people (split knowledge), each in a
  sealed, tamper-evident envelope, stored offline (safe). Nobody holds both. Using the account needs both people
  present, and a second person watches every action.
- **Bootstrap admin:** Keycloak's temporary bootstrap admin (`KC_BOOTSTRAP_ADMIN_*`) is deleted once the
  break-glass account exists. Locally the bootstrap admin `local-admin` plays this role; that is acceptable only
  because the local stack holds no real data.
- **Network:** the admin console and admin API are reachable only from the operations network, not from the
  public hostname.
- **Audit:** admin events are on in realm `agentcity` (with details, kept 7 days locally; production keeps them in
  the log pipeline). Turn on master-realm admin events as well.
- **Review:** after every use, change the password, re-seal both envelopes, and write an incident note.

## 2. When to use it

- Sign-in is broken for everyone or many people: a bad flow change, SMTP down (no email codes), agency IdP down,
  or Keycloak misconfigured.
- A person must lose access now: compromise, departure, or a stolen device.
- A client credential leaked (the `agentcity-bff` secret).
- One person cannot sign in and no ordinary route remains, for example a lost passkey with email codes unavailable.

## 3. Procedure

1. **Open an incident.** Record who, why, and the second person.
2. **Retrieve both credentials.**
3. **Sign in** to the master realm: admin console `https://<keycloak>/admin/master/console/`, or admin REST with a
   token from `realms/master/protocol/openid-connect/token` (client `admin-cli`).
4. **Act** (section 4). Use the admin API calls below, so the actions are exact and can be logged.
   `$KC = https://<keycloak>`, `$T = admin access token`. Master-realm tokens live 60 s; fetch a new one as needed.
5. **Confirm** the effect (each action lists its check).
6. **Close:** sign out, rotate the break-glass password, re-seal, complete the incident note.

## 4. Actions

### 4.1 Remove a person's access immediately (tested: `break-glass-disable-user`)

```
# find the user
curl -H "Authorization: Bearer $T" "$KC/admin/realms/agentcity/users?email=<email>&exact=true"
# disable (blocks refresh and every new sign-in)
curl -X PUT -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"enabled":false}' "$KC/admin/realms/agentcity/users/<id>"
# end all of their Keycloak sessions (also sends back-channel logout to the API)
curl -X POST -H "Authorization: Bearer $T" "$KC/admin/realms/agentcity/users/<id>/logout"
```

Both calls are needed. Tested results:

- **Disable alone does not end sessions:** 2 sessions before and 2 after disabling. It does make the refresh token
  fail with `invalid_grant` "User disabled", and it blocks silent and fresh sign-in ("Account is disabled, contact
  your administrator").
- **"Log out" ends every session:** 0 afterwards.
- **The API:** admin "log out user" sends a signed logout token to the client's back-channel URL. Delivery was
  verified with a stand-in listener (`backchannel-logout-token`), not with the API. The API then revokes its
  sessions by `sid`/`sub`, disconnects sockets, and publishes a `person` revocation. If back-channel delivery fails,
  the API's periodic revalidation catches it within its interval, because refresh then fails.
- **Also in the API:** revoke the person's memberships if they must not come back (access module), so re-enabling
  the Keycloak account later does not restore permissions silently.

To restore: `PUT … {"enabled":true}`, and clear a brute-force lock if there is one:
`DELETE $KC/admin/realms/agentcity/attack-detection/brute-force/users/<id>`.

### 4.2 End every session in the realm (tested: `break-glass-logout-all`)

```
curl -X POST -H "Authorization: Bearer $T" "$KC/admin/realms/agentcity/logout-all"
```

Tested: active `agentcity-bff` client sessions went to 0 (counts before vary per run; see the evidence). Everyone must sign in again. Use it after a
suspected realm-wide compromise, or after rotating the client secret.

### 4.3 Rotate the `agentcity-bff` client secret (tested: `break-glass-rotate-client-secret`)

```
curl -X POST -H "Authorization: Bearer $T" "$KC/admin/realms/agentcity/clients/<client uuid>/client-secret"
# → {"type":"secret","value":"<new secret>"}; put it in the secret store as OIDC_CLIENT_SECRET, restart the API
```

- Tested: right after rotation, exchanging a code with the old secret failed (`unauthorized_client`) and the new
  secret worked.
- Between rotation and the API restart, sign-in fails. Plan a short outage.
- Follow with 4.2 if tokens may also have leaked.
- Locally the test put the committed `local-dev-only-oidc-bff-secret` back afterwards.

### 4.4 A person lost their passkey (tested: `break-glass-lost-passkey-recovery`)

Only after verifying the person's identity out of band, with two people.

```
# list and remove the old passkey(s)
curl -H "Authorization: Bearer $T" "$KC/admin/realms/agentcity/users/<id>/credentials"
curl -X DELETE -H "Authorization: Bearer $T" "$KC/admin/realms/agentcity/users/<id>/credentials/<credential id>"
curl -X POST -H "Authorization: Bearer $T" "$KC/admin/realms/agentcity/users/<id>/logout"
# send a 15-minute passkey enrolment link to their verified address
curl -X PUT -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '["webauthn-register-passwordless"]' \
  "$KC/admin/realms/agentcity/users/<id>/execute-actions-email?lifespan=900"
```

Tested:

- After removal, the old device's passkey no longer signs in.
- The enrolment email arrived (Mailpit, subject "Update Your Account").
- A new authenticator registered through the link and signed in (acr 1, `amr ["passkey"]`).
- The person also receives an "Update credential" email for each change (email event listener).

### 4.5 Turn off agency SSO (tested: `break-glass-disable-agency-sso`)

Use this when the agency IdP is compromised or misbehaving.

```
curl -H "Authorization: Bearer $T" "$KC/admin/realms/agentcity/identity-provider/instances/agency-sso" > idp.json
# set "enabled": false in idp.json, then:
curl -X PUT -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d @idp.json "$KC/admin/realms/agentcity/identity-provider/instances/agency-sso"
```

- Tested: while it is disabled, `kc_idp_hint=agency-sso` falls back to the plain sign-in page without the SSO
  button, and no code is issued. Re-enabled, the button returns.
- Existing brokered sessions are not ended by this. Follow with 4.1 for the affected people, or 4.2.
- People who have a passkey can still sign in with it.

### 4.6 Sign-in itself is broken (procedure only)

- **A flow change broke sign-in:** recreate the realm from the committed `infra/keycloak/agentcity-realm.json`
  (production: re-import into a fresh realm through the same pipeline), or bind the browser flow back to the last
  known-good copy. Then run the verification.
- **SMTP or email codes are down:** people with a passkey or agency SSO are unaffected. For others, use 4.4 with a
  working mail path, or wait. **Never** give a person a password or create a sign-in shortcut: the realm has no
  password step on purpose.
- **Keycloak is down:** the API cannot create sessions. Existing API sessions fail revalidation and are revoked.
  This fails closed by design. Restore Keycloak; there is no bypass.

## 5. What break-glass may not do

- No passwords for AgentCity people, no impersonation into the product, no development login shortcuts, and no
  copying of tokens.
- No direct database edits of memberships. Use the access module's SECURITY DEFINER functions through the API, or
  an access-module runbook.
- No disabling of brute-force detection, PKCE, or email verification to "get someone in".

## 6. Local test of these operations

```
pnpm keycloak:seed
node --env-file=infra/local-dev.env infra/keycloak/verify/verify-idp.mjs
```

The break-glass checks are `break-glass-disable-user`, `break-glass-logout-all`,
`break-glass-rotate-client-secret`, `break-glass-lost-passkey-recovery`, `break-glass-disable-agency-sso`, and the
supporting `brute-force` and `backchannel-logout-token`. They use temporary users and restore every setting they
change. `logout-all` ends every local session.
