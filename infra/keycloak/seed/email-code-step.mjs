// Adds the first-party email sign-in code step (`agentcity-email-code`) to the level-1 subflow of the agentcity
// browser flow, once its provider jar is installed in infra/keycloak/providers. Idempotent.
//
// The realm JSON does not reference the provider, so the realm imports and passkey/SSO sign-in work without it.
// Run it standalone (`node --env-file=infra/local-dev.env infra/keycloak/seed/email-code-step.mjs`); `pnpm
// keycloak:seed` runs it too. Pass --require to exit non-zero when the provider is missing.
import { pathToFileURL } from 'node:url';
import { adminClient } from './kc-admin.mjs';

export const EMAIL_CODE_PROVIDER = 'agentcity-email-code';
const REALM = 'agentcity';
const LOA1_FLOW = 'agentcity-loa1';
const AMR_CONFIG_ALIAS = 'agentcity-amr-email-code';

/**
 * Ensures the email-code execution exists in `agentcity-loa1` as an ALTERNATIVE after the passkey, with amr
 * "email-code". Returns 'provider-missing' | 'added' | 'present'.
 */
export async function ensureEmailCodeStep(api, log = console.error, provider = EMAIL_CODE_PROVIDER) {
  const { data: providers } = await api('GET', `${REALM}/authentication/authenticator-providers`);
  if (!providers.some(p => p.id === provider)) {
    log(`email-code: provider "${provider}" is not installed; level 1 offers passkeys (and agency SSO) only.`);
    return 'provider-missing';
  }

  let execution = await findExecution(api, provider);
  let status = 'present';
  if (!execution) {
    await api('POST', `${REALM}/authentication/flows/${LOA1_FLOW}/executions/execution`, { provider });
    execution = await findExecution(api, provider);
    if (!execution) throw new Error('email-code: execution was not created');
    status = 'added';
  }
  if (execution.requirement !== 'ALTERNATIVE') {
    await api('PUT', `${REALM}/authentication/flows/${LOA1_FLOW}/executions`, {
      ...execution,
      requirement: 'ALTERNATIVE',
    });
  }
  // The amr value lives on the execution's config (Keycloak's "Authentication reference"). Keep any keys the
  // authenticator itself defines; only set the two reference keys.
  const reference = { 'default.reference.value': 'email-code', 'default.reference.maxAge': '43200' };
  if (execution.authenticationConfig) {
    const { data: config } = await api('GET', `${REALM}/authentication/config/${execution.authenticationConfig}`);
    if (config.config?.['default.reference.value'] !== 'email-code') {
      await api('PUT', `${REALM}/authentication/config/${execution.authenticationConfig}`, {
        ...config,
        config: { ...config.config, ...reference },
      });
    }
  } else {
    await api('POST', `${REALM}/authentication/executions/${execution.id}/config`, {
      alias: AMR_CONFIG_ALIAS,
      config: reference,
    });
  }
  log(`email-code: step ${status} in ${LOA1_FLOW} (ALTERNATIVE after passkey, amr "email-code").`);
  return status;
}

async function findExecution(api, provider) {
  const { data } = await api('GET', `${REALM}/authentication/flows/${LOA1_FLOW}/executions`);
  return data.find(e => e.providerId === provider && e.level === 0) ?? null;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { api } = await adminClient();
  const status = await ensureEmailCodeStep(api);
  if (status === 'provider-missing' && process.argv.includes('--require')) process.exit(1);
}
