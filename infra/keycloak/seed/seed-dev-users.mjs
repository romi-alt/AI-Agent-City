// Creates the local development users (`pnpm keycloak:seed`). Idempotent: existing users are brought back to the
// seeded state (enabled, email verified) and keep their Keycloak id. Refuses NODE_ENV=production and any Keycloak
// that is not on localhost/127.0.0.1 (see kc-admin.mjs).
//
// Prints JSON to stdout:
//   { issuer, agentcity: { "<email>": { sub, subject } }, agencyIdp: { "<email>": { sub, password } } }
// where subject = "kc:<sub>" is the person id the API and database use. Progress goes to stderr.
//
// Users in realm `agentcity` have no password (sign-in is passkey, email code or agency SSO). To give one a
// passkey, send the admin enrolment email (planning/agentcity-migration/m03/IDP.md, "Passkeys").
import { adminClient, findUserByEmail } from './kc-admin.mjs';
import { ensureEmailCodeStep } from './email-code-step.mjs';

const AGENCY_SSO_PASSWORD = 'local-dev-only-agency-sso-password';

const AGENTCITY_USERS = [
  { email: 'owner@agentcity.test', firstName: 'Olivia', lastName: 'Owner' },
  { email: 'staff@agentcity.test', firstName: 'Sam', lastName: 'Staff' },
  { email: 'client.admin@agentcity.test', firstName: 'Clara', lastName: 'Client-Admin' },
  { email: 'client.viewer@agentcity.test', firstName: 'Victor', lastName: 'Client-Viewer' },
  { email: 'outsider@agentcity.test', firstName: 'Oscar', lastName: 'Outsider' },
];
const AGENCY_USER = { email: 'sso.user@agency.example', firstName: 'Sasha', lastName: 'Agency' };

const { base, api } = await adminClient();
const log = message => console.error(message);

await ensureEmailCodeStep(api, log);

const agentcity = {};
for (const person of AGENTCITY_USERS) {
  agentcity[person.email] = await ensureUser('agentcity', person);
}

// The agency's own IdP: a password is fine there, it simulates the agency's corporate sign-in.
const agencyUser = await ensureUser('agency-idp', AGENCY_USER);
await api('PUT', `agency-idp/users/${agencyUser.sub}/reset-password`, {
  type: 'password',
  value: AGENCY_SSO_PASSWORD,
  temporary: false,
});

// The same person in agentcity, linked to the agency account by an administrator (explicit link, not by email),
// so tests know the subject before the first SSO sign-in.
const ssoInAgentcity = await ensureUser('agentcity', AGENCY_USER);
const { data: links } = await api('GET', `agentcity/users/${ssoInAgentcity.sub}/federated-identity`);
const link = links.find(l => l.identityProvider === 'agency-sso');
if (link && link.userId !== agencyUser.sub) {
  await api('DELETE', `agentcity/users/${ssoInAgentcity.sub}/federated-identity/agency-sso`);
}
if (!link || link.userId !== agencyUser.sub) {
  await api('POST', `agentcity/users/${ssoInAgentcity.sub}/federated-identity/agency-sso`, {
    identityProvider: 'agency-sso',
    userId: agencyUser.sub,
    userName: AGENCY_USER.email,
  });
  log(`linked agentcity ${AGENCY_USER.email} to agency-sso (${agencyUser.sub})`);
}
agentcity[AGENCY_USER.email] = ssoInAgentcity;

console.log(
  JSON.stringify(
    {
      issuer: `${base}/realms/agentcity`,
      agentcity,
      agencyIdp: { [AGENCY_USER.email]: { sub: agencyUser.sub, password: AGENCY_SSO_PASSWORD } },
    },
    null,
    2,
  ),
);

async function ensureUser(realm, { email, firstName, lastName }) {
  const desired = {
    username: email,
    email,
    emailVerified: true,
    enabled: true,
    firstName,
    lastName,
  };
  let user = await findUserByEmail(api, realm, email);
  if (!user) {
    await api('POST', `${realm}/users`, { ...desired, requiredActions: [] });
    user = await findUserByEmail(api, realm, email);
    log(`created ${realm} ${email}`);
  } else {
    await api('PUT', `${realm}/users/${user.id}`, { ...desired, requiredActions: [] });
    log(`updated ${realm} ${email}`);
  }
  return { sub: user.id, subject: `kc:${user.id}` };
}
